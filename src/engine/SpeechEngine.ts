type SpeechListener = (speaking: boolean) => void;

/**
 * Fila de fala em cima de `speechSynthesis`. Seleciona automaticamente uma
 * voz masculina pt-BR (com fallback en-US), mantém pitch grave e não deixa
 * duas falas se sobreporem.
 */
class SpeechEngine {
  private queue: string[] = [];
  private current: SpeechSynthesisUtterance | null = null;
  private voice: SpeechSynthesisVoice | null = null;
  private enabled = true;
  private listeners = new Set<SpeechListener>();
  private voicesBound = false;
  /** Transformação aplicada a todo texto antes de falar (ver personalize.ts). */
  private transform: ((text: string) => string) | null = null;
  private gender: 'female' | 'male' = 'female';
  private rate = 1.18;
  private pitch = 1.0;

  readonly supported: boolean =
    typeof window !== 'undefined' && 'speechSynthesis' in window;

  constructor() {
    if (!this.supported) return;
    this.pickVoice();
    if (!this.voicesBound) {
      this.voicesBound = true;
      window.speechSynthesis.addEventListener('voiceschanged', () => this.pickVoice());
    }
  }

  /* ---------------------------------------------------------------- */

  setGender(gender: 'female' | 'male'): void {
    if (this.gender === gender) return;
    this.gender = gender;
    this.pickVoice();
  }

  /** Ajusta velocidade e tom (vindos da configuração). */
  setTuning(rate: number, pitch: number): void {
    this.rate = Math.max(0.5, Math.min(2, rate));
    this.pitch = Math.max(0.5, Math.min(2, pitch));
  }

  private pickVoice(): void {
    if (!this.supported) return;
    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) return;

    const femalePatterns = /(maria|heloisa|hel[óo]isa|francisca|luciana|female|mulher|feminin|f[eê]mea|google portugu[êe]s do brasil|zira|helena|sabina)/i;
    const malePatterns = /(daniel|ricardo|felipe|thiago|male|homem|masculin|antonio|jorge)/i;
    const wanted = this.gender === 'female' ? femalePatterns : malePatterns;
    const avoid = this.gender === 'female' ? malePatterns : femalePatterns;

    const ptVoices = voices.filter((v) => /^pt(-|_)?BR/i.test(v.lang));
    const ptAny = voices.filter((v) => /^pt/i.test(v.lang));
    const enVoices = voices.filter((v) => /^en/i.test(v.lang));

    const pickFrom = (list: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null => {
      if (list.length === 0) return null;
      // 1º: casa o gênero desejado. 2º: qualquer um que NÃO seja do outro
      // gênero. 3º: o primeiro da lista.
      return (
        list.find((v) => wanted.test(v.name)) ??
        list.find((v) => !avoid.test(v.name)) ??
        list[0]
      );
    };

    this.voice =
      pickFrom(ptVoices) ?? pickFrom(ptAny) ?? pickFrom(enVoices) ?? voices[0] ?? null;
  }

  getVoiceName(): string {
    return this.voice?.name ?? 'INDISPONÍVEL';
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.cancel();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  isSpeaking(): boolean {
    return this.current !== null;
  }

  onSpeakingChange(listener: SpeechListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(speaking: boolean): void {
    for (const l of this.listeners) l(speaking);
  }

  /* ---------------------------------------------------------------- */

  /** Define a transformação de saída. Chamado uma vez, no App. */
  setTransform(transform: ((text: string) => string) | null): void {
    this.transform = transform;
  }

  speak(text: string): void {
    if (!this.supported || !this.enabled) return;
    const source = this.transform ? this.transform(text) : text;
    const clean = source.replace(/\s+/g, ' ').trim();
    if (clean.length === 0) return;

    this.queue.push(clean);
    if (!this.current) this.next();
  }

  private next(): void {
    const text = this.queue.shift();
    if (text === undefined) {
      this.current = null;
      this.emit(false);
      return;
    }

    const utter = new SpeechSynthesisUtterance(text);
    if (this.voice) utter.voice = this.voice;
    utter.lang = this.voice?.lang ?? 'pt-BR';
    utter.pitch = this.pitch;
    utter.rate = this.rate;
    utter.volume = 1;

    const finish = (): void => {
      if (this.current !== utter) return;
      this.current = null;
      this.next();
    };
    utter.onend = finish;
    utter.onerror = finish;

    this.current = utter;
    this.emit(true);
    try {
      window.speechSynthesis.speak(utter);
    } catch {
      finish();
    }
  }

  cancel(): void {
    if (!this.supported) return;
    this.queue = [];
    this.current = null;
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* alguns navegadores lançam se nada estiver na fila */
    }
    this.emit(false);
  }
}

export const speech = new SpeechEngine();
