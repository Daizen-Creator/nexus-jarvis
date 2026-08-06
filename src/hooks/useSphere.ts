import { useCallback, useMemo } from 'react';
import type { ParticleSphere } from '../engine/ParticleSphere';
import type { SphereState, Theme } from '../types';

/**
 * Ponte imperativa entre React e o motor de canvas.
 *
 * O handle é um objeto mutável a nível de módulo: nenhum componente re-renderiza
 * quando o motor muda, e `commands.ts` consegue falar com a esfera sem context.
 */
export const sphereHandle: { current: ParticleSphere | null } = { current: null };

export interface SphereDesignInput {
  density?: number;
  rings?: number;
  filaments?: boolean;
  radial?: boolean;
  glow?: number;
  speed?: number;
  coreSize?: number;
}

export interface SphereController {
  setState: (state: SphereState) => void;
  getState: () => SphereState;
  setDesign: (design: SphereDesignInput) => void;
  pulse: (strength?: number) => void;
  setTheme: (theme: Theme) => void;
  setReveal: (value: number) => void;
  getFps: () => number;
  getParticleCount: () => number;
  isReady: () => boolean;
}

/** Controller estável — pode ir em dependências de efeito sem causar loops. */
export const sphereController: SphereController = {
  setState: (state) => sphereHandle.current?.setState(state),
  getState: () => sphereHandle.current?.getState() ?? 'idle',
  setDesign: (design) => sphereHandle.current?.setDesign(design),
  pulse: (strength) => sphereHandle.current?.pulse(strength),
  setTheme: (theme) => sphereHandle.current?.setTheme(theme),
  setReveal: (value) => sphereHandle.current?.setReveal(value),
  getFps: () => sphereHandle.current?.getFps() ?? 0,
  getParticleCount: () => sphereHandle.current?.getParticleCount() ?? 0,
  isReady: () => sphereHandle.current !== null,
};

export function useSphere(): SphereController {
  const setState = useCallback((state: SphereState) => sphereController.setState(state), []);
  const pulse = useCallback((strength?: number) => sphereController.pulse(strength), []);
  const setTheme = useCallback((theme: Theme) => sphereController.setTheme(theme), []);
  const setReveal = useCallback((value: number) => sphereController.setReveal(value), []);

  return useMemo<SphereController>(
    () => ({
      setState,
      getState: sphereController.getState,
      setDesign: sphereController.setDesign,
      pulse,
      setTheme,
      setReveal,
      getFps: sphereController.getFps,
      getParticleCount: sphereController.getParticleCount,
      isReady: sphereController.isReady,
    }),
    [setState, pulse, setTheme, setReveal],
  );
}
