import { useCallback, useEffect, useRef, useState } from 'react';
import { desktop } from '../desktop/bridge';

/** Ponte imperativa para comandos de voz dispararem o microfone. */
export const voiceHandle: {
  supported: boolean;
  listening: boolean;
  start: () => void;
  stop: () => void;
} = {
  supported: false,
  listening: false,
  start: () => undefined,
  stop: () => undefined,
};

const getRecognitionCtor = (): SpeechRecognitionConstructor | null => {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
};

/**
 * Reconhecimento de voz só existe em Chrome/Edge e exige origem segura
 * (https ou localhost). `supported` reflete exatamente isso.
 */
export const isSpeechRecognitionSupported = (): boolean => {
  // No app de desktop quem escuta é o daemon Vosk, não o navegador — e ainda
  // bem: o Chromium do Electron é compilado sem as chaves da API de fala do
  // Google, então `webkitSpeechRecognition` falharia com erro de rede.
  if (desktop()) return true;
  if (getRecognitionCtor() === null) return false;
  if (typeof window === 'undefined') return false;
  return window.isSecureContext || window.location.hostname === 'localhost';
};

const WAKE_WORDS = ['jarvis', 'jarves', 'sistema'];

const stripWakeWord = (text: string): string | null => {
  const lower = text.trim().toLowerCase();
  for (const word of WAKE_WORDS) {
    if (lower === word) return '';
    if (lower.startsWith(`${word} `) || lower.startsWith(`${word}, `)) {
      return text.trim().slice(word.length).replace(/^[,\s]+/, '');
    }
  }
  return null;
};

export interface UseSpeechRecognitionOptions {
  lang?: string;
  /** Quando ativo, só processa frases iniciadas por "Jarvis" ou "Sistema". */
  wakeWord?: boolean;
  onFinal: (text: string) => void;
  onInterim?: (text: string) => void;
  onError?: (error: string) => void;
}

export interface UseSpeechRecognitionResult {
  supported: boolean;
  listening: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions,
): UseSpeechRecognitionResult {
  const { lang = 'pt-BR', wakeWord = false } = options;

  const [supported] = useState<boolean>(() => isSpeechRecognitionSupported());
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const wantListeningRef = useRef(false);
  const restartTimerRef = useRef<number | null>(null);

  // Callbacks vivem em refs — trocar handler nunca reinicia o reconhecimento.
  const onFinalRef = useRef(options.onFinal);
  const onInterimRef = useRef(options.onInterim);
  const onErrorRef = useRef(options.onError);
  const wakeWordRef = useRef(wakeWord);

  onFinalRef.current = options.onFinal;
  onInterimRef.current = options.onInterim;
  onErrorRef.current = options.onError;
  wakeWordRef.current = wakeWord;

  /* ---------------------------------------------------------------- */
  /* Caminho do desktop: o daemon Vosk empurra os eventos pelo IPC.    */
  /* ---------------------------------------------------------------- */

  const bridge = desktop();

  useEffect(() => {
    if (!bridge) return undefined;

    const offHeard = bridge.onVoiceHeard((payload) => {
      // Limpa o texto parcial ao fechar a frase. A EXECUÇÃO não acontece aqui:
      // quem resolve e roda o comando é o processo principal (ações de sistema)
      // ou o `App` via `voice:command` (registro/conversa). Chamar onFinal aqui
      // também executava tudo em dobro — daí comandos "duplicados" ou o volume
      // subindo E o núcleo dizendo "não reconhecido".
      if (payload.awake) onInterimRef.current?.('');
    });

    const offPartial = bridge.onVoicePartial((text) => onInterimRef.current?.(text));

    const offState = bridge.onVoiceState((state) => {
      const active = state.status === 'listening';
      setListening(active);
      voiceHandle.listening = active;
      if (state.status === 'error' || state.status.startsWith('no-')) {
        setError(state.message);
        onErrorRef.current?.(state.message);
      } else {
        setError(null);
      }
    });

    void bridge.getVoiceState().then((state) => {
      const active = state.status === 'listening';
      setListening(active);
      voiceHandle.listening = active;
    });

    return () => {
      offHeard();
      offPartial();
      offState();
    };
  }, [bridge]);

  /* ---------------------------------------------------------------- */
  /* Caminho do navegador: Web Speech API                              */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (bridge) return undefined;
    if (!supported) return undefined;
    const Ctor = getRecognitionCtor();
    if (!Ctor) return undefined;

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = (): void => {
      setListening(true);
      voiceHandle.listening = true;
      setError(null);
    };

    recognition.onresult = (event: SpeechRecognitionEvent): void => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? '';
        if (result.isFinal) {
          const text = transcript.trim();
          if (text.length === 0) continue;
          if (wakeWordRef.current) {
            const stripped = stripWakeWord(text);
            if (stripped === null) continue;
            if (stripped.length === 0) continue;
            onFinalRef.current(stripped);
          } else {
            onFinalRef.current(text);
          }
        } else {
          interim += transcript;
        }
      }
      onInterimRef.current?.(interim.trim());
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent): void => {
      // "no-speech" e "aborted" são ruído operacional, não falha real.
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      setError(event.error);
      onErrorRef.current?.(event.error);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        wantListeningRef.current = false;
        setListening(false);
        voiceHandle.listening = false;
      }
    };

    recognition.onend = (): void => {
      setListening(false);
      voiceHandle.listening = false;
      onInterimRef.current?.('');
      // `continuous` para sozinho em silêncios longos: religa se ainda queremos.
      if (wantListeningRef.current) {
        restartTimerRef.current = window.setTimeout(() => {
          if (!wantListeningRef.current) return;
          try {
            recognition.start();
          } catch {
            /* já iniciado */
          }
        }, 320);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      wantListeningRef.current = false;
      if (restartTimerRef.current !== null) {
        window.clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
      recognition.onend = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onstart = null;
      try {
        recognition.abort();
      } catch {
        /* nada em execução */
      }
      recognitionRef.current = null;
      voiceHandle.listening = false;
    };
  }, [bridge, supported, lang]);

  const start = useCallback(() => {
    if (bridge) {
      wantListeningRef.current = true;
      void bridge.startVoice();
      return;
    }
    const recognition = recognitionRef.current;
    if (!recognition) return;
    wantListeningRef.current = true;
    try {
      recognition.start();
    } catch {
      /* start() lança se já estiver rodando — comportamento esperado */
    }
  }, [bridge]);

  const stop = useCallback(() => {
    wantListeningRef.current = false;
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (bridge) {
      void bridge.stopVoice();
      setListening(false);
      voiceHandle.listening = false;
      return;
    }
    const recognition = recognitionRef.current;
    if (!recognition) return;
    try {
      recognition.stop();
    } catch {
      /* nada em execução */
    }
    setListening(false);
    voiceHandle.listening = false;
  }, [bridge]);

  const toggle = useCallback(() => {
    if (wantListeningRef.current) stop();
    else start();
  }, [start, stop]);

  // Publica o controle para o registry de comandos.
  useEffect(() => {
    voiceHandle.supported = supported;
    voiceHandle.start = start;
    voiceHandle.stop = stop;
    return () => {
      voiceHandle.start = () => undefined;
      voiceHandle.stop = () => undefined;
    };
  }, [supported, start, stop]);

  return { supported, listening, error, start, stop, toggle };
}
