/**
 * Tipos centrais do NEXUS. Nada de `any` em nenhum ponto do projeto.
 */

/* ------------------------------------------------------------------ */
/* Jogador                                                             */
/* ------------------------------------------------------------------ */

export type Rank = 'E' | 'D' | 'C' | 'B' | 'A' | 'S';

export type AttributeKey =
  | 'forca'
  | 'agilidade'
  | 'inteligencia'
  | 'percepcao'
  | 'vitalidade';

export type Attributes = Record<AttributeKey, number>;

export interface AttributeMeta {
  key: AttributeKey;
  label: string;
  short: string;
  icon: string;
}

export interface LevelUpInfo {
  from: number;
  to: number;
  rankFrom: Rank;
  rankTo: Rank;
  pointsGained: number;
}

/* ------------------------------------------------------------------ */
/* Missões diárias                                                     */
/* ------------------------------------------------------------------ */

export type QuestMetric = 'commands' | 'voice' | 'level' | 'theme';

export interface Quest {
  id: string;
  title: string;
  description: string;
  metric: QuestMetric;
  target: number;
  progress: number;
  xp: number;
  completed: boolean;
}

/* ------------------------------------------------------------------ */
/* Esfera                                                              */
/* ------------------------------------------------------------------ */

export type SphereState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'alert'
  | 'levelup';

/** Id de um tema do registro (ver engine/themes.ts). */
export type Theme = string;

/* ------------------------------------------------------------------ */
/* Terminal / UI                                                       */
/* ------------------------------------------------------------------ */

export type TerminalKind = 'user' | 'system' | 'error' | 'info';

export interface TerminalLine {
  id: string;
  kind: TerminalKind;
  text: string;
  ts: number;
  /** Linhas do sistema entram com efeito typewriter na primeira renderização. */
  typed: boolean;
}

export type ModalKind = 'help' | 'status' | 'quests' | null;

export type UiPhase = 'boot' | 'preflight' | 'login' | 'dashboard';

export type ToastKind = 'info' | 'success' | 'error' | 'quest';

export interface ToastItem {
  id: string;
  kind: ToastKind;
  title: string;
  message: string;
}

/* ------------------------------------------------------------------ */
/* Registry de comandos                                                */
/* ------------------------------------------------------------------ */

export interface CommandContext {
  /** Texto original digitado/falado, sem normalização. */
  raw: string;
  /** Alias que casou com o comando, já normalizado. */
  matched: string;
  /** Restante depois do alias, ainda sem normalizar. */
  argString: string;
  /** Restante quebrado por espaços. */
  args: string[];
  /** Escreve no terminal. */
  print: (text: string, kind?: TerminalKind) => void;
  /** Escreve no terminal e fala. */
  respond: (text: string) => void;
}

export interface Command {
  id: string;
  aliases: string[];
  description: string;
  usage?: string;
  run: (ctx: CommandContext) => void;
}

/* ------------------------------------------------------------------ */
/* Áudio                                                               */
/* ------------------------------------------------------------------ */

export type SoundName =
  | 'key'
  | 'hover'
  | 'confirm'
  | 'error'
  | 'notify'
  | 'impact'
  | 'boot'
  | 'quest';
