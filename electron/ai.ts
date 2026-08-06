import { app } from 'electron';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AiStatus,
  CodeRequest,
  CodeResult,
  ExecResult,
} from '../src/types/desktop';
import { LANGUAGES, languageById, suggestFileName } from '../src/desktop/languages';
import { loadConfig } from './config';

/* ------------------------------------------------------------------ */
/* Pasta de saída                                                      */
/* ------------------------------------------------------------------ */

export const projectsDir = (): string => {
  const configured = loadConfig().ai.projectsDir.trim();
  if (configured.length > 0) return configured;
  return join(app.getPath('documents'), 'NEXUS');
};

/* ------------------------------------------------------------------ */
/* Ollama                                                              */
/* ------------------------------------------------------------------ */

const timeoutSignal = (ms: number): AbortSignal => AbortSignal.timeout(ms);

export const aiStatus = async (): Promise<AiStatus> => {
  const { baseUrl } = loadConfig().ai;
  try {
    const response = await fetch(`${baseUrl}/api/tags`, { signal: timeoutSignal(4000) });
    if (!response.ok) {
      return { reachable: false, models: [], message: `Ollama respondeu ${response.status}.` };
    }
    const data = (await response.json()) as { models?: Array<{ name?: string }> };
    const models = (data.models ?? []).map((m) => m.name ?? '').filter((n) => n.length > 0);
    return {
      reachable: true,
      models,
      message: models.length > 0 ? `${models.length} modelo(s) disponível(is).` : 'Nenhum modelo baixado.',
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      reachable: false,
      models: [],
      message: `Ollama não respondeu em ${baseUrl}. Instale em ollama.com e deixe-o rodando. (${reason})`,
    };
  }
};

