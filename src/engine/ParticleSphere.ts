import type { SphereState, Theme } from '../types';

/* ------------------------------------------------------------------ */
/* Paletas                                                             */
/* ------------------------------------------------------------------ */

type RGB = [number, number, number];

interface Palette {
  core: RGB;
  particle: RGB;
  ring: RGB;
  accent: RGB;
}

const FALLBACK_BLUE: Palette = {
  core: [186, 250, 255],
  particle: [0, 212, 255],
  ring: [0, 160, 220],
  accent: [125, 249, 255],
};

/** Lê "r g b" de uma variável CSS; devolve o fallback se ausente. */
const readVar = (styles: CSSStyleDeclaration, name: string, fallback: RGB): RGB => {
  const raw = styles.getPropertyValue(name).trim();
  const parts = raw.split(/[\s,]+/).map((n) => Number.parseFloat(n));
  if (parts.length >= 3 && parts.every((n) => Number.isFinite(n))) {
    return [parts[0], parts[1], parts[2]];
  }
  return fallback;
};

const darken = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

/**
 * Constrói a paleta da esfera a partir das variáveis CSS do tema atual.
 * Assim qualquer um dos temas do registro colore a esfera sem código extra.
 */
const paletteFromCss = (): { base: Palette; alert: Palette; gold: Palette } => {
  if (typeof document === 'undefined') {
    return { base: FALLBACK_BLUE, alert: FALLBACK_BLUE, gold: FALLBACK_BLUE };
  }
  const s = getComputedStyle(document.documentElement);
  const primary = readVar(s, '--c-blue', [0, 212, 255]);
  const accent = readVar(s, '--c-cyan', [125, 249, 255]);
  const ice = readVar(s, '--c-ice', [232, 246, 255]);
  const gold = readVar(s, '--c-gold', [255, 176, 32]);
  const danger = readVar(s, '--c-danger', [255, 51, 85]);

  return {
    base: { core: ice, particle: primary, ring: darken(primary, 0.75), accent },
    alert: { core: [255, 226, 226], particle: danger, ring: darken(danger, 0.85), accent: danger },
    gold: { core: [255, 250, 220], particle: gold, ring: darken(gold, 0.85), accent: [255, 238, 170] },
  };
};

/* ------------------------------------------------------------------ */
/* Perfil por estado                                                   */
/* ------------------------------------------------------------------ */

interface StateProfile {
  /** rotação em rad/s no eixo Y */
  spinY: number;
  /** rotação em rad/s no eixo X */
  spinX: number;
  /** amplitude do ruído aplicado às partículas (em raios) */
  jitter: number;
  /** multiplicador de velocidade dos anéis */
  ringSpeed: number;
  /** brilho geral (0..1.6) */
  brightness: number;
  /** intensidade do núcleo */
  coreGain: number;
  /** densidade dos filamentos (0..1) */
  filament: number;
}

const PROFILES: Record<SphereState, StateProfile> = {
  idle: { spinY: 0.16, spinX: 0.045, jitter: 0.006, ringSpeed: 1, brightness: 1, coreGain: 1, filament: 0.7 },
  listening: { spinY: 0.34, spinX: 0.1, jitter: 0.038, ringSpeed: 1.7, brightness: 1.35, coreGain: 1.2, filament: 1 },
  processing: { spinY: 0.5, spinX: 0.14, jitter: 0.014, ringSpeed: 4.2, brightness: 1.15, coreGain: 1.05, filament: 0.85 },
  speaking: { spinY: 0.22, spinX: 0.06, jitter: 0.018, ringSpeed: 1.5, brightness: 1.3, coreGain: 1.45, filament: 0.9 },
  alert: { spinY: 0.62, spinX: 0.02, jitter: 0.03, ringSpeed: 3, brightness: 1.25, coreGain: 1.3, filament: 0.6 },
  levelup: { spinY: 0.75, spinX: 0.2, jitter: 0.05, ringSpeed: 5, brightness: 1.6, coreGain: 1.6, filament: 1 },
};

/* ------------------------------------------------------------------ */
/* Estruturas internas                                                 */
/* ------------------------------------------------------------------ */

interface Particle {
  /** posição base na esfera unitária */
  bx: number;
  by: number;
  bz: number;
  /** fases de ruído independentes */
  p1: number;
  p2: number;
  /** velocidade radial da explosão */
  burst: number;
  /* cache da projeção do frame corrente */
  sx: number;
  sy: number;
  depth: number;
  scale: number;
  visible: boolean;
}

interface Link {
  a: number;
  b: number;
  strength: number;
}

interface Ring {
  tiltX: number;
  tiltZ: number;
  radius: number;
  speed: number;
  phase: number;
  arcPhase: number;
  arcSpeed: number;
  width: number;
}

interface Shockwave {
  radius: number;
  life: number;
  speed: number;
}

