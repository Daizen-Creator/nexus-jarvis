import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { SystemWindow } from './SystemWindow';
import { sphereController } from '../hooks/useSphere';
import { audio } from '../engine/AudioEngine';
import { speech } from '../engine/SpeechEngine';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSystemStore } from '../store/useSystemStore';
import type { LevelUpInfo } from '../types';

const RANK_NAME: Record<string, string> = {
  E: 'E — DESPERTADO',
  D: 'D — OPERADOR',
  C: 'C — TÁTICO',
  B: 'B — ELITE',
  A: 'A — COMANDANTE',
  S: 'S — SOBERANO',
};

/**
 * Timeline GSAP completa: escurecer, flash, explosão dourada da esfera,
 * janela do Sistema e — nos limiares de rank — uma segunda janela.
 */
export function LevelUpCinematic(): JSX.Element | null {
  const levelUp = usePlayerStore((s) => s.lastLevelUp);
  const consume = usePlayerStore((s) => s.consumeLevelUp);
  const setCinematicActive = useSystemStore((s) => s.setCinematicActive);
  const voiceEnabled = useSystemStore((s) => s.voiceEnabled);
  const reducedMotion = useSystemStore((s) => s.reducedMotion);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const flashRef = useRef<HTMLDivElement | null>(null);
  const windowRef = useRef<HTMLDivElement | null>(null);
  const rankRef = useRef<HTMLDivElement | null>(null);

  // Congela os dados no início da cinemática para o texto não mudar no meio.
  const [frozen, setFrozen] = useState<LevelUpInfo | null>(null);

  useEffect(() => {
    if (!levelUp) return undefined;
    setFrozen(levelUp);
    setCinematicActive(true);

    const rankChanged = levelUp.rankFrom !== levelUp.rankTo;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        onComplete: () => {
          setCinematicActive(false);
          consume();
          setFrozen(null);
          if (sphereController.getState() === 'levelup') sphereController.setState('idle');
        },
      });

      // 1. escurecer
      tl.fromTo(
        rootRef.current,
        { autoAlpha: 0 },
        { autoAlpha: 1, duration: reducedMotion ? 0.01 : 0.35, ease: 'power2.out' },
      );

      // 2. flash branco + impacto grave
      tl.call(() => {
        audio.play('impact');
        sphereController.setState('levelup');
        sphereController.pulse(2);
      });
      tl.fromTo(
        flashRef.current,
        { autoAlpha: 0 },
        { autoAlpha: 1, duration: reducedMotion ? 0.01 : 0.08, ease: 'none' },
      );
      tl.to(flashRef.current, {
        autoAlpha: 0,
        duration: reducedMotion ? 0.01 : 0.5,
        ease: 'power2.in',
      });

      // 3. janela do Sistema entra com escala + glow
      tl.fromTo(
        windowRef.current,
        { autoAlpha: 0, scale: 0.72, filter: 'blur(14px)' },
        {
          autoAlpha: 1,
          scale: 1,
          filter: 'blur(0px)',
          duration: reducedMotion ? 0.01 : 0.7,
          ease: 'back.out(1.6)',
        },
        '-=0.25',
      );

      tl.call(() => {
        audio.play('notify');
        if (voiceEnabled) {
          speech.speak(`Parabéns, Senhor. Você alcançou o nível ${levelUp.to}.`);
        }
      });

      tl.to({}, { duration: reducedMotion ? 0.4 : 2.2 });

      // 4. segunda janela nos limiares de rank
      if (rankChanged) {
        tl.fromTo(
          rankRef.current,
          { autoAlpha: 0, y: 26, scale: 0.9 },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            duration: reducedMotion ? 0.01 : 0.6,
            ease: 'back.out(1.8)',
          },
        );
        tl.call(() => {
          audio.play('quest');
          if (voiceEnabled) {
            speech.speak(`Você subiu para o rank ${levelUp.rankTo}.`);
          }
        });
        tl.to({}, { duration: reducedMotion ? 0.4 : 2.4 });
      }

      // 5. saída
      tl.to(rootRef.current, {
        autoAlpha: 0,
        duration: reducedMotion ? 0.01 : 0.5,
        ease: 'power2.inOut',
      });
    }, rootRef);

    return () => ctx.revert();
  }, [levelUp, consume, setCinematicActive, voiceEnabled, reducedMotion]);

  const info = frozen ?? levelUp;
  if (!info) return null;

  const rankChanged = info.rankFrom !== info.rankTo;

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-5 bg-black/72 p-4 opacity-0 backdrop-blur-sm"
      role="alertdialog"
      aria-label="Subiu de nível"
    >
      <div
        ref={flashRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-white opacity-0"
      />

      <div ref={windowRef} className="w-full max-w-md opacity-0">
        <SystemWindow title="Notificação" badge="★" variant="gold" meta="LVL-UP">
          <div className="space-y-4 text-center">
            <p
              className="font-display text-3xl font-black tracking-[0.16em] text-gold nx-chroma sm:text-4xl"
              style={{ textShadow: '0 0 18px rgb(var(--c-gold) / 0.85)' }}
            >
              LEVEL UP!
            </p>

            <p className="font-display text-lg tracking-[0.12em] text-ice">
              Nível <span className="text-ice/45">{info.from}</span>
              <span className="mx-2 text-gold">→</span>
              <span className="text-gold nx-glow">{info.to}</span>
            </p>

            <ul className="mx-auto max-w-xs space-y-1.5 border-t border-gold/25 pt-3 text-left font-mono text-xs text-ice/75">
              <li className="flex justify-between">
                <span>Pontos de atributo</span>
                <span className="text-gold">+{info.pointsGained}</span>
              </li>
              <li className="flex justify-between">
                <span>HP e Mana</span>
                <span className="text-gold">RESTAURADOS</span>
              </li>
              <li className="flex justify-between">
                <span>Rank atual</span>
                <span className="text-gold">{info.rankTo}</span>
              </li>
            </ul>

            <p className="font-mono text-[0.62rem] tracking-[0.2em] text-ice/35">
              DISTRIBUA OS PONTOS NO PAINEL DE ATRIBUTOS
            </p>
          </div>
        </SystemWindow>
      </div>

      {rankChanged ? (
        <div ref={rankRef} className="w-full max-w-sm opacity-0">
          <SystemWindow title="Promoção" badge="◆" variant="gold" meta="RANK-UP">
            <div className="text-center">
              <p className="font-display text-sm tracking-[0.24em] text-ice/70">
                VOCÊ SUBIU PARA O RANK
              </p>
              <p
                className="mt-2 font-display text-5xl font-black text-gold"
                style={{ textShadow: '0 0 26px rgb(var(--c-gold))' }}
              >
                {info.rankTo}
              </p>
              <p className="mt-2 font-mono text-[0.66rem] tracking-[0.2em] text-gold/70">
                {RANK_NAME[info.rankTo] ?? info.rankTo}
              </p>
            </div>
          </SystemWindow>
        </div>
      ) : null}
    </div>
  );
}
