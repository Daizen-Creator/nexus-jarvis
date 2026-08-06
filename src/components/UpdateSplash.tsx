import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { desktop } from '../desktop/bridge';
import { useSound } from '../hooks/useSound';
import type { UpdatePayload } from '../types/desktop';

/**
 * Aviso de atualização — canto inferior direito.
 *
 * Reage aos eventos que o processo principal (electron-updater) emite:
 * verificando, disponível, baixando, pronta. Some sozinho quando não há nada.
 */
export function UpdateSplash(): JSX.Element | null {
  const bridge = desktop();
  const sound = useSound();
  const [state, setState] = useState<UpdatePayload | null>(null);

  useEffect(() => {
    if (!bridge) return undefined;
    return bridge.onUpdate((payload) => {
      setState(payload);
      if (payload.status === 'ready' || payload.status === 'available') sound.play('notify');
      // Estados sem novidade somem depois de um tempo.
      if (payload.status === 'none' || payload.status === 'idle' || payload.status === 'error') {
        window.setTimeout(() => setState((s) => (s === payload ? null : s)), 4000);
      }
    });
  }, [bridge, sound]);

  if (!bridge || !state) return null;
  // Nada a mostrar quando está tudo em dia e o aviso já sumiu.
  if (state.status === 'idle') return null;

  const s = state.status;
  const isReady = s === 'ready';

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[68] w-[min(20rem,calc(100vw-2rem))]">
      <AnimatePresence>
        <motion.div
          key={s}
          initial={{ opacity: 0, y: 20, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.34, ease: [0.2, 0.8, 0.2, 1] }}
          className={`nx-window nx-clip-sm pointer-events-auto px-3 py-2.5 ${
            isReady ? 'nx-window--gold' : s === 'error' ? 'nx-window--alert' : ''
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                s === 'checking' || s === 'downloading' ? 'animate-pulse bg-cyan' : isReady ? 'bg-gold' : s === 'error' ? 'bg-danger' : 'bg-ice/40'
              }`}
            />
            <span className={`font-display text-[0.6rem] font-bold uppercase tracking-[0.24em] ${isReady ? 'text-gold' : 'text-cyan'}`}>
              {s === 'checking' && 'Verificando'}
              {s === 'available' && 'Atualização'}
              {s === 'downloading' && 'Baixando'}
              {s === 'ready' && 'Pronta'}
              {s === 'none' && 'Em dia'}
              {s === 'error' && 'Falha'}
            </span>
            {state.version ? (
              <span className="ml-auto font-mono text-[0.6rem] text-ice/45">v{state.version}</span>
            ) : null}
          </div>

          <p className="mt-1 font-mono text-[0.68rem] leading-snug text-ice/70">{state.message}</p>

          {s === 'downloading' && state.pct != null ? (
            <div className="nx-bar mt-1.5 h-1">
              <div className="nx-bar__fill bg-gradient-to-r from-blue to-cyan" style={{ width: `${state.pct}%` }} />
            </div>
          ) : null}

          {isReady ? (
            <button
              type="button"
              onClick={() => bridge.installUpdate()}
              onMouseEnter={sound.hover}
              className="nx-btn nx-clip-btn mt-2 w-full !min-h-[2rem] !py-1 !text-[0.6rem]"
            >
              REINICIAR E INSTALAR
            </button>
          ) : null}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
