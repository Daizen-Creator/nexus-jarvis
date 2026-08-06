import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import type { ToolRunResult } from '../src/types/desktop';
import { loadConfig } from './config';

/**
 * Execução de ferramentas de linha de comando registradas na configuração.
 *
 * Só roda o que está cadastrado: o renderer manda um `id`, não um comando
 * arbitrário. Um comando de voz mal entendido não vira execução livre de shell.
 */

const TIMEOUT_MS = 5 * 60 * 1000;
const MAX_OUTPUT = 200_000;

let current: ChildProcess | null = null;

export const isRunning = (): boolean => current !== null;

export const stopTool = (): void => {
  if (!current) return;
  current.kill();
  current = null;
};

/** Verifica se o executável existe no PATH antes de tentar rodar. */
export const checkTool = (command: string): { found: boolean; path: string | null } => {
  if (command.trim().length === 0) return { found: false, path: null };
  try {
    const probe = spawnSync(
      process.platform === 'win32' ? 'where' : 'which',
      [command],
      { windowsHide: true, encoding: 'utf8', timeout: 6000 },
    );
    if (probe.status === 0 && probe.stdout) {
      const first = probe.stdout.split(/\r?\n/).find((l) => l.trim().length > 0);
      return { found: true, path: first?.trim() ?? null };
    }
  } catch {
    /* não encontrado */
  }
  return { found: false, path: null };
};

export const runTool = (
  toolId: string,
  rawArgs: string,
  onOutput: (text: string, stream: 'out' | 'err') => void,
): Promise<ToolRunResult> =>
  new Promise((resolve) => {
    if (current) {
      resolve({ ok: false, exitCode: null, timedOut: false, message: 'Já existe uma ferramenta em execução.' });
      return;
    }

    const tool = loadConfig().tools.find((t) => t.id === toolId);
    if (!tool) {
      resolve({ ok: false, exitCode: null, timedOut: false, message: `Ferramenta "${toolId}" não registrada.` });
      return;
    }
    if (!tool.enabled) {
      resolve({ ok: false, exitCode: null, timedOut: false, message: `"${tool.name}" está desativada.` });
      return;
    }

    // Ferramentas ofensivas só rodam com o modo segurança conscientemente ligado.
    if (tool.category === 'ataque' && !loadConfig().guards.allowSecurity) {
      resolve({
        ok: false,
        exitCode: null,
        timedOut: false,
        message: `"${tool.name}" exige o modo segurança ativado (Configuração → Segurança) e uso autorizado.`,
      });
      return;
    }

    const found = checkTool(tool.command);
    if (!found.found) {
      resolve({
        ok: false,
        exitCode: null,
        timedOut: false,
        message: `"${tool.command}" não está instalado ou não está no PATH.`,
      });
      return;
    }

    // `{args}` recebe o que veio depois do nome da ferramenta, quebrado por
    // espaços — respeitando aspas para argumentos com espaço.
    const parts = rawArgs.trim().match(/"[^"]*"|\S+/g) ?? [];
    const cleaned = parts.map((p) => p.replace(/^"|"$/g, ''));
    const args = tool.args.flatMap((a) => (a === '{args}' ? cleaned : [a.replace('{args}', rawArgs.trim())]));

    let produced = 0;
    let timedOut = false;

    const child = spawn(tool.command, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    current = child;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, TIMEOUT_MS);

    const pipe = (stream: 'out' | 'err') => (chunk: string): void => {
      if (produced > MAX_OUTPUT) return;
      produced += chunk.length;
      onOutput(chunk, stream);
    };

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', pipe('out'));
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', pipe('err'));

    child.on('error', (error) => {
      clearTimeout(timer);
      current = null;
      resolve({ ok: false, exitCode: null, timedOut: false, message: error.message });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      current = null;
      resolve({
        ok: code === 0 && !timedOut,
        exitCode: code,
        timedOut,
        message: timedOut
          ? 'Interrompido por tempo limite (5 min).'
          : code === 0
            ? `${tool.name} concluído.`
            : `${tool.name} saiu com código ${code}.`,
      });
    });
  });