export interface ParticleSphereOptions {
  canvas: HTMLCanvasElement;
  theme?: Theme;
  reducedMotion?: boolean;
  /** Fundo transparente — usado pelo HUD do app de desktop. */
  transparent?: boolean;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

const easeOutElastic = (t: number): number => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -9 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};

const rgba = (c: RGB, alpha: number): string =>
  `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alpha.toFixed(3)})`;

const lerpRGB = (a: RGB, b: RGB, t: number, out: RGB): void => {
  out[0] = lerp(a[0], b[0], t);
  out[1] = lerp(a[1], b[1], t);
  out[2] = lerp(a[2], b[2], t);
};

/** Vetor de rascunho reaproveitado — o loop não aloca nada por frame. */
const scratch = { x: 0, y: 0, z: 0 };

/* ------------------------------------------------------------------ */
/* Motor                                                               */
/* ------------------------------------------------------------------ */

/**
 * Motor de renderização da esfera. É uma classe TypeScript pura: mantém o
 * próprio `requestAnimationFrame` e nunca toca no ciclo de render do React.
 * A UI apenas envia comandos imperativos (`setState`, `pulse`, `setTheme`).
 */
export class ParticleSphere {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  private particles: Particle[] = [];
  private links: Link[] = [];
  private rings: Ring[] = [];
  private shockwaves: Shockwave[] = [];

  private targetCount = 900;
  private count = 900;

  private width = 0;
  private height = 0;
  private dpr = 1;

  private angY = 0;
  private angX = -0.28;

  private state: SphereState = 'idle';
  private profile: StateProfile = { ...PROFILES.idle };

  private theme: Theme = 'blue';
  private basePalette: Palette = FALLBACK_BLUE;
  private alertPalette: Palette = FALLBACK_BLUE;
  private goldPalette: Palette = FALLBACK_BLUE;
  private palette: Palette = {
    core: [...FALLBACK_BLUE.core] as RGB,
    particle: [...FALLBACK_BLUE.particle] as RGB,
    ring: [...FALLBACK_BLUE.ring] as RGB,
    accent: [...FALLBACK_BLUE.accent] as RGB,
  };

  private pointerX = 0;
  private pointerY = 0;
  private parallaxX = 0;
  private parallaxY = 0;

  private pulseEnergy = 0;
  private time = 0;
  private levelupT = -1;
  private reveal = 1;

  private frameId = 0;
  private lastFrame = 0;
  private fps = 60;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private downgrades = 0;

  /** Opções de aparência (preset + ajustes) vindas da configuração. */
  private design = {
    density: 1,
    rings: 3,
    filaments: true,
    radial: false,
    glow: 1,
    speed: 1,
    coreSize: 1,
  };

  private reducedMotion: boolean;
  private readonly transparent: boolean;
  private disposed = false;

  private resizeObserver: ResizeObserver | null = null;
  private readonly onPointerMove: (e: PointerEvent) => void;
  private readonly onPointerLeave: () => void;
  private readonly onVisibility: () => void;

  constructor(options: ParticleSphereOptions) {
    this.canvas = options.canvas;
    this.transparent = options.transparent ?? false;
    const ctx = this.canvas.getContext('2d', { alpha: this.transparent });
    if (!ctx) {
      throw new Error('NEXUS: contexto 2D indisponível neste navegador.');
    }
    this.ctx = ctx;
    this.reducedMotion = options.reducedMotion ?? false;
    this.setTheme(options.theme ?? 'blue');

    this.onPointerMove = (e: PointerEvent): void => {
      const rect = this.canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      this.pointerX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointerY = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    };
    this.onPointerLeave = (): void => {
      this.pointerX = 0;
      this.pointerY = 0;
    };
    this.onVisibility = (): void => {
      // Evita um "salto" de dt gigantesco ao voltar para a aba.
      this.lastFrame = performance.now();
    };

    this.measure();
    this.rebuild();
    this.buildRings();

    this.resizeObserver = new ResizeObserver(() => this.measure());
    this.resizeObserver.observe(this.canvas);

    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    window.addEventListener('pointerleave', this.onPointerLeave, { passive: true });
    document.addEventListener('visibilitychange', this.onVisibility);

    if (this.reducedMotion) {
      this.renderStatic();
    } else {
      this.lastFrame = performance.now();
      this.frameId = requestAnimationFrame(this.loop);
    }
  }

  /* ---------------------------------------------------------------- */
  /* API imperativa                                                    */
  /* ---------------------------------------------------------------- */

  setState(next: SphereState): void {
    if (this.state === next) return;
    this.state = next;
    if (next === 'levelup') {
      this.levelupT = 0;
      for (const p of this.particles) {
        p.burst = 0.55 + Math.random() * 0.9;
      }
      this.shockwaves.push({ radius: 0.2, life: 1, speed: 2.6 });
    }
  }

