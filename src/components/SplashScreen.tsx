import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import gsap from 'gsap';
import { sphereController } from '../hooks/useSphere';
import { useSound } from '../hooks/useSound';

export interface SplashScreenProps {
  onComplete: () => void;
}

/**
 * Abertura curta (~1,6s) — a alternativa leve à sequência de boot completa.
 *
 * Materializa a esfera, mostra o logo com uma linha de status e sai. Sem log de
 * terminal, sem digitação: só o suficiente para o núcleo "acordar".
 */
export function SplashScreen({ onComplete }: SplashScreenProps): JSX.Element {
  const sound = useSound();
  const doneRef = useRef(false);

  const finish = (): void => {
    if (doneRef.current) return;
    doneRef.current = true;
    sphereController.setReveal(1);
    onComplete();
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  useEffect(() => {
    sphereController.setReveal(0);
    sound.play('boot');

    const proxy = { v: 0 };
    const tween = gsap.to(proxy, {
      v: 1,
      duration: 1.2,
      ease: 'expo.out',
      onUpdate: () => sphereController.setReveal(proxy.v),
    });
    sphereController.setState('processing');

    const timer = window.setTimeout(() => {
      sphereController.setState('idle');
      finishRef.current();
    }, 1600);

    const skip = (): void => finishRef.current();
    window.addEventListener('pointerdown', skip);
    window.addEventListener('keydown', skip);

    return () => {
      tween.kill();
      window.clearTimeout(timer);
      window.removeEventListener('pointerdown', skip);
      window.removeEventListener('keydown', skip);
    };
    // Montagem única.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-bg"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, filter: 'blur(10px)' }}
      transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <motion.h1
        initial={{ opacity: 0, letterSpacing: '0.1em', scale: 0.9 }}
        animate={{ opacity: 1, letterSpacing: '0.5em', scale: 1 }}
        transition={{ duration: 1, ease: [0.2, 0.8, 0.2, 1] }}
        className="font-display text-4xl font-black text-cyan nx-chroma sm:text-6xl"
      >
        NEXUS
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.6 }}
        className="mt-4 font-mono text-[0.6rem] tracking-[0.4em] text-ice/40"
      >
        NÚCLEO ONLINE
      </motion.p>

      <motion.div
        className="mt-6 h-px w-40 origin-left bg-gradient-to-r from-transparent via-cyan to-transparent"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 0.3, duration: 1.1, ease: [0.2, 0.8, 0.2, 1] }}
      />
    </motion.div>
  );
}
