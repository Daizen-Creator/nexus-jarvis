import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseTypewriterOptions {
  /** Milissegundos por caractere. */
  speed?: number;
  /** Atraso antes do primeiro caractere. */
  startDelay?: number;
  /** Se falso, o texto aparece inteiro imediatamente. */
  enabled?: boolean;
  onChar?: (char: string, index: number) => void;
  onDone?: () => void;
}

export interface UseTypewriterResult {
  display: string;
  done: boolean;
  /** Pula direto para o texto completo. */
  skip: () => void;
}

/**
 * Datilografia caractere a caractere. Roda por `setTimeout`, nunca a 60fps —
 * o custo de re-render fica na casa de 20–30 Hz e só durante a digitação.
 */
export function useTypewriter(
  text: string,
  options: UseTypewriterOptions = {},
): UseTypewriterResult {
  const { speed = 26, startDelay = 0, enabled = true } = options;

  const [index, setIndex] = useState(0);
  const timerRef = useRef<number | null>(null);
  const onCharRef = useRef(options.onChar);
  const onDoneRef = useRef(options.onDone);
  const doneFiredRef = useRef(false);

  onCharRef.current = options.onChar;
  onDoneRef.current = options.onDone;

  // Recomeça sempre que o texto muda.
  useEffect(() => {
    doneFiredRef.current = false;
    setIndex(enabled ? 0 : text.length);
  }, [text, enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    if (index >= text.length) return undefined;

    const delay = index === 0 ? startDelay + speed : speed;
    timerRef.current = window.setTimeout(() => {
      onCharRef.current?.(text[index], index);
      setIndex((i) => i + 1);
    }, delay);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [index, text, speed, startDelay, enabled]);

  const done = index >= text.length;

  useEffect(() => {
    if (done && !doneFiredRef.current) {
      doneFiredRef.current = true;
      onDoneRef.current?.();
    }
  }, [done]);

  const skip = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIndex(text.length);
  }, [text.length]);

  return { display: text.slice(0, index), done, skip };
}
