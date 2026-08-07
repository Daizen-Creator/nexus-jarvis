import { app } from 'electron';
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type {
  MicDevice,
  VoiceHeardPayload,
  VoiceStatePayload,
} from '../src/types/desktop';
import { detectWakeWord } from '../src/engine/matcher';
import { loadConfig } from './config';

/* ------------------------------------------------------------------ */
/* Localização dos recursos Python                                     */
/* ------------------------------------------------------------------ */

export const pythonDir = (): string =>
  app.isPackaged
    ? join(process.resourcesPath, 'python')
    : join(app.getAppPath(), 'python');

const scriptPath = (name: string): string => join(pythonDir(), name);

/** Descobre um interpretador utilizável. No Windows o launcher `py` é o mais confiável. */
let cachedPython: string | null | undefined;

/** Verdadeiro quando há Python, mas sem vosk/sounddevice instalados. */
export let pythonPresentButMissingDeps = false;

export const findPython = (): string | null => {
  if (cachedPython !== undefined) return cachedPython;
  // `python`/`python3` (executáveis reais) vêm ANTES de `py`: o launcher `py`
  // lê o shebang do script (#!/usr/bin/env python3) e pode redirecionar para
  // outro Python — no Windows, muitas vezes o da Microsoft Store, que não tem
  // vosk/sounddevice. O `python.exe` ignora o shebang.
  const candidates = process.platform === 'win32' ? ['python', 'python3', 'py'] : ['python3', 'python'];
  let sawPython = false;
  for (const candidate of candidates) {
    try {
      // Sonda IMPORTANDO os módulos: só serve um Python que tenha as dependências.
      const probe = spawnSync(candidate, ['-c', 'import vosk, sounddevice'], {
        windowsHide: true,
        timeout: 12000,
      });
      if (probe.status === 0) {
        cachedPython = candidate;
        return candidate;
      }
      if (probe.error === undefined) sawPython = true;
    } catch {
      /* tenta o próximo */
    }
  }
  // Nenhum Python com as dependências. Guarda se ao menos EXISTE um Python,
  // para o supervisor dar a mensagem certa (faltam pacotes, não falta Python).
  cachedPython = null;
  pythonPresentButMissingDeps = sawPython;
  return null;
};

export const checkModel = (): { installed: boolean; path: string | null } => {
  const configured = loadConfig().voice.modelPath;
  if (configured && existsSync(configured)) return { installed: true, path: configured };

  const dir = join(pythonDir(), 'models');
  if (!existsSync(dir)) return { installed: false, path: null };
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = join(dir, entry.name);
      // Cobre os dois layouts do Vosk: o pequeno é achatado, o grande usa subpastas.
      const markers = ['final.mdl', join('am', 'final.mdl'), 'mfcc.conf', join('conf', 'mfcc.conf')];
      if (markers.some((m) => existsSync(join(full, m)))) return { installed: true, path: full };
    }
  } catch {
    /* pasta ilegível */
  }
  return { installed: false, path: null };
};

/* ------------------------------------------------------------------ */
/* Supervisor do daemon                                                */
/* ------------------------------------------------------------------ */

interface VoiceEvents {
  onHeard: (payload: VoiceHeardPayload) => void;
  onPartial: (text: string) => void;
  onState: (payload: VoiceStatePayload) => void;
}

class VoiceSupervisor {
  private child: ChildProcess | null = null;
  private state: VoiceStatePayload = { status: 'stopped', message: 'Escuta parada.' };
  private events: VoiceEvents | null = null;
  private buffer = '';
  private wantRunning = false;
  private restarts = 0;
  private restartTimer: NodeJS.Timeout | null = null;

  bind(events: VoiceEvents): void {
    this.events = events;
  }

  getState(): VoiceStatePayload {
    return this.state;
  }

  private setState(next: VoiceStatePayload): void {
    this.state = next;
    this.events?.onState(next);
  }

