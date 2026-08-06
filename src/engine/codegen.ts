import { LANGUAGES } from '../desktop/languages';
import { desktop } from '../desktop/bridge';
import { useCodeStore } from '../store/useCodeStore';
import { useConfigStore } from '../store/useConfigStore';
import { useSystemStore } from '../store/useSystemStore';
import { speech } from './SpeechEngine';
import { bestMatch, normalize } from './matcher';

/** Palavras que separam a linguagem da descrição: "em python que soma". */
const LINK_WORDS = ['que', 'para', 'pra', 'com', 'de', 'onde', 'qual'];

export interface ParsedCodeRequest {
  language: string;
  prompt: string;
}

/**
 * Extrai linguagem e descrição de uma frase livre.
 *
 * Aceita "programe em python uma calculadora", "codar java hello world",
 * "cria um script python que renomeia arquivos". Sem linguagem explícita,
 * assume Python — é o caso mais comum e o que roda direto nesta máquina.
 */
export const parseCodeRequest = (input: string): ParsedCodeRequest | null => {
  // Duas listas em paralelo: a normalizada casa a linguagem, a original vira o
  // prompt. O modelo escreve código melhor lendo a frase como você a disse.
  const original = input.trim().split(/\s+/).filter((t) => t.length > 0);
  const normalized = original.map((t) => normalize(t));
  if (original.length === 0) return null;

  let languageId: string | null = null;
  let languageAt = -1;

  for (let i = 0; i < normalized.length && languageId === null; i += 1) {
    for (let span = 3; span >= 1; span -= 1) {
      if (i + span > normalized.length) continue;
      const chunk = normalized.slice(i, i + span).join(' ');

      // Igualdade, não "frase contida": `bestMatch` pontua 0,94 quando a frase
      // está contida no texto, e isso fazia "java um jogo" casar com "java" e
      // engolir três tokens — o prompt perdia "jogo".
      const exact = LANGUAGES.find((l) => l.phrases.some((p) => normalize(p) === chunk));
      const match =
        exact ??
        bestMatch(chunk, LANGUAGES.map((l) => ({ value: l, phrases: l.phrases })), 0.95)?.value;

      if (match) {
        languageId = match.id;
        languageAt = i + span;
        break;
      }
    }
  }

  // Tudo depois da linguagem é a descrição; sem linguagem, a frase inteira.
  let restStart = languageId !== null ? languageAt : 0;
  while (restStart < normalized.length && LINK_WORDS.includes(normalized[restStart])) {
    restStart += 1;
  }

  // Sem `stripFiller` aqui: artigos e preposições ajudam o modelo a entender.
  const prompt = original.slice(restStart).join(' ').trim();
  if (prompt.length < 3) return null;

  return { language: languageId ?? 'python', prompt };
};

/* ------------------------------------------------------------------ */

const print = (text: string, kind: 'system' | 'error' | 'info' = 'system'): void =>
  useSystemStore.getState().print(text, kind);

/**
 * Pede o código ao Ollama e conduz a saída: terminal, arquivo, editor e —
 * se explicitamente liberado — execução.
 */
export const generate = async (request: ParsedCodeRequest): Promise<void> => {
  const bridge = desktop();
  const store = useCodeStore.getState();

  if (!bridge) {
    print('GERAÇÃO DE CÓDIGO EXIGE O APP DE DESKTOP (npm run desktop).', 'error');
    return;
  }

  const config = useConfigStore.getState().config;
  if (!config.ai.enabled) {
    print('A geração de código está desligada em Configuração → IA.', 'error');
    return;
  }

  const language = LANGUAGES.find((l) => l.id === request.language) ?? LANGUAGES[0];

  store.begin(language.id, request.prompt);
  print(`GERANDO ${language.label.toUpperCase()}: ${request.prompt}`, 'info');
  if (config.voice.speakResponses) {
    speech.speak(`Escrevendo ${language.label} para você, Senhor. Um momento.`);
  }

  const status = await bridge.aiStatus();
  if (!status.reachable) {
    useCodeStore.getState().fail(status.message);
    print(status.message, 'error');
    speech.speak('Não consegui falar com o modelo local, Senhor.');
    return;
  }
  if (!status.models.some((m) => m === config.ai.model || m.startsWith(`${config.ai.model}:`))) {
    const message = `Modelo "${config.ai.model}" não está baixado. Baixe em Configuração → IA.`;
    useCodeStore.getState().fail(message);
    print(message, 'error');
    return;
  }

  const result = await bridge.aiGenerate({ language: language.id, prompt: request.prompt });
  useCodeStore.getState().finish(result);

  if (!result.ok) {
    print(result.message, 'error');
    speech.speak('Falhei ao gerar o código, Senhor.');
    return;
  }

  print(result.message, 'system');

  if (result.filePath && config.ai.openInEditor) {
    const opened = await bridge.aiOpenInEditor(result.filePath);
    print(opened.ok ? `Aberto no editor.` : `Editor: ${opened.message}`, opened.ok ? 'system' : 'error');
  }

  speech.speak(`Código em ${language.label} pronto, Senhor.`);

  if (result.filePath && config.ai.allowExecute && language.run) {
    useCodeStore.getState().setExecuting(true);
    const exec = await bridge.aiExecute(result.filePath, language.id);
    useCodeStore.getState().setExecuting(false);
    useCodeStore.getState().setExec(exec);
    print(
      exec.ok ? 'EXECUÇÃO CONCLUÍDA.' : `EXECUÇÃO FALHOU (código ${exec.exitCode ?? '?'}).`,
      exec.ok ? 'info' : 'error',
    );
  }
};

/** Liga o streaming do processo principal ao store. Chamado uma vez no App. */
export const bindCodeStream = (): (() => void) => {
  const bridge = desktop();
  if (!bridge) return () => undefined;
  return bridge.onAiChunk((text) => useCodeStore.getState().appendChunk(text));
};

/** Frases que abrem o gerador de código. */
export const CODE_VERBS = [
  'programar',
  'programe',
  'programa',
  'codar',
  'code',
  'escrever codigo',
  'escreva codigo',
  'criar script',
  'cria script',
  'criar programa',
  'fazer um programa',
  'gerar codigo',
];

/** Detecta e recorta o verbo de programação de uma frase. */
export const stripCodeVerb = (input: string): string | null => {
  const normalized = normalize(input);
  for (const verb of CODE_VERBS) {
    if (normalized === verb) return '';
    if (normalized.startsWith(`${verb} `)) return normalized.slice(verb.length).trim();
  }
  return null;
};
