import type { ReactNode } from 'react';

export type SystemWindowVariant = 'default' | 'alert' | 'gold';

export interface SystemWindowProps {
  title: string;
  children: ReactNode;
  /** Glifo do quadrado do cabeçalho. */
  badge?: string;
  variant?: SystemWindowVariant;
  className?: string;
  bodyClassName?: string;
  footer?: ReactNode;
  onClose?: () => void;
  /** Texto pequeno à direita do título (ex.: "SYS-04"). */
  meta?: string;
  id?: string;
}

const VARIANT_CLASS: Record<SystemWindowVariant, string> = {
  default: '',
  alert: 'nx-window--alert',
  gold: 'nx-window--gold',
};

const VARIANT_TEXT: Record<SystemWindowVariant, string> = {
  default: 'text-cyan',
  alert: 'text-danger',
  gold: 'text-gold',
};

/**
 * Janela base do Sistema: borda dupla, cantos recortados, glow interno e
 * externo. Todo painel e todo modal do NEXUS é construído em cima dela.
 */
export function SystemWindow({
  title,
  children,
  badge = '!',
  variant = 'default',
  className = '',
  bodyClassName = '',
  footer,
  onClose,
  meta,
  id,
}: SystemWindowProps): JSX.Element {
  return (
    <section
      id={id}
      className={`nx-window nx-clip ${VARIANT_CLASS[variant]} ${className}`}
      aria-label={title}
    >
      <header className="nx-titlebar flex items-center gap-3 px-4 py-2.5">
        <span
          aria-hidden="true"
          className={`grid h-6 w-6 shrink-0 place-items-center border text-xs font-bold ${
            variant === 'alert'
              ? 'border-danger/70 text-danger'
              : variant === 'gold'
                ? 'border-gold/70 text-gold'
                : 'border-blue/70 text-cyan'
          }`}
        >
          {badge}
        </span>

        <h2
          className={`font-display text-[0.72rem] font-bold uppercase tracking-[0.42em] ${VARIANT_TEXT[variant]} nx-chroma`}
        >
          {title}
        </h2>

        <span className="ml-auto flex items-center gap-3">
          {meta ? (
            <span className="hidden font-mono text-[0.6rem] tracking-[0.2em] text-ice/30 sm:inline">
              {meta}
            </span>
          ) : null}
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label={`Fechar ${title}`}
              className="grid h-8 w-8 place-items-center text-ice/45 transition-colors duration-200 hover:text-danger focus-visible:text-danger"
            >
              <span aria-hidden="true" className="text-base leading-none">
                ✕
              </span>
            </button>
          ) : null}
        </span>
      </header>

      <div className={`relative px-4 py-4 sm:px-5 sm:py-5 ${bodyClassName}`}>{children}</div>

      {footer ? (
        <footer className="border-t border-blue/20 px-4 py-3 sm:px-5">{footer}</footer>
      ) : null}
    </section>
  );
}

export interface PanelProps {
  title: string;
  children: ReactNode;
  meta?: string;
  className?: string;
  bodyClassName?: string;
}

/**
 * Variante leve da janela, usada nos painéis do HUD: mesma linguagem visual
 * (borda neon fina, cantos recortados, barra de título diagonal) com menos peso.
 */
export function Panel({
  title,
  children,
  meta,
  className = '',
  bodyClassName = '',
}: PanelProps): JSX.Element {
  return (
    <section className={`nx-panel nx-clip-sm flex flex-col ${className}`} aria-label={title}>
      <header className="nx-titlebar flex items-center gap-2 px-3 py-1.5">
        <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rotate-45 bg-cyan" />
        <h3 className="font-display text-[0.6rem] font-bold uppercase tracking-[0.34em] text-cyan">
          {title}
        </h3>
        {meta ? (
          <span className="ml-auto font-mono text-[0.55rem] tracking-[0.2em] text-ice/25">
            {meta}
          </span>
        ) : null}
      </header>
      <div className={`flex-1 px-3 py-3 ${bodyClassName}`}>{children}</div>
    </section>
  );
}
