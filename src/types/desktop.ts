/**
 * Contrato compartilhado entre o processo principal do Electron, o preload e
 * o renderer. Um único arquivo para os três lados evita divergência de tipos.
 */

/* ------------------------------------------------------------------ */
/* Ações                                                               */
/* ------------------------------------------------------------------ */

export type SystemActionId =
  | 'volume-up'
  | 'volume-down'
  | 'mute'
  | 'play-pause'
  | 'next-track'
  | 'prev-track'
  | 'lock'
  | 'sleep'
  | 'shutdown'
  | 'restart';

export const SYSTEM_ACTION_LABEL: Record<SystemActionId, string> = {
  'volume-up': 'Aumentar volume',
  'volume-down': 'Diminuir volume',
  mute: 'Mudo',
  'play-pause': 'Reproduzir / pausar',
  'next-track': 'Próxima faixa',
  'prev-track': 'Faixa anterior',
  lock: 'Bloquear a tela',
  sleep: 'Suspender',
  shutdown: 'Desligar',
  restart: 'Reiniciar',
};

export type ActionKind = 'open-url' | 'open-app' | 'system' | 'speak' | 'search';

export interface NexusAction {
  kind: ActionKind;
  /** URL, caminho do executável, id de ação de sistema ou texto a falar. */
  target: string;
  /** Argumentos de linha de comando, só para `open-app`. */
  args?: string[];
}

export interface ActionResult {
  ok: boolean;
  message: string;
}

/* ------------------------------------------------------------------ */
/* Itens configuráveis                                                 */
/* ------------------------------------------------------------------ */

export interface SiteShortcut {
  id: string;
  name: string;
  /** Termos que casam com `abrir <termo>` e com voz. */
  phrases: string[];
  url: string;
}

export interface AppShortcut {
  id: string;
  name: string;
  phrases: string[];
  /** Caminho do executável ou nome resolvível pelo PATH/App Paths. */
  path: string;
  args: string[];
}

/** "Programar" comandos: frase → ação, criado pelo usuário no painel. */
export interface CustomCommand {
  id: string;
  phrases: string[];
  description: string;
  action: NexusAction;
  /** Resposta falada; vazio usa uma resposta padrão. */
  reply: string;
  enabled: boolean;
}

/* ------------------------------------------------------------------ */
/* Configuração                                                        */
/* ------------------------------------------------------------------ */

export interface NexusProfile {
  /** Login exigido pela tela de autenticação. */
  userName: string;
  /** Como o assistente se dirige a você: "Senhor", "Chefe", "Daniel"... */
  address: string;
  /** SHA-256 da senha. O texto puro nunca é gravado. */
  passwordHash: string;
  /** Nome do assistente (persona). Ex.: NEXA, SEXTA-FEIRA, FRIDAY. */
  assistantName: string;
}

export interface VoiceConfig {
  enabled: boolean;
  wakeWords: string[];
  /** Falso = qualquer fala vira comando; verdadeiro = exige a wake word. */
  requireWakeWord: boolean;
  /** Índice do dispositivo do sounddevice; null usa o padrão do sistema. */
  deviceIndex: number | null;
  /** Caminho do modelo Vosk; null usa o modelo baixado em `python/models`. */
  modelPath: string | null;
  /** 0..1 — descarta resultados abaixo desta confiança média. */
  minConfidence: number;
  speakResponses: boolean;
  /** Gênero da voz sintetizada. A persona feminina é a padrão. */
  voiceGender: 'female' | 'male';
  /** Voz específica escolhida pelo nome. Vazio = escolha automática por gênero. */
  voiceName: string;
  /** Velocidade da fala (0.5 lento … 2 rápido). */
  voiceRate: number;
  /** Tom da voz (0.5 grave … 2 agudo). */
  voicePitch: number;
}

