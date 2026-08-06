import { useMemo } from 'react';

interface CornerProps {
  position: 'tl' | 'tr' | 'bl' | 'br';
}

const CORNER_CLASS: Record<CornerProps['position'], string> = {
  tl: 'top-0 left-0',
  tr: 'top-0 right-0 -scale-x-100',
  bl: 'bottom-0 left-0 -scale-y-100',
  br: 'bottom-0 right-0 -scale-100',
};

function Corner({ position }: CornerProps): JSX.Element {
  return (
    <svg
      viewBox="0 0 160 160"
      className={`absolute h-24 w-24 sm:h-36 sm:w-36 ${CORNER_CLASS[position]}`}
      fill="none"
    >
      <path
        d="M4 60 L4 20 Q4 4 20 4 L60 4"
        stroke="rgb(var(--c-blue))"
        strokeOpacity="0.45"
        strokeWidth="1.2"
      />
      <path
        d="M12 72 L12 26 Q12 12 26 12 L72 12"
        stroke="rgb(var(--c-blue))"
        strokeOpacity="0.18"
        strokeWidth="1"
      />
      <circle cx="20" cy="20" r="3" fill="rgb(var(--c-cyan))" fillOpacity="0.6" />
      <path d="M4 84 L4 104" stroke="rgb(var(--c-cyan))" strokeOpacity="0.5" strokeWidth="2" />
      <path d="M84 4 L108 4" stroke="rgb(var(--c-cyan))" strokeOpacity="0.5" strokeWidth="2" />
      {Array.from({ length: 6 }, (_, i) => (
        <path
          key={i}
          d={`M26 ${34 + i * 9} L${34 + (i % 3) * 8} ${34 + i * 9}`}
          stroke="rgb(var(--c-blue))"
          strokeOpacity="0.22"
          strokeWidth="1"
        />
      ))}
    </svg>
  );
}

function TickRing({ className, reverse }: { className: string; reverse?: boolean }): JSX.Element {
  const ticks = useMemo(
    () =>
      Array.from({ length: 60 }, (_, i) => {
        const angle = (i / 60) * Math.PI * 2;
        const long = i % 5 === 0;
        const r1 = long ? 62 : 68;
        const r2 = 72;
        return {
          x1: 80 + Math.cos(angle) * r1,
          y1: 80 + Math.sin(angle) * r1,
          x2: 80 + Math.cos(angle) * r2,
          y2: 80 + Math.sin(angle) * r2,
          long,
        };
      }),
    [],
  );

  return (
    <svg
      viewBox="0 0 160 160"
      className={`${className} ${reverse ? 'animate-spinslow-rev' : 'animate-spinslow'}`}
      fill="none"
    >
      <circle
        cx="80"
        cy="80"
        r="72"
        stroke="rgb(var(--c-blue))"
        strokeOpacity="0.12"
        strokeWidth="1"
      />
      {ticks.map((t, i) => (
        <line
          key={i}
          x1={t.x1}
          y1={t.y1}
          x2={t.x2}
          y2={t.y2}
          stroke="rgb(var(--c-blue))"
          strokeOpacity={t.long ? 0.4 : 0.16}
          strokeWidth={t.long ? 1.4 : 0.8}
        />
      ))}
      <path
        d="M80 8 A72 72 0 0 1 140 44"
        stroke="rgb(var(--c-cyan))"
        strokeOpacity="0.55"
        strokeWidth="1.6"
      />
    </svg>
  );
}

/**
 * Camada decorativa em SVG por cima do canvas: anéis de canto, tickmarks
 * girando e textos técnicos. Puramente estética — `aria-hidden`.
 */
export function HudOverlay(): JSX.Element {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-10 overflow-hidden">
      <Corner position="tl" />
      <Corner position="tr" />
      <Corner position="bl" />
      <Corner position="br" />

      <TickRing className="absolute left-1/2 top-1/2 h-[68vmin] w-[68vmin] -translate-x-1/2 -translate-y-1/2 opacity-40" />
      <TickRing
        className="absolute left-1/2 top-1/2 h-[86vmin] w-[86vmin] -translate-x-1/2 -translate-y-1/2 opacity-20"
        reverse
      />

      {/* Textos técnicos decorativos */}
      <div className="absolute left-1/2 top-6 -translate-x-1/2 font-mono text-[0.55rem] tracking-[0.5em] text-blue/25">
        SYS-04 · CORE STABLE
      </div>
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 font-mono text-[0.55rem] tracking-[0.4em] text-blue/20">
        LAT 23.5505 S · LON 46.6333 W · ARC 100%
      </div>
      <div className="absolute left-6 top-1/2 hidden -translate-y-1/2 -rotate-90 font-mono text-[0.55rem] tracking-[0.4em] text-blue/20 lg:block">
        NEXUS PROTOCOL // BUILD 1.0.0
      </div>
      <div className="absolute right-6 top-1/2 hidden -translate-y-1/2 rotate-90 font-mono text-[0.55rem] tracking-[0.4em] text-blue/20 lg:block">
        LINK ENCRYPTED // AES-256
      </div>

      {/* Marcações de escala laterais */}
      <svg
        viewBox="0 0 20 400"
        preserveAspectRatio="none"
        className="absolute left-2 top-1/4 hidden h-1/2 w-5 md:block"
      >
        {Array.from({ length: 21 }, (_, i) => (
          <line
            key={i}
            x1="0"
            y1={i * 20}
            x2={i % 5 === 0 ? 16 : 8}
            y2={i * 20}
            stroke="rgb(var(--c-blue))"
            strokeOpacity={i % 5 === 0 ? 0.35 : 0.15}
            strokeWidth="1"
          />
        ))}
      </svg>
      <svg
        viewBox="0 0 20 400"
        preserveAspectRatio="none"
        className="absolute right-2 top-1/4 hidden h-1/2 w-5 md:block"
      >
        {Array.from({ length: 21 }, (_, i) => (
          <line
            key={i}
            x1="20"
            y1={i * 20}
            x2={i % 5 === 0 ? 4 : 12}
            y2={i * 20}
            stroke="rgb(var(--c-blue))"
            strokeOpacity={i % 5 === 0 ? 0.35 : 0.15}
            strokeWidth="1"
          />
        ))}
      </svg>
    </div>
  );
}
