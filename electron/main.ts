import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  Tray,
} from 'electron';
import { join } from 'node:path';
import type { NexusAction, NexusConfig, VoiceHeardPayload, VoiceStatePayload } from '../src/types/desktop';
import { getConfigPath, loadConfig, resetConfig, saveConfig, sha256 } from './config';
import { runAction } from './actions';
import { resolve as resolveCommand } from './resolver';
import { checkModel, downloadModel, listMicDevices, voice } from './voice';
import { aiStatus, askAssistant, executeFile, generateCode, openInEditor, pullModel } from './ai';
import { checkTool, runTool, stopTool } from './tools';
import { checkRequirements, fixRequirement } from './preflight';
import { appVersion, bindUpdater, checkUpdate, initUpdater, installUpdate } from './updater';
import { cleanTemp, killProcess, systemReport, systemStats } from './system';
import type { SystemReportKind } from '../src/types/desktop';
import { LANGUAGES } from '../src/desktop/languages';
import type { CodeRequest } from '../src/types/desktop';

const DEV_SERVER = process.env.VITE_DEV_SERVER_URL;
const isDev = Boolean(DEV_SERVER);
// Compilado para dist-electron/electron/, então o renderer fica em <app>/dist.
const preloadPath = join(__dirname, 'preload.js');
const rendererIndex = (): string => join(app.getAppPath(), 'dist', 'index.html');

let hudWindow: BrowserWindow | null = null;
let configWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let hudHideTimer: NodeJS.Timeout | null = null;

/* ------------------------------------------------------------------ */
/* Ícone da bandeja — desenhado em memória, sem arquivo externo         */
/* ------------------------------------------------------------------ */

const trayIcon = (): Electron.NativeImage => {
  const size = 16;
  const buffer = Buffer.alloc(size * size * 4);
  const cx = 7.5;
  const cy = 7.5;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const d = Math.hypot(x - cx, y - cy);
      const ring = Math.max(0, 1 - Math.abs(d - 6) / 1.6);
      const core = Math.max(0, 1 - d / 2.6);
      const a = Math.min(1, ring * 0.85 + core);
      const i = (y * size + x) * 4;
      // BGRA
      buffer[i] = 255;
      buffer[i + 1] = 212;
      buffer[i + 2] = 0;
      buffer[i + 3] = Math.round(a * 255);
    }
  }
  return nativeImage.createFromBuffer(buffer, { width: size, height: size });
};

/* ------------------------------------------------------------------ */
/* Janelas                                                             */
/* ------------------------------------------------------------------ */

const loadRenderer = (win: BrowserWindow, mode: 'hud' | 'app'): void => {
  if (isDev) {
    void win.loadURL(`${DEV_SERVER}?mode=${mode}`);
  } else {
    void win.loadFile(rendererIndex(), { query: { mode } });
  }
};

const createHudWindow = (): BrowserWindow => {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  const win = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    // Sem foco: o HUD aparece por cima sem roubar o teclado do que você faz.
    focusable: false,
    show: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Cliques atravessam o HUD: ele nunca bloqueia o que está atrás.
  win.setIgnoreMouseEvents(true, { forward: true });

  loadRenderer(win, 'hud');

  win.on('closed', () => {
    hudWindow = null;
  });

  return win;
};

const createConfigWindow = (): BrowserWindow => {
  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    show: false,
    // Sem moldura nativa: a barra de título é desenhada no estilo do Sistema.
    frame: false,
    backgroundColor: '#050508',
    autoHideMenuBar: true,
    title: 'NEXUS',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  loadRenderer(win, 'app');

  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    configWindow = null;
  });

  return win;
};

const showHud = (autoHide = true): void => {
  if (!hudWindow) hudWindow = createHudWindow();
  if (hudHideTimer) {
    clearTimeout(hudHideTimer);
    hudHideTimer = null;
  }
  hudWindow.showInactive();
  hudWindow.setAlwaysOnTop(true, 'screen-saver');

  const { hudTimeoutMs } = loadConfig().behavior;
  if (autoHide && hudTimeoutMs > 0) {
    hudHideTimer = setTimeout(() => hudWindow?.hide(), hudTimeoutMs);
  }
};

const hideHud = (): void => {
  if (hudHideTimer) {
    clearTimeout(hudHideTimer);
    hudHideTimer = null;
  }
  hudWindow?.hide();
};

const openConfigWindow = (): void => {
  if (!configWindow) configWindow = createConfigWindow();
  if (configWindow.isMinimized()) configWindow.restore();
  configWindow.show();
  configWindow.focus();
  configWindow.webContents.send('ui:open-config');
};

