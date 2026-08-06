import { spawn } from 'node:child_process';
import { rmSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Telemetria e manutenção reais do PC, no espírito do "cérebro do sistema" do
 * J.A.R.V.I.S. — mas só o que é seguro e de fato existe no Windows: uso de
 * CPU/RAM, processos, disco, bateria, temperatura, inicialização e limpeza de
 * temporários. Nada de overclock automático ou "contra-ataque a invasores".
 */

export type SystemReportKind =
  | 'stats'
  | 'processes'
  | 'disk'
  | 'battery'
  | 'temp'
  | 'startup'
  | 'network';

const ps = (script: string, timeoutMs = 15000): Promise<string> =>
  new Promise((resolve) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script],
      { windowsHide: true },
    );
    let out = '';
    let err = '';
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (c: string) => (out += c));
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (c: string) => (err += c));
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve(`ERRO: ${e.message}`);
    });
    child.on('close', () => {
      clearTimeout(timer);
      resolve(out.trim() || (err.trim() ? `ERRO: ${err.trim()}` : ''));
    });
  });

/* ------------------------------------------------------------------ */

const statsScript = `
$os = Get-CimInstance Win32_OperatingSystem
$cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
$totalRam = [math]::Round($os.TotalVisibleMemorySize/1MB,1)
$freeRam = [math]::Round($os.FreePhysicalMemory/1MB,1)
$usedRam = [math]::Round($totalRam-$freeRam,1)
$up = (Get-Date) - $os.LastBootUpTime
"CPU|$cpu"
"RAM|$usedRam|$totalRam"
"UP|$([math]::Floor($up.TotalHours))|$($up.Minutes)"
"OS|$($os.Caption)"
`;

const gpuScript = `
$smi = "$env:SystemRoot\\System32\\nvidia-smi.exe"
if (Test-Path $smi) {
  $r = & $smi --query-gpu=utilization.gpu,temperature.gpu,memory.used,memory.total --format=csv,noheader,nounits 2>$null
  if ($r) { "GPU|$($r -replace '\\s','')" }
}
`;

/** Dados estruturados para o painel JARVIS OS (números, não texto formatado). */
export const systemStats = async (): Promise<Record<string, unknown>> => {
  const [stats, gpu, disk] = await Promise.all([
    ps(statsScript),
    ps(gpuScript),
    ps(
      `Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object { ` +
        `"$($_.DeviceID)|$([math]::Round($_.FreeSpace/1GB,1))|$([math]::Round($_.Size/1GB,1))" }`,
    ),
  ]);

  const map = new Map<string, string[]>();
  for (const line of `${stats}\n${gpu}`.split(/\r?\n/)) {
    const [k, ...v] = line.split('|');
    if (k) map.set(k.trim(), v);
  }

  const num = (s: string | undefined): number | null => {
    if (s === undefined) return null;
    const n = Number.parseFloat(s);
    return Number.isFinite(n) ? n : null;
  };

  const ram = map.get('RAM');
  const up = map.get('UP');
  const gpuParts = (map.get('GPU')?.[0] ?? '').split(',');

  const disks = disk
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => {
      const [id, free, total] = l.split('|');
      return { id, freeGb: num(free) ?? 0, totalGb: num(total) ?? 0 };
    });

  return {
    cpu: num(map.get('CPU')?.[0]) ?? 0,
    ramUsed: num(ram?.[0]) ?? 0,
    ramTotal: num(ram?.[1]) ?? 0,
    gpuUtil: num(gpuParts[0]),
    gpuTemp: num(gpuParts[1]),
    gpuMemUsed: num(gpuParts[2]),
    gpuMemTotal: num(gpuParts[3]),
    uptimeH: num(up?.[0]) ?? 0,
    uptimeM: num(up?.[1]) ?? 0,
    os: map.get('OS')?.[0] ?? '',
    disks,
  };
};