  start(): VoiceStatePayload {
    if (this.child) return this.state;

    const python = findPython();
    if (!python) {
      this.setState({
        status: 'no-python',
        message: pythonPresentButMissingDeps
          ? 'Python encontrado, mas sem vosk/sounddevice. Rode: pip install -r python/requirements.txt'
          : 'Python não encontrado no PATH. Instale o Python 3 para usar a voz.',
      });
      return this.state;
    }

    const model = checkModel();
    if (!model.installed) {
      this.setState({
        status: 'no-model',
        message: 'Modelo de voz ausente. Baixe-o no painel de configuração.',
      });
      return this.state;
    }

    const config = loadConfig();
    const args = [scriptPath('nexus_voice.py'), '--model', model.path as string];
    if (config.voice.deviceIndex !== null) {
      args.push('--device', String(config.voice.deviceIndex));
    }

    this.wantRunning = true;
    this.setState({ status: 'starting', message: 'Iniciando a escuta...' });

    const child = spawn(python, args, {
      cwd: pythonDir(),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' },
    });
    this.child = child;
    this.buffer = '';

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => this.consume(chunk));

    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      const text = chunk.trim();
      if (text.length > 0) console.error('[nexus-voice]', text);
    });

    child.on('error', (error) => {
      this.setState({ status: 'error', message: error.message });
      this.child = null;
    });

    child.on('close', (code) => {
      this.child = null;
      if (!this.wantRunning) {
        this.setState({ status: 'stopped', message: 'Escuta parada.' });
        return;
      }
      // Saídas 2 e 3 são diagnósticos definitivos: religar não resolve.
      if (code === 2 || code === 3) {
        this.wantRunning = false;
        return;
      }
      if (this.restarts >= 5) {
        this.wantRunning = false;
        this.setState({
          status: 'error',
          message: 'O daemon de voz caiu repetidamente. Verifique o microfone e o modelo.',
        });
        return;
      }
      this.restarts += 1;
      const delay = Math.min(8000, 600 * 2 ** this.restarts);
      this.setState({ status: 'starting', message: `Reconectando a escuta (${this.restarts}/5)...` });
      this.restartTimer = setTimeout(() => this.start(), delay);
    });

    return this.state;
  }

  stop(): VoiceStatePayload {
    this.wantRunning = false;
    this.restarts = 0;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.child) {
      this.child.kill();
      this.child = null;
    }
    this.setState({ status: 'stopped', message: 'Escuta parada.' });
    return this.state;
  }

  /** Reinicia para aplicar mudanças de dispositivo ou modelo. */
  restart(): VoiceStatePayload {
    const wasRunning = this.child !== null || this.wantRunning;
    this.stop();
    return wasRunning ? this.start() : this.state;
  }

  private consume(chunk: string): void {
    this.buffer += chunk;
    let index = this.buffer.indexOf('\n');
    while (index >= 0) {
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (line.length > 0) this.handleLine(line);
      index = this.buffer.indexOf('\n');
    }
    // Uma linha absurdamente longa só pode ser lixo — evita crescer sem limite.
    if (this.buffer.length > 64_000) this.buffer = '';
  }

  private handleLine(line: string): void {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line) as Record<string, unknown>;
    } catch {
      console.error('[nexus-voice] linha inválida:', line);
      return;
    }

    const type = event.type;

    if (type === 'state') {
      const status = String(event.status) as VoiceStatePayload['status'];
      if (status === 'listening') this.restarts = 0;
      this.setState({
        status,
        message: String(event.message ?? ''),
        device: typeof event.device === 'string' ? event.device : undefined,
      });
      return;
    }

    if (type === 'partial') {
      this.events?.onPartial(String(event.text ?? ''));
      return;
    }

    if (type === 'final') {
      const text = String(event.text ?? '').trim();
      if (text.length === 0) return;
      const confidence = typeof event.confidence === 'number' ? event.confidence : 1;

      const config = loadConfig();
      if (confidence < config.voice.minConfidence) return;

      const { requireWakeWord, wakeWords } = config.voice;
      const wake = detectWakeWord(text, wakeWords);
      const awake = requireWakeWord ? wake.awake : true;
      const payload: VoiceHeardPayload = {
        text: requireWakeWord ? wake.rest : wake.awake ? wake.rest : text,
        awake,
        confidence,
      };
      this.events?.onHeard(payload);
    }
  }
}

export const voice = new VoiceSupervisor();

/* ------------------------------------------------------------------ */
/* Operações pontuais                                                  */
/* ------------------------------------------------------------------ */

export const listMicDevices = (): Promise<MicDevice[]> =>
  new Promise((resolve) => {
    const python = findPython();
    if (!python) {
      resolve([]);
      return;
    }
    const child = spawn(python, [scriptPath('nexus_voice.py'), '--list-devices'], {
      cwd: pythonDir(),
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    let out = '';
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      out += chunk;
    });
    child.on('error', () => resolve([]));
    child.on('close', () => {
      for (const line of out.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;
        try {
          const parsed = JSON.parse(trimmed) as { type?: string; devices?: MicDevice[] };
          if (parsed.type === 'devices' && Array.isArray(parsed.devices)) {
            resolve(parsed.devices);
            return;
          }
        } catch {
          /* ignora linhas não-JSON */
        }
      }
      resolve([]);
    });
  });

export const downloadModel = (
  onProgress: (pct: number) => void,
  large = false,
): Promise<{ ok: boolean; message: string }> =>
  new Promise((resolve) => {
    const python = findPython();
    if (!python) {
      resolve({ ok: false, message: 'Python não encontrado no PATH.' });
      return;
    }

    const args = [scriptPath('download_model.py')];
    if (large) args.push('--large'); // modelo grande (~1,5 GB, bem mais preciso)
    const child = spawn(python, args, {
      cwd: pythonDir(),
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' },
    });

    let stderr = '';
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
      // O downloader emite "PROGRESS <pct>" no stderr.
      const matches = chunk.match(/PROGRESS ([\d.]+)/g);
      if (matches) {
        const last = matches[matches.length - 1];
        const pct = Number.parseFloat(last.replace('PROGRESS ', ''));
        if (Number.isFinite(pct)) onProgress(pct);
      }
    });

    child.on('error', (error) => resolve({ ok: false, message: error.message }));
    child.on('close', (code) => {
      if (code === 0) {
        onProgress(100);
        resolve({ ok: true, message: 'Modelo instalado.' });
      } else {
        resolve({ ok: false, message: stderr.trim() || `Falha no download (código ${code}).` });
      }
    });
  });