const broadcast = (channel: string, payload?: unknown): void => {
  for (const win of [hudWindow, configWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }
};

/* ------------------------------------------------------------------ */
/* Bandeja                                                             */
/* ------------------------------------------------------------------ */

const buildTrayMenu = (): void => {
  if (!tray) return;
  const state = voice.getState();
  const listening = state.status === 'listening' || state.status === 'starting';

  tray.setToolTip(`NEXUS — ${state.message}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `NEXUS · ${state.status}`, enabled: false },
      { type: 'separator' },
      {
        label: listening ? 'Parar de escutar' : 'Começar a escutar',
        click: () => {
          if (listening) voice.stop();
          else voice.start();
        },
      },
      { label: 'Mostrar HUD', click: () => showHud(false) },
      { label: 'Esconder HUD', click: hideHud },
      { type: 'separator' },
      { label: 'Configuração...', click: openConfigWindow },
      {
        label: 'Abrir pasta de configuração',
        click: () => {
          void import('electron').then(({ shell }) => shell.showItemInFolder(getConfigPath()));
        },
      },
      { type: 'separator' },
      { label: 'Sair', click: () => app.quit() },
    ]),
  );
};

const createTray = (): void => {
  tray = new Tray(trayIcon());
  tray.on('double-click', openConfigWindow);
  buildTrayMenu();
};

/* ------------------------------------------------------------------ */
/* Voz → ação                                                          */
/* ------------------------------------------------------------------ */

const handleHeard = (payload: VoiceHeardPayload): void => {
  broadcast('voice:heard', payload);
  if (!payload.awake) return;

  const config = loadConfig();

  // Wake word sozinha: só acorda o HUD e espera o comando.
  if (payload.text.trim().length === 0) {
    if (config.behavior.showHudOnWake) showHud();
    return;
  }

  const resolution = resolveCommand(payload.text, config);

  if (config.behavior.showHudOnWake) showHud();

  if (!resolution.handled) {
    // Comando conversacional/registro: o renderer imprime a fala e executa.
    broadcast('voice:command', resolution.text);
    return;
  }

  // Ação de sistema/app resolvida aqui: manda a fala (para o terminal mostrar
  // o que foi ouvido) junto com o resultado.
  void runAction(resolution.action).then((result) => {
    broadcast('voice:reply', {
      said: payload.text,
      reply: result.ok ? resolution.reply : `Não consegui: ${result.message}`,
      ok: result.ok,
    });
  });
};

const handleVoiceState = (payload: VoiceStatePayload): void => {
  broadcast('voice:state', payload);
  buildTrayMenu();
};

/* ------------------------------------------------------------------ */
/* IPC                                                                 */
/* ------------------------------------------------------------------ */

const registerIpc = (): void => {
  ipcMain.handle('config:get', () => loadConfig());
  ipcMain.handle('config:save', (_e, config: NexusConfig) => {
    const previous = loadConfig();
    const next = saveConfig(config);

    if (previous.behavior.globalShortcut !== next.behavior.globalShortcut) {
      registerShortcut(next);
    }
    if (previous.behavior.autostart !== next.behavior.autostart) {
      app.setLoginItemSettings({ openAtLogin: next.behavior.autostart, args: ['--hidden'] });
    }
    // Dispositivo ou modelo diferente exige religar o daemon.
    if (
      previous.voice.deviceIndex !== next.voice.deviceIndex ||
      previous.voice.modelPath !== next.voice.modelPath
    ) {
      voice.restart();
    }
    broadcast('config:changed', next);
    return next;
  });
  ipcMain.handle('config:reset', () => {
    const next = resetConfig();
    broadcast('config:changed', next);
    return next;
  });
  ipcMain.handle('config:hash', (_e, plain: string) => sha256(plain));

  ipcMain.handle('voice:start', () => voice.start());
  ipcMain.handle('voice:stop', () => voice.stop());
  ipcMain.handle('voice:state', () => voice.getState());
  ipcMain.handle('voice:devices', () => listMicDevices());
  ipcMain.handle('voice:check-model', () => checkModel());
  ipcMain.handle('voice:download-model', () =>
    downloadModel((pct) => broadcast('model:progress', pct)),
  );

  ipcMain.handle('action:run', (_e, action: NexusAction) => runAction(action));

  ipcMain.handle('ai:status', () => aiStatus());
  ipcMain.handle('ai:languages', () => LANGUAGES);
  ipcMain.handle('ai:generate', (_e, request: CodeRequest) =>
    generateCode(request, (chunk) => broadcast('ai:chunk', chunk)),
  );
  ipcMain.handle('ai:pull', (_e, model: string) =>
    pullModel(model, (pct, status) => broadcast('ai:pull-progress', { pct, status })),
  );
  ipcMain.handle('ai:execute', (_e, filePath: string, language: string) =>
    executeFile(filePath, language),
  );
  ipcMain.handle('ai:open-editor', (_e, filePath: string) => openInEditor(filePath));
  ipcMain.handle(
    'ai:ask',
    (_e, question: string, history: Array<{ role: 'user' | 'assistant'; content: string }>) =>
      askAssistant(question, history, (chunk) => broadcast('ai:chunk', chunk)),
  );

  ipcMain.handle('tool:run', (_e, toolId: string, args: string) =>
    runTool(toolId, args, (text, stream) => broadcast('tool:output', { text, stream })),
  );
  ipcMain.on('tool:stop', stopTool);
  ipcMain.handle('tool:check', (_e, command: string) => checkTool(command));

  ipcMain.handle('system:report', (_e, kind: SystemReportKind) => systemReport(kind));
  ipcMain.handle('system:stats', () => systemStats());
  ipcMain.handle('system:clean', () => cleanTemp());
  ipcMain.handle('system:kill', (_e, name: string) => killProcess(name));

  ipcMain.handle('preflight:check', () => checkRequirements());
  ipcMain.handle('preflight:fix', (_e, id: string) =>
    fixRequirement(
      id,
      (line) => broadcast('preflight:log', { id, line }),
      (pct) => broadcast('preflight:progress', { id, pct }),
    ),
  );

  ipcMain.handle('dialog:pick-dir', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Pasta dos projetos gerados',
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:pick-exe', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Escolha o programa',
      properties: ['openFile'],
      filters: [{ name: 'Programas', extensions: ['exe', 'bat', 'cmd', 'lnk', 'com'] }],
    });
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
  });

  ipcMain.on('hud:show', () => showHud(false));
  ipcMain.on('hud:hide', hideHud);
  ipcMain.on('window:config', openConfigWindow);
  ipcMain.on('app:quit', () => app.quit());

  // Controles da janela sem moldura, vindos da barra de título customizada.
  ipcMain.on('window:minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
  ipcMain.on('window:maximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on('window:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close());

  ipcMain.handle('app:version', () => appVersion());
  ipcMain.handle('update:check', () => checkUpdate());
  ipcMain.on('update:install', () => installUpdate());
};

/* ------------------------------------------------------------------ */
/* Atalho global                                                       */
/* ------------------------------------------------------------------ */

const registerShortcut = (config: NexusConfig): void => {
  globalShortcut.unregisterAll();
  const accelerator = config.behavior.globalShortcut.trim();
  if (accelerator.length === 0) return;
  try {
    const ok = globalShortcut.register(accelerator, () => {
      if (hudWindow?.isVisible()) hideHud();
      else showHud(false);
    });
    if (!ok) console.error('[nexus] atalho global recusado:', accelerator);
  } catch (error) {
    console.error('[nexus] atalho global inválido:', error);
  }
};

/* ------------------------------------------------------------------ */
/* Ciclo de vida                                                       */
/* ------------------------------------------------------------------ */

// Uma instância só: a segunda apenas traz a configuração para a frente.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', openConfigWindow);

  app.whenReady().then(() => {
    const config = loadConfig();

    registerIpc();
    voice.bind({
      onHeard: handleHeard,
      onPartial: (text) => broadcast('voice:partial', text),
      onState: handleVoiceState,
    });

    hudWindow = createHudWindow();
    createTray();
    registerShortcut(config);

    app.setLoginItemSettings({ openAtLogin: config.behavior.autostart, args: ['--hidden'] });

    // Só some na bandeja quando o Windows inicia o app sozinho (autostart passa
    // `--hidden`). Abrir na mão e não ver janela nenhuma parece travamento.
    const launchedByAutostart = process.argv.includes('--hidden');
    if (!launchedByAutostart || !config.behavior.startMinimized) openConfigWindow();

    if (config.voice.enabled) voice.start();

    // Auto-update: transmite os eventos para as janelas e agenda a 1ª checagem.
    bindUpdater((payload) => broadcast('update:status', payload));
    void initUpdater();
  });

  // App de bandeja: fechar as janelas não encerra o processo.
  app.on('window-all-closed', () => {
    /* mantém vivo em segundo plano */
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    voice.stop();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) hudWindow = createHudWindow();
  });
}
