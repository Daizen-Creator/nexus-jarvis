import { useEffect, useRef } from 'react';
import { animate } from 'framer-motion';

export interface AnimatedNumberProps {
  value: number;
  /** Casas decimais exibidas. */
  decimals?: number;
  duration?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
}

/**
 * Contador animado que escreve direto no DOM.
 *
 * Nenhum `setState` por frame: a interpolação do framer-motion atualiza o
 * `textContent` do span, então o React não re-renderiza durante a contagem.
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  duration = 0.7,
  className = '',
  prefix = '',
  suffix = '',
}: AnimatedNumberProps): JSX.Element {
  const ref = useRef<HTMLSpanElement | null>(null);
  const fromRef = useRef(value);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const from = fromRef.current;
    const to = value;
    fromRef.current = to;

    if (from === to) {
      node.textContent = `${prefix}${to.toFixed(decimals)}${suffix}`;
      return undefined;
    }

    const controls = animate(from, to, {
      duration,
      ease: [0.2, 0.8, 0.2, 1],
      onUpdate: (latest) => {
        node.textContent = `${prefix}${latest.toFixed(decimals)}${suffix}`;
      },
    });

    return () => controls.stop();
  }, [value, decimals, duration, prefix, suffix]);

  return (
    <span ref={ref} className={className}>
      {`${prefix}${value.toFixed(decimals)}${suffix}`}
    </span>
  );
}
