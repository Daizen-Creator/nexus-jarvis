import { useEffect, useRef, useState } from 'react';
import { Panel } from '../SystemWindow';
import { sphereController } from '../../hooks/useSphere';
import { useSystemStore } from '../../store/useSystemStore';
import { speech } from '../../engine/SpeechEngine';
import { themeById } from '../../engine/themes';

const SAMPLES = 48;

/** Mini-gráfico de atividade: desenhado direto no canvas, fora do React. */
function ActivityGraph(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const data = new Array<number>(SAMPLES).fill(0.3);
    let phase = 0;
    let disposed = false;

    const resize = (): void => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const draw = (): void => {
      if (disposed) return;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      if (w === 0 || h === 0) return;

      phase += 0.35;
      const fps = sphereController.getFps();
      const load = 0.25 + Math.abs(Math.sin(phase * 0.7)) * 0.35 + (60 - Math.min(60, fps)) / 120;
      data.push(Math.min(1, load + Math.random() * 0.18));
      data.shift();

      ctx.clearRect(0, 0, w, h);

      // grade
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 4; i += 1) {
        const y = (h / 4) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      const styles = getComputedStyle(document.documentElement);
      const blue = styles.getPropertyValue('--c-blue').trim() || '0 212 255';
      const cyan = styles.getPropertyValue('--c-cyan').trim() || '125 249 255';

      const step = w / (SAMPLES - 1);

      // área preenchida
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let i = 0; i < data.length; i += 1) {
        ctx.lineTo(i * step, h - data[i] * h * 0.92);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = `rgba(${blue.replace(/\s+/g, ',')},0.14)`;
      ctx.fill();

      // linha
      ctx.beginPath();
      for (let i = 0; i < data.length; i += 1) {
        const x = i * step;
        const y = h - data[i] * h * 0.92;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(${cyan.replace(/\s+/g, ',')},0.85)`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    };

    draw();
    const interval = window.setInterval(draw, 120);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      observer.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="h-12 w-full" />;
}

export function SystemPanel(): JSX.Element {
  const theme = useSystemStore((s) => s.theme);
  const micSupported = useSystemStore((s) => s.micSupported);

  const [clock, setClock] = useState(() => new Date());
  const [fps, setFps] = useState(60);
  const [particles, setParticles] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setClock(new Date());
      setFps(sphereController.getFps());
      setParticles(sphereController.getParticleCount());
    }, 500);
    return () => window.clearInterval(interval);
  }, []);

  const time = clock.toLocaleTimeString('pt-BR', { hour12: false });
  const date = clock.toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });

  const stable = fps >= 40;

  return (
    <Panel title="Sistema" meta="SYS-04">
      <div className="text-center">
        <p className="font-display text-3xl font-black leading-none tracking-[0.08em] text-ice nx-glow tabular-nums">
          {time}
        </p>
        <p className="mt-1 font-mono text-[0.62rem] uppercase tracking-[0.28em] text-ice/45">
          {date}
        </p>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 font-mono text-[0.65rem]">
        <dt className="text-ice/40">FPS</dt>
        <dd className={`text-right tabular-nums ${stable ? 'text-cyan' : 'text-danger'}`}>{fps}</dd>

        <dt className="text-ice/40">NÚCLEO</dt>
        <dd className={`text-right ${stable ? 'text-success' : 'text-gold'}`}>
          {stable ? 'ESTÁVEL' : 'CARGA ALTA'}
        </dd>

        <dt className="text-ice/40">PARTÍCULAS</dt>
        <dd className="text-right tabular-nums text-ice/70">{particles}</dd>

        <dt className="text-ice/40">ESPECTRO</dt>
        <dd className="truncate text-right uppercase text-ice/70">{themeById(theme).label}</dd>

        <dt className="text-ice/40">VOZ</dt>
        <dd className="truncate text-right text-ice/70" title={speech.getVoiceName()}>
          {speech.supported ? 'ATIVA' : 'N/D'}
        </dd>

        <dt className="text-ice/40">MIC</dt>
        <dd className={`text-right ${micSupported ? 'text-ice/70' : 'text-danger/70'}`}>
          {micSupported ? 'PRONTO' : 'N/D'}
        </dd>
      </dl>

      <div className="mt-3">
        <p className="nx-label mb-1">Atividade do núcleo</p>
        <ActivityGraph />
      </div>
    </Panel>
  );
}
