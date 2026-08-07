import { app } from 'electron';
import type { UpdatePayload } from '../src/types/desktop';

/**
 * Auto-update via electron-updater + GitHub Releases.
 *
 * Como funciona, em uma frase: o app compara a própria versão com a última
 * *release* publicada no GitHub; se houver uma maior, baixa em segundo plano e
 * avisa para reiniciar. Em desenvolvimento (não empacotado) fica desligado —
 * só faz sentido num app instalado.
 */

type Emit = (payload: UpdatePayload) => void;

let emitFn: Emit = () => undefined;
let ready = false;

export const bindUpdater = (emit: Emit): void => {
  emitFn = emit;
};

export const appVersion = (): string => app.getVersion();

/**
 * Converte um erro do updater em estado. Quando falta o `app-update.yml` (build
 * sem config de publicação) ou é rede indisponível, não é "falha" para o usuário
 * — é só "auto-update indisponível". Nada de cartão de erro vermelho por isso.
 */
const fromError = (err: unknown): UpdatePayload => {
  const msg = err instanceof Error ? err.message : String(err);
  if (/app-update\.yml|ENOENT|dev-app-update|net::|ENOTFOUND|ECONNREFUSED|getaddrinfo/i.test(msg)) {
    return { status: 'idle', version: app.getVersion(), message: 'Auto-update indisponível nesta instalação.' };
  }
  return { status: 'error', message: msg };
};

/** Carrega o electron-updater só quando empacotado, para não pesar o dev. */
const loadAutoUpdater = async (): Promise<typeof import('electron-updater').autoUpdater | null> => {
  if (!app.isPackaged) return null;
  try {
    const mod = await import('electron-updater');
    return mod.autoUpdater;
  } catch (error) {
    emitFn({ status: 'error', message: `updater indisponível: ${String(error)}` });
    return null;
  }
};

let autoUpdaterRef: Awaited<ReturnType<typeof loadAutoUpdater>> = null;

export const initUpdater = async (): Promise<void> => {
  const au = await loadAutoUpdater();
  autoUpdaterRef = au;
  if (!au) {
    emitFn({ status: 'idle', message: 'Auto-update só funciona no app instalado.' });
    return;
  }

  au.autoDownload = true;
  au.autoInstallOnAppQuit = true;

  au.on('checking-for-update', () => emitFn({ status: 'checking', message: 'Procurando atualização...' }));
  au.on('update-available', (info) =>
    emitFn({ status: 'available', version: info.version, message: `Versão ${info.version} disponível.` }),
  );
  au.on('update-not-available', () => emitFn({ status: 'none', message: 'Você já está na versão mais recente.' }));
  au.on('download-progress', (p) =>
    emitFn({ status: 'downloading', pct: Math.round(p.percent), message: `Baixando ${Math.round(p.percent)}%` }),
  );
  au.on('update-downloaded', (info) =>
    emitFn({ status: 'ready', version: info.version, message: `Versão ${info.version} pronta. Reinicie para instalar.` }),
  );
  au.on('error', (err) => emitFn(fromError(err)));

  ready = true;

  // Primeira verificação alguns segundos depois de abrir, sem travar o boot.
  setTimeout(() => void checkUpdate(), 8000);
};

export const checkUpdate = async (): Promise<UpdatePayload> => {
  if (!app.isPackaged || !autoUpdaterRef || !ready) {
    const payload: UpdatePayload = {
      status: 'idle',
      version: app.getVersion(),
      message: 'Auto-update ativo apenas no app instalado.',
    };
    emitFn(payload);
    return payload;
  }
  try {
    await autoUpdaterRef.checkForUpdates();
    return { status: 'checking' };
  } catch (error) {
    const payload = fromError(error);
    emitFn(payload);
    return payload;
  }
};

export const installUpdate = (): void => {
  if (autoUpdaterRef) autoUpdaterRef.quitAndInstall();
};