  getState(): SphereState {
    return this.state;
  }

  /** Impulso curto — usado a cada comando executado. */
  pulse(strength = 1): void {
    this.pulseEnergy = Math.min(2.2, this.pulseEnergy + strength);
    this.shockwaves.push({ radius: 0.35, life: 1, speed: 1.5 + strength * 0.5 });
    if (this.shockwaves.length > 6) this.shockwaves.shift();
    if (this.reducedMotion) this.renderStatic();
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    // As cores vêm das variáveis CSS já aplicadas pelo tema — funciona para
    // qualquer um dos temas do registro, sem paleta embutida por tema.
    const p = paletteFromCss();
    this.basePalette = p.base;
    this.alertPalette = p.alert;
    this.goldPalette = p.gold;
    if (this.reducedMotion) this.renderStatic();
  }

  getTheme(): Theme {
    return this.theme;
  }

  /** 0 → invisível, 1 → totalmente materializada. Usado no boot. */
  setReveal(value: number): void {
    this.reveal = clamp(value, 0, 1);
    if (this.reducedMotion) this.renderStatic();
  }

  setReducedMotion(reduced: boolean): void {
    if (this.reducedMotion === reduced) return;
    this.reducedMotion = reduced;
    if (reduced) {
      cancelAnimationFrame(this.frameId);
      this.frameId = 0;
      this.renderStatic();
    } else if (!this.disposed) {
      this.lastFrame = performance.now();
      this.frameId = requestAnimationFrame(this.loop);
    }
  }

  getFps(): number {
    return Math.round(this.fps);
  }

  getParticleCount(): number {
    return this.count;
  }

  destroy(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.frameId = 0;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerleave', this.onPointerLeave);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.particles = [];
    this.links = [];
    this.rings = [];
    this.shockwaves = [];
  }

  /* ---------------------------------------------------------------- */
  /* Construção                                                        */
  /* ---------------------------------------------------------------- */