export const systemReport = async (kind: SystemReportKind): Promise<string> => {
  switch (kind) {
    case 'stats': {
      const [stats, gpu] = await Promise.all([ps(statsScript), ps(gpuScript)]);
      const map = new Map<string, string[]>();
      for (const line of `${stats}\n${gpu}`.split(/\r?\n/)) {
        const [k, ...v] = line.split('|');
        if (k) map.set(k.trim(), v);
      }
      const lines: string[] = ['— NÚCLEO DO SISTEMA —'];
      const cpu = map.get('CPU')?.[0];
      if (cpu) lines.push(`CPU: ${cpu}% de uso`);
      const ram = map.get('RAM');
      if (ram) lines.push(`RAM: ${ram[0]} / ${ram[1]} GB`);
      const gpuv = map.get('GPU')?.[0];
      if (gpuv) {
        const [util, temp, memU, memT] = gpuv.split(',');
        lines.push(`GPU: ${util}% · ${temp}°C · ${memU}/${memT} MB`);
      }
      const up = map.get('UP');
      if (up) lines.push(`Ativo há: ${up[0]}h ${up[1]}min`);
      const os = map.get('OS');
      if (os) lines.push(`${os[0]}`);
      return lines.join('\n');
    }

    case 'processes': {
      const out = await ps(
        `Get-Process | Sort-Object WS -Descending | Select-Object -First 8 Name, ` +
          `@{n='MB';e={[math]::Round($_.WS/1MB,0)}}, ` +
          `@{n='CPU';e={[math]::Round($_.CPU,0)}} | ` +
          `ForEach-Object { "$($_.Name)|$($_.MB)|$($_.CPU)" }`,
      );
      const lines = ['— PROCESSOS (por memória) —'];
      for (const l of out.split(/\r?\n/).filter(Boolean)) {
        const [name, mb, cpu] = l.split('|');
        lines.push(`${name.padEnd(22).slice(0, 22)} ${mb} MB  ·  ${cpu}s CPU`);
      }
      return lines.join('\n');
    }

    case 'disk': {
      const out = await ps(
        `Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object { ` +
          `"$($_.DeviceID)|$([math]::Round($_.FreeSpace/1GB,1))|$([math]::Round($_.Size/1GB,1))" }`,
      );
      const health = await ps(
        `Get-CimInstance -Namespace root\\wmi -Class MSStorageDriver_FailurePredictStatus -ErrorAction SilentlyContinue | ` +
          `ForEach-Object { if ($_.PredictFailure) { 'RISCO' } else { 'OK' } }`,
      );
      const lines = ['— ARMAZENAMENTO —'];
      for (const l of out.split(/\r?\n/).filter(Boolean)) {
        const [id, free, size] = l.split('|');
        const pct = Math.round((Number(free) / Number(size)) * 100);
        lines.push(`${id} ${free} GB livres de ${size} GB (${pct}%)`);
      }
      lines.push(`Saúde S.M.A.R.T.: ${health.includes('RISCO') ? 'RISCO DETECTADO' : 'OK'}`);
      return lines.join('\n');
    }

    case 'battery': {
      const out = await ps(
        `$b = Get-CimInstance Win32_Battery; if ($b) { ` +
          `"$($b.EstimatedChargeRemaining)|$($b.BatteryStatus)" } else { 'NONE' }`,
      );
      if (out.includes('NONE') || out === '') return 'Sem bateria — este é um desktop, Senhor.';
      const [charge, status] = out.split('|');
      const plugged = status === '2';
      return `— BATERIA —\nCarga: ${charge}%\nEstado: ${plugged ? 'na tomada' : 'em uso'}`;
    }

    case 'temp': {
      const out = await ps(
        `$t = Get-CimInstance -Namespace root/wmi -Class MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue; ` +
          `if ($t) { [math]::Round((($t | Measure-Object -Property CurrentTemperature -Average).Average/10)-273.15,1) }`,
      );
      const gpu = await ps(gpuScript);
      const lines = ['— TEMPERATURA —'];
      if (out && !out.startsWith('ERRO')) lines.push(`CPU (zona térmica): ${out}°C`);
      else lines.push('CPU: sensor não exposto pelo Windows (comum em desktops).');
      const gpuv = gpu.split('|')[1];
      if (gpuv) lines.push(`GPU: ${gpuv.split(',')[1]}°C`);
      return lines.join('\n');
    }

    case 'startup': {
      const out = await ps(
        `Get-CimInstance Win32_StartupCommand | Select-Object -First 15 Name, Command | ` +
          `ForEach-Object { "$($_.Name)|$($_.Command)" }`,
      );
      const lines = ['— PROGRAMAS DE INICIALIZAÇÃO —'];
      for (const l of out.split(/\r?\n/).filter(Boolean)) {
        const [name] = l.split('|');
        lines.push(`· ${name}`);
      }
      if (lines.length === 1) lines.push('(nenhum item de inicialização listado)');
      return lines.join('\n');
    }

    case 'network': {
      const out = await ps(
        `Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue | ` +
          `Select-Object -First 12 RemoteAddress, RemotePort, OwningProcess | ` +
          `ForEach-Object { "$($_.RemoteAddress)|$($_.RemotePort)|$($_.OwningProcess)" }`,
      );
      const lines = ['— CONEXÕES ATIVAS —'];
      for (const l of out.split(/\r?\n/).filter(Boolean)) {
        const [ip, port, pid] = l.split('|');
        lines.push(`${ip}:${port}  (PID ${pid})`);
      }
      if (lines.length === 1) lines.push('(nenhuma conexão estabelecida)');
      return lines.join('\n');
    }

    default:
      return 'Relatório desconhecido.';
  }
};

