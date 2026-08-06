import { useSound } from '../hooks/useSound';

export interface MicButtonProps {
  supported: boolean;
  listening: boolean;
  onToggle: () => void;
}

/**
 * Botão circular do microfone. Sem suporte do navegador, o botão some e dá
 * lugar ao aviso — reconhecimento de voz só existe em Chrome/Edge sob https
 * ou localhost.
 */
export function MicButton({ supported, listening, onToggle }: MicButtonProps): JSX.Element {
  const sound = useSound();

  if (!supported) {
    return (
      <p
        className="font-mono text-[0.58rem] leading-tight tracking-[0.14em] text-danger/75"
        role="note"
      >
        RECONHECIMENTO DE VOZ
        <br />
        INDISPONÍVEL NESTE NAVEGADOR
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        sound.unlock();
        sound.play('hover');
        onToggle();
      }}
      onMouseEnter={sound.hover}
      aria-label={listening ? 'Desativar microfone' : 'Ativar microfone'}
      aria-pressed={listening}
      className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-full border transition-all duration-300 ${
        listening
          ? 'border-cyan bg-cyan/15 text-cyan'
          : 'border-blue/45 bg-blue/5 text-ice/55 hover:border-blue hover:text-cyan'
      }`}
      style={listening ? { boxShadow: '0 0 18px rgb(var(--c-cyan) / 0.6)' } : undefined}
    >
      {listening ? (
        <span
          aria-hidden="true"
          className="animate-pulse-ring absolute inset-0 rounded-full border border-cyan"
        />
      ) : null}

      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
        <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M5 11a7 7 0 0 0 14 0"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path d="M12 18v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </button>
  );
}