  private measure(): void {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width || window.innerWidth));
    const h = Math.max(1, Math.round(rect.height || window.innerHeight));
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    if (w === this.width && h === this.height && dpr === this.dpr) return;

    this.width = w;
    this.height = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.transparent) {
      this.ctx.clearRect(0, 0, w, h);
    } else {
      this.ctx.fillStyle = '#000000';
      this.ctx.fillRect(0, 0, w, h);
    }

    const desired = this.densityForViewport(w);
    if (desired !== this.targetCount) {
      this.targetCount = desired;
      this.downgrades = 0;
      this.rebuild();
    }
    if (this.reducedMotion) this.renderStatic();
  }

  private densityForViewport(width: number): number {
    let base: number;
    if (width < 480) base = 420;
    else if (width < 768) base = 600;
    else if (width < 1280) base = 900;
    else base = 1100;
    return Math.max(120, Math.round(base * this.design.density));
  }

  /** Aplica as opções de aparência (preset + ajustes). */
  setDesign(design: Partial<typeof this.design>): void {
    this.design = { ...this.design, ...design };
    const desired = this.densityForViewport(this.width);
    if (desired !== this.targetCount) {
      this.targetCount = desired;
      this.downgrades = 0;
      this.rebuild();
    }
    if (this.reducedMotion) this.renderStatic();
  }

  /** Distribuição por espiral de Fibonacci — cobertura uniforme da casca. */
  private rebuild(): void {
    const n = this.targetCount;
    this.count = n;
    const golden = Math.PI * (3 - Math.sqrt(5));
    const next: Particle[] = new Array<Particle>(n);

    for (let i = 0; i < n; i += 1) {
      const y = 1 - (i / Math.max(1, n - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = golden * i;
      next[i] = {
        bx: Math.cos(theta) * r,
        by: y,
        bz: Math.sin(theta) * r,
        p1: Math.random() * Math.PI * 2,
        p2: Math.random() * Math.PI * 2,
        burst: 0,
        sx: 0,
        sy: 0,
        depth: 0,
        scale: 1,
        visible: false,
      };
    }

    this.particles = next;
    this.buildLinks();
  }

  /**
   * A esfera é rígida: a vizinhança 3D não muda com a rotação. Por isso os
   * filamentos são calculados uma única vez e apenas reprojetados por frame.
   */
  private buildLinks(): void {
    const pts = this.particles;
    const n = pts.length;
    const links: Link[] = [];
    // Raio de vizinhança proporcional ao espaçamento médio na casca.
    const threshold = 2.6 * Math.sqrt(4 / Math.max(1, n));
    const t2 = threshold * threshold;
    const maxPerParticle = 3;

    for (let i = 0; i < n; i += 1) {
      const a = pts[i];
      let used = 0;
      for (let j = i + 1; j < n && used < maxPerParticle; j += 1) {
        const b = pts[j];
        const dx = a.bx - b.bx;
        const dy = a.by - b.by;
        const dz = a.bz - b.bz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < t2) {
          links.push({ a: i, b: j, strength: 1 - Math.sqrt(d2) / threshold });
          used += 1;
        }
      }
    }
    this.links = links;
  }

  private buildRings(): void {
    this.rings = [
      { tiltX: 0.42, tiltZ: 0.1, radius: 1.42, speed: 0.28, phase: 0, arcPhase: 0, arcSpeed: 1.1, width: 1.1 },
      { tiltX: -0.95, tiltZ: 0.62, radius: 1.68, speed: -0.19, phase: 1.7, arcPhase: 2.2, arcSpeed: -0.75, width: 0.9 },
      { tiltX: 1.35, tiltZ: -0.4, radius: 1.94, speed: 0.12, phase: 3.1, arcPhase: 4.4, arcSpeed: 0.5, width: 0.7 },
    ];
  }

  /* ---------------------------------------------------------------- */
  /* Loop                                                              */
  /* ---------------------------------------------------------------- */

  private readonly loop = (now: number): void => {
    if (this.disposed) return;
    this.frameId = requestAnimationFrame(this.loop);

    const rawDt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    const dt = clamp(rawDt, 0, 0.05);
    if (dt <= 0) return;

    this.trackFps(rawDt);
    this.step(dt);
    this.render();
  };

  private trackFps(rawDt: number): void {
    if (rawDt <= 0 || rawDt > 1) return;
    this.fpsAccum += 1 / rawDt;
    this.fpsFrames += 1;
    if (this.fpsFrames < 60) return;

    this.fps = this.fpsAccum / this.fpsFrames;
    this.fpsAccum = 0;
    this.fpsFrames = 0;

    // Degradação automática: no máximo 3 reduções, piso de 260 partículas.
    if (this.fps < 40 && this.downgrades < 3 && this.targetCount > 260) {
      this.downgrades += 1;
      this.targetCount = Math.max(260, Math.round(this.targetCount * 0.72));
      this.rebuild();
    }
  }

  private step(dt: number): void {
    this.time += dt;

    // Interpolação suave do perfil de estado.
    const target = PROFILES[this.state];
    const k = 1 - Math.pow(0.001, dt);
    this.profile.spinY = lerp(this.profile.spinY, target.spinY, k);
    this.profile.spinX = lerp(this.profile.spinX, target.spinX, k);
    this.profile.jitter = lerp(this.profile.jitter, target.jitter, k);
    this.profile.ringSpeed = lerp(this.profile.ringSpeed, target.ringSpeed, k);
    this.profile.brightness = lerp(this.profile.brightness, target.brightness, k);
    this.profile.coreGain = lerp(this.profile.coreGain, target.coreGain, k);
    this.profile.filament = lerp(this.profile.filament, target.filament, k);

    // Paleta alvo por estado.
    let targetPalette = this.basePalette;
    if (this.state === 'alert') targetPalette = this.alertPalette;
    else if (this.state === 'levelup') targetPalette = this.goldPalette;
    else if (this.state === 'listening') {
      targetPalette = {
        core: this.basePalette.accent,
        particle: this.basePalette.accent,
        ring: this.basePalette.particle,
        accent: this.basePalette.core,
      };
    }
    lerpRGB(this.palette.core, targetPalette.core, k, this.palette.core);
    lerpRGB(this.palette.particle, targetPalette.particle, k, this.palette.particle);
    lerpRGB(this.palette.ring, targetPalette.ring, k, this.palette.ring);
    lerpRGB(this.palette.accent, targetPalette.accent, k, this.palette.accent);

    this.angY += this.profile.spinY * dt * this.design.speed;
    this.angX += this.profile.spinX * dt * 0.35 * this.design.speed;
    this.angX = clamp(this.angX, -0.65, 0.65);

    // Parallax com amortecimento.
    const pk = 1 - Math.pow(0.02, dt);
    this.parallaxX = lerp(this.parallaxX, this.pointerX * 0.32, pk);
    this.parallaxY = lerp(this.parallaxY, this.pointerY * 0.22, pk);

    this.pulseEnergy = Math.max(0, this.pulseEnergy - dt * 2.1);

    for (let i = this.shockwaves.length - 1; i >= 0; i -= 1) {
      const s = this.shockwaves[i];
      s.radius += s.speed * dt;
      s.life -= dt * 1.15;
      if (s.life <= 0) this.shockwaves.splice(i, 1);
    }

    if (this.levelupT >= 0) {
      this.levelupT += dt;
      if (this.levelupT > 3.2) {
        this.levelupT = -1;
        if (this.state === 'levelup') this.setState('idle');
      }
    }
  }

  /** Multiplicador de raio combinando pulso, fala e explosão de level up. */
  private radiusMultiplier(): number {
    let mul = 1 + this.pulseEnergy * 0.09;

    if (this.state === 'speaking') {
      mul += 0.05 + Math.sin(this.time * 13.5) * 0.045;
    }

    if (this.levelupT >= 0) {
      const t = clamp(this.levelupT / 2.6, 0, 1);
      if (t < 0.22) {
        mul += easeOutCubic(t / 0.22) * 1.65;
      } else {
        const k = (t - 0.22) / 0.78;
        mul += 1.65 * (1 - easeOutElastic(k));
      }
    }
    return mul;
  }

  /** Rotação global aplicada a um ponto; resultado em `scratch`. */
  private project(x: number, y: number, z: number): void {
    const ay = this.angY + this.parallaxX;
    const ax = this.angX + this.parallaxY;
    const cy = Math.cos(ay);
    const sy = Math.sin(ay);
    const cx = Math.cos(ax);
    const sx = Math.sin(ax);

    const x1 = x * cy + z * sy;
    const z1 = -x * sy + z * cy;
    const y2 = y * cx - z1 * sx;
    const z2 = y * sx + z1 * cx;

    scratch.x = x1;
    scratch.y = y2;
    scratch.z = z2;
  }

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  private render(): void {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    if (w === 0 || h === 0) return;

    // Rastro: esmaece o frame anterior em vez de limpar.
    // Sobre fundo opaco basta escurecer; com transparência é preciso comer o
    // alfa, senão o canvas vai ficando preto sólido e some a sobreposição.
    if (this.transparent) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,0.14)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
    }
    ctx.fillRect(0, 0, w, h);

    if (this.reveal <= 0.001) return;

    const cx = w / 2;
    const cy = h * 0.5;
    const baseRadius = Math.min(w, h) * 0.28;
    const radius = baseRadius * this.radiusMultiplier() * (0.25 + 0.75 * this.reveal);
    const bright = this.profile.brightness * this.reveal * this.design.glow;
    const fov = 3.1;

    ctx.globalCompositeOperation = 'lighter';

    this.drawRings(ctx, cx, cy, baseRadius, fov, bright);
    this.projectParticles(cx, cy, radius, fov);
    if (this.design.radial) this.drawRadial(ctx, cx, cy, bright);
    if (this.design.filaments) this.drawFilaments(ctx, bright);
    if (this.design.radial) this.drawBuildings(ctx, cx, cy, radius, fov, bright);
    this.drawParticles(ctx, bright);
    if (this.design.radial) this.drawRim(ctx, cx, cy, radius, bright);
    this.drawShockwaves(ctx, cx, cy, baseRadius, bright);
    this.drawCore(ctx, cx, cy, baseRadius, bright);

    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
  }

  private projectParticles(cx: number, cy: number, radius: number, fov: number): void {
    const jitter = this.profile.jitter;
    const t = this.time;
    const burstK =
      this.levelupT >= 0 ? clamp(this.levelupT / 2.6, 0, 1) : 0;
    const burstAmount =
      burstK > 0
        ? burstK < 0.22
          ? easeOutCubic(burstK / 0.22)
          : 1 - easeOutElastic((burstK - 0.22) / 0.78)
        : 0;

    for (let i = 0; i < this.particles.length; i += 1) {
      const p = this.particles[i];
      const n1 = Math.sin(t * 2.3 + p.p1);
      const n2 = Math.cos(t * 1.7 + p.p2);
      const stretch = 1 + jitter * (n1 + n2) * 0.5 + burstAmount * p.burst * 0.35;

      this.project(p.bx * stretch, p.by * stretch, p.bz * stretch);

      const persp = fov / (fov + scratch.z);
      p.sx = cx + scratch.x * radius * persp;
      p.sy = cy + scratch.y * radius * persp;
      p.depth = (scratch.z + 1) * 0.5; // 0 = fundo, 1 = frente
      p.scale = persp;
      p.visible =
        p.sx > -40 && p.sx < this.width + 40 && p.sy > -40 && p.sy < this.height + 40;
    }
  }

  /**
   * Raios do centro para as partículas — a assinatura do holograma do
   * J.A.R.V.I.S. As linhas frontais são mais fortes; as de trás, tênues. Tudo
   * num punhado de paths (por faixa de profundidade) para não pesar.
   */
  private drawRadial(ctx: CanvasRenderingContext2D, cx: number, cy: number, bright: number): void {
    const accent = this.palette.accent;
    ctx.shadowBlur = 0;
    ctx.lineWidth = 0.7;

    const buckets = 3;
    // Um subconjunto das partículas vira raio — todas deixaria um disco sólido.
    const step = 2;
    for (let b = 0; b < buckets; b += 1) {
      const lo = b / buckets;
      const hi = (b + 1) / buckets;
      const mid = (lo + hi) * 0.5;
      const alpha = mid * mid * 0.5 * bright;
      if (alpha < 0.01) continue;

      ctx.beginPath();
      let drawn = false;
      for (let i = 0; i < this.particles.length; i += step) {
        const p = this.particles[i];
        if (!p.visible || p.depth < lo || p.depth >= hi) continue;
        // Começa um pouco fora do núcleo para o centro não virar um borrão.
        const t = 0.28;
        ctx.moveTo(cx + (p.sx - cx) * t, cy + (p.sy - cy) * t);
        ctx.lineTo(p.sx, p.sy);
        drawn = true;
      }
      if (drawn) {
        ctx.strokeStyle = rgba(accent, alpha);
        ctx.stroke();
      }
    }
  }

  /**
   * Detalhe da borda: "antenas" curtas apontando para fora na silhueta da
   * esfera (onde z≈0). As alturas variam por partícula, dando aquele recorte
   * irregular de cidade na borda, como na referência do J.A.R.V.I.S.
   */
  private drawRim(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
    bright: number,
  ): void {
    const accent = this.palette.accent;
    const particle = this.palette.particle;
    ctx.shadowBlur = 0;
    ctx.lineWidth = 0.9;

    ctx.beginPath();
    let drawn = false;
    for (let i = 0; i < this.particles.length; i += 1) {
      const p = this.particles[i];
      if (!p.visible) continue;
      // Perto da silhueta: profundidade ~0,5 (z próximo de zero).
      if (Math.abs(p.depth - 0.5) > 0.13) continue;

      const dx = p.sx - cx;
      const dy = p.sy - cy;
      const dist = Math.hypot(dx, dy) || 1;
      const h = (Math.sin(p.p1 * 12.9) + 1) * 0.5; // 0..1 pseudo-aleatório
      const len = radius * (0.035 + h * h * 0.2);
      const ux = dx / dist;
      const uy = dy / dist;
      ctx.moveTo(p.sx, p.sy);
      ctx.lineTo(p.sx + ux * len, p.sy + uy * len);
      drawn = true;
    }
    if (drawn) {
      ctx.strokeStyle = rgba(accent, 0.5 * bright);
      ctx.stroke();
    }

    // Um segundo passe mais curto e mais denso, para o "brilho" da borda.
    ctx.beginPath();
    drawn = false;
    for (let i = 0; i < this.particles.length; i += 2) {
      const p = this.particles[i];
      if (!p.visible || Math.abs(p.depth - 0.5) > 0.08) continue;
      const dx = p.sx - cx;
      const dy = p.sy - cy;
      const dist = Math.hypot(dx, dy) || 1;
      ctx.moveTo(p.sx, p.sy);
      ctx.lineTo(p.sx + (dx / dist) * radius * 0.03, p.sy + (dy / dist) * radius * 0.03);
      drawn = true;
    }
    if (drawn) {
      ctx.strokeStyle = rgba(particle, 0.3 * bright);
      ctx.stroke();
    }
  }

  /**
   * "Prédios": barras radiais de alturas variadas saindo da superfície da
   * esfera, em 3D. É a característica que mais aproxima da referência — a
   * cidade enrolada na esfera. Cada partícula ganha uma barra apontando para
   * fora do centro (normal da superfície); as da frente ficam curtas pela
   * perspectiva, as da silhueta viram as "antenas" da borda.
   */
  private drawBuildings(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
    fov: number,
    bright: number,
  ): void {
    const c = this.palette.particle;
    const accent = this.palette.accent;
    ctx.shadowBlur = 0;
    ctx.lineWidth = 0.95;

    const buckets = 3;
    for (let b = 0; b < buckets; b += 1) {
      const lo = b / buckets;
      const hi = (b + 1) / buckets;
      const mid = (lo + hi) * 0.5;
      const alpha = (0.12 + mid * mid * 0.6) * bright;
      if (alpha < 0.02) continue;

      ctx.beginPath();
      let drawn = false;
      for (let i = 0; i < this.particles.length; i += 2) {
        const p = this.particles[i];
        if (!p.visible || p.depth < lo || p.depth >= hi) continue;
        // Altura pseudo-aleatória por partícula — recorte irregular de cidade.
        const rnd = (Math.sin(p.p1 * 17.7) + 1) * 0.5;
        const h = 0.05 + rnd * rnd * 0.4;
        this.project(p.bx * (1 + h), p.by * (1 + h), p.bz * (1 + h));
        const persp = fov / (fov + scratch.z);
        const tx = cx + scratch.x * radius * persp;
        const ty = cy + scratch.y * radius * persp;
        ctx.moveTo(p.sx, p.sy);
        ctx.lineTo(tx, ty);
        drawn = true;
      }
      if (drawn) {
        ctx.strokeStyle = rgba(mid > 0.62 ? accent : c, alpha);
        ctx.stroke();
      }
    }
  }

  private drawFilaments(ctx: CanvasRenderingContext2D, bright: number): void {
    const density = this.profile.filament;
    if (density <= 0.05) return;

    const c = this.palette.ring;
    ctx.shadowBlur = 0;
    ctx.lineWidth = 0.6;

    // Quatro faixas de profundidade → 4 paths em vez de um stroke por linha.
    const buckets = 4;
    for (let b = 0; b < buckets; b += 1) {
      const lo = b / buckets;
      const hi = (b + 1) / buckets;
      const mid = (lo + hi) * 0.5;
      const alpha = mid * mid * 0.3 * density * bright;
      if (alpha < 0.008) continue;

      ctx.beginPath();
      let drawn = false;
      for (let i = 0; i < this.links.length; i += 1) {
        const link = this.links[i];
        const a = this.particles[link.a];
        const bp = this.particles[link.b];
        if (!a || !bp) continue;
        const depth = (a.depth + bp.depth) * 0.5;
        if (depth < lo || depth >= hi) continue;
        if (!a.visible && !bp.visible) continue;
        if (link.strength < 0.18) continue;
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(bp.sx, bp.sy);
        drawn = true;
      }
      if (drawn) {
        ctx.strokeStyle = rgba(c, alpha);
        ctx.stroke();
      }
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D, bright: number): void {
    const c = this.palette.particle;
    const accent = this.palette.accent;

    ctx.shadowBlur = 0;
    for (let i = 0; i < this.particles.length; i += 1) {
      const p = this.particles[i];
      if (!p.visible) continue;

      // Hemisfério traseiro: menor e mais escuro.
      const depth = p.depth;
      const alpha = clamp((0.1 + depth * depth * 0.9) * bright, 0, 1);
      if (alpha < 0.02) continue;
      const size = (0.45 + depth * 1.65) * p.scale;

      ctx.fillStyle = rgba(depth > 0.86 ? accent : c, alpha);
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Um punhado de partículas frontais recebe glow real (shadowBlur é caro).
    ctx.shadowColor = rgba(accent, 0.9);
    ctx.shadowBlur = 12;
    ctx.fillStyle = rgba(accent, 0.5 * bright);
    const step = Math.max(1, Math.floor(this.particles.length / 45));
    for (let i = 0; i < this.particles.length; i += step) {
      const p = this.particles[i];
      if (!p.visible || p.depth < 0.75) continue;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, 1.1 * p.scale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  private drawRings(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    baseRadius: number,
    fov: number,
    bright: number,
  ): void {
    const segments = 84;
    const speed = this.profile.ringSpeed * this.design.speed;
    const ringColor = this.palette.ring;
    const arcColor = this.palette.accent;

    // Desenha só a quantidade de anéis escolhida no design.
    const ringCount = Math.max(0, Math.min(this.design.rings, this.rings.length));
    for (let r = 0; r < ringCount; r += 1) {
      const ring = this.rings[r];
      ring.phase += ring.speed * speed * 0.016;
      ring.arcPhase += ring.arcSpeed * speed * 0.02;

      const ctx1 = Math.cos(ring.tiltX);
      const stx = Math.sin(ring.tiltX);
      const ctz = Math.cos(ring.tiltZ);
      const stz = Math.sin(ring.tiltZ);
      const rr = baseRadius * ring.radius * (0.3 + 0.7 * this.reveal);

      ctx.lineWidth = ring.width;
      ctx.shadowBlur = 0;
      ctx.beginPath();

      for (let s = 0; s <= segments; s += 1) {
        const a = (s / segments) * Math.PI * 2 + ring.phase;
        // ponto no plano local do anel
        const lx = Math.cos(a);
        const ly = 0;
        const lz = Math.sin(a);
        // inclinação em X
        const y1 = ly * ctx1 - lz * stx;
        const z1 = ly * stx + lz * ctx1;
        // inclinação em Z
        const x2 = lx * ctz - y1 * stz;
        const y2 = lx * stz + y1 * ctz;

        this.project(x2, y2, z1);
        const persp = fov / (fov + scratch.z);
        const px = cx + scratch.x * rr * persp;
        const py = cy + scratch.y * rr * persp;
        if (s === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = rgba(ringColor, 0.22 * bright);
      ctx.stroke();

      // Arco brilhante percorrendo o perímetro.
      const arcSpan = 0.5;
      const start = ring.arcPhase % (Math.PI * 2);
      const arcSegments = 22;
      ctx.beginPath();
      for (let s = 0; s <= arcSegments; s += 1) {
        const a = start + (s / arcSegments) * arcSpan + ring.phase;
        const lx = Math.cos(a);
        const lz = Math.sin(a);
        const y1 = -lz * stx;
        const z1 = lz * ctx1;
        const x2 = lx * ctz - y1 * stz;
        const y2 = lx * stz + y1 * ctz;

        this.project(x2, y2, z1);
        const persp = fov / (fov + scratch.z);
        const px = cx + scratch.x * rr * persp;
        const py = cy + scratch.y * rr * persp;
        if (s === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.lineWidth = ring.width * 2.1;
      ctx.strokeStyle = rgba(arcColor, 0.75 * bright);
      ctx.shadowColor = rgba(arcColor, 0.9);
      ctx.shadowBlur = 16;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Projeta um ângulo do anel para a tela, com escala de raio opcional.
      const ringPt = (a: number, radScale: number): { x: number; y: number } => {
        const lx = Math.cos(a);
        const lz = Math.sin(a);
        const y1 = -lz * stx;
        const z1 = lz * ctx1;
        const x2 = lx * ctz - y1 * stz;
        const y2 = lx * stz + y1 * ctz;
        this.project(x2, y2, z1);
        const persp = fov / (fov + scratch.z);
        return {
          x: cx + scratch.x * rr * radScale * persp,
          y: cy + scratch.y * rr * radScale * persp,
        };
      };

      // Marcações finas perpendiculares ao longo de todo o anel — o "detalhe"
      // das linhas. Mais longas a cada 4ª, como uma régua/escala.
      const ticks = 60;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (let s = 0; s < ticks; s += 1) {
        const a = (s / ticks) * Math.PI * 2 + ring.phase;
        const inner = ringPt(a, 1);
        const outer = ringPt(a, s % 4 === 0 ? 1.075 : 1.035);
        ctx.moveTo(inner.x, inner.y);
        ctx.lineTo(outer.x, outer.y);
      }
      ctx.strokeStyle = rgba(ringColor, 0.28 * bright);
      ctx.stroke();

      // Nó brilhante correndo na frente do arco.
      const head = ringPt(start + arcSpan + ring.phase, 1);
      ctx.beginPath();
      ctx.arc(head.x, head.y, ring.width * 1.6, 0, Math.PI * 2);
      ctx.fillStyle = rgba(arcColor, 0.95 * bright);
      ctx.shadowColor = rgba(arcColor, 1);
      ctx.shadowBlur = 14;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  private drawShockwaves(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    baseRadius: number,
    bright: number,
  ): void {
    if (this.shockwaves.length === 0) return;
    const c = this.palette.accent;
    ctx.shadowBlur = 0;
    for (let i = 0; i < this.shockwaves.length; i += 1) {
      const s = this.shockwaves[i];
      const alpha = clamp(s.life, 0, 1) * 0.4 * bright;
      if (alpha < 0.01) continue;
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius * s.radius, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(c, alpha);
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  }

  private drawCore(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    baseRadius: number,
    bright: number,
  ): void {
    // Respiração de 3 segundos.
    const breath = 0.85 + Math.sin((this.time / 3) * Math.PI * 2) * 0.15;
    const gain = this.profile.coreGain * breath * (0.4 + 0.6 * this.reveal);
    const coreR = baseRadius * 0.3 * gain * (1 + this.pulseEnergy * 0.25) * this.design.coreSize;
    if (coreR <= 0.5) return;

    const c = this.palette.core;
    const p = this.palette.particle;

    const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 3.2);
    halo.addColorStop(0, rgba(p, 0.32 * bright));
    halo.addColorStop(0.45, rgba(p, 0.09 * bright));
    halo.addColorStop(1, rgba(p, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR * 3.2, 0, Math.PI * 2);
    ctx.fill();

    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    core.addColorStop(0, rgba([255, 255, 255], 0.95 * bright));
    core.addColorStop(0.25, rgba(c, 0.8 * bright));
    core.addColorStop(0.7, rgba(p, 0.24 * bright));
    core.addColorStop(1, rgba(p, 0));
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Frame único para `prefers-reduced-motion`: sem partículas nem rotação. */
  private renderStatic(): void {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    if (w === 0 || h === 0) return;

    ctx.globalCompositeOperation = 'source-over';
    if (this.transparent) {
      ctx.clearRect(0, 0, w, h);
    } else {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, w, h);
    }

    const cx = w / 2;
    const cy = h * 0.5;
    const baseRadius = Math.min(w, h) * 0.28;

    ctx.globalCompositeOperation = 'lighter';
    const p = this.basePalette.particle;
    const c = this.basePalette.core;

    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.arc(cx, cy, baseRadius * (1.15 + i * 0.28), 0, Math.PI * 2);
      ctx.strokeStyle = rgba(p, 0.16 - i * 0.04);
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseRadius * 0.9);
    core.addColorStop(0, rgba([255, 255, 255], 0.85 * this.reveal));
    core.addColorStop(0.3, rgba(c, 0.45 * this.reveal));
    core.addColorStop(1, rgba(p, 0));
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, baseRadius * 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
}