export interface BehaviorConfig {
  autostart: boolean;
  startMinimized: boolean;
  /** Quanto o HUD fica visível depois de responder (ms). 0 = não some. */
  hudTimeoutMs: number;
  globalShortcut: string;
  showHudOnWake: boolean;
  soundEnabled: boolean;
  /** Id do tema (ver engine/themes.ts). */
  theme: string;
  /** Splash rápido em vez da longa sequência de boot. */
  splash: boolean;
  /**
   * Pula a tela de autenticação e entra direto, usando o perfil configurado.
   * Faz sentido num assistente pessoal de usuário único.
   */
  skipLogin: boolean;
}

export interface GuardConfig {
  allowShutdown: boolean;
  allowRestart: boolean;
  allowSleep: boolean;
  allowLock: boolean;
  allowApps: boolean;
  /**
   * Modo segurança: libera as ferramentas de categoria "ataque". Desligado
   * até você declarar que só as usa em sistemas próprios ou autorizados.
   */
  allowSecurity: boolean;
  /** Timestamp do aceite da nota de uso autorizado. 0 = não aceito. */
  securityAckAt: number;
}

/* ------------------------------------------------------------------ */
/* Geração de código                                                   */
/* ------------------------------------------------------------------ */

export interface CodeLanguage {
  id: string;
  label: string;
  /** Extensão gravada no arquivo, sem o ponto. */
  extension: string;
  /** Frases que casam com "programe em <...>". */
  phrases: string[];
  /** Como executar: comando e argumentos; `{file}` vira o caminho do arquivo. */
  run: { command: string; args: string[] } | null;
}

export interface AiConfig {
  enabled: boolean;
  /** Endpoint do Ollama. Local por padrão — nada sai da máquina. */
  baseUrl: string;
  /** Modelo de código. Um coder acerta sintaxe, mas inventa fatos. */
  model: string;
  /**
   * Modelo de conversa. Separado do de código de propósito: um modelo de
   * código responde "Santos Dumont foi um piloto francês" com toda a confiança.
   */
  chatModel: string;
  temperature: number;
  /** Teto de tokens da resposta. */
  maxTokens: number;
  /** Janela de contexto. Menor economiza VRAM; em GPUs pequenas isso importa. */
  contextSize: number;
  /** Pasta onde os arquivos gerados são gravados. */
  projectsDir: string;
  /** Executável do editor aberto depois de salvar. Vazio desativa. */
  editorCommand: string;
  saveToFile: boolean;
  openInEditor: boolean;
  /**
   * Executar o código gerado. Desligado por padrão: rodar código de um LLM sem
   * ler antes é o caminho mais curto para estragar alguma coisa.
   */
  allowExecute: boolean;
  /** Segundos até matar o processo do código gerado. */
  executeTimeoutSec: number;
  /**
   * Modo conversa: o que não casa com nenhum comando vai para o modelo local
   * e volta como resposta falada, em vez de "comando não reconhecido".
   */
  conversational: boolean;
  /** Quantas trocas anteriores o modelo enxerga numa conversa. */
  historyTurns: number;
}

export interface CodeRequest {
  language: string;
  prompt: string;
}

/** Categoria de uma ferramenta CLI — organiza o painel e o modo segurança. */
export type ToolCategory = 'geral' | 'recon' | 'defesa' | 'ataque';

/** Ferramenta de linha de comando registrada (sherlock, nmap, yt-dlp...). */
export interface CliTool {
  id: string;
  name: string;
  /** Frases que disparam a ferramenta por voz ou texto. */
  phrases: string[];
  command: string;
  /** `{args}` recebe o que você falou depois do nome da ferramenta. */
  args: string[];
  description: string;
  category: ToolCategory;
  enabled: boolean;
  /** Como instalar, quando não vem com o Windows. */
  install?: string;
}

export interface ToolRunResult {
  ok: boolean;
  exitCode: number | null;
  timedOut: boolean;
  message: string;
}

export interface SystemStats {
  cpu: number;
  ramUsed: number;
  ramTotal: number;
  gpuUtil: number | null;
  gpuTemp: number | null;
  gpuMemUsed: number | null;
  gpuMemTotal: number | null;
  uptimeH: number;
  uptimeM: number;
  os: string;
  disks: Array<{ id: string; freeGb: number; totalGb: number }>;
}

