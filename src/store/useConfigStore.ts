import { create } from 'zustand';
import type { NexusConfig } from '../types/desktop';
import { defaultConfig, mergeConfig } from '../desktop/defaults';
import { desktop, desktopInternal } from '../desktop/bridge';

const BROWSER_KEY = 'nexus_desktop_config';

/**
 * Configuração do NEXUS no renderer.
 *
 * No Electron a fonte da verdade é o arquivo em `userData`, acessado por IPC.
 * No navegador comum tudo cai para o localStorage, então o painel continua
 * funcionando em `npm run dev` — só as ações de sistema é que não existem.
 */
interface ConfigState {
  config: NexusConfig;
  loaded: boolean;
  saving: boolean;

  load: () => Promise<void>;
  save: (next: NexusConfig) => Promise<void>;
  patch: (mutate: (draft: NexusConfig) => NexusConfig) => Promise<void>;
  reset: () => Promise<void>;
  hashPassword: (plain: string) => Promise<string>;
}

/** SHA-256 pela Web Crypto — mesmo algoritmo que o processo principal usa. */
const hashInBrowser = async (plain: string): Promise<string> => {
  const bytes = new TextEncoder().encode(plain);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

const readBrowserConfig = (): NexusConfig => {
  try {
    const raw = localStorage.getItem(BROWSER_KEY);
    if (raw) return mergeConfig(JSON.parse(raw) as Partial<NexusConfig>);
  } catch {
    /* config corrompida: cai no padrão */
  }
  return defaultConfig();
};

export const useConfigStore = create<ConfigState>()((set, get) => ({
  config: defaultConfig(),
  loaded: false,
  saving: false,

  load: async () => {
    const bridge = desktop();
    const config = bridge ? await bridge.getConfig() : readBrowserConfig();
    set({ config, loaded: true });
  },

  save: async (next) => {
    set({ saving: true });
    try {
      const bridge = desktop();
      if (bridge) {
        const saved = await bridge.saveConfig(next);
        set({ config: saved });
      } else {
        const merged = mergeConfig(next);
        localStorage.setItem(BROWSER_KEY, JSON.stringify(merged));
        set({ config: merged });
      }
    } finally {
      set({ saving: false });
    }
  },

  patch: async (mutate) => {
    await get().save(mutate(get().config));
  },

  reset: async () => {
    const bridge = desktop();
    if (bridge) {
      set({ config: await bridge.resetConfig() });
    } else {
      localStorage.removeItem(BROWSER_KEY);
      set({ config: defaultConfig() });
    }
  },

  hashPassword: async (plain) => {
    const bridge = desktop();
    return bridge ? bridge.hashPassword(plain) : hashInBrowser(plain);
  },
}));

/* ------------------------------------------------------------------ */
/* Sincronização                                                       */
/* ------------------------------------------------------------------ */

/** Mantém as duas janelas (HUD e configuração) com a mesma config. */
export const subscribeConfigChanges = (): (() => void) => {
  const internal = desktopInternal();
  if (!internal) return () => undefined;
  return internal.onConfigChanged((config) => useConfigStore.setState({ config, loaded: true }));
};

/** Como o J.A.R.V.I.S. deve se dirigir a você. Nunca devolve vazio. */
export const addressOf = (config: NexusConfig): string =>
  config.profile.address.trim() || 'Senhor';

export const useAddress = (): string => useConfigStore((s) => addressOf(s.config));
