import type { SoundName } from '../types';

/**
 * Todo o áudio do NEXUS é sintetizado em tempo real com a Web Audio API —
 * nenhum arquivo externo, nenhuma dependência, nenhum custo.
 *
 * O AudioContext só pode nascer depois de um gesto do usuário, por isso
 * `unlock()` precisa ser chamado a partir de um handler de clique/tecla.
 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private volume = 0.5;

  private droneNodes: { osc: OscillatorNode[]; gain: GainNode; lfo: OscillatorNode } | null = null;

  /* ---------------------------------------------------------------- */

  isReady(): boolean {
    return this.ctx !== null;
  }

  /** Deve ser chamado dentro de um gesto do usuário. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? window.webkitAudioContext;
    if (!Ctor) return;

    try {
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : this.volume;
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      if (ctx.state === 'suspended') void ctx.resume();
    } catch {
      this.ctx = null;
      this.master = null;
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(muted ? 0 : this.volume, now, 0.05);
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (!this.muted && this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Primitivas                                                        */
  /* ---------------------------------------------------------------- */

  /** Um oscilador com envelope ADSR simplificado (attack / decay linear). */
  private tone(params: {
    freq: number;
    toFreq?: number;
    type?: OscillatorType;
    start?: number;
    duration: number;
    attack?: number;
    peak?: number;
    detune?: number;
    filter?: number;
  }): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const t0 = ctx.currentTime + (params.start ?? 0);
    const dur = params.duration;
    const peak = params.peak ?? 0.2;
    const attack = Math.min(params.attack ?? 0.008, dur * 0.5);

    const osc = ctx.createOscillator();
    osc.type = params.type ?? 'sine';
    osc.frequency.setValueAtTime(params.freq, t0);
    if (params.toFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, params.toFreq), t0 + dur);
    }
    if (params.detune !== undefined) osc.detune.setValueAtTime(params.detune, t0);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    if (params.filter !== undefined) {
      const biquad = ctx.createBiquadFilter();
      biquad.type = 'lowpass';
      biquad.frequency.setValueAtTime(params.filter, t0);
      osc.connect(biquad);
      biquad.connect(gain);
    } else {
      osc.connect(gain);
    }

    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    osc.onended = (): void => {
      osc.disconnect();
      gain.disconnect();
    };
  }

  /** Ruído branco filtrado — usado no impacto do level up. */
  private noise(params: { duration: number; peak?: number; filter?: number; start?: number }): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const t0 = ctx.currentTime + (params.start ?? 0);
    const length = Math.max(1, Math.floor(ctx.sampleRate * params.duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const biquad = ctx.createBiquadFilter();
    biquad.type = 'lowpass';
    biquad.frequency.setValueAtTime(params.filter ?? 1200, t0);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(params.peak ?? 0.18, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + params.duration);

    src.connect(biquad);
    biquad.connect(gain);
    gain.connect(master);
    src.start(t0);
    src.onended = (): void => {
      src.disconnect();
      biquad.disconnect();
      gain.disconnect();
    };
  }

  /* ---------------------------------------------------------------- */
  /* Sons nomeados                                                     */
  /* ---------------------------------------------------------------- */

  play(name: SoundName): void {
    if (!this.ctx || this.muted) return;

    switch (name) {
      case 'key':
        this.tone({
          freq: 1500 + Math.random() * 500,
          toFreq: 900,
          type: 'square',
          duration: 0.035,
          peak: 0.035,
          filter: 3200,
        });
        break;

      case 'hover':
        this.tone({ freq: 880, toFreq: 1320, type: 'sine', duration: 0.08, peak: 0.045 });
        break;

      case 'confirm':
        this.tone({ freq: 620, type: 'sine', duration: 0.14, peak: 0.14 });
        this.tone({ freq: 930, type: 'sine', duration: 0.22, peak: 0.12, start: 0.07 });
        this.tone({ freq: 1240, type: 'triangle', duration: 0.3, peak: 0.07, start: 0.14 });
        break;

      case 'error':
        this.tone({ freq: 240, toFreq: 90, type: 'sawtooth', duration: 0.32, peak: 0.16, filter: 900 });
        this.tone({ freq: 180, toFreq: 70, type: 'square', duration: 0.26, peak: 0.09, start: 0.05, filter: 700 });
        break;

      case 'notify':
        // Os dois tons ascendentes característicos do "Sistema".
        this.tone({ freq: 784, type: 'sine', duration: 0.2, peak: 0.15 });
        this.tone({ freq: 1046, type: 'sine', duration: 0.38, peak: 0.15, start: 0.12 });
        this.tone({ freq: 2093, type: 'sine', duration: 0.5, peak: 0.04, start: 0.12 });
        break;

      case 'quest':
        this.tone({ freq: 660, type: 'triangle', duration: 0.16, peak: 0.12 });
        this.tone({ freq: 880, type: 'triangle', duration: 0.16, peak: 0.12, start: 0.1 });
        this.tone({ freq: 1320, type: 'sine', duration: 0.3, peak: 0.09, start: 0.2 });
        break;

      case 'impact':
        this.tone({ freq: 120, toFreq: 32, type: 'sine', duration: 1.1, peak: 0.42 });
        this.tone({ freq: 60, toFreq: 24, type: 'triangle', duration: 1.4, peak: 0.3 });
        this.noise({ duration: 0.7, peak: 0.22, filter: 900 });
        this.tone({ freq: 1760, toFreq: 220, type: 'sine', duration: 0.9, peak: 0.08, start: 0.05 });
        break;

      case 'boot':
        this.tone({ freq: 320, toFreq: 1280, type: 'sine', duration: 0.9, peak: 0.1 });
        this.tone({ freq: 160, toFreq: 640, type: 'triangle', duration: 1.1, peak: 0.08 });
        break;

      default:
        break;
    }
  }

  /* ---------------------------------------------------------------- */
  /* Drone ambiente                                                    */
  /* ---------------------------------------------------------------- */

  startDrone(): void {
    if (!this.ctx || !this.master || this.droneNodes) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.055, now + 2.5);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(420, now);

    const freqs = [55, 82.5, 110, 164.81];
    const oscs: OscillatorNode[] = freqs.map((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = i % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(f, now);
      osc.detune.setValueAtTime((i - 1.5) * 6, now);
      osc.connect(filter);
      osc.start(now);
      return osc;
    });

    // LFO lento abrindo e fechando o filtro — dá o "respiro" do reator.
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.07, now);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(160, now);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start(now);

    filter.connect(gain);
    gain.connect(this.master);

    this.droneNodes = { osc: oscs, gain, lfo };
  }

  stopDrone(): void {
    const nodes = this.droneNodes;
    const ctx = this.ctx;
    if (!nodes || !ctx) return;
    this.droneNodes = null;

    const now = ctx.currentTime;
    nodes.gain.gain.cancelScheduledValues(now);
    nodes.gain.gain.setValueAtTime(Math.max(0.0001, nodes.gain.gain.value), now);
    nodes.gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

    window.setTimeout(() => {
      for (const osc of nodes.osc) {
        try {
          osc.stop();
        } catch {
          /* já parado */
        }
        osc.disconnect();
      }
      try {
        nodes.lfo.stop();
      } catch {
        /* já parado */
      }
      nodes.lfo.disconnect();
      nodes.gain.disconnect();
    }, 1400);
  }

  isDroneOn(): boolean {
    return this.droneNodes !== null;
  }

  toggleDrone(): boolean {
    if (this.droneNodes) {
      this.stopDrone();
      return false;
    }
    this.startDrone();
    return this.droneNodes !== null;
  }

  dispose(): void {
    this.stopDrone();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
      this.master = null;
    }
  }
}

export const audio = new AudioEngine();
