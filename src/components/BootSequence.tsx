import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import gsap from 'gsap';
import { useTypewriter } from '../hooks/useTypewriter';
import { useSound } from '../hooks/useSound';
import { sphereController } from '../hooks/useSphere';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSystemStore } from '../store/useSystemStore';
import { useConfigStore } from '../store/useConfigStore';
import { speech } from '../engine/SpeechEngine';

const BOOT_LOG = [
  '> INICIALIZANDO NÚCLEO J.A.R.V.I.S. ......... OK',
  '> CARREGANDO MÓDULOS DE VOZ ................. OK',
  '> CALIBRANDO SENSORES ....................... OK',
  '> SINCRONIZANDO COM O SISTEMA ............... OK',
  '> REATOR ARC: 100% — ESTÁVEL',
].join('\n');

const SHORT_LOG = [
  '> RECONHECENDO ASSINATURA ................... OK',
  '> RESTAURANDO SESSÃO ........................ OK',
].join('\n');

export const greetingForHour = (hour: number): string => {
  if (hour < 6) return 'Boa madrugada';
  if (hour < 12) return 'Bom dia';
  if (hour < 19) return 'Boa tarde';
  return 'Boa noite';
};

type Stage = 'log' | 'reveal' | 'greet';

export interface BootSequenceProps {
  onComplete: () => void;
}

/**
 * Sequência de abertura (~6s, ~3s se já houver save). Pulável com clique ou
 * qualquer tecla.
 */
export function BootSequence({ onComplete }: BootSequenceProps): JSX.Element {
  const sound = useSound();
  const savedName = usePlayerStore((s) => (s.loggedIn ? s.name : ''));
  const reducedMotion = useSystemStore((s) => s.reducedMotion);
  const voiceEnabled = useSystemStore((s) => s.voiceEnabled);

  const [stage, setStage] = useState<Stage>('log');
  const finishedRef = useRef(false);
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const timersRef = useRef<number[]>([]);

  const returning = savedName.length > 0;
  const log = returning ? SHORT_LOG : BOOT_LOG;

  const persona = useConfigStore.getState().config.profile.assistantName || 'NEXA';
  const greeting = returning
    ? `Bem-vindo de volta, ${savedName}. ${persona} à sua disposição.`
    : `Sistemas online. Aqui é ${persona}. ${greetingForHour(new Date().getHours())}, Senhor. Aguardando autenticação.`;

  /* ---------------------------------------------------------------- */

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    tweenRef.current?.kill();
    sphereController.setReveal(1);
    onComplete();
  }, [onComplete]);

  const handleCharacter = useCallback(
    (char: string) => {
      if (char === '\n') sound.play('key');
    },
    [sound],
  );

  const logTyper = useTypewriter(log, {
    speed: reducedMotion ? 0 : 16,
    enabled: !reducedMotion,
    onChar: handleCharacter,
    onDone: () => setStage('reveal'),
  });

  const greetTyper = useTypewriter(stage === 'greet' ? greeting : '', {
    speed: reducedMotion ? 0 : 30,
    enabled: !reducedMotion && stage === 'greet',
  });

  /* ---------------------------------------------------------------- */

  // Materialização da esfera: escala 0 → 1 numa timeline GSAP.
  useEffect(() => {
    if (stage !== 'reveal') return undefined;

    sound.play('boot');
    const proxy = { v: 0 };
    const tween = gsap.to(proxy, {
      v: 1,
      duration: reducedMotion ? 0.01 : 1.5,
      ease: 'expo.out',
      onUpdate: () => sphereController.setReveal(proxy.v),
      onComplete: () => {
        sphereController.setReveal(1);
        setStage('greet');
      },
    });
    tweenRef.current = tween;

    return () => {
      tween.kill();
    };
  }, [stage, reducedMotion, sound]);

  // Saudação falada + saída da tela de boot.
  useEffect(() => {
    if (stage !== 'greet') return undefined;

    sphereController.setState('speaking');
    if (voiceEnabled) speech.speak(greeting);

    const hold = window.setTimeout(() => {
      sphereController.setState('idle');
      finish();
    }, reducedMotion ? 400 : 2600);
    timersRef.current.push(hold);

    return () => window.clearTimeout(hold);
  }, [stage, greeting, voiceEnabled, reducedMotion, finish]);

  // Estado inicial: esfera invisível até a materialização.
  useEffect(() => {
    sphereController.setReveal(0);
    const timers = timersRef.current;
    return () => {
      for (const t of timers) window.clearTimeout(t);
      timers.length = 0;
    };
  }, []);

  // Pular com clique ou tecla.
  const skipLog = logTyper.skip;
  const skipGreet = greetTyper.skip;

  useEffect(() => {
    const skip = (): void => {
      skipLog();
      skipGreet();
      finish();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Tab') return;
      skip();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', skip);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', skip);
    };
  }, [finish, skipLog, skipGreet]);

  /* ---------------------------------------------------------------- */

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-bg"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, filter: 'blur(12px)' }}
      transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {/* Scanline varrendo de cima a baixo */}
      {!reducedMotion ? (
        <div
          aria-hidden="true"
          className="nx-scan-down pointer-events-none absolute inset-x-0 top-0 h-24"
          style={{
            background:
              'linear-gradient(to bottom, transparent, rgb(var(--c-blue) / 0.16), transparent)',
          }}
        />
      ) : null}

      <div className="relative w-full max-w-2xl px-6">
        <pre
          className="whitespace-pre-wrap font-mono text-[0.72rem] leading-relaxed text-blue sm:text-sm"
          aria-live="polite"
        >
          {logTyper.display}
          {!logTyper.done ? <span className="animate-blink">▋</span> : null}
        </pre>

        {stage === 'greet' ? (
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
            className="mt-8 font-display text-sm tracking-[0.14em] text-ice nx-glow sm:text-base"
          >
            {greetTyper.display}
            {!greetTyper.done ? <span className="animate-blink">▋</span> : null}
          </motion.p>
        ) : null}

        <p className="mt-10 font-mono text-[0.6rem] tracking-[0.35em] text-ice/25">
          CLIQUE OU PRESSIONE QUALQUER TECLA PARA PULAR
        </p>
      </div>
    </motion.div>
  );
}