export const pullModel = async (
  model: string,
  onProgress: (pct: number, status: string) => void,
): Promise<{ ok: boolean; message: string }> => {
  const { baseUrl } = loadConfig().ai;
  try {
    const response = await fetch(`${baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, stream: true }),
    });
    if (!response.ok || !response.body) {
      return { ok: false, message: `Falha ao baixar: HTTP ${response.status}` };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let index = buffer.indexOf('\n');
      while (index >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf('\n');
        if (line.length === 0) continue;
        try {
          const event = JSON.parse(line) as {
            status?: string;
            completed?: number;
            total?: number;
            error?: string;
          };
          if (event.error) return { ok: false, message: event.error };
          const pct =
            event.total && event.total > 0 ? ((event.completed ?? 0) / event.total) * 100 : 0;
          onProgress(pct, event.status ?? '');
        } catch {
          /* linha parcial */
        }
      }
    }
    onProgress(100, 'pronto');
    return { ok: true, message: `Modelo ${model} instalado.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
};

/* ------------------------------------------------------------------ */
/* Extração do código                                                  */
/* ------------------------------------------------------------------ */

/**
 * Modelos pequenos ignoram "responda só com código" com frequência: vem
 * explicação antes, cerca markdown, às vezes as duas coisas. Esta função tira
 * o código de dentro disso.
 */
export const extractCode = (raw: string): string => {
  const fenced = [...raw.matchAll(/```[a-zA-Z0-9+#-]*\s*\n([\s\S]*?)```/g)];
  if (fenced.length > 0) {
    // Se vier mais de um bloco, o maior costuma ser o programa completo.
    return fenced
      .map((m) => m[1])
      .reduce((longest, current) => (current.length > longest.length ? current : longest))
      .trim();
  }

  // Cerca aberta e nunca fechada — acontece quando a resposta é truncada.
  const open = raw.indexOf('```');
  if (open >= 0) {
    const afterFence = raw.slice(open + 3);
    const newline = afterFence.indexOf('\n');
    if (newline >= 0) return afterFence.slice(newline + 1).trim();
  }

  return raw.trim();
};

const SYSTEM_PROMPT = [
  'Você é um gerador de código. Responda APENAS com o código-fonte final,',
  'dentro de um único bloco markdown com a linguagem indicada.',
  'Não escreva explicações, introduções nem comentários fora do código.',
  'O código deve ser completo, executável e pronto para salvar em um arquivo.',
  'Comentários dentro do código devem estar em português.',
].join(' ');

export const generateCode = async (
  request: CodeRequest,
  onChunk: (text: string) => void,
): Promise<CodeResult> => {
  const config = loadConfig().ai;
  const language = languageById(request.language) ?? LANGUAGES[0];

  const fail = (message: string): CodeResult => ({
    ok: false,
    language: language.id,
    code: '',
    raw: '',
    filePath: null,
    message,
  });

  if (!config.enabled) return fail('A geração de código está desligada nas configurações.');

  const prompt = [
    `Linguagem: ${language.label}.`,
    `Tarefa: ${request.prompt}`,
    language.id === 'java'
      ? 'Use uma única classe pública com método main.'
      : '',
  ]
    .filter((p) => p.length > 0)
    .join('\n');

  let raw = '';
  try {
    const response = await fetch(`${config.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        prompt,
        system: SYSTEM_PROMPT,
        stream: true,
        options: {
          temperature: config.temperature,
          num_predict: config.maxTokens,
          num_ctx: config.contextSize,
        },
      }),
    });

    if (!response.ok || !response.body) {
      return fail(`Ollama respondeu ${response.status}. Verifique o modelo "${config.model}".`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let index = buffer.indexOf('\n');
      while (index >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf('\n');
        if (line.length === 0) continue;
        try {
          const event = JSON.parse(line) as { response?: string; error?: string };
          if (event.error) return fail(event.error);
          if (event.response) {
            raw += event.response;
            onChunk(event.response);
          }
        } catch {
          /* linha parcial */
        }
      }
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return fail(`Não consegui falar com o Ollama: ${reason}`);
  }

  const code = extractCode(raw);
  if (code.length === 0) return fail('O modelo não devolveu código.');

  let filePath: string | null = null;
  if (config.saveToFile) {
    try {
      const dir = projectsDir();
      mkdirSync(dir, { recursive: true });
      const fileName = suggestFileName(language, request.prompt, code);
      filePath = join(dir, fileName);
      writeFileSync(filePath, code, 'utf8');
    } catch (error) {
      return {
        ok: true,
        language: language.id,
        code,
        raw,
        filePath: null,
        message: `Código gerado, mas não consegui salvar: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  return {
    ok: true,
    language: language.id,
    code,
    raw,
    filePath,
    message: filePath ? `Salvo em ${filePath}` : 'Código gerado.',
  };
};

/* ------------------------------------------------------------------ */
/* Conversa                                                            */
/* ------------------------------------------------------------------ */

const assistantSystem = (address: string): string =>
  [
    'Você é o J.A.R.V.I.S., assistente pessoal do usuário, e responde em português do Brasil.',
    `Trate o usuário por "${address}".`,
    'Seja direto e conciso: no máximo três frases curtas, a menos que peçam detalhe.',
    'Sua resposta será FALADA em voz alta, então nada de markdown, listas, emoji ou código.',
    'Se não souber, diga que não sabe. Não invente fatos, links nem números.',
  ].join(' ');

/**
 * Pergunta livre ao modelo local. É o que faz o NEXUS responder qualquer coisa
 * em vez de "comando não reconhecido".
 */
export const askAssistant = async (
  question: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  onChunk: (text: string) => void,
): Promise<{ ok: boolean; answer: string; message: string }> => {
  const config = loadConfig();
  const ai = config.ai;

  if (!ai.enabled || !ai.conversational) {
    return { ok: false, answer: '', message: 'Modo conversa desligado.' };
  }

  const turns = Math.max(0, ai.historyTurns);
  const messages = [
    { role: 'system', content: assistantSystem(config.profile.address.trim() || 'Senhor') },
    ...history.slice(-turns * 2),
    { role: 'user', content: question },
  ];

  let answer = '';
  try {
    const response = await fetch(`${ai.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ai.chatModel.trim() || ai.model,
        messages,
        stream: true,
        // Resposta falada precisa ser curta: teto bem abaixo do usado em código.
        options: { temperature: 0.6, num_predict: 260, num_ctx: ai.contextSize },
      }),
    });

    if (!response.ok || !response.body) {
      return { ok: false, answer: '', message: `Ollama respondeu ${response.status}.` };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let index = buffer.indexOf('\n');
      while (index >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf('\n');
        if (line.length === 0) continue;
        try {
          const event = JSON.parse(line) as {
            message?: { content?: string };
            error?: string;
          };
          if (event.error) return { ok: false, answer: '', message: event.error };
          const piece = event.message?.content;
          if (piece) {
            answer += piece;
            onChunk(piece);
          }
        } catch {
          /* linha parcial */
        }
      }
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, answer: '', message: `Não consegui falar com o Ollama: ${reason}` };
  }

  const clean = speakable(answer);
  if (clean.length === 0) return { ok: false, answer: '', message: 'O modelo não respondeu.' };
  return { ok: true, answer: clean, message: 'ok' };
};

/**
 * Limpa a resposta para ser lida em voz alta.
 *
 * Modelos pequenos ignoram "não use listas nem markdown" com frequência, e
 * asteriscos e marcadores ficam horríveis na síntese de fala.
 */
export const speakable = (text: string): string =>
  text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/(^|\n)\s*[-*•]\s+/g, '$1')
    .replace(/(^|\n)\s*\d+[.)]\s+/g, '$1')
    .replace(/[#>|]/g, ' ')
    .replace(/\s*\n\s*/g, '. ')
    .replace(/\.\s*\./g, '.')
    .replace(/\s{2,}/g, ' ')
    .trim();

/* ------------------------------------------------------------------ */
/* Executar                                                            */
/* ------------------------------------------------------------------ */

const LIMIT = 20_000;

/**
 * Roda o arquivo gerado, com timeout e saída truncada.
 *
 * Protegido por `allowExecute`, desligado por padrão: código vindo de um LLM
 * não deve rodar sem alguém ter lido antes.
 */
export const executeFile = (filePath: string, languageId: string): Promise<ExecResult> =>
  new Promise((resolve) => {
    const config = loadConfig().ai;
    const empty: ExecResult = { ok: false, stdout: '', stderr: '', exitCode: null, timedOut: false };

    if (!config.allowExecute) {
      resolve({ ...empty, stderr: 'Execução desligada. Ative em Configuração → IA.' });
      return;
    }

    const language = languageById(languageId);
    if (!language?.run) {
      resolve({ ...empty, stderr: `Não sei executar ${languageId} automaticamente.` });
      return;
    }

    const args = language.run.args.map((a) => a.replace('{file}', filePath));
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const child = spawn(language.run.command, args, {
      cwd: projectsDir(),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, Math.max(1, config.executeTimeoutSec) * 1000);

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      if (stdout.length < LIMIT) stdout += chunk;
    });
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      if (stderr.length < LIMIT) stderr += chunk;
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ ...empty, stderr: error.message });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0 && !timedOut,
        stdout: stdout.slice(0, LIMIT),
        stderr: timedOut
          ? `${stderr}\n[NEXUS] Interrompido após ${config.executeTimeoutSec}s.`.trim()
          : stderr.slice(0, LIMIT),
        exitCode: code,
        timedOut,
      });
    });
  });

export const openInEditor = (filePath: string): Promise<{ ok: boolean; message: string }> =>
  new Promise((resolve) => {
    const command = loadConfig().ai.editorCommand.trim();
    if (command.length === 0) {
      resolve({ ok: false, message: 'Nenhum editor configurado.' });
      return;
    }

    const child = spawn(command, [filePath], {
      detached: true,
      stdio: 'ignore',
      // `code` no Windows é um .cmd — sem shell o spawn não o encontra.
      shell: process.platform === 'win32',
      windowsHide: false,
    });
    child.on('error', (error) => resolve({ ok: false, message: error.message }));
    child.unref();
    setTimeout(() => resolve({ ok: true, message: `Aberto em ${command}` }), 260);
  });
