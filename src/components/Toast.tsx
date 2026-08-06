import { AnimatePresence, motion } from 'framer-motion';
import { useSystemStore } from '../store/useSystemStore';
import type { ToastKind } from '../types';

const KIND_STYLE: Record<ToastKind, { border: string; text: string; badge: string }> = {
  info: { border: 'border-blue/60', text: 'text-cyan', badge: 'i' },
  success: { border: 'border-success/60', text: 'text-success', badge: '✓' },
  error: { border: 'border-danger/70', text: 'text-danger', badge: '!' },
  quest: { border: 'border-gold/70', text: 'text-gold', badge: '★' },
};

/** Pilha de notificações do Sistema, no canto superior direito. */
export function Toast(): JSX.Element {
  const toasts = useSystemStore((s) => s.toasts);
  const dismiss = useSystemStore((s) => s.dismissToast);

  return (
    <div
      className="pointer-events-none fixed right-3 top-16 z-[70] flex w-[min(20rem,calc(100vw-1.5rem))] flex-col gap-2 sm:right-5 sm:top-20"
      role="status"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const style = KIND_STYLE[toast.kind];
          return (
            <motion.button
              key={toast.id}
              type="button"
              layout
              initial={{ opacity: 0, x: 60, filter: 'blur(6px)' }}
              animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, x: 60, transition: { duration: 0.24 } }}
              transition={{ duration: 0.34, ease: [0.2, 0.8, 0.2, 1] }}
              onClick={() => dismiss(toast.id)}
              className={`nx-window nx-clip-sm pointer-events-auto flex w-full items-start gap-3 px-3 py-2.5 text-left ${style.border}`}
            >
              <span
                aria-hidden="true"
                className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center border text-[0.65rem] font-bold ${style.border} ${style.text}`}
              >
                {style.badge}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block font-display text-[0.62rem] font-bold uppercase tracking-[0.28em] ${style.text}`}
                >
                  {toast.title}
                </span>
                <span className="mt-1 block break-words font-mono text-[0.72rem] leading-snug text-ice/70">
                  {toast.message}
                </span>
              </span>
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
