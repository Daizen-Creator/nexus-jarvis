import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { loadConfig } from './config';
import { aiStatus, pullModel } from './ai';
import { checkModel, downloadModel, findPython, pythonPresentButMissingDeps, pythonDir } from './voice';

export type ReqStatus = 'ok' | 'missing' | 'checking' | 'error';

export interface Requirement {
  id: string;
  label: string;
  status: ReqStatus;
  detail: string;
  /** Pode ser resolvido pelo próprio NEXUS com um clique. */
  fixable: boolean;
  /** Opcional: falta não impede de entrar. */
  optional: boolean;
}

/* ------------------------------------------------------------------ */
/* Verificação                                                         */
/* ------------------------------------------------------------------ */

export const checkRequirements = async (): Promise<Requirement[]> => {
  const config = loadConfig();
  const reqs: Requirement[] = [];

  /* Python + dependências de voz */
  const python = findPython();
  reqs.push({
    id: 'python',
    label: 'Python 3',
    status: python ? 'ok' : 'missing',
    detail: python
      ? `interpretador: ${python}`
      : 'Não encontrado no PATH. Instale em python.org.',
    fixable: false,
    optional: false,
  });

  reqs.push({
    id: 'voice-deps',
    label: 'Dependências de voz (vosk, sounddevice)',
    status: python ? 'ok' : pythonPresentButMissingDeps ? 'missing' : 'error',
    detail: python
      ? 'instaladas'
      : pythonPresentButMissingDeps
        ? 'Python encontrado, mas faltam os pacotes.'
        : 'Depende do Python.',
    fixable: pythonPresentButMissingDeps,
    optional: false,
  });

  /* Modelo Vosk */
  const model = checkModel();
  reqs.push({
    id: 'vosk-model',
    label: 'Modelo de voz pt-BR (Vosk)',
    status: model.installed ? 'ok' : 'missing',
    detail: model.installed ? (model.path ?? 'instalado') : 'Modelo ausente (~31 MB).',
    fixable: true,
    optional: false,
  });

  /* Ollama */
  const ai = await aiStatus();
  reqs.push({
    id: 'ollama',
    label: 'Ollama (IA local)',
    status: ai.reachable ? 'ok' : 'missing',
    detail: ai.reachable ? ai.message : 'Não está rodando. Instale em ollama.com e abra-o.',
    fixable: true,
    optional: true,
  });

  const has = (name: string): boolean =>
    ai.models.some((m) => m === name || m.startsWith(`${name}:`) || m.startsWith(name));

  reqs.push({
    id: 'model-code',
    label: `Modelo de código (${config.ai.model})`,
    status: !ai.reachable ? 'error' : has(config.ai.model) ? 'ok' : 'missing',
    detail: !ai.reachable ? 'Depende do Ollama.' : has(config.ai.model) ? 'instalado' : 'Não baixado.',
    fixable: ai.reachable,
    optional: true,
  });

  reqs.push({
    id: 'model-chat',
    label: `Modelo de conversa (${config.ai.chatModel})`,
    status: !ai.reachable ? 'error' : has(config.ai.chatModel) ? 'ok' : 'missing',
    detail: !ai.reachable
      ? 'Depende do Ollama.'
      : has(config.ai.chatModel)
        ? 'instalado'
        : 'Não baixado.',
    fixable: ai.reachable,
    optional: true,
  });

  return reqs;
};

/* ------------------------------------------------------------------ */
/* Correções                                                           */
/* ------------------------------------------------------------------ */

const pipInstall = (onLog: (line: string) => void): Promise<{ ok: boolean; message: string }> =>
  new Promise((resolve) => {
    const python = findPython() ?? 'python';
    const req = join(pythonDir(), 'requirements.txt');
    const child = spawn(python, ['-m', 'pip', 'install', '-r', req], {
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (c: string) => onLog(c.trimEnd()));
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (c: string) => onLog(c.trimEnd()));
    child.on('error', (e) => resolve({ ok: false, message: e.message }));
    child.on('close', (code) =>
      resolve({ ok: code === 0, message: code === 0 ? 'Dependências instaladas.' : `pip saiu com código ${code}.` }),
    );
  });

/** Tenta iniciar o servidor do Ollama a partir de locais conhecidos. */
const startOllama = (onLog: (line: string) => void): Promise<{ ok: boolean; message: string }> =>
  new Promise((resolve) => {
    // Locais padrão do Ollama em qualquer Windows — nada específico de máquina.
    const candidates = [
      'ollama', // no PATH
      join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Ollama', 'ollama.exe'),
      join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Ollama', 'ollama.exe'),
    ];

    const tryNext = (i: number): void => {
      if (i >= candidates.length) {
        resolve({ ok: false, message: 'Ollama não encontrado. Instale em ollama.com.' });
        return;
      }
      try {
        const child = spawn(candidates[i], ['serve'], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
          shell: false,
        });
        child.on('error', () => tryNext(i + 1));
        child.unref();
        onLog(`iniciando ${candidates[i]}...`);
        // Dá um tempo para o servidor subir antes de reconferir.
        setTimeout(async () => {
          const status = await aiStatus();
          resolve(
            status.reachable
              ? { ok: true, message: 'Ollama iniciado.' }
              : { ok: false, message: 'Ollama não respondeu a tempo. Abra-o manualmente.' },
          );
        }, 6000);
      } catch {
        tryNext(i + 1);
      }
    };
    tryNext(0);
  });

export const fixRequirement = async (
  id: string,
  onLog: (line: string) => void,
  onProgress: (pct: number) => void,
): Promise<{ ok: boolean; message: string }> => {
  const config = loadConfig();
  switch (id) {
    case 'voice-deps':
      return pipInstall(onLog);
    case 'vosk-model':
      return downloadModel((pct) => onProgress(pct));
    case 'ollama':
      return startOllama(onLog);
    case 'model-code':
      return pullModel(config.ai.model, (pct, status) => {
        onProgress(pct);
        onLog(status);
      });
    case 'model-chat':
      return pullModel(config.ai.chatModel, (pct, status) => {
        onProgress(pct);
        onLog(status);
      });
    default:
      return { ok: false, message: `Sem correção automática para "${id}".` };
  }
};
