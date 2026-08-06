import { useCallback, useEffect, useMemo } from 'react';
import { audio } from '../engine/AudioEngine';
import { useSystemStore } from '../store/useSystemStore';
import type { SoundName } from '../types';

export interface UseSoundResult {
  play: (name: SoundName) => void;
  /** Handlers prontos para `onMouseEnter` / `onFocus`. */
  hover: () => void;
  key: () => void;
  enabled: boolean;
  unlock: () => void;
}

/**
 * Acesso ao motor de áudio já respeitando o mute global persistido no store.
 * O `AudioContext` só nasce dentro de um gesto do usuário — daí o `unlock()`.
 */
export function useSound(): UseSoundResult {
  const enabled = useSystemStore((s) => s.soundEnabled);

  useEffect(() => {
    audio.setMuted(!enabled);
  }, [enabled]);

  const play = useCallback(
    (name: SoundName) => {
      if (!enabled) return;
      audio.play(name);
    },
    [enabled],
  );

  const hover = useCallback(() => play('hover'), [play]);
  const key = useCallback(() => play('key'), [play]);
  const unlock = useCallback(() => audio.unlock(), []);

  return useMemo(
    () => ({ play, hover, key, enabled, unlock }),
    [play, hover, key, enabled, unlock],
  );
}