/* ------------------------------------------------------------------ */
/* Limpeza de temporários                                              */
/* ------------------------------------------------------------------ */

const dirSize = (dir: string): number => {
  let total = 0;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return 0;
  }
  for (const name of entries) {
    const full = join(dir, name);
    try {
      const st = statSync(full);
      if (st.isDirectory()) total += dirSize(full);
      else total += st.size;
    } catch {
      /* arquivo em uso / sem permissão */
    }
  }
  return total;
};

/**
 * Apaga o conteúdo das pastas de temporários. Só temporários — nunca documentos
 * nem nada fora de %TEMP%/Windows\Temp. Arquivos em uso são ignorados.
 */
export const cleanTemp = async (): Promise<{ ok: boolean; freedMb: number; message: string }> => {
  const targets = [tmpdir(), join(process.env.SystemRoot ?? 'C:\\Windows', 'Temp')];
  let freed = 0;

  for (const dir of targets) {
    const before = dirSize(dir);
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      const full = join(dir, name);
      try {
        rmSync(full, { recursive: true, force: true });
      } catch {
        /* em uso */
      }
    }
    const after = dirSize(dir);
    freed += Math.max(0, before - after);
  }

  const freedMb = Math.round(freed / 1_048_576);
  return {
    ok: true,
    freedMb,
    message:
      freedMb > 0
        ? `Limpeza concluída. ${freedMb} MB liberados dos temporários.`
        : 'Temporários já estavam limpos, Senhor.',
  };
};

/* ------------------------------------------------------------------ */
/* Encerrar um processo pelo nome                                      */
/* ------------------------------------------------------------------ */

// Processos que o NEXUS se recusa a encerrar — derrubá-los trava o Windows.
const PROTECTED = new Set([
  'system', 'idle', 'csrss', 'wininit', 'winlogon', 'services', 'lsass',
  'smss', 'svchost', 'explorer', 'dwm', 'nexus', 'electron',
]);

export const killProcess = async (name: string): Promise<{ ok: boolean; message: string }> => {
  const clean = name.trim().replace(/\.exe$/i, '');
  if (clean.length === 0) return { ok: false, message: 'Qual programa, Senhor?' };
  if (PROTECTED.has(clean.toLowerCase())) {
    return { ok: false, message: `"${clean}" é um processo crítico do sistema. Não vou encerrá-lo.` };
  }

  const out = await ps(
    `$p = Get-Process -Name "${clean.replace(/"/g, '')}" -ErrorAction SilentlyContinue; ` +
      `if ($p) { $p | Stop-Process -Force; "OK|$($p.Count)" } else { "NONE" }`,
  );
  if (out.startsWith('OK')) {
    const n = out.split('|')[1] ?? '1';
    return { ok: true, message: `${clean} encerrado (${n} ${Number(n) > 1 ? 'processos' : 'processo'}).` };
  }
  return { ok: false, message: `Não encontrei nenhum processo "${clean}" em execução.` };
};
