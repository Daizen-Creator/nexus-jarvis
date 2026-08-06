import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface Note {
  id: string;
  text: string;
  ts: number;
}

interface NotesState {
  notes: Note[];
  add: (text: string) => void;
  remove: (id: string) => void;
  clear: () => void;
}

/** Anotações rápidas ditadas por voz ou digitadas. Persistidas localmente. */
export const useNotesStore = create<NotesState>()(
  persist(
    (set) => ({
      notes: [],
      add: (text) =>
        set((s) => ({
          notes: [
            ...s.notes,
            { id: `n-${Date.now().toString(36)}`, text: text.trim(), ts: Date.now() },
          ].slice(-100),
        })),
      remove: (id) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),
      clear: () => set({ notes: [] }),
    }),
    {
      name: 'nexus_notes',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