export type SystemReportKind =
  | 'stats'
  | 'processes'
  | 'disk'
  | 'battery'
  | 'temp'
  | 'startup'
  | 'network';

/* ------------------------------------------------------------------ */
/* Atualização automática                                              */
/* ------------------------------------------------------------------ */

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'none'
  | 'downloading'
  | 'ready'
  | 'error';

export interface UpdatePayload {
  status: UpdateStatus;
  /** Versão nova encontrada, quando houver. */
  version?: string;
  /** Progresso do download (0–100). */
  pct?: number;
  message?: string;
}

export type RequirementStatus = 'ok' | 'missing' | 'checking' | 'error';

export interface Requirement {
  id: string;
  label: string;
  status: RequirementStatus;
  detail: string;
  fixable: boolean;
  optional: boolean;
}

export interface CodeResult {
  ok: boolean;
  language: string;
  /** Código já extraído da cerca markdown. */
  code: string;
  /** Texto completo devolvido pelo modelo. */
  raw: string;
  filePath: string | null;
  message: string;
}

export interface ExecResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

export interface AiStatus {
  reachable: boolean;
  /** Modelos já baixados no Ollama. */
  models: string[];
  message: string;
}

/** Aparência da esfera de partículas — presets e ajustes finos. */
export interface SphereDesign {
  /** Preset nomeado (nucleo, nebulosa, grade, reator, constelacao, minimo). */
  preset: string;
  /** Multiplicador da contagem de partículas (0.4–1.6). */
  density: number;
  /** Quantos anéis orbitais desenhar (0–3). */
  rings: number;
  /** Teia de filamentos entre partículas. */
  filaments: boolean;
  /** Raios radiais do centro para as partículas (visual "holograma"). */
  radial: boolean;
  /** Intensidade do brilho (0.5–1.6). */
  glow: number;
  /** Multiplicador da rotação (0.3–2). */
  speed: number;
  /** Tamanho do núcleo (0.5–1.6). */
  coreSize: number;
}

export interface NexusConfig {
  version: number;
  profile: NexusProfile;
  voice: VoiceConfig;
  behavior: BehaviorConfig;
  sphere: SphereDesign;
  guards: GuardConfig;
  ai: AiConfig;
  sites: SiteShortcut[];
  apps: AppShortcut[];
  tools: CliTool[];
  customCommands: CustomCommand[];
}

/* ------------------------------------------------------------------ */
/* Estado do daemon de voz                                             */
/* ------------------------------------------------------------------ */

export type VoiceDaemonStatus =
  | 'stopped'
  | 'starting'
  | 'listening'
  | 'no-model'
  | 'no-microphone'
  | 'no-python'
  | 'error';

export interface VoiceStatePayload {
  status: VoiceDaemonStatus;
  message: string;
  /** Dispositivo em uso, quando houver. */
  device?: string;
}

export interface VoiceHeardPayload {
  text: string;
  /** Verdadeiro quando a wake word foi detectada (ou não é exigida). */
  awake: boolean;
  confidence: number;
}

export interface MicDevice {
  index: number;
  name: string;
  channels: number;
  hostApi: string;
}

/* ------------------------------------------------------------------ */
/* Ponte exposta pelo preload                                          */
/* ------------------------------------------------------------------ */

export interface NexusBridge {
  readonly isDesktop: true;
  readonly platform: string;
  readonly version: string;

  getConfig: () => Promise<NexusConfig>;
  saveConfig: (config: NexusConfig) => Promise<NexusConfig>;
  resetConfig: () => Promise<NexusConfig>;
  hashPassword: (plain: string) => Promise<string>;

