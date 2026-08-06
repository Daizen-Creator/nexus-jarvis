import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Panel } from '../SystemWindow';
import { usePlayerStore } from '../../store/usePlayerStore';

const DAY_MS = 24 * 60 * 60 * 1000;

const formatCountdown = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
};

export function QuestPanel(): JSX.Element {
  const quests = usePlayerStore((s) => s.quests);
  const questsStamp = usePlayerStore((s) => s.questsStamp);
  const ensureDailyQuests = usePlayerStore((s) => s.ensureDailyQuests);

  const [now, setNow] = useState(() => Date.now());

  // 1 Hz — só o cronômetro de reset. Nada aqui roda a 60 fps.
  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
      ensureDailyQuests();
    }, 1000);
    return () => window.clearInterval(interval);
  }, [ensureDailyQuests]);

  const remaining = questsStamp + DAY_MS - now;
  const doneCount = quests.filter((q) => q.completed).length;

  return (
    <Panel title="Missões Diárias" meta={`${doneCount}/${quests.length}`}>
      <p className="mb-3 font-mono text-[0.6rem] tracking-[0.2em] text-ice/35">
        RESET EM {formatCountdown(remaining)}
      </p>

      <ul className="space-y-3">
        {quests.map((quest) => {
          const pct = Math.min(100, (quest.progress / quest.target) * 100);
          return (
            <li key={quest.id}>
              <div className="flex items-start gap-2">
                <span
                  aria-hidden="true"
                  className={`mt-1 h-2 w-2 shrink-0 rotate-45 border ${
                    quest.completed ? 'border-gold bg-gold' : 'border-blue/60'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="relative inline-block font-display text-[0.68rem] font-bold uppercase tracking-[0.16em] text-ice/85">
                    {quest.title}
                    {/* risco animado ao concluir */}
                    <motion.span
                      aria-hidden="true"
                      className="absolute left-0 top-1/2 h-px bg-gold"
                      initial={false}
                      animate={{ width: quest.completed ? '100%' : '0%' }}
                      transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
                      style={{ boxShadow: '0 0 8px rgb(var(--c-gold))' }}
                    />
                  </p>
                  <p className="font-mono text-[0.66rem] leading-snug text-ice/45">
                    {quest.description}
                  </p>
                </div>
                <span
                  className={`shrink-0 font-mono text-[0.66rem] ${
                    quest.completed ? 'text-gold' : 'text-cyan/70'
                  }`}
                >
                  +{quest.xp} XP
                </span>
              </div>

              <div className="mt-1.5 flex items-center gap-2 pl-4">
                <div className="nx-bar h-1 flex-1">
                  <motion.div
                    className={`nx-bar__fill ${
                      quest.completed
                        ? 'bg-gradient-to-r from-gold/70 to-gold'
                        : 'bg-gradient-to-r from-blue/60 to-cyan'
                    }`}
                    initial={false}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
                  />
                </div>
                <span className="font-mono text-[0.6rem] tabular-nums text-ice/40">
                  {Math.min(quest.progress, quest.target)}/{quest.target}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
