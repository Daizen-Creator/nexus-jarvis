import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  AttributeKey,
  AttributeMeta,
  Attributes,
  LevelUpInfo,
  Quest,
  QuestMetric,
  Rank,
} from '../types';

/* ------------------------------------------------------------------ */
/* Regras de progressão                                                */
/* ------------------------------------------------------------------ */

export const RANK_THRESHOLDS: ReadonlyArray<{ level: number; rank: Rank }> = [
  { level: 50, rank: 'S' },
  { level: 35, rank: 'A' },
  { level: 20, rank: 'B' },
  { level: 10, rank: 'C' },
  { level: 5, rank: 'D' },
  { level: 1, rank: 'E' },
];

export const rankForLevel = (level: number): Rank => {
  for (const t of RANK_THRESHOLDS) {
    if (level >= t.level) return t.rank;
  }
  return 'E';
};

/** Curva de XP: cresce ~22% por nível. */
export const xpForLevel = (level: number): number =>
  Math.round(100 * Math.pow(1.22, Math.max(0, level - 1)));

export const POINTS_PER_LEVEL = 3;
export const XP_PER_COMMAND = 15;

export const ATTRIBUTE_META: ReadonlyArray<AttributeMeta> = [
  { key: 'forca', label: 'Força', short: 'FOR', icon: '⚔' },
  { key: 'agilidade', label: 'Agilidade', short: 'AGI', icon: '⟁' },
  { key: 'inteligencia', label: 'Inteligência', short: 'INT', icon: '✶' },
  { key: 'percepcao', label: 'Percepção', short: 'PER', icon: '◉' },
  { key: 'vitalidade', label: 'Vitalidade', short: 'VIT', icon: '❖' },
];

const BASE_ATTRIBUTES: Attributes = {
  forca: 10,
  agilidade: 10,
  inteligencia: 10,
  percepcao: 10,
  vitalidade: 10,
};

export const maxHpFor = (level: number, attrs: Attributes): number =>
  100 + (level - 1) * 20 + attrs.vitalidade * 6;

export const maxManaFor = (level: number, attrs: Attributes): number =>
  50 + (level - 1) * 15 + attrs.inteligencia * 5;

/* ------------------------------------------------------------------ */
/* Missões diárias                                                     */
/* ------------------------------------------------------------------ */

const DAY_MS = 24 * 60 * 60 * 1000;

export const buildDailyQuests = (): Quest[] => [
  {
    id: 'q-commands',
    title: 'Operador Ativo',
    description: 'Executar 3 comandos no terminal',
    metric: 'commands',
    target: 3,
    progress: 0,
    xp: 60,
    completed: false,
  },
  {
    id: 'q-voice',
    title: 'Canal de Voz',
    description: 'Ativar o modo de voz',
    metric: 'voice',
    target: 1,
    progress: 0,
    xp: 40,
    completed: false,
  },
  {
    id: 'q-level',
    title: 'Ascensão',
    description: 'Alcançar o nível 2',
    metric: 'level',
    target: 2,
    progress: 1,
    xp: 80,
    completed: false,
  },
  {
    id: 'q-theme',
    title: 'Recalibrar Espectro',
    description: 'Alternar o tema do núcleo',
    metric: 'theme',
    target: 1,
    progress: 0,
    xp: 30,
    completed: false,
  },
];

/* ------------------------------------------------------------------ */
/* Shape do store                                                      */
/* ------------------------------------------------------------------ */

interface PlayerData {
  name: string;
  loggedIn: boolean;
  level: number;
  xp: number;
  rank: Rank;
  attributes: Attributes;
  points: number;
  hp: number;
  mana: number;
  quests: Quest[];
  questsStamp: number;
  history: string[];
  totalCommands: number;
  createdAt: number;
}

interface PlayerActions {
  login: (name: string) => void;
  logout: () => void;
  addXp: (amount: number) => void;
  spendPoint: (key: AttributeKey) => void;
  trackQuest: (metric: QuestMetric, value?: number) => void;
  ensureDailyQuests: () => void;
  pushHistory: (entry: string) => void;
  regen: (dt: number) => void;
  damage: (amount: number) => void;
  forceLevelUp: () => void;
  consumeLevelUp: () => void;
}

