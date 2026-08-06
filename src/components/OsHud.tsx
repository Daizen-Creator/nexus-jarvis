import { useEffect, useRef, useState } from 'react';
import { desktop } from '../desktop/bridge';
import { usePlayerStore } from '../store/usePlayerStore';
import type { SystemStats } from '../types/desktop';

/* ------------------------------------------------------------------ */
/* Medidor em arco                                                     */
/* ------------------------------------------------------------------ */

function ArcMeter({
  label,
  value,
  max,
  unit,
  size = 120,
}: {
  label: string;
  value: number;
  max: number;
  unit: string;
  size?: number;
}): JSX.Element {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const r = size / 2 - 10;
  const cx = size / 2;
  const cy = size / 2;
  // Arco de 270° começando embaixo à esquerda.
  const start = 135;
  const sweep = 270;
  const end = start + sweep * pct;
  const toXY = (deg: number): [number, number] => {
    const rad = (deg * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const [sx, sy] = toXY(start);
  const [ex, ey] = toXY(end);
  const [fx, fy] = toXY(start + sweep);
  const large = sweep * pct > 180 ? 1 : 0;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full" style={{ maxWidth: size }}>
        <path
          d={`M ${sx} ${sy} A ${r} ${r} 0 1 1 ${fx} ${fy}`}
          fill="none"
          stroke="rgb(var(--c-blue))"
          strokeOpacity="0.15"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <path
          d={`M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey}`}
          fill="none"
          stroke="rgb(var(--c-cyan))"
          strokeWidth="6"
          strokeLinecap="round"
          style={{ filter: 'drop-shadow(0 0 4px rgb(var(--c-cyan)))' }}
        />
        <text x={cx} y={cy - 2} textAnchor="middle" className="fill-ice font-display" style={{ fontSize: size * 0.22, fontWeight: 900 }}>
          {Math.round(value)}
        </text>
        <text x={cx} y={cy + size * 0.16} textAnchor="middle" className="fill-cyan" style={{ fontSize: size * 0.1 }}>
          {unit}
        </text>
      </svg>
      <span className="nx-label mt-1">{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Reator central                                                      */
/* ------------------------------------------------------------------ */

function Reactor({ cpu }: { cpu: number }): JSX.Element {
  const segs = 40;
  const active = Math.round((cpu / 100) * segs);
  return (
    <svg viewBox="0 0 300 300" className="h-full w-full">
      {/* anéis de escala girando */}
      <g className="animate-spinslow" style={{ transformOrigin: '150px 150px' }}>
        {Array.from({ length: 72 }, (_, i) => {
          const a = (i / 72) * Math.PI * 2;
          const long = i % 6 === 0;
          const r1 = long ? 128 : 133;
          return (
            <line
              key={i}
              x1={150 + Math.cos(a) * r1}
              y1={150 + Math.sin(a) * r1}
              x2={150 + Math.cos(a) * 138}
              y2={150 + Math.sin(a) * 138}
              stroke="rgb(var(--c-blue))"
              strokeOpacity={long ? 0.5 : 0.2}
              strokeWidth={long ? 1.4 : 0.8}
            />
          );
        })}
      </g>
      <circle cx="150" cy="150" r="120" fill="none" stroke="rgb(var(--c-blue))" strokeOpacity="0.25" strokeWidth="1" />
      <circle cx="150" cy="150" r="96" fill="none" stroke="rgb(var(--c-blue))" strokeOpacity="0.3" strokeWidth="1" className="animate-spinslow-rev" style={{ transformOrigin: '150px 150px' }} />

      {/* segmentos do reator = carga da CPU */}
      {Array.from({ length: segs }, (_, i) => {
        const a = (i / segs) * Math.PI * 2 - Math.PI / 2;
        const on = i < active;
        return (
          <line
            key={i}
            x1={150 + Math.cos(a) * 60}
            y1={150 + Math.sin(a) * 60}
            x2={150 + Math.cos(a) * 88}
            y2={150 + Math.sin(a) * 88}
            stroke={on ? 'rgb(var(--c-cyan))' : 'rgb(var(--c-blue))'}
            strokeOpacity={on ? 0.95 : 0.15}
            strokeWidth="4"
            style={on ? { filter: 'drop-shadow(0 0 3px rgb(var(--c-cyan)))' } : undefined}
          />
        );
      })}

      {/* triângulo do núcleo */}
      <g style={{ filter: 'drop-shadow(0 0 12px rgb(var(--c-cyan)))' }}>
        <polygon
          points="150,95 195,175 105,175"
          fill="rgb(var(--c-cyan) / 0.15)"
          stroke="rgb(var(--c-cyan))"
          strokeWidth="2"
        />
        <circle cx="150" cy="150" r="10" fill="rgb(var(--c-ice))" />
      </g>
      <text x="150" y="215" textAnchor="middle" className="fill-cyan font-display" style={{ fontSize: 13, letterSpacing: 3 }}>
        CPU {Math.round(cpu)}%
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Gráfico de atividade                                                */
/* ------------------------------------------------------------------ */

function LiveGraph({ value }: { value: number }): JSX.Element {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const dataRef = useRef<number[]>(new Array(60).fill(0));
  const valRef = useRef(value);
  valRef.current = value;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    let raf = 0;
    let disposed = false;

    const resize = (): void => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, rect.width * dpr);
      canvas.height = Math.max(1, rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let last = 0;
    const draw = (ts: number): void => {
      if (disposed) return;
      raf = requestAnimationFrame(draw);
      if (ts - last < 90) return;
      last = ts;
      const d = dataRef.current;
      d.push(valRef.current / 100);
      d.shift();
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      ctx.clearRect(0, 0, w, h);
      const st = window.getComputedStyle(document.documentElement);
      const cyan = st.getPropertyValue('--c-cyan').trim().replace(/\s+/g, ',') || '125,249,255';
      const step = w / (d.length - 1);
      ctx.beginPath();
      ctx.moveTo(0, h);
      d.forEach((v, i) => ctx.lineTo(i * step, h - v * h * 0.9));
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = `rgba(${cyan},0.12)`;
      ctx.fill();
      ctx.beginPath();
      d.forEach((v, i) => (i === 0 ? ctx.moveTo(0, h - v * h * 0.9) : ctx.lineTo(i * step, h - v * h * 0.9)));
      ctx.strokeStyle = `rgba(${cyan},0.85)`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    };
    raf = requestAnimationFrame(draw);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} className="h-full w-full" aria-hidden="true" />;
}

/* ------------------------------------------------------------------ */
/* Bloco de painel                                                     */
/* ------------------------------------------------------------------ */

function Block({
  title,
  children,
  className = '',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div className={`nx-panel nx-clip-sm flex flex-col ${className}`}>
      <div className="nx-titlebar flex items-center gap-2 px-2 py-1">
        <span className="h-1 w-1 rotate-45 bg-cyan" />
        <span className="font-display text-[0.52rem] font-bold uppercase tracking-[0.28em] text-cyan">
          {title}
        </span>
      </div>
      <div className="flex-1 p-2">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Painel JARVIS OS                                                    */
/* ------------------------------------------------------------------ */

export function OsHud(): JSX.Element {
  const bridge = desktop();
  const name = usePlayerStore((s) => s.name);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [clock, setClock] = useState(() => new Date());

  useEffect(() => {
    const tick = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!bridge) return undefined;
    let alive = true;
    const poll = (): void => {
      void bridge.systemStats().then((s) => {
        if (alive) setStats(s);
      });
    };
    poll();
    const id = window.setInterval(poll, 2000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [bridge]);

  if (!bridge) {
    return (
      <div className="grid flex-1 place-items-center">
        <p className="max-w-sm text-center font-mono text-[0.75rem] leading-relaxed text-ice/50">
          O painel JARVIS OS lê o hardware real e só funciona no app de desktop
          (<span className="text-cyan">npm run desktop</span>).
        </p>
      </div>
    );
  }

  const time = clock.toLocaleTimeString('pt-BR', { hour12: false });
  const date = clock.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  const cpu = stats?.cpu ?? 0;
  const ramPct = stats && stats.ramTotal > 0 ? (stats.ramUsed / stats.ramTotal) * 100 : 0;

  return (
    <div className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-2 gap-2 lg:grid-cols-4">
      {/* Coluna esquerda */}
      <div className="flex flex-col gap-2">
        <Block title="Processador">
          <ArcMeter label="CPU" value={cpu} max={100} unit="%" />
        </Block>
        <Block title="Memória">
          <ArcMeter label="RAM" value={ramPct} max={100} unit="%" />
          <p className="mt-1 text-center font-mono text-[0.6rem] text-ice/50">
            {stats ? `${stats.ramUsed.toFixed(1)} / ${stats.ramTotal.toFixed(1)} GB` : '—'}
          </p>
        </Block>
      </div>

      {/* Centro: reator + relógio */}
      <div className="col-span-2 flex flex-col gap-2 lg:col-span-2">
        <div className="nx-panel nx-clip-sm flex items-center justify-between px-4 py-2">
          <div>
            <p className="font-display text-lg font-black tracking-[0.3em] text-cyan nx-chroma">JARVIS OS</p>
            <p className="font-mono text-[0.6rem] tracking-[0.2em] text-ice/40">User: {name || '—'}</p>
          </div>
          <div className="text-right">
            <p className="font-display text-2xl font-black tabular-nums text-ice nx-glow">{time}</p>
            <p className="font-mono text-[0.58rem] uppercase tracking-[0.16em] text-ice/45">{date}</p>
          </div>
        </div>

        <div className="nx-panel nx-clip-sm relative grid flex-1 place-items-center p-2" style={{ minHeight: '18rem' }}>
          <div className="aspect-square w-full max-w-[22rem]">
            <Reactor cpu={cpu} />
          </div>
        </div>

        <Block title="Atividade do sistema" className="h-20">
          <LiveGraph value={cpu} />
        </Block>
      </div>

      {/* Coluna direita */}
      <div className="flex flex-col gap-2">
        {stats?.gpuTemp != null ? (
          <Block title="GPU">
            <ArcMeter label="TEMP" value={stats.gpuTemp} max={100} unit="°C" />
            <p className="mt-1 text-center font-mono text-[0.6rem] text-ice/50">
              {stats.gpuUtil ?? 0}% · {stats.gpuMemUsed ?? 0}/{stats.gpuMemTotal ?? 0} MB
            </p>
          </Block>
        ) : null}

        <Block title="Armazenamento">
          <div className="space-y-2">
            {(stats?.disks ?? []).map((d) => {
              const usedPct = d.totalGb > 0 ? ((d.totalGb - d.freeGb) / d.totalGb) * 100 : 0;
              return (
                <div key={d.id}>
                  <div className="mb-0.5 flex justify-between font-mono text-[0.58rem] text-ice/55">
                    <span>{d.id}</span>
                    <span>{d.freeGb.toFixed(0)} GB livres</span>
                  </div>
                  <div className="nx-bar h-1.5">
                    <div
                      className={`nx-bar__fill ${usedPct > 90 ? 'bg-gradient-to-r from-danger/70 to-danger' : 'bg-gradient-to-r from-blue to-cyan'}`}
                      style={{ width: `${usedPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {(!stats || stats.disks.length === 0) && (
              <p className="font-mono text-[0.6rem] text-ice/30">lendo discos...</p>
            )}
          </div>
        </Block>

        <Block title="Núcleo">
          <dl className="grid grid-cols-2 gap-x-2 gap-y-1 font-mono text-[0.58rem]">
            <dt className="text-ice/40">Ativo</dt>
            <dd className="text-right text-ice/75">{stats ? `${stats.uptimeH}h ${stats.uptimeM}m` : '—'}</dd>
            <dt className="text-ice/40">Estado</dt>
            <dd className={`text-right ${cpu < 85 ? 'text-success' : 'text-gold'}`}>{cpu < 85 ? 'ESTÁVEL' : 'CARGA ALTA'}</dd>
            <dt className="text-ice/40">SO</dt>
            <dd className="truncate text-right text-ice/60" title={stats?.os}>{stats?.os.replace('Microsoft ', '') || '—'}</dd>
          </dl>
        </Block>
      </div>
    </div>
  );
}
