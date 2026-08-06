import { app } from 'electron';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { NexusConfig } from '../src/types/desktop';
import { defaultConfig, mergeConfig } from '../src/desktop/defaults';

export const sha256 = (plain: string): string =>
  createHash('sha256').update(plain, 'utf8').digest('hex');

let cached: NexusConfig | null = null;

const configPath = (): string => join(app.getPath('userData'), 'nexus-config.json');

export const loadConfig = (): NexusConfig => {
  if (cached) return cached;
  const path = configPath();

  if (!existsSync(path)) {
    cached = defaultConfig();
    saveConfig(cached);
    return cached;
  }

  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as Partial<NexusConfig>;
    cached = mergeConfig(parsed);
    // Config de uma versão antiga: grava a versão migrada para não repetir a
    // migração a cada abertura (e para o arquivo refletir o estado real).
    if ((parsed.version ?? 1) !== cached.version) {
      saveConfig(cached);
    }
  } catch (error) {
    console.error('[nexus] config ilegível, usando o padrão:', error);
    cached = defaultConfig();
  }
  return cached;
};

export const saveConfig = (config: NexusConfig): NexusConfig => {
  const next = mergeConfig(config);
  cached = next;
  const path = configPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(next, null, 2), 'utf8');
  return next;
};

export const resetConfig = (): NexusConfig => saveConfig(defaultConfig());

export const getConfigPath = configPath;