interface PlayerState extends PlayerData, PlayerActions {
  lastLevelUp: LevelUpInfo | null;
  /** XP creditado por missão desde o último render — alimenta os toasts. */
  questFlash: { id: string; title: string; xp: number } | null;
  consumeQuestFlash: () => void;
}

const initialData = (): PlayerData => ({
  name: '',
  loggedIn: false,
  level: 1,
  xp: 0,
  rank: 'E',
  attributes: { ...BASE_ATTRIBUTES },
  points: 0,
  hp: maxHpFor(1, BASE_ATTRIBUTES),
  mana: maxManaFor(1, BASE_ATTRIBUTES),
  quests: buildDailyQuests(),
  questsStamp: Date.now(),
  history: [],
  totalCommands: 0,
  createdAt: Date.now(),
});

/* ------------------------------------------------------------------ */
/* Núcleo puro de XP — sem efeitos colaterais                          */
/* ------------------------------------------------------------------ */

interface XpResult {
  level: number;
  xp: number;
  rank: Rank;
  points: number;
  hp: number;
  mana: number;
  lastLevelUp: LevelUpInfo | null;
}

const applyXp = (
  state: Pick<PlayerState, 'level' | 'xp' | 'points' | 'rank' | 'attributes' | 'hp' | 'mana'>,
  amount: number,
  prior: LevelUpInfo | null,
): XpResult => {
  let level = state.level;
  let xp = state.xp + Math.max(0, Math.round(amount));
  let points = state.points;

  const fromLevel = prior?.from ?? level;
  const rankFrom = prior?.rankFrom ?? state.rank;
  let gained = prior?.pointsGained ?? 0;

  // Guarda contra loops absurdos caso alguém injete um XP gigantesco.
  let guard = 0;
  while (xp >= xpForLevel(level) && guard < 200) {
    xp -= xpForLevel(level);
    level += 1;
    points += POINTS_PER_LEVEL;
    gained += POINTS_PER_LEVEL;
    guard += 1;
  }

  const rank = rankForLevel(level);
  const maxHp = maxHpFor(level, state.attributes);
  const maxMana = maxManaFor(level, state.attributes);
  const leveled = level > fromLevel;

  return {
    level,
    xp,
    rank,
    points,
    // Subir de nível restaura completamente.
    hp: leveled ? maxHp : Math.min(state.hp, maxHp),
    mana: leveled ? maxMana : Math.min(state.mana, maxMana),
    lastLevelUp: leveled
      ? { from: fromLevel, to: level, rankFrom, rankTo: rank, pointsGained: gained }
      : prior,
  };
};

/**
 * Atualiza o progresso das missões e devolve o XP bônus a creditar.
 * Não credita nada por conta própria — quem chama fecha o ciclo, o que evita
 * recursão entre "subir de nível" e "missão de nível concluída".
 */
