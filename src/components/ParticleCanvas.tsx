import { useEffect, useRef } from 'react';
import { ParticleSphere } from '../engine/ParticleSphere';
import { sphereHandle } from '../hooks/useSphere';
import { useSystemStore } from '../store/useSystemStore';

/**
 * Casca fina de React em volta do motor de canvas.
 *
 * O motor é instanciado UMA vez em `useEffect` + `useRef` e roda no próprio
 * `requestAnimationFrame`. Nenhum `useState` deste componente muda a 60fps —
 * ele só repassa comandos imperativos quando tema/motion mudam.
 */
export interface ParticleCanvasProps {
  /** Fundo transparente para a sobreposição do app de desktop. */
  transparent?: boolean;
}

export function ParticleCanvas({ transparent = false }: ParticleCanvasProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reducedMotion = useSystemStore((s) => s.reducedMotion);

  // Montagem única — `transparent` não entra nas dependências de propósito:
  // trocar o modo exigiria um contexto 2D novo, e isso não acontece em runtime.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const sphere = new ParticleSphere({
      canvas,
      theme: useSystemStore.getState().theme,
      reducedMotion: useSystemStore.getState().reducedMotion,
      transparent,
    });
    sphereHandle.current = sphere;

    return () => {
      sphere.destroy();
      sphereHandle.current = null;
    };
  }, []);

  // O tema é aplicado por quem monta a tela (App / HudApp): eles escrevem as
  // variáveis CSS e chamam sphere.setTheme na ordem certa. Aqui só a montagem
  // e o modo reduzido.
  useEffect(() => {
    sphereHandle.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
    />
  );
}
