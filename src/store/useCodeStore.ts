import { create } from 'zustand';
import type { CodeResult, ExecResult } from '../types/desktop';

/**
 * Estado da geração de código.
 *
 * O streaming escreve em `stream` a ~30 Hz enquanto o modelo responde. Isso é
 * bem abaixo dos 60 fps do canvas, então não compete com a esfera — mas por
 * isso mesmo mora num store separado: só o painel de código re-renderiza.
 */
interface CodeState {
  open: boolean;
  busy: boolean;
  language: string;
  prompt: string;
  /** Texto cru chegando do modelo, token a token. */
  stream: string;
  result: CodeResult | null;
  exec: ExecResult | null;
  executing: boolean;
  error: string | null;

  setOpen: (open: boolean) => void;
  begin: (language: string, prompt: string) => void;
  appendChunk: (text: string) => void;
  finish: (result: CodeResult) => void;
  fail: (message: string) => void;
  setExec: (exec: ExecResult | null) => void;
  setExecuting: (executing: boolean) => void;
  clear: () => void;
}

export const useCodeStore = create<CodeState>()((set) => ({
  open: false,
  busy: false,
  language: 'python',
  prompt: '',
  stream: '',
  result: null,
  exec: null,
  executing: false,
  error: null,

  setOpen: (open) => set({ open }),

  begin: (language, prompt) =>
    set({
      open: true,
      busy: true,
      language,
      prompt,
      stream: '',
      result: null,
      exec: null,
      error: null,
    }),

  appendChunk: (text) => set((s) => ({ stream: s.stream + text })),

  finish: (result) =>
    set({ busy: false, result, error: result.ok ? null : result.message }),

  fail: (message) => set({ busy: false, error: message }),

  setExec: (exec) => set({ exec }),
  setExecuting: (executing) => set({ executing }),

  clear: () =>
    set({ stream: '', result: null, exec: null, error: null, busy: false, executing: false }),
}));
