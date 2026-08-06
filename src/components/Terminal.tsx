import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MicButton } from './MicButton';
import { useSound } from '../hooks/useSound';
import { useTypewriter } from '../hooks/useTypewriter';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { sphereController } from '../hooks/useSphere';
import { runCommand } from '../engine/commands';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSystemStore } from '../store/useSystemStore';
import type { TerminalKind, TerminalLine } from '../types';

const KIND_CLASS: Record<TerminalKind, string> = {
  user: 'text-blue',
  system: 'text-ice/90',
  error: 'text-danger',
  info: 'text-gold/80',
};

const formatTime = (ts: number): string =>
  new Date(ts).toLocaleTimeString('pt-BR', { hour12: false });

/* ------------------------------------------------------------------ */

interface LineViewProps {
  line: TerminalLine;
  animate: boolean;
}

/** Linhas do sistema entram com typewriter apenas na primeira exibição. */
function LineView({ line, animate }: LineViewProps): JSX.Element {
  const markTyped = useSystemStore((s) => s.markTyped);
  const shouldType = animate && !line.typed;

  const { display, done } = useTypewriter(line.text, {
    speed: 12,
    enabled: shouldType,
    onDone: () => {
      if (shouldType) markTyped(line.id);
    },
  });

  const text = shouldType ? display : line.text;

  return (
    <div className="flex gap-2 leading-relaxed">
      <span className="shrink-0 select-none font-mono text-[0.6rem] text-ice/20">
        {formatTime(line.ts)}
      </span>
      <span className={`min-w-0 flex-1 whitespace-pre-wrap break-words ${KIND_CLASS[line.kind]}`}>
        {line.kind === 'user' ? <span className="text-cyan/70">&gt; </span> : null}
        {text}
        {shouldType && !done ? <span className="animate-blink">▋</span> : null}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function Terminal(): JSX.Element {
  const sound = useSound();
  const lines = useSystemStore((s) => s.lines);
  const reducedMotion = useSystemStore((s) => s.reducedMotion);
  const voiceEnabled = useSystemStore((s) => s.voiceEnabled);
  const setMicActive = useSystemStore((s) => s.setMicActive);
  const setMicSupported = useSystemStore((s) => s.setMicSupported);
  const history = usePlayerStore((s) => s.history);
  const trackQuest = usePlayerStore((s) => s.trackQuest);

  const [input, setInput] = useState('');
  const [interim, setInterim] = useState('');
  const [wakeWord, setWakeWord] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  /* -------------------------------------------------------------- */
  /* Voz                                                             */
  /* -------------------------------------------------------------- */

  const handleFinal = useCallback((text: string) => {
    setInterim('');
    runCommand(text, 'voice');
  }, []);

  const { supported, listening, toggle, stop } = useSpeechRecognition({
    lang: 'pt-BR',
    wakeWord,
    onFinal: handleFinal,
    onInterim: setInterim,
  });

  useEffect(() => {
    setMicSupported(supported);
  }, [supported, setMicSupported]);

  useEffect(() => {
    setMicActive(listening);
    if (listening) {
      sphereController.setState('listening');
      trackQuest('voice');
    } else if (sphereController.getState() === 'listening') {
      sphereController.setState('idle');
    }
  }, [listening, setMicActive, trackQuest]);

  // Desligar a voz pelo comando/toggle também fecha o microfone.
  useEffect(() => {
    if (!voiceEnabled && listening) stop();
  }, [voiceEnabled, listening, stop]);

  /* -------------------------------------------------------------- */
  /* Log                                                             */
  /* -------------------------------------------------------------- */

  useEffect(() => {
    const node = logRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [lines]);

  /* -------------------------------------------------------------- */
  /* Entrada                                                         */
  /* -------------------------------------------------------------- */

  const submit = useCallback(() => {
    const value = input.trim();
    if (value.length === 0) return;
    sound.unlock();
    setInput('');
    setHistoryIndex(-1);
    runCommand(value, 'text');
  }, [input, sound]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submit();
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (history.length === 0) return;
        const next = historyIndex < 0 ? history.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(next);
        setInput(history[next] ?? '');
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (historyIndex < 0) return;
        const next = historyIndex + 1;
        if (next >= history.length) {
          setHistoryIndex(-1);
          setInput('');
        } else {
          setHistoryIndex(next);
          setInput(history[next] ?? '');
        }
        return;
      }

      sound.key();
    },
    [submit, history, historyIndex, sound],
  );

  const placeholder = useMemo(
    () => (listening ? 'Ouvindo...' : "Digite um comando ou 'ajuda'"),
    [listening],
  );

  return (
    <section
      className="nx-panel nx-clip-sm flex min-h-0 flex-col"
      aria-label="Terminal de comandos"
    >
      <header className="nx-titlebar flex items-center gap-2 px-3 py-1.5">
        <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rotate-45 bg-cyan" />
        <h3 className="font-display text-[0.6rem] font-bold uppercase tracking-[0.34em] text-cyan">
          Terminal
        </h3>
        <button
          type="button"
          onClick={() => setWakeWord((w) => !w)}
          onMouseEnter={sound.hover}
          disabled={!supported}
          aria-pressed={wakeWord}
          className={`ml-auto border px-2 py-0.5 font-mono text-[0.55rem] tracking-[0.16em] transition-colors duration-200 ${
            wakeWord
              ? 'border-cyan/70 text-cyan'
              : 'border-ice/15 text-ice/30 hover:border-blue/50 hover:text-ice/60'
          } disabled:cursor-not-allowed disabled:opacity-40`}
        >
          WAKE WORD
        </button>
      </header>

      <div
        ref={logRef}
        className="nx-scroll min-h-[9rem] flex-1 space-y-0.5 overflow-y-auto px-3 py-2 font-mono text-[0.72rem]"
        role="log"
        aria-live="polite"
      >
        {lines.length === 0 ? (
          <p className="text-ice/25">
            Núcleo pronto. Digite <span className="text-cyan">ajuda</span> para ver os comandos.
          </p>
        ) : (
          lines.map((line) => (
            <LineView key={line.id} line={line} animate={!reducedMotion && line.kind !== 'user'} />
          ))
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-blue/20 px-3 py-2">
        <MicButton supported={supported} listening={listening} onToggle={toggle} />

        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span aria-hidden="true" className="font-mono text-sm text-cyan">
            &gt;
          </span>
          <div className="relative min-w-0 flex-1">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => sound.unlock()}
              placeholder={placeholder}
              aria-label="Comando"
              autoComplete="off"
              spellCheck={false}
              className="w-full border-none bg-transparent p-0 font-mono text-sm text-ice outline-none placeholder:text-ice/25"
            />
            {/* Texto parcial do reconhecimento de voz, em cinza */}
            {interim.length > 0 ? (
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center truncate font-mono text-sm text-ice/30">
                {input.length > 0 ? '' : interim}
              </span>
            ) : null}
          </div>
          {input.length === 0 && interim.length === 0 ? (
            <span aria-hidden="true" className="animate-blink font-mono text-sm text-cyan">
              ▋
            </span>
          ) : null}
        </div>

        <button
          type="button"
          onClick={submit}
          onMouseEnter={sound.hover}
          aria-label="Executar comando"
          className="nx-btn nx-clip-btn hidden !min-h-[2.25rem] !px-3 !py-1.5 sm:block"
        >
          EXEC
        </button>
      </div>
    </section>
  );
}
