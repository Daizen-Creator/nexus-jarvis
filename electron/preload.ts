import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  ActionResult,
  AiStatus,
  CodeLanguage,
  CodeRequest,
  CodeResult,
  ExecResult,
  MicDevice,
  NexusAction,
  NexusBridge,
  NexusConfig,
  Requirement,
  SystemReportKind,
  SystemStats,
  ToolRunResult,
  UpdatePayload,
  VoiceHeardPayload,
  VoiceStatePayload,
} from '../src/types/desktop';

/** Assina um canal e devolve a função que cancela a assinatura. */
const subscribe = <T>(channel: string, cb: (payload: T) => void): (() => void) => {
  const listener = (_event: IpcRendererEvent, payload: T): void => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
};

/**
 * Superfície mínima e explícita exposta ao renderer. `contextIsolation` fica
 * ligado e o renderer nunca vê `ipcRenderer` nem nada do Node.
 */
const bridge: NexusBridge = {
  isDesktop: true,
  platform: process.platform,
  version: process.versions.electron ?? '0',

  getConfig: () => ipcRenderer.invoke('config:get') as Promise<NexusConfig>,
  saveConfig: (config) => ipcRenderer.invoke('config:save', config) as Promise<NexusConfig>,
  resetConfig: () => ipcRenderer.invoke('config:reset') as Promise<NexusConfig>,
  hashPassword: (plain) => ipcRenderer.invoke('config:hash', plain) as Promise<string>,

  startVoice: () => ipcRenderer.invoke('voice:start') as Promise<VoiceStatePayload>,
  stopVoice: () => ipcRenderer.invoke('voice:stop') as Promise<VoiceStatePayload>,
  getVoiceState: () => ipcRenderer.invoke('voice:state') as Promise<VoiceStatePayload>,
  listMicDevices: () => ipcRenderer.invoke('voice:devices') as Promise<MicDevice[]>,
  checkModel: () =>
    ipcRenderer.invoke('voice:check-model') as Promise<{ installed: boolean; path: string | null }>,
  downloadModel: () =>
    ipcRenderer.invoke('voice:download-model') as Promise<{ ok: boolean; message: string }>,

  runAction: (action: NexusAction) => ipcRenderer.invoke('action:run', action) as Promise<ActionResult>,
  pickExecutable: () => ipcRenderer.invoke('dialog:pick-exe') as Promise<string | null>,
  pickDirectory: () => ipcRenderer.invoke('dialog:pick-dir') as Promise<string | null>,

  aiStatus: () => ipcRenderer.invoke('ai:status') as Promise<AiStatus>,
  aiGenerate: (request: CodeRequest) => ipcRenderer.invoke('ai:generate', request) as Promise<CodeResult>,
  aiPullModel: (model: string) =>
    ipcRenderer.invoke('ai:pull', model) as Promise<{ ok: boolean; message: string }>,
  aiExecute: (filePath: string, language: string) =>
    ipcRenderer.invoke('ai:execute', filePath, language) as Promise<ExecResult>,
  aiOpenInEditor: (filePath: string) =>
    ipcRenderer.invoke('ai:open-editor', filePath) as Promise<ActionResult>,
  aiLanguages: () => ipcRenderer.invoke('ai:languages') as Promise<CodeLanguage[]>,
  aiAsk: (question, history) =>
    ipcRenderer.invoke('ai:ask', question, history) as Promise<{
      ok: boolean;
      answer: string;
      message: string;
    }>,

  runTool: (toolId: string, args: string) =>
    ipcRenderer.invoke('tool:run', toolId, args) as Promise<ToolRunResult>,
  stopTool: () => ipcRenderer.send('tool:stop'),
  checkTool: (command: string) =>
    ipcRenderer.invoke('tool:check', command) as Promise<{ found: boolean; path: string | null }>,

  checkRequirements: () => ipcRenderer.invoke('preflight:check') as Promise<Requirement[]>,
  fixRequirement: (id: string) =>
    ipcRenderer.invoke('preflight:fix', id) as Promise<{ ok: boolean; message: string }>,

  systemReport: (kind: SystemReportKind) =>
    ipcRenderer.invoke('system:report', kind) as Promise<string>,
  systemStats: () => ipcRenderer.invoke('system:stats') as Promise<SystemStats>,
  systemClean: () =>
    ipcRenderer.invoke('system:clean') as Promise<{ ok: boolean; freedMb: number; message: string }>,
  systemKill: (name: string) =>
    ipcRenderer.invoke('system:kill', name) as Promise<{ ok: boolean; message: string }>,

  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowMaximize: () => ipcRenderer.send('window:maximize'),
  windowClose: () => ipcRenderer.send('window:close'),

  appVersion: () => ipcRenderer.invoke('app:version') as Promise<string>,
  checkUpdate: () => ipcRenderer.invoke('update:check') as Promise<UpdatePayload>,
  installUpdate: () => ipcRenderer.send('update:install'),

  showHud: () => ipcRenderer.send('hud:show'),
  hideHud: () => ipcRenderer.send('hud:hide'),
  openConfigWindow: () => ipcRenderer.send('window:config'),
  quit: () => ipcRenderer.send('app:quit'),

  onVoiceHeard: (cb) => subscribe<VoiceHeardPayload>('voice:heard', cb),
  onVoicePartial: (cb) => subscribe<string>('voice:partial', cb),
  onVoiceState: (cb) => subscribe<VoiceStatePayload>('voice:state', cb),
  onModelProgress: (cb) => subscribe<number>('model:progress', cb),
  onOpenConfig: (cb) => subscribe<void>('ui:open-config', () => cb()),
  onAiChunk: (cb) => subscribe<string>('ai:chunk', cb),
  onAiPullProgress: (cb) => subscribe<{ pct: number; status: string }>('ai:pull-progress', cb),
  onToolOutput: (cb) => subscribe<{ text: string; stream: 'out' | 'err' }>('tool:output', cb),
  onPreflightLog: (cb) => subscribe<{ id: string; line: string }>('preflight:log', cb),
  onPreflightProgress: (cb) => subscribe<{ id: string; pct: number }>('preflight:progress', cb),
  onUpdate: (cb) => subscribe<UpdatePayload>('update:status', cb),
};

contextBridge.exposeInMainWorld('nexus', bridge);

/* Canais extras usados só internamente pelo renderer. */
contextBridge.exposeInMainWorld('nexusInternal', {
  onVoiceCommand: (cb: (text: string) => void) => subscribe<string>('voice:command', cb),
  onVoiceReply: (cb: (payload: { reply: string; ok: boolean; said?: string }) => void) =>
    subscribe<{ reply: string; ok: boolean; said?: string }>('voice:reply', cb),
  onConfigChanged: (cb: (config: NexusConfig) => void) =>
    subscribe<NexusConfig>('config:changed', cb),
});
