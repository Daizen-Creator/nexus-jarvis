import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Panel } from '../SystemWindow';
import { AnimatedNumber } from '../AnimatedNumber';
import {
  maxHpFor,
  maxManaFor,
  usePlayerStore,
  xpForLevel,
} from '../../store/usePlayerStore';
import type { Rank } from '../../types';

export const RANK_STYLE: Record<Rank, { text: string; border: string; bg: string; extra: string }> = {
  E: { text: 'text-ice/55', border: 'border-ice/30', bg: 'bg-ice/5', extra: '' },
  D: { text: 'text-success', border: 'border-success/60', bg: 'bg-success/10', extra: '' },
  C: { text: 'text-blue', border: 'border-blue/60', bg: 'bg-blue/10', extra: '' },
  B: { text: 'text-violet', border: 'border-violet/60', bg: 'bg-violet/10', extra: '' },
  A: { text: 'text-gold', border: 'border-gold/70', bg: 'bg-gold/10', extra: '' },
  S: {
    text: 'text-danger',
    border: 'border-danger/80',
    bg: 'bg-danger/10',
    extra: 'animate-rank-pulse',
  },
};

interface VitalBarProps {
  label: string;
  value: number;
  max: number;
  colorClass: string;
}

function VitalBar({ label, value, max, colorClass }: VitalBarProps): JSX.Element {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="nx-label">{label}</span>
        <span className="font-mono text-[0.65rem] text-ice/70">
          <AnimatedNumber value={Math.round(value)} duration={0.35} /> / {Math.round(max)}
        </span>
      </div>
      <div className="nx-bar">
        <motion.div
          className={`nx-bar__fill ${colorClass}`}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </div>
    </div>
  );
}

/**
 * Identidade do Jogador: rank, nível, XP e vitais com regeneração contínua.
 * A regeneração roda a 4 Hz — longe dos 60 fps do canvas.
 */
export function StatusPanel(): JSX.Element {
  const name = usePlayerStore((s) => s.name);
  const level = usePlayerStore((s) => s.level);
  const rank = usePlayerStore((s) => s.rank);
  const xp = usePlayerStore((s) => s.xp);
  const hp = usePlayerStore((s) => s.hp);
  const mana = usePlayerStore((s) => s.mana);
  const attributes = usePlayerStore((s) => s.attributes);
  const regen = usePlayerStore((s) => s.regen);

  useEffect(() => {
    const interval = window.setInterval(() => regen(0.25), 250);
    return () => window.clearInterval(interval);
  }, [regen]);

  const needed = xpForLevel(level);
  const pct = Math.min(100, (xp / needed) * 100);
  const style = RANK_STYLE[rank];

  return (
    <Panel title="Status" meta="PLR-01">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="nx-label">Jogador</p>
          <p className="truncate font-display text-base font-bold tracking-[0.1em] text-ice nx-glow">
            {name || '—'}
          </p>

          <div className="mt-3 flex items-center gap-2">
            <span
              className={`grid h-8 w-8 place-items-center border font-display text-sm font-black ${style.text} ${style.border} ${style.bg} ${style.extra}`}
              aria-label={`Rank ${rank}`}
            >
              {rank}
            </span>
            <span className="nx-label">Rank</span>
          </div>
        </div>

        <div className="text-right">
          <p className="nx-label">Nível</p>
          <AnimatedNumber
            value={level}
            className="block font-display text-4xl font-black leading-none text-cyan nx-glow"
          />
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="nx-label">Experiência</span>
          <span className="font-mono text-[0.65rem] text-ice/70">
            <AnimatedNumber value={xp} duration={0.5} /> / {needed}
            <span className="ml-2 text-cyan">
              <AnimatedNumber value={pct} decimals={1} duration={0.5} suffix="%" />
            </span>
          </span>
        </div>
        <div className="nx-bar h-2.5">
          <motion.div
            className="nx-bar__fill overflow-hidden bg-gradient-to-r from-blue to-cyan"
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
            style={{ boxShadow: '0 0 12px rgb(var(--c-blue) / 0.8)' }}
          >
            {/* brilho correndo por dentro da barra */}
            <span className="nx-bar__shine animate-sweep-x" />
          </motion.div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <VitalBar
          label="HP"
          value={hp}
          max={maxHpFor(level, attributes)}
          colorClass="bg-gradient-to-r from-danger/70 to-danger"
        />
        <VitalBar
          label="Mana"
          value={mana}
          max={maxManaFor(level, attributes)}
          colorClass="bg-gradient-to-r from-violet/70 to-violet"
        />
      </div>
    </Panel>
  );
}
