import { useEffect, useState } from 'react';
import { desktop } from '../desktop/bridge';
import { useSound } from '../hooks/useSound';

/**
 * Barra de título no estilo do Sistema — substitui a moldura nativa do Windows.
 *
 * A faixa inteira é arrastável (`-webkit-app-region: drag` via `nx-drag`);
 * os botões desmarcam a região (`nx-no-drag`) para continuarem clicáveis.
 * Só aparece no app de desktop; no navegador não há o que controlar.
 */
export function TitleBar(): JSX.Element | null {
  const bridge = desktop();
  const sound = useSound();
  const [version, setVersion] = useState('');

  useEffect(() => {
    if (bridge) void bridge.appVersion().then(setVersion);
  }, [bridge]);

  if (!bridge) return null;

  return (
    <header className="nx-drag fixed inset-x-0 top-0 z-[95] flex h-8 items-center gap-2 border-b border-blue/25 bg-bg/85 px-3 backdrop-blur-md">
      <span aria-hidden="true" className="h-2 w-2 rotate-45 bg-cyan" style={{ boxShadow: '0 0 8px rgb(var(--c-cyan))' }} />
      <span className="font-display text-[0.6rem] font-black tracking-[0.4em] text-cyan nx-chroma">
        NEXUS
      </span>
      <span className="font-mono text-[0.55rem] tracking-[0.3em] text-ice/25">// SISTEMA</span>
      {version ? (
        <span className="font-mono text-[0.52rem] tracking-[0.2em] text-ice/25">v{version}</span>
      ) : null}

      <div className="nx-no-drag ml-auto flex items-center gap-1">
        <button
          type="button"
          aria-label="Minimizar"
          onMouseEnter={sound.hover}
          onClick={() => bridge.windowMinimize()}
          className="grid h-6 w-8 place-items-center text-ice/50 transition-colors hover:bg-blue/15 hover:text-cyan"
        >
          <span className="block h-px w-3 bg-current" />
        </button>
        <button
          type="button"
          aria-label="Maximizar"
          onMouseEnter={sound.hover}
          onClick={() => bridge.windowMaximize()}
          className="grid h-6 w-8 place-items-center text-ice/50 transition-colors hover:bg-blue/15 hover:text-cyan"
        >
          <span className="block h-2.5 w-2.5 border border-current" />
        </button>
        <button
          type="button"
          aria-label="Fechar"
          onMouseEnter={sound.hover}
          onClick={() => bridge.windowClose()}
          className="grid h-6 w-8 place-items-center text-ice/50 transition-colors hover:bg-danger/25 hover:text-danger"
        >
          <span aria-hidden="true" className="text-xs leading-none">✕</span>
        </button>
      </div>
    </header>
  );
}