  startVoice: () => Promise<VoiceStatePayload>;
  stopVoice: () => Promise<VoiceStatePayload>;
  getVoiceState: () => Promise<VoiceStatePayload>;
  listMicDevices: () => Promise<MicDevice[]>;
  checkModel: () => Promise<{ installed: boolean; path: string | null }>;
  downloadModel: (large?: boolean) => Promise<{ ok: boolean; message: string }>;

  runAction: (action: NexusAction) => Promise<ActionResult>;
  pickExecutable: () => Promise<string | null>;
  pickDirectory: () => Promise<string | null>;

  aiStatus: () => Promise<AiStatus>;
  aiGenerate: (request: CodeRequest) => Promise<CodeResult>;
  aiPullModel: (model: string) => Promise<{ ok: boolean; message: string }>;
  aiExecute: (filePath: string, language: string) => Promise<ExecResult>;
  aiOpenInEditor: (filePath: string) => Promise<ActionResult>;
  aiLanguages: () => Promise<CodeLanguage[]>;
  /** Pergunta livre ao modelo local; a resposta chega por `onAiChunk`. */
  aiAsk: (question: string, history: Array<{ role: 'user' | 'assistant'; content: string }>) =>
    Promise<{ ok: boolean; answer: string; message: string }>;

  runTool: (toolId: string, args: string) => Promise<ToolRunResult>;
  stopTool: () => void;
  checkTool: (command: string) => Promise<{ found: boolean; path: string | null }>;

  checkRequirements: () => Promise<Requirement[]>;
  fixRequirement: (id: string) => Promise<{ ok: boolean; message: string }>;

  systemReport: (kind: SystemReportKind) => Promise<string>;
  systemStats: () => Promise<SystemStats>;
  systemClean: () => Promise<{ ok: boolean; freedMb: number; message: string }>;
  systemKill: (name: string) => Promise<{ ok: boolean; message: string }>;

  /** Controles da janela sem moldura (chrome estilo Sistema). */
  windowMinimize: () => void;
  windowMaximize: () => void;
  windowClose: () => void;

  /** Versão instalada do app. */
  appVersion: () => Promise<string>;
  /** Procura atualização agora. */
  checkUpdate: () => Promise<UpdatePayload>;
  /** Reinicia e instala a atualização baixada. */
  installUpdate: () => void;

  showHud: () => void;
  hideHud: () => void;
  openConfigWindow: () => void;
  quit: () => void;

  onVoiceHeard: (cb: (payload: VoiceHeardPayload) => void) => () => void;
  onVoicePartial: (cb: (text: string) => void) => () => void;
  onVoiceState: (cb: (payload: VoiceStatePayload) => void) => () => void;
  onModelProgress: (cb: (pct: number) => void) => () => void;
  onOpenConfig: (cb: () => void) => () => void;
  /** Streaming da geração de código, token a token. */
  onAiChunk: (cb: (text: string) => void) => () => void;
  onAiPullProgress: (cb: (payload: { pct: number; status: string }) => void) => () => void;
  /** Saída ao vivo de uma ferramenta CLI. */
  onToolOutput: (cb: (payload: { text: string; stream: 'out' | 'err' }) => void) => () => void;
  onPreflightLog: (cb: (payload: { id: string; line: string }) => void) => () => void;
  onPreflightProgress: (cb: (payload: { id: string; pct: number }) => void) => () => void;
  /** Eventos do auto-update (verificando, baixando, pronto...). */
  onUpdate: (cb: (payload: UpdatePayload) => void) => () => void;
}

/** Canais internos renderer↔main que não fazem parte da API pública. */
export interface NexusInternal {
  onVoiceCommand: (cb: (text: string) => void) => () => void;
  onVoiceReply: (cb: (payload: { reply: string; ok: boolean; said?: string }) => void) => () => void;
  onConfigChanged: (cb: (config: NexusConfig) => void) => () => void;
}

/*
 * Este arquivo é compartilhado com o processo principal do Electron, que compila
 * sem a lib DOM. Por isso ele contém apenas tipos e constantes — os helpers que
 * tocam em `window` vivem em `src/desktop/bridge.ts`.
 */
