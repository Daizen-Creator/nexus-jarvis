import { shell } from 'electron';
import { spawn } from 'node:child_process';
import type { ActionResult, NexusAction, SystemActionId } from '../src/types/desktop';
import { loadConfig } from './config';

/* ------------------------------------------------------------------ */
/* Teclas de mídia e energia (Windows)                                 */
/* ------------------------------------------------------------------ */

/**
 * Códigos das teclas virtuais multimídia. `SendKeys` com esses caracteres é a
 * forma nativa de controlar volume e mídia sem instalar nada.
 */
const VIRTUAL_KEY: Partial<Record<SystemActionId, number>> = {
  'volume-up': 175,
  'volume-down': 174,
  mute: 173,
  'play-pause': 179,
  'next-track': 176,
  'prev-track': 177,
};

const runPowerShell = (script: string): Promise<ActionResult> =>
  new Promise((resolve) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );

    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => resolve({ ok: false, message: error.message }));
    child.on('close', (code) => {
      if (code === 0) resolve({ ok: true, message: 'ok' });
      else resolve({ ok: false, message: stderr.trim() || `código ${code}` });
    });
  });

const sendVirtualKey = (key: number, repeat = 1): Promise<ActionResult> => {
  const presses = Array.from({ length: repeat }, () => `$w.SendKeys([char]${key})`).join('; ');
  return runPowerShell(`$w = New-Object -ComObject WScript.Shell; ${presses}`);
};

/* ------------------------------------------------------------------ */
/* Ações de sistema                                                    */
/* ------------------------------------------------------------------ */

export const runSystemAction = async (action: SystemActionId): Promise<ActionResult> => {
  const { guards } = loadConfig();

  // Ações destrutivas ficam atrás de um interruptor no painel, desligado por padrão.
  if (action === 'shutdown' && !guards.allowShutdown) {
    return { ok: false, message: 'Desligar está bloqueado nas configurações.' };
  }
  if (action === 'restart' && !guards.allowRestart) {
    return { ok: false, message: 'Reiniciar está bloqueado nas configurações.' };
  }
  if (action === 'sleep' && !guards.allowSleep) {
    return { ok: false, message: 'Suspender está bloqueado nas configurações.' };
  }
  if (action === 'lock' && !guards.allowLock) {
    return { ok: false, message: 'Bloquear a tela está bloqueado nas configurações.' };
  }

  const key = VIRTUAL_KEY[action];
  if (key !== undefined) {
    // Volume anda em passos de 2 para a mudança ser perceptível.
    const repeat = action === 'volume-up' || action === 'volume-down' ? 3 : 1;
    return sendVirtualKey(key, repeat);
  }

  switch (action) {
    case 'lock':
      return runPowerShell('rundll32.exe user32.dll,LockWorkStation');
    case 'sleep':
      return runPowerShell('rundll32.exe powrprof.dll,SetSuspendState 0,1,0');
    case 'shutdown':
      return runPowerShell('shutdown.exe /s /t 5');
    case 'restart':
      return runPowerShell('shutdown.exe /r /t 5');
    default:
      return { ok: false, message: `Ação desconhecida: ${action}` };
  }
};

/* ------------------------------------------------------------------ */
/* Abrir programas                                                     */
/* ------------------------------------------------------------------ */

const openApp = async (target: string, args: string[]): Promise<ActionResult> => {
  const { guards } = loadConfig();
  if (!guards.allowApps) {
    return { ok: false, message: 'Abrir programas está bloqueado nas configurações.' };
  }
  if (target.trim().length === 0) {
    return { ok: false, message: 'Caminho do programa vazio.' };
  }

  // Protocolos do Windows (ms-settings:, mailto:) vão pelo shell.
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) && !/^[a-z]:[\\/]/i.test(target)) {
    try {
      await shell.openExternal(target);
      return { ok: true, message: `Abrindo ${target}` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  return new Promise((resolve) => {
    try {
      const child = spawn(target, args, {
        detached: true,
        stdio: 'ignore',
        shell: false,
        windowsHide: false,
      });
      child.on('error', (error) => {
        // Nem tudo é executável direto: cai para o shell do Windows.
        void shell
          .openPath(target)
          .then((message) =>
            resolve(
              message
                ? { ok: false, message: `${error.message} / ${message}` }
                : { ok: true, message: `Abrindo ${target}` },
            ),
          )
          .catch(() => resolve({ ok: false, message: error.message }));
      });
      child.unref();
      // `spawn` não confirma sucesso na hora; se nenhum erro veio, deu certo.
      setTimeout(() => resolve({ ok: true, message: `Abrindo ${target}` }), 220);
    } catch (error) {
      resolve({ ok: false, message: error instanceof Error ? error.message : String(error) });
    }
  });
};

/* ------------------------------------------------------------------ */
/* Dispatcher                                                          */
/* ------------------------------------------------------------------ */

export const runAction = async (action: NexusAction): Promise<ActionResult> => {
  switch (action.kind) {
    case 'open-url': {
      try {
        await shell.openExternal(action.target);
        return { ok: true, message: `Abrindo ${action.target}` };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
    }

    case 'search': {
      const url = `https://www.google.com/search?q=${encodeURIComponent(action.target)}`;
      try {
        await shell.openExternal(url);
        return { ok: true, message: `Buscando "${action.target}"` };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
    }

    case 'open-app':
      return openApp(action.target, action.args ?? []);

    case 'system':
      return runSystemAction(action.target as SystemActionId);

    case 'speak':
      // A fala acontece no renderer, que tem o SpeechEngine.
      return { ok: true, message: action.target };

    default:
      return { ok: false, message: `Tipo de ação desconhecido: ${String(action.kind)}` };
  }
};