const syncQuests = (
  quests: Quest[],
  level: number,
  patch: { metric: QuestMetric; value: number; absolute: boolean } | null,
): { quests: Quest[]; bonusXp: number; completed: Quest[] } => {
  let bonusXp = 0;
  const completed: Quest[] = [];

  const next = quests.map((q) => {
    if (q.completed) return q;
    let progress = q.progress;

    if (q.metric === 'level') {
      progress = Math.max(progress, level);
    } else if (patch && patch.metric === q.metric) {
      progress = patch.absolute
        ? Math.max(progress, patch.value)
        : progress + patch.value;
    }

    progress = Math.min(progress, q.target);
    if (progress >= q.target) {
      bonusXp += q.xp;
      const done: Quest = { ...q, progress, completed: true };
      completed.push(done);
      return done;
    }
    return progress === q.progress ? q : { ...q, progress };
  });

  return { quests: next, bonusXp, completed };
};

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      ...initialData(),
      lastLevelUp: null,
      questFlash: null,

      login: (name) => {
        const trimmed = name.trim() || 'JOGADOR';
        const state = get();
        set({
          name: trimmed,
          loggedIn: true,
          createdAt: state.createdAt || Date.now(),
        });
        get().ensureDailyQuests();
      },

      logout: () => {
        set({ ...initialData(), lastLevelUp: null, questFlash: null });
      },

      addXp: (amount) => {
        if (amount <= 0) return;
        set((s) => {
          let level = s.level;
          let xp = s.xp;
          let points = s.points;
          let rank = s.rank;
          let hp = s.hp;
          let mana = s.mana;
          let info = s.lastLevelUp;
          let quests = s.quests;
          let flash = s.questFlash;

          let pending = amount;
          let guard = 0;

          // Creditar XP pode concluir a missão de nível, que credita mais XP,
          // que pode subir outro nível. O laço fecha esse ciclo com segurança.
          while (pending > 0 && guard < 8) {
            guard += 1;
            const r = applyXp(
              { level, xp, points, rank, attributes: s.attributes, hp, mana },
              pending,
              info,
            );
            level = r.level;
            xp = r.xp;
            points = r.points;
            rank = r.rank;
            hp = r.hp;
            mana = r.mana;
            info = r.lastLevelUp;

            const q = syncQuests(quests, level, null);
            quests = q.quests;
            pending = q.bonusXp;
            if (q.completed.length > 0) {
              const last = q.completed[q.completed.length - 1];
              flash = { id: last.id, title: last.title, xp: last.xp };
            }
          }

          return {
            level,
            xp,
            points,
            rank,
            hp,
            mana,
            quests,
            lastLevelUp: info,
            questFlash: flash,
          };
        });
      },

      spendPoint: (key) => {
        const s = get();
        if (s.points <= 0) return;
        const attributes: Attributes = { ...s.attributes, [key]: s.attributes[key] + 1 };
        set({
          attributes,
          points: s.points - 1,
          hp: Math.min(s.hp, maxHpFor(s.level, attributes)),
          mana: Math.min(s.mana, maxManaFor(s.level, attributes)),
        });
      },

      trackQuest: (metric, value = 1) => {
        const s = get();
        const absolute = metric === 'level';
        const r = syncQuests(s.quests, s.level, { metric, value, absolute });
        if (r.quests === s.quests && r.bonusXp === 0) return;

        const flash =
          r.completed.length > 0
            ? {
                id: r.completed[r.completed.length - 1].id,
                title: r.completed[r.completed.length - 1].title,
                xp: r.completed[r.completed.length - 1].xp,
              }
            : s.questFlash;

        set({ quests: r.quests, questFlash: flash });
        if (r.bonusXp > 0) get().addXp(r.bonusXp);
      },

      ensureDailyQuests: () => {
        const s = get();
        if (Date.now() - s.questsStamp < DAY_MS) return;
        set({ quests: buildDailyQuests(), questsStamp: Date.now() });
      },

      pushHistory: (entry) => {
        set((s) => ({
          history: [...s.history, entry].slice(-50),
          totalCommands: s.totalCommands + 1,
        }));
      },

      regen: (dt) => {
        const s = get();
        if (!s.loggedIn) return;
        const maxHp = maxHpFor(s.level, s.attributes);
        const maxMana = maxManaFor(s.level, s.attributes);
        if (s.hp >= maxHp && s.mana >= maxMana) return;

        const hp = Math.min(maxHp, s.hp + (0.9 + s.attributes.vitalidade * 0.05) * dt);
        const mana = Math.min(maxMana, s.mana + (1.4 + s.attributes.inteligencia * 0.08) * dt);
        set({ hp, mana });
      },

      damage: (amount) => {
        set((s) => ({ hp: Math.max(0, s.hp - Math.abs(amount)) }));
      },

      forceLevelUp: () => {
        const s = get();
        get().addXp(xpForLevel(s.level) - s.xp);
      },

      consumeLevelUp: () => set({ lastLevelUp: null }),
      consumeQuestFlash: () => set({ questFlash: null }),
    }),
    {
      name: 'nexus_save',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): PlayerData => ({
        name: s.name,
        loggedIn: s.loggedIn,
        level: s.level,
        xp: s.xp,
        rank: s.rank,
        attributes: s.attributes,
        points: s.points,
        hp: s.hp,
        mana: s.mana,
        quests: s.quests,
        questsStamp: s.questsStamp,
        history: s.history,
        totalCommands: s.totalCommands,
        createdAt: s.createdAt,
      }),
    },
  ),
);

/* ------------------------------------------------------------------ */
/* Seletores utilitários                                               */
/* ------------------------------------------------------------------ */

export const selectXpNeeded = (s: PlayerState): number => xpForLevel(s.level);
export const selectMaxHp = (s: PlayerState): number => maxHpFor(s.level, s.attributes);
export const selectMaxMana = (s: PlayerState): number => maxManaFor(s.level, s.attributes);
