import { motion } from 'framer-motion';
import { Panel } from '../SystemWindow';
import { AnimatedNumber } from '../AnimatedNumber';
import { useSound } from '../../hooks/useSound';
import { sphereController } from '../../hooks/useSphere';
import { ATTRIBUTE_META, usePlayerStore } from '../../store/usePlayerStore';
import type { AttributeKey } from '../../types';

/** Teto usado só para a proporção da barra — o atributo em si não tem limite. */
const BAR_SCALE = 60;

export function AttributesPanel(): JSX.Element {
  const attributes = usePlayerStore((s) => s.attributes);
  const points = usePlayerStore((s) => s.points);
  const spendPoint = usePlayerStore((s) => s.spendPoint);
  const sound = useSound();

  const handleSpend = (key: AttributeKey): void => {
    if (points <= 0) return;
    spendPoint(key);
    sound.play('confirm');
    sphereController.pulse(0.5);
  };

  return (
    <Panel title="Atributos" meta="ATR-02">
      <div className="mb-3 flex items-center justify-between">
        <span className="nx-label">Pontos disponíveis</span>
        <span
          className={`font-display text-lg font-black leading-none ${
            points > 0 ? 'text-gold nx-glow' : 'text-ice/30'
          }`}
        >
          <AnimatedNumber value={points} />
        </span>
      </div>

      <ul className="space-y-2.5">
        {ATTRIBUTE_META.map((meta) => {
          const value = attributes[meta.key];
          const pct = Math.min(100, (value / BAR_SCALE) * 100);
          return (
            <li key={meta.key}>
              <div className="mb-1 flex items-center gap-2">
                <span aria-hidden="true" className="w-4 text-center text-xs text-cyan">
                  {meta.icon}
                </span>
                <span className="nx-label flex-1">{meta.label}</span>
                <span className="font-display text-sm font-bold text-ice">
                  <AnimatedNumber value={value} duration={0.45} />
                </span>
                <button
                  type="button"
                  onClick={() => handleSpend(meta.key)}
                  onMouseEnter={sound.hover}
                  disabled={points <= 0}
                  aria-label={`Distribuir um ponto em ${meta.label}`}
                  className="grid h-6 w-6 place-items-center border border-gold/60 text-xs font-bold text-gold transition-all duration-200 hover:bg-gold/20 disabled:cursor-not-allowed disabled:border-ice/15 disabled:text-ice/20 disabled:hover:bg-transparent"
                >
                  +
                </button>
              </div>
              <div className="nx-bar h-1.5">
                <motion.div
                  className="nx-bar__fill bg-gradient-to-r from-blue/60 to-cyan"
                  initial={false}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
