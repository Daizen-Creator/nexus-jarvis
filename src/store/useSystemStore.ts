import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { personalize } from '../engine/personalize';
import { nextThemeId } from '../engine/themes';
import type {
  ModalKind,
  SphereState,
  TerminalKind,
  TerminalLine,
  Theme,
  ToastItem,
  ToastKind,
  UiPhase,
} from '../types';

const MAX_LINES = 200;

let idSeq = 0;
const nextId = (prefix: string): string => {
  idSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${idSeq}`;
};

interface SystemPersisted {
  theme: Theme;
  soundEnabled: boolean;
  voiceEnabled: boolean;
  /** "Lembrar-me": sem isso a sessão não é restaurada no próximo boot. */
  remember: boolean;
}

interface SystemState extends SystemPersisted {
  phase: UiPhase;
  modal: ModalKind;
  lines: TerminalLine[];
  toasts: ToastItem[];
  micActive: boolean;
  micSupported: boolean;
  sphereState: SphereState;
  cinematicActive: boolean;
  loginVisible: boolean;
  reducedMotion: boolean;
  configOpen: boolean;

  setPhase: (phase: UiPhase) => void;
  setModal: (modal: ModalKind) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => Theme;
  setRemember: (remember: boolean) => void;
  setSoundEnabled: (enabled: boolean) => void;
  toggleSound: () => boolean;
  setVoiceEnabled: (enabled: boolean) => void;
  setMicActive: (active: boolean) => void;
  setMicSupported: (supported: boolean) => void;
  setSphereState: (state: SphereState) => void;
  setCinematicActive: (active: boolean) => void;
  setLoginVisible: (visible: boolean) => void;
  setReducedMotion: (reduced: boolean) => void;
  setConfigOpen: (open: boolean) => void;

  print: (text: string, kind?: TerminalKind) => void;
  clearLines: () => void;
  markTyped: (id: string) => void;

  pushToast: (kind: ToastKind, title: string, message: string) => void;
  dismissToast: (id: string) => void;
}

export const useSystemStore = create<SystemState>()(
  persist(
    (set, get) => ({
      theme: 'stark',
      soundEnabled: true,
      voiceEnabled: true,
      remember: true,

      phase: 'boot',
      modal: null,
      lines: [],
      toasts: [],
      micActive: false,
      micSupported: false,
      sphereState: 'idle',
      cinematicActive: false,
      loginVisible: true,
      reducedMotion: false,
      configOpen: false,

      setPhase: (phase) => set({ phase }),
      setModal: (modal) => set({ modal }),

      setTheme: (theme) => set({ theme }),
      toggleTheme: () => {
        // Avança para o próximo tema do registro (são dezenas).
        const theme: Theme = nextThemeId(get().theme);
        set({ theme });
        return theme;
      },

      setRemember: (remember) => set({ remember }),
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
      toggleSound: () => {
        const soundEnabled = !get().soundEnabled;
        set({ soundEnabled });
        return soundEnabled;
      },

      setVoiceEnabled: (voiceEnabled) => set({ voiceEnabled }),
      setMicActive: (micActive) => set({ micActive }),
      setMicSupported: (micSupported) => set({ micSupported }),
      setSphereState: (sphereState) => set({ sphereState }),
      setCinematicActive: (cinematicActive) => set({ cinematicActive }),
      setLoginVisible: (loginVisible) => set({ loginVisible }),
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
      setConfigOpen: (configOpen) => set({ configOpen }),

      print: (text, kind = 'system') => {
        const line: TerminalLine = {
          id: nextId('line'),
          kind,
          // Mesma personalização da fala: o terminal e a voz falam igual.
          text: personalize(text),
          ts: Date.now(),
          typed: kind === 'user',
        };
        set((s) => ({ lines: [...s.lines, line].slice(-MAX_LINES) }));
      },

      clearLines: () => set({ lines: [] }),

      markTyped: (id) =>
        set((s) => ({
          lines: s.lines.map((l) => (l.id === id ? { ...l, typed: true } : l)),
        })),

      pushToast: (kind, title, message) => {
        const toast: ToastItem = { id: nextId('toast'), kind, title, message };
        set((s) => ({ toasts: [...s.toasts, toast].slice(-4) }));
        window.setTimeout(() => get().dismissToast(toast.id), 4600);
      },

      dismissToast: (id) =>
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    }),
    {
      name: 'nexus_system',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): SystemPersisted => ({
        theme: s.theme,
        soundEnabled: s.soundEnabled,
        voiceEnabled: s.voiceEnabled,
        remember: s.remember,
      }),
    },
  ),
);
