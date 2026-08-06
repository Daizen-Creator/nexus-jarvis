import type { NexusBridge, NexusInternal } from '../types/desktop';

/**
 * Acesso ao processo principal do Electron a partir do renderer.
 *
 * Tudo aqui devolve `undefined` quando o NEXUS roda como página normal no
 * navegador — a mesma base de código serve os dois alvos sem ramificação.
 */

declare global {
  interface Window {
    nexus?: NexusBridge;
    nexusInternal?: NexusInternal;
  }
}

export const desktop = (): NexusBridge | undefined =>
  typeof window === 'undefined' ? undefined : window.nexus;

export const desktopInternal = (): NexusInternal | undefined =>
  typeof window === 'undefined' ? undefined : window.nexusInternal;

export const isDesktop = (): boolean => desktop() !== undefined;

/** `?mode=hud` roda a sobreposição transparente; qualquer outro valor, o app cheio. */
export const uiMode = (): 'hud' | 'app' => {
  if (typeof window === 'undefined') return 'app';
  const params = new URLSearchParams(window.location.search);
  return params.get('mode') === 'hud' ? 'hud' : 'app';
};
