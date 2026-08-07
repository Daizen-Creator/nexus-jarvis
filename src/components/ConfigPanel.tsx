import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { SystemWindow, Panel } from './SystemWindow';
import { useSound } from '../hooks/useSound';
import { useConfigStore } from '../store/useConfigStore';
import { useSystemStore } from '../store/useSystemStore';
import { speech } from '../engine/SpeechEngine';
import { THEMES, themeById } from '../engine/themes';
import { sphereController } from '../hooks/useSphere';
import { SECURITY_TOOLS, SPHERE_PRESETS, presetTheme, sphereFromPreset } from '../desktop/defaults';
import { desktop } from '../desktop/bridge';
import { SYSTEM_ACTION_LABEL } from '../types/desktop';
import type {
  ActionKind,
  AiStatus,
  AppShortcut,
  CliTool,
  CustomCommand,
  MicDevice,
  NexusConfig,
  SiteShortcut,
  SystemActionId,
  ToolCategory,
  VoiceStatePayload,
} from '../types/desktop';

const CATEGORY_LABEL: Record<ToolCategory, string> = {
  geral: 'Geral',
  recon: 'Reconhecimento',
  defesa: 'Defesa',
  ataque: 'Pentest (autorizado)',
};

/* ------------------------------------------------------------------ */
/* Blocos reutilizáveis                                                */
/* ------------------------------------------------------------------ */

const uid = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <label className="block">
      <span className="nx-label mb-1 block">{label}</span>
      {children}
      {hint ? <span className="mt-1 block font-mono text-[0.62rem] text-ice/35">{hint}</span> : null}
    </label>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  danger,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  danger?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full min-h-[44px] items-center gap-3 border-b border-blue/10 py-2 text-left last:border-b-0"
    >
      <span
        className={`relative h-5 w-9 shrink-0 border transition-colors duration-200 ${
          checked
            ? danger
              ? 'border-danger/70 bg-danger/20'
              : 'border-cyan/70 bg-cyan/20'
            : 'border-ice/20 bg-ice/5'
        }`}
      >
        <motion.span
          className={`absolute top-0.5 h-3.5 w-3.5 ${danger && checked ? 'bg-danger' : checked ? 'bg-cyan' : 'bg-ice/35'}`}
          initial={false}
          animate={{ left: checked ? 18 : 2 }}
          transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-[0.74rem] text-ice/85">{label}</span>
        {hint ? <span className="block font-mono text-[0.62rem] text-ice/35">{hint}</span> : null}
      </span>
    </button>
  );
}

const inputClass = 'nx-input nx-clip-sm font-mono text-[0.78rem]';

/** Lista de frases separada por vírgula — o formato que o usuário entende. */
const phrasesToText = (phrases: string[]): string => phrases.join(', ');
const textToPhrases = (text: string): string[] =>
  text
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

/* ------------------------------------------------------------------ */
/* Seções                                                              */
/* ------------------------------------------------------------------ */

interface SectionProps {
  config: NexusConfig;
  update: (mutate: (draft: NexusConfig) => NexusConfig) => void;
}

function ProfileSection({ config, update }: SectionProps): JSX.Element {
  const hashPassword = useConfigStore((s) => s.hashPassword);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const applyPassword = useCallback(async () => {
    if (newPassword.length < 4) {
      setMessage({ text: 'A senha precisa de pelo menos 4 caracteres.', ok: false });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ text: 'As senhas não conferem.', ok: false });
      return;
    }
    const digest = await hashPassword(newPassword);
    update((d) => ({ ...d, profile: { ...d.profile, passwordHash: digest } }));
    setNewPassword('');
    setConfirmPassword('');
    setMessage({ text: 'Senha atualizada.', ok: true });
  }, [newPassword, confirmPassword, hashPassword, update]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Identidade" meta="PRF-01">
        <div className="space-y-3">
          <Field label="Usuário" hint="É o login exigido na tela de autenticação.">
            <input
              className={inputClass}
              value={config.profile.userName}
              maxLength={32}
              onChange={(e) =>
                update((d) => ({ ...d, profile: { ...d.profile, userName: e.target.value } }))
              }
            />
          </Field>

          <Field
            label="Como prefere ser chamado"
            hint='Substitui "Senhor" em toda fala e resposta. Ex.: Chefe, Daniel, Capitão.'
          >
            <input
              className={inputClass}
              value={config.profile.address}
              maxLength={24}
              placeholder="Senhor"
              onChange={(e) =>
                update((d) => ({ ...d, profile: { ...d.profile, address: e.target.value } }))
              }
            />
          </Field>

          <Field label="Nome da assistente (persona)" hint="Ex.: NEXA, SEXTA-FEIRA, FRIDAY, Sistema.">
            <input
              className={inputClass}
              value={config.profile.assistantName}
              maxLength={24}
              placeholder="NEXA"
              onChange={(e) =>
                update((d) => ({ ...d, profile: { ...d.profile, assistantName: e.target.value } }))
              }
            />
          </Field>

          <div className="border-t border-blue/15 pt-3">
            <p className="font-mono text-[0.68rem] leading-snug text-ice/45">
              Prévia:{' '}
              <span className="text-cyan">
                &quot;Bom dia, {config.profile.address.trim() || 'Senhor'}. Aguardando
                autenticação.&quot;
              </span>
            </p>
          </div>
        </div>
      </Panel>

      <Panel title="Senha" meta="PRF-02">
        <div className="space-y-3">
          <p className="font-mono text-[0.66rem] leading-snug text-ice/40">
            A senha é guardada apenas como hash SHA-256 — o texto puro não fica em disco nem no
            código. Ainda assim, isto é uma tranca local e cosmética de um app offline de usuário
            único, não uma fronteira de segurança real.
          </p>

          <Field label="Nova senha">
            <input
              type="password"
              className={inputClass}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </Field>

          <Field label="Confirmar senha">
            <input
              type="password"
              className={inputClass}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </Field>

          <button type="button" className="nx-btn nx-clip-btn w-full" onClick={() => void applyPassword()}>
            ATUALIZAR SENHA
          </button>

          {message ? (
            <p
              className={`font-mono text-[0.68rem] ${message.ok ? 'text-success' : 'text-danger'}`}
              role="status"
            >
              {message.text}
            </p>
          ) : null}

          <p className="break-all border-t border-blue/15 pt-2 font-mono text-[0.58rem] text-ice/25">
            hash atual: {config.profile.passwordHash.slice(0, 32)}…
          </p>
        </div>
      </Panel>
    </div>
  );
}

function VoiceSection({ config, update }: SectionProps): JSX.Element {
  const [devices, setDevices] = useState<MicDevice[]>([]);
  const [state, setState] = useState<VoiceStatePayload | null>(null);
  const [model, setModel] = useState<{ installed: boolean; path: string | null } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const bridge = desktop();

  const refresh = useCallback(() => {
    if (!bridge) return;
    void bridge.listMicDevices().then(setDevices);
    void bridge.getVoiceState().then(setState);
    void bridge.checkModel().then(setModel);
  }, [bridge]);

  useEffect(() => {
    refresh();
    if (!bridge) return undefined;
    const offState = bridge.onVoiceState(setState);
    const offProgress = bridge.onModelProgress((pct) => setProgress(pct >= 100 ? null : pct));
    return () => {
      offState();
      offProgress();
    };
  }, [bridge, refresh]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Canal de voz" meta="VOZ-01">
        <div className="space-y-1">
          <Toggle
            label="Escuta em segundo plano"
            hint="Liga o daemon Vosk assim que o NEXUS abre."
            checked={config.voice.enabled}
            onChange={(v) => update((d) => ({ ...d, voice: { ...d.voice, enabled: v } }))}
          />
          <Toggle
            label="Exigir wake word"
            hint="Desligado, qualquer frase captada vira comando."
            checked={config.voice.requireWakeWord}
            onChange={(v) => update((d) => ({ ...d, voice: { ...d.voice, requireWakeWord: v } }))}
          />
          <Toggle
            label="Falar as respostas"
            checked={config.voice.speakResponses}
            onChange={(v) => update((d) => ({ ...d, voice: { ...d.voice, speakResponses: v } }))}
          />
          <Toggle
            label="Voz feminina"
            hint="Usada quando 'Voz específica' está em Automática."
            checked={config.voice.voiceGender === 'female'}
            onChange={(v) =>
              update((d) => ({ ...d, voice: { ...d.voice, voiceGender: v ? 'female' : 'male' } }))
            }
          />
        </div>

        <div className="mt-3 space-y-2">
          <Field
            label="Voz específica"
            hint="Escolha uma voz instalada. Instale mais em Windows → Hora e idioma → Fala."
          >
            <select
              className={inputClass}
              value={config.voice.voiceName}
              onChange={(e) => update((d) => ({ ...d, voice: { ...d.voice, voiceName: e.target.value } }))}
            >
              <option value="">Automática (por gênero)</option>
              {speech.listVoices().map((v) => (
                <option key={v.name} value={v.name}>
                  {v.female ? '♀' : '♂'} {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </Field>
          <button
            type="button"
            className="nx-btn nx-clip-btn w-full !text-[0.6rem]"
            onClick={() => {
              speech.setVoiceName(config.voice.voiceName);
              speech.setGender(config.voice.voiceGender);
              speech.setTuning(config.voice.voiceRate, config.voice.voicePitch);
              speech.speak('Olá, Senhor. É assim que a minha voz soa.');
            }}
          >
            OUVIR ESTA VOZ
          </button>
        </div>

        <div className="mt-3 space-y-3">
          <Field label={`Velocidade da fala: ${config.voice.voiceRate.toFixed(2)}×`} hint="Mais alto = fala mais rápido.">
            <input type="range" min={0.7} max={1.6} step={0.02} value={config.voice.voiceRate}
              onChange={(e) => update((d) => ({ ...d, voice: { ...d.voice, voiceRate: Number(e.target.value) } }))}
              className="w-full accent-cyan" />
          </Field>
          <Field label={`Tom da voz: ${config.voice.voicePitch.toFixed(2)}`} hint="1.0 é o natural. Longe disso soa mais robótico.">
            <input type="range" min={0.6} max={1.5} step={0.02} value={config.voice.voicePitch}
              onChange={(e) => update((d) => ({ ...d, voice: { ...d.voice, voicePitch: Number(e.target.value) } }))}
              className="w-full accent-cyan" />
          </Field>
        </div>

        <div className="mt-3 space-y-3">
          <Field
            label="Palavras de ativação"
            hint='Separe por vírgula. "sistema" é a mais confiável no modelo pt-BR; "jarvis" não existe no vocabulário e sai como "já vos" — o casamento fuzzy cobre as variantes.'
          >
            <input
              className={inputClass}
              value={phrasesToText(config.voice.wakeWords)}
              onChange={(e) =>
                update((d) => ({ ...d, voice: { ...d.voice, wakeWords: textToPhrases(e.target.value) } }))
              }
            />
          </Field>

          <Field
            label={`Confiança mínima: ${config.voice.minConfidence.toFixed(2)}`}
            hint="Abaixo disso a frase é descartada. Mais alto = menos engano, mais comandos perdidos."
          >
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={config.voice.minConfidence}
              onChange={(e) =>
                update((d) => ({
                  ...d,
                  voice: { ...d.voice, minConfidence: Number(e.target.value) },
                }))
              }
              className="w-full accent-cyan"
            />
          </Field>
        </div>
      </Panel>

      <Panel title="Microfone e modelo" meta="VOZ-02">
        <div className="space-y-3">
          {/* Diagnóstico direto: por que a voz (não) está funcionando. */}
          <ul className="space-y-1 border-l-2 border-blue/40 pl-3">
            {[
              {
                ok: devices.length > 0,
                label: 'Microfone',
                bad: 'Nenhum microfone detectado — conecte um e clique em Reexaminar.',
              },
              {
                ok: model?.installed ?? false,
                label: 'Modelo de voz',
                bad: 'Modelo Vosk ausente — baixe abaixo.',
              },
              {
                ok: state ? state.status !== 'no-python' : true,
                label: 'Python',
                bad: 'Python não encontrado no PATH.',
              },
              {
                ok: state?.status === 'listening',
                label: 'Escutando agora',
                bad: 'Parado. Clique em Escutar para iniciar.',
              },
            ].map((row) => (
              <li key={row.label} className="flex items-start gap-2 font-mono text-[0.66rem]">
                <span className={row.ok ? 'text-success' : 'text-danger'}>{row.ok ? '●' : '○'}</span>
                <span className="text-ice/70">
                  {row.label}
                  {!row.ok ? <span className="block text-ice/40">{row.bad}</span> : null}
                </span>
              </li>
            ))}
          </ul>

          <Field label="Dispositivo de entrada">
            <select
              className={inputClass}
              value={config.voice.deviceIndex ?? ''}
              onChange={(e) =>
                update((d) => ({
                  ...d,
                  voice: {
                    ...d.voice,
                    deviceIndex: e.target.value === '' ? null : Number(e.target.value),
                  },
                }))
              }
            >
              <option value="">Padrão do sistema</option>
              {devices.map((device) => (
                <option key={device.index} value={device.index}>
                  {device.index} — {device.name} ({device.hostApi})
                </option>
              ))}
            </select>
          </Field>

          {devices.length === 0 ? (
            <p className="font-mono text-[0.66rem] leading-snug text-danger/80">
              Nenhum dispositivo de entrada encontrado. Conecte um microfone e clique em
              &quot;Reexaminar&quot;.
            </p>
          ) : null}

          <div className="flex gap-2">
            <button type="button" className="nx-btn nx-clip-btn flex-1 !text-[0.6rem]" onClick={refresh}>
              REEXAMINAR
            </button>
            <button
              type="button"
              className="nx-btn nx-clip-btn flex-1 !text-[0.6rem]"
              disabled={!bridge}
              onClick={() => {
                if (!bridge) return;
                if (state?.status === 'listening') void bridge.stopVoice();
                else void bridge.startVoice();
              }}
            >
              {state?.status === 'listening' ? 'PARAR' : 'ESCUTAR'}
            </button>
          </div>

          <div className="border-t border-blue/15 pt-3">
            <p className="nx-label mb-1">Modelo Vosk</p>
            {model?.installed ? (
              <p className="break-all font-mono text-[0.64rem] text-success">
                instalado · {model.path}
              </p>
            ) : (
              <>
                <p className="font-mono text-[0.66rem] text-danger/80">
                  Modelo ausente. Baixe (~31 MB) para a escuta funcionar.
                </p>
                <button
                  type="button"
                  className="nx-btn nx-clip-btn mt-2 w-full !text-[0.6rem]"
                  disabled={!bridge || progress !== null}
                  onClick={() => {
                    setProgress(0);
                    void bridge?.downloadModel(false).then((r) => {
                      setProgress(null);
                      if (r.ok) refresh();
                    });
                  }}
                >
                  {progress !== null ? `BAIXANDO ${progress.toFixed(0)}%` : 'BAIXAR MODELO'}
                </button>
              </>
            )}

            {/* Modelo grande: bem mais preciso para quem não é entendido direito.
                Disponível mesmo com o pequeno já instalado — troca por upgrade. */}
            <p className="mt-3 font-mono text-[0.62rem] text-ice/45">
              Não está te entendendo direito? Baixe o modelo grande (~1,5 GB) —
              precisão muito maior. Precisa de espaço em disco e uma boa conexão.
            </p>
            <button
              type="button"
              className="nx-btn nx-clip-btn mt-2 w-full !text-[0.6rem]"
              disabled={!bridge || progress !== null}
              onClick={() => {
                setProgress(0);
                void bridge?.downloadModel(true).then((r) => {
                  setProgress(null);
                  if (r.ok) refresh();
                });
              }}
            >
              {progress !== null
                ? `BAIXANDO ${progress.toFixed(0)}%`
                : 'BAIXAR MODELO GRANDE (MELHOR PRECISÃO)'}
            </button>
          </div>

          {state ? (
            <p className="border-t border-blue/15 pt-2 font-mono text-[0.64rem] text-ice/50">
              estado: <span className="text-cyan">{state.status}</span> — {state.message}
              {state.device ? ` (${state.device})` : ''}
            </p>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}

function BehaviorSection({ config, update }: SectionProps): JSX.Element {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Segundo plano" meta="CMP-01">
        <div className="space-y-1">
          <Toggle
            label="Iniciar com o Windows"
            hint="Registra o NEXUS na inicialização, já minimizado na bandeja."
            checked={config.behavior.autostart}
            onChange={(v) => update((d) => ({ ...d, behavior: { ...d.behavior, autostart: v } }))}
          />
          <Toggle
            label="Iniciar minimizado na bandeja"
            hint="Vale só quando o Windows abre o NEXUS sozinho. Abrir na mão sempre mostra o painel."
            checked={config.behavior.startMinimized}
            onChange={(v) =>
              update((d) => ({ ...d, behavior: { ...d.behavior, startMinimized: v } }))
            }
          />
          <Toggle
            label="Mostrar o HUD ao acordar"
            hint="A esfera aparece sobre tudo quando a wake word é detectada."
            checked={config.behavior.showHudOnWake}
            onChange={(v) =>
              update((d) => ({ ...d, behavior: { ...d.behavior, showHudOnWake: v } }))
            }
          />
          <Toggle
            label="Abertura rápida (splash)"
            hint="Um splash curto no lugar da sequência de boot completa."
            checked={config.behavior.splash}
            onChange={(v) => update((d) => ({ ...d, behavior: { ...d.behavior, splash: v } }))}
          />
          <Toggle
            label="Entrar direto (sem login)"
            hint="Pula a tela de identificação e abre com o seu perfil."
            checked={config.behavior.skipLogin}
            onChange={(v) => update((d) => ({ ...d, behavior: { ...d.behavior, skipLogin: v } }))}
          />
          <Toggle
            label="Som da interface"
            checked={config.behavior.soundEnabled}
            onChange={(v) =>
              update((d) => ({ ...d, behavior: { ...d.behavior, soundEnabled: v } }))
            }
          />
        </div>

        <div className="mt-3 space-y-3">
          <Field
            label="Atalho global"
            hint="Formato do Electron: Control+Shift+Space, Alt+N, Super+J..."
          >
            <input
              className={inputClass}
              value={config.behavior.globalShortcut}
              onChange={(e) =>
                update((d) => ({
                  ...d,
                  behavior: { ...d.behavior, globalShortcut: e.target.value },
                }))
              }
            />
          </Field>

          <Field
            label={`HUD some após ${(config.behavior.hudTimeoutMs / 1000).toFixed(0)}s`}
            hint="Zero mantém o HUD na tela até você escondê-lo."
          >
            <input
              type="range"
              min={0}
              max={30000}
              step={1000}
              value={config.behavior.hudTimeoutMs}
              onChange={(e) =>
                update((d) => ({
                  ...d,
                  behavior: { ...d.behavior, hudTimeoutMs: Number(e.target.value) },
                }))
              }
              className="w-full accent-cyan"
            />
          </Field>

          <Field label={`Tema — ${themeById(config.behavior.theme).label}`} hint={`${THEMES.length} temas de cor`}>
            <div className="nx-scroll grid max-h-44 grid-cols-6 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-8">
              {THEMES.map((th) => {
                const selected = config.behavior.theme === th.id;
                return (
                  <button
                    key={th.id}
                    type="button"
                    title={th.label}
                    aria-label={th.label}
                    aria-pressed={selected}
                    onClick={() => {
                      update((d) => ({ ...d, behavior: { ...d.behavior, theme: th.id } }));
                      // Prévia ao vivo, sem esperar o botão salvar.
                      useSystemStore.getState().setTheme(th.id);
                    }}
                    className={`aspect-square rounded-sm border transition-transform duration-150 hover:scale-110 ${
                      selected ? 'border-ice ring-1 ring-ice' : 'border-black/40'
                    }`}
                    style={{
                      background: `radial-gradient(circle at 30% 30%, rgb(${th.accent}), rgb(${th.primary}) 70%, rgb(${th.bg}))`,
                      boxShadow: selected ? `0 0 8px rgb(${th.primary})` : undefined,
                    }}
                  />
                );
              })}
            </div>
          </Field>
        </div>
      </Panel>

      <Panel title="Permissões de sistema" meta="CMP-02">
        <p className="mb-2 font-mono text-[0.66rem] leading-snug text-ice/40">
          Ações destrutivas ficam desligadas por padrão. Um comando de voz mal entendido não deve
          conseguir desligar a máquina.
        </p>
        <div className="space-y-1">
          <Toggle
            label="Abrir programas"
            checked={config.guards.allowApps}
            onChange={(v) => update((d) => ({ ...d, guards: { ...d.guards, allowApps: v } }))}
          />
          <Toggle
            label="Bloquear a tela"
            checked={config.guards.allowLock}
            onChange={(v) => update((d) => ({ ...d, guards: { ...d.guards, allowLock: v } }))}
          />
          <Toggle
            label="Suspender"
            checked={config.guards.allowSleep}
            onChange={(v) => update((d) => ({ ...d, guards: { ...d.guards, allowSleep: v } }))}
          />
          <Toggle
            danger
            label="Reiniciar o computador"
            hint="Executa shutdown /r com 5 s de margem."
            checked={config.guards.allowRestart}
            onChange={(v) => update((d) => ({ ...d, guards: { ...d.guards, allowRestart: v } }))}
          />
          <Toggle
            danger
            label="Desligar o computador"
            hint="Executa shutdown /s com 5 s de margem."
            checked={config.guards.allowShutdown}
            onChange={(v) => update((d) => ({ ...d, guards: { ...d.guards, allowShutdown: v } }))}
          />
        </div>
      </Panel>
    </div>
  );
}

function SitesSection({ config, update }: SectionProps): JSX.Element {
  return (
    <Panel title="Sites" meta={`${config.sites.length} itens`}>
      <p className="mb-3 font-mono text-[0.66rem] text-ice/40">
        Diga &quot;abrir &lt;frase&gt;&quot; ou só a frase. O que não casar com nada vira busca no
        Google.
      </p>

      <div className="space-y-2">
        {config.sites.map((site, index) => (
          <div key={site.id} className="grid gap-2 border-b border-blue/10 pb-2 md:grid-cols-[1fr_1.2fr_1.6fr_auto]">
            <input
              className={inputClass}
              value={site.name}
              placeholder="Nome"
              onChange={(e) =>
                update((d) => {
                  const sites = [...d.sites];
                  sites[index] = { ...site, name: e.target.value };
                  return { ...d, sites };
                })
              }
            />
            <input
              className={inputClass}
              value={phrasesToText(site.phrases)}
              placeholder="frases, separadas, por vírgula"
              onChange={(e) =>
                update((d) => {
                  const sites = [...d.sites];
                  sites[index] = { ...site, phrases: textToPhrases(e.target.value) };
                  return { ...d, sites };
                })
              }
            />
            <input
              className={inputClass}
              value={site.url}
              placeholder="https://"
              onChange={(e) =>
                update((d) => {
                  const sites = [...d.sites];
                  sites[index] = { ...site, url: e.target.value };
                  return { ...d, sites };
                })
              }
            />
            <button
              type="button"
              aria-label={`Remover ${site.name}`}
              className="nx-btn nx-btn--ghost nx-clip-btn !min-h-[2.4rem] !px-3 !py-1"
              onClick={() => update((d) => ({ ...d, sites: d.sites.filter((s) => s.id !== site.id) }))}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="nx-btn nx-clip-btn mt-3 w-full !text-[0.62rem]"
        onClick={() =>
          update((d) => ({
            ...d,
            sites: [...d.sites, { id: uid('site'), name: '', phrases: [], url: 'https://' } as SiteShortcut],
          }))
        }
      >
        + ADICIONAR SITE
      </button>
    </Panel>
  );
}

function AppsSection({ config, update }: SectionProps): JSX.Element {
  const bridge = desktop();

  return (
    <Panel title="Programas" meta={`${config.apps.length} itens`}>
      <p className="mb-3 font-mono text-[0.66rem] text-ice/40">
        Caminho do executável ou nome resolvível pelo Windows (notepad.exe, ms-settings:).
        {bridge ? '' : ' Abrir programas só funciona no app de desktop.'}
      </p>

      <div className="space-y-2">
        {config.apps.map((appItem, index) => (
          <div key={appItem.id} className="grid gap-2 border-b border-blue/10 pb-2 md:grid-cols-[1fr_1.2fr_1.6fr_auto_auto]">
            <input
              className={inputClass}
              value={appItem.name}
              placeholder="Nome"
              onChange={(e) =>
                update((d) => {
                  const apps = [...d.apps];
                  apps[index] = { ...appItem, name: e.target.value };
                  return { ...d, apps };
                })
              }
            />
            <input
              className={inputClass}
              value={phrasesToText(appItem.phrases)}
              placeholder="frases, separadas"
              onChange={(e) =>
                update((d) => {
                  const apps = [...d.apps];
                  apps[index] = { ...appItem, phrases: textToPhrases(e.target.value) };
                  return { ...d, apps };
                })
              }
            />
            <input
              className={inputClass}
              value={appItem.path}
              placeholder="C:\\...\\programa.exe"
              onChange={(e) =>
                update((d) => {
                  const apps = [...d.apps];
                  apps[index] = { ...appItem, path: e.target.value };
                  return { ...d, apps };
                })
              }
            />
            <button
              type="button"
              disabled={!bridge}
              className="nx-btn nx-clip-btn !min-h-[2.4rem] !px-3 !py-1 !text-[0.58rem]"
              onClick={() => {
                void bridge?.pickExecutable().then((path) => {
                  if (!path) return;
                  update((d) => {
                    const apps = [...d.apps];
                    apps[index] = { ...apps[index], path };
                    return { ...d, apps };
                  });
                });
              }}
            >
              ...
            </button>
            <button
              type="button"
              aria-label={`Remover ${appItem.name}`}
              className="nx-btn nx-btn--ghost nx-clip-btn !min-h-[2.4rem] !px-3 !py-1"
              onClick={() => update((d) => ({ ...d, apps: d.apps.filter((a) => a.id !== appItem.id) }))}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="nx-btn nx-clip-btn mt-3 w-full !text-[0.62rem]"
        onClick={() =>
          update((d) => ({
            ...d,
            apps: [...d.apps, { id: uid('app'), name: '', phrases: [], path: '', args: [] } as AppShortcut],
          }))
        }
      >
        + ADICIONAR PROGRAMA
      </button>
    </Panel>
  );
}

const ACTION_KINDS: Array<{ value: ActionKind; label: string; hint: string }> = [
  { value: 'open-url', label: 'Abrir URL', hint: 'https://...' },
  { value: 'open-app', label: 'Abrir programa', hint: 'notepad.exe' },
  { value: 'system', label: 'Ação de sistema', hint: '' },
  { value: 'search', label: 'Buscar no Google', hint: 'termo da busca' },
  { value: 'speak', label: 'Só responder', hint: 'texto que o NEXUS fala' },
];

function CommandsSection({ config, update }: SectionProps): JSX.Element {
  return (
    <Panel title="Comandos programados" meta={`${config.customCommands.length} itens`}>
      <p className="mb-3 font-mono text-[0.66rem] leading-snug text-ice/40">
        Aqui você programa os seus próprios comandos: frase falada ou digitada → ação. Eles têm
        prioridade sobre os comandos embutidos, então dá para sobrescrever qualquer um.
      </p>

      <div className="space-y-3">
        {config.customCommands.map((command, index) => {
          const patch = (next: Partial<CustomCommand>): void =>
            update((d) => {
              const customCommands = [...d.customCommands];
              customCommands[index] = { ...customCommands[index], ...next };
              return { ...d, customCommands };
            });

          return (
            <div key={command.id} className="nx-panel nx-clip-sm space-y-2 p-3">
              <div className="flex items-center gap-2">
                <input
                  className={`${inputClass} flex-1`}
                  value={command.description}
                  placeholder="Descrição curta"
                  onChange={(e) => patch({ description: e.target.value })}
                />
                <button
                  type="button"
                  role="switch"
                  aria-checked={command.enabled}
                  aria-label="Ativar comando"
                  onClick={() => patch({ enabled: !command.enabled })}
                  className={`h-9 border px-3 font-mono text-[0.6rem] ${
                    command.enabled ? 'border-cyan/70 text-cyan' : 'border-ice/20 text-ice/30'
                  }`}
                >
                  {command.enabled ? 'ATIVO' : 'INATIVO'}
                </button>
                <button
                  type="button"
                  aria-label="Remover comando"
                  className="nx-btn nx-btn--ghost nx-clip-btn !min-h-[2.25rem] !px-3 !py-1"
                  onClick={() =>
                    update((d) => ({
                      ...d,
                      customCommands: d.customCommands.filter((c) => c.id !== command.id),
                    }))
                  }
                >
                  ✕
                </button>
              </div>

              <Field label="Frases de disparo" hint="Separe por vírgula.">
                <input
                  className={inputClass}
                  value={phrasesToText(command.phrases)}
                  placeholder="modo foco, foco total"
                  onChange={(e) => patch({ phrases: textToPhrases(e.target.value) })}
                />
              </Field>

              <div className="grid gap-2 md:grid-cols-[1fr_1.6fr]">
                <Field label="Tipo de ação">
                  <select
                    className={inputClass}
                    value={command.action.kind}
                    onChange={(e) =>
                      patch({ action: { ...command.action, kind: e.target.value as ActionKind } })
                    }
                  >
                    {ACTION_KINDS.map((kind) => (
                      <option key={kind.value} value={kind.value}>
                        {kind.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Alvo">
                  {command.action.kind === 'system' ? (
                    <select
                      className={inputClass}
                      value={command.action.target}
                      onChange={(e) => patch({ action: { ...command.action, target: e.target.value } })}
                    >
                      <option value="">— escolha —</option>
                      {(Object.keys(SYSTEM_ACTION_LABEL) as SystemActionId[]).map((key) => (
                        <option key={key} value={key}>
                          {SYSTEM_ACTION_LABEL[key]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className={inputClass}
                      value={command.action.target}
                      placeholder={ACTION_KINDS.find((k) => k.value === command.action.kind)?.hint}
                      onChange={(e) => patch({ action: { ...command.action, target: e.target.value } })}
                    />
                  )}
                </Field>
              </div>

              <Field label="Resposta falada" hint="Vazio usa uma resposta padrão.">
                <input
                  className={inputClass}
                  value={command.reply}
                  placeholder="Modo foco ativado, Senhor."
                  onChange={(e) => patch({ reply: e.target.value })}
                />
              </Field>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="nx-btn nx-clip-btn mt-3 w-full !text-[0.62rem]"
        onClick={() =>
          update((d) => ({
            ...d,
            customCommands: [
              ...d.customCommands,
              {
                id: uid('cmd'),
                phrases: [],
                description: '',
                action: { kind: 'open-url', target: 'https://' },
                reply: '',
                enabled: true,
              } as CustomCommand,
            ],
          }))
        }
      >
        + PROGRAMAR COMANDO
      </button>
    </Panel>
  );
}

function AiSection({ config, update }: SectionProps): JSX.Element {
  const bridge = desktop();
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [pull, setPull] = useState<{ pct: number; status: string } | null>(null);

  const refresh = useCallback(() => {
    if (!bridge) return;
    void bridge.aiStatus().then(setStatus);
  }, [bridge]);

  useEffect(() => {
    refresh();
    if (!bridge) return undefined;
    return bridge.onAiPullProgress((p) => setPull(p.pct >= 100 ? null : p));
  }, [bridge, refresh]);

  const installed =
    status?.models.some(
      (m) => m === config.ai.model || m.startsWith(`${config.ai.model}:`),
    ) ?? false;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Modelo local" meta="IA-01">
        <div className="space-y-3">
          <Toggle
            label="Geração de código"
            hint="Usa o Ollama rodando na sua máquina. Nenhum prompt sai daqui."
            checked={config.ai.enabled}
            onChange={(v) => update((d) => ({ ...d, ai: { ...d.ai, enabled: v } }))}
          />
          <Toggle
            label="Modo conversa"
            hint='O que não é comando vira pergunta ao modelo, em vez de "comando não reconhecido".'
            checked={config.ai.conversational}
            onChange={(v) => update((d) => ({ ...d, ai: { ...d.ai, conversational: v } }))}
          />

          <div
            className={`border-l-2 pl-3 font-mono text-[0.66rem] leading-snug ${
              status?.reachable ? 'border-success text-success' : 'border-danger text-danger/85'
            }`}
          >
            {status ? status.message : 'verificando...'}
          </div>

          <Field label="Endereço do Ollama">
            <input
              className={inputClass}
              value={config.ai.baseUrl}
              onChange={(e) => update((d) => ({ ...d, ai: { ...d.ai, baseUrl: e.target.value } }))}
            />
          </Field>

          <Field
            label="Modelo de código"
            hint="Com 4 GB de VRAM, um modelo 3B roda inteiro na GPU. O 7B é melhor, mas transborda para a RAM e fica lento."
          >
            <input
              className={inputClass}
              value={config.ai.model}
              onChange={(e) => update((d) => ({ ...d, ai: { ...d.ai, model: e.target.value } }))}
            />
          </Field>

          <Field
            label="Modelo de conversa"
            hint="Separado de propósito: um modelo de código responde bem sobre sintaxe, mas inventa fatos em conhecimento geral."
          >
            <input
              className={inputClass}
              value={config.ai.chatModel}
              placeholder="llama3.2:3b"
              onChange={(e) => update((d) => ({ ...d, ai: { ...d.ai, chatModel: e.target.value } }))}
            />
          </Field>

          <div className="flex gap-2">
            <button type="button" className="nx-btn nx-clip-btn flex-1 !text-[0.58rem]" onClick={refresh}>
              REEXAMINAR
            </button>
            <button
              type="button"
              className="nx-btn nx-clip-btn flex-1 !text-[0.58rem]"
              disabled={!bridge || pull !== null || installed}
              onClick={() => {
                setPull({ pct: 0, status: 'iniciando' });
                void bridge?.aiPullModel(config.ai.model).then(() => {
                  setPull(null);
                  refresh();
                });
              }}
            >
              {installed ? 'INSTALADO' : pull ? `${pull.pct.toFixed(0)}%` : 'BAIXAR MODELO'}
            </button>
          </div>

          {pull ? (
            <p className="font-mono text-[0.62rem] text-ice/40">{pull.status}</p>
          ) : null}

          {status && status.models.length > 0 ? (
            <div className="border-t border-blue/15 pt-2">
              <p className="nx-label mb-1">Modelos baixados</p>
              <ul className="space-y-0.5 font-mono text-[0.64rem] text-ice/55">
                {status.models.map((m) => (
                  <li key={m}>
                    <button
                      type="button"
                      className="text-left hover:text-cyan"
                      onClick={() => update((d) => ({ ...d, ai: { ...d.ai, model: m } }))}
                    >
                      {m}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Panel>

      <Panel title="Saída do código" meta="IA-02">
        <div className="space-y-1">
          <Toggle
            label="Salvar em arquivo"
            checked={config.ai.saveToFile}
            onChange={(v) => update((d) => ({ ...d, ai: { ...d.ai, saveToFile: v } }))}
          />
          <Toggle
            label="Abrir no editor"
            checked={config.ai.openInEditor}
            onChange={(v) => update((d) => ({ ...d, ai: { ...d.ai, openInEditor: v } }))}
          />
          <Toggle
            danger
            label="Executar o código gerado"
            hint="Rodar código de um LLM sem ler antes é arriscado. Ligue com consciência."
            checked={config.ai.allowExecute}
            onChange={(v) => update((d) => ({ ...d, ai: { ...d.ai, allowExecute: v } }))}
          />
        </div>

        <div className="mt-3 space-y-3">
          <Field label="Pasta dos projetos" hint="Vazio usa Documentos\\NEXUS.">
            <div className="flex gap-2">
              <input
                className={`${inputClass} flex-1`}
                value={config.ai.projectsDir}
                placeholder="Documentos\NEXUS"
                onChange={(e) =>
                  update((d) => ({ ...d, ai: { ...d.ai, projectsDir: e.target.value } }))
                }
              />
              <button
                type="button"
                disabled={!bridge}
                className="nx-btn nx-clip-btn !min-h-[2.4rem] !px-3 !py-1 !text-[0.58rem]"
                onClick={() => {
                  void bridge?.pickDirectory().then((dir) => {
                    if (dir) update((d) => ({ ...d, ai: { ...d.ai, projectsDir: dir } }));
                  });
                }}
              >
                ...
              </button>
            </div>
          </Field>

          <Field label="Editor" hint="Comando do editor. Vazio desativa a abertura.">
            <input
              className={inputClass}
              value={config.ai.editorCommand}
              placeholder="code"
              onChange={(e) =>
                update((d) => ({ ...d, ai: { ...d.ai, editorCommand: e.target.value } }))
              }
            />
          </Field>

          <Field label={`Criatividade: ${config.ai.temperature.toFixed(2)}`} hint="Baixo = código mais previsível.">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={config.ai.temperature}
              onChange={(e) =>
                update((d) => ({ ...d, ai: { ...d.ai, temperature: Number(e.target.value) } }))
              }
              className="w-full accent-cyan"
            />
          </Field>

          <Field label={`Timeout de execução: ${config.ai.executeTimeoutSec}s`}>
            <input
              type="range"
              min={5}
              max={120}
              step={5}
              value={config.ai.executeTimeoutSec}
              onChange={(e) =>
                update((d) => ({
                  ...d,
                  ai: { ...d.ai, executeTimeoutSec: Number(e.target.value) },
                }))
              }
              className="w-full accent-cyan"
            />
          </Field>
        </div>
      </Panel>
    </div>
  );
}

function ToolsSection({ config, update }: SectionProps): JSX.Element {
  const bridge = desktop();
  const [found, setFound] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!bridge) return;
    let alive = true;
    void Promise.all(
      config.tools.map((t) => bridge.checkTool(t.command).then((r) => [t.id, r.found] as const)),
    ).then((pairs) => {
      if (alive) setFound(Object.fromEntries(pairs));
    });
    return () => {
      alive = false;
    };
    // Só reexamina quando a lista de comandos muda.
  }, [bridge, config.tools.map((t) => t.command).join('|')]);

  return (
    <Panel title="Ferramentas de linha de comando" meta={`${config.tools.length} itens`}>
      <p className="mb-3 font-mono text-[0.66rem] leading-snug text-ice/40">
        Fale ou digite o nome da ferramenta e os argumentos — a saída aparece ao vivo no terminal.
        O NEXUS só executa o que está cadastrado aqui; ele nunca roda um comando arbitrário vindo da
        voz. Ferramentas não instaladas aparecem marcadas.
      </p>

      <div className="space-y-3">
        {config.tools.map((tool, index) => {
          const patch = (next: Partial<CliTool>): void =>
            update((d) => {
              const tools = [...d.tools];
              tools[index] = { ...tools[index], ...next };
              return { ...d, tools };
            });

          const ok = found[tool.id];

          return (
            <div key={tool.id} className="nx-panel nx-clip-sm space-y-2 p-3">
              <div className="flex items-center gap-2">
                <input
                  className={`${inputClass} flex-1`}
                  value={tool.name}
                  placeholder="Nome"
                  onChange={(e) => patch({ name: e.target.value })}
                />
                <span
                  className={`shrink-0 border px-2 py-1 font-mono text-[0.56rem] ${
                    ok === undefined
                      ? 'border-ice/20 text-ice/30'
                      : ok
                        ? 'border-success/60 text-success'
                        : 'border-danger/60 text-danger'
                  }`}
                >
                  {ok === undefined ? '—' : ok ? 'INSTALADA' : 'NÃO ENCONTRADA'}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={tool.enabled}
                  aria-label={`Ativar ${tool.name}`}
                  onClick={() => patch({ enabled: !tool.enabled })}
                  className={`h-9 border px-3 font-mono text-[0.6rem] ${
                    tool.enabled ? 'border-cyan/70 text-cyan' : 'border-ice/20 text-ice/30'
                  }`}
                >
                  {tool.enabled ? 'ATIVA' : 'INATIVA'}
                </button>
                <button
                  type="button"
                  aria-label={`Remover ${tool.name}`}
                  className="nx-btn nx-btn--ghost nx-clip-btn !min-h-[2.25rem] !px-3 !py-1"
                  onClick={() =>
                    update((d) => ({ ...d, tools: d.tools.filter((t) => t.id !== tool.id) }))
                  }
                >
                  ✕
                </button>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <Field label="Frases de disparo" hint="Separe por vírgula.">
                  <input
                    className={inputClass}
                    value={phrasesToText(tool.phrases)}
                    onChange={(e) => patch({ phrases: textToPhrases(e.target.value) })}
                  />
                </Field>
                <Field label="Comando" hint="Executável no PATH.">
                  <input
                    className={inputClass}
                    value={tool.command}
                    placeholder="sherlock"
                    onChange={(e) => patch({ command: e.target.value })}
                  />
                </Field>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <Field label="Argumentos" hint="Separe por vírgula. {args} = o que você falou.">
                  <input
                    className={inputClass}
                    value={tool.args.join(', ')}
                    placeholder="{args}"
                    onChange={(e) => patch({ args: textToPhrases(e.target.value) })}
                  />
                </Field>
                <Field label="Categoria">
                  <select
                    className={inputClass}
                    value={tool.category ?? 'geral'}
                    onChange={(e) => patch({ category: e.target.value as ToolCategory })}
                  >
                    {(Object.keys(CATEGORY_LABEL) as ToolCategory[]).map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABEL[c]}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <p className="font-mono text-[0.62rem] leading-snug text-ice/35">
                {tool.description}
                {tool.install ? ` · instalar: ${tool.install}` : ''}
              </p>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="nx-btn nx-clip-btn mt-3 w-full !text-[0.62rem]"
        onClick={() =>
          update((d) => ({
            ...d,
            tools: [
              ...d.tools,
              {
                id: uid('tool'),
                name: '',
                phrases: [],
                command: '',
                args: ['{args}'],
                description: '',
                category: 'geral',
                enabled: true,
              } as CliTool,
            ],
          }))
        }
      >
        + ADICIONAR FERRAMENTA
      </button>
    </Panel>
  );
}

function SphereSection({ config, update }: SectionProps): JSX.Element {
  const d = config.sphere;
  const applyPreset = (id: string): void => {
    const next = sphereFromPreset(id);
    const theme = presetTheme(id);
    update((c) => ({
      ...c,
      sphere: next,
      behavior: theme ? { ...c.behavior, theme } : c.behavior,
    }));
    sphereController.setDesign(next); // prévia ao vivo
    if (theme) useSystemStore.getState().setTheme(theme); // tema sugerido ao vivo
  };
  const set = (patch: Partial<typeof d>): void => {
    const next = { ...d, ...patch, preset: 'personalizado' };
    update((c) => ({ ...c, sphere: next }));
    sphereController.setDesign(next);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Estilo da esfera" meta="ESF-01">
        <p className="mb-3 font-mono text-[0.66rem] text-ice/40">
          Escolha um preset e ajuste fino ao lado. A esfera muda ao vivo.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Object.entries(SPHERE_PRESETS).map(([id, preset]) => (
            <button
              key={id}
              type="button"
              onClick={() => applyPreset(id)}
              className={`nx-clip-btn border px-2 py-3 font-display text-[0.6rem] font-bold uppercase tracking-[0.16em] transition-colors ${
                d.preset === id
                  ? 'border-cyan/70 bg-blue/20 text-cyan'
                  : 'border-blue/25 text-ice/55 hover:border-blue/50 hover:text-ice/80'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <p className="mt-3 font-mono text-[0.62rem] text-ice/30">
          Preset atual: {d.preset === 'personalizado' ? 'Personalizado' : SPHERE_PRESETS[d.preset]?.label ?? d.preset}
        </p>
      </Panel>

      <Panel title="Ajuste fino" meta="ESF-02">
        <div className="space-y-3">
          <Field label={`Densidade de partículas: ${d.density.toFixed(2)}×`}>
            <input type="range" min={0.4} max={1.6} step={0.05} value={d.density}
              onChange={(e) => set({ density: Number(e.target.value) })} className="w-full accent-cyan" />
          </Field>
          <Field label={`Anéis orbitais: ${d.rings}`}>
            <input type="range" min={0} max={3} step={1} value={d.rings}
              onChange={(e) => set({ rings: Number(e.target.value) })} className="w-full accent-cyan" />
          </Field>
          <Field label={`Brilho: ${d.glow.toFixed(2)}×`}>
            <input type="range" min={0.5} max={1.6} step={0.05} value={d.glow}
              onChange={(e) => set({ glow: Number(e.target.value) })} className="w-full accent-cyan" />
          </Field>
          <Field label={`Rotação: ${d.speed.toFixed(2)}×`}>
            <input type="range" min={0.3} max={2} step={0.05} value={d.speed}
              onChange={(e) => set({ speed: Number(e.target.value) })} className="w-full accent-cyan" />
          </Field>
          <Field label={`Núcleo: ${d.coreSize.toFixed(2)}×`}>
            <input type="range" min={0.5} max={1.6} step={0.05} value={d.coreSize}
              onChange={(e) => set({ coreSize: Number(e.target.value) })} className="w-full accent-cyan" />
          </Field>
          <Toggle label="Teia de filamentos" hint="Linhas conectando as partículas próximas."
            checked={d.filaments} onChange={(v) => set({ filaments: v })} />
          <Toggle label="Raios radiais" hint="Linhas do centro para fora — o visual holográfico do J.A.R.V.I.S."
            checked={d.radial} onChange={(v) => set({ radial: v })} />
        </div>
      </Panel>
    </div>
  );
}

function SecuritySection({ config, update }: SectionProps): JSX.Element {
  const acknowledged = config.guards.securityAckAt > 0;
  const active = config.guards.allowSecurity;

  const installed = new Set(config.tools.map((t) => `${t.command}|${t.name}`));
  const missing = SECURITY_TOOLS.filter((t) => !installed.has(`${t.command}|${t.name}`));

  const importAll = (): void =>
    update((d) => ({
      ...d,
      tools: [
        ...d.tools,
        ...missing.map((t, i) => ({ ...t, id: `sec-${Date.now().toString(36)}-${i}` })),
      ],
    }));

  const grouped = (['recon', 'defesa', 'ataque'] as const).map((cat) => ({
    cat,
    tools: config.tools.filter((t) => t.category === cat),
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Modo segurança" meta="SEC-01">
        <div className="space-y-3">
          <div className="border-l-2 border-danger/60 pl-3">
            <p className="font-display text-[0.66rem] font-bold uppercase tracking-[0.24em] text-danger">
              Uso autorizado apenas
            </p>
            <p className="mt-1 font-mono text-[0.66rem] leading-snug text-ice/55">
              Estas ferramentas são um lançador para utilitários que você instala. Use somente em
              sistemas seus ou que você tenha autorização explícita e por escrito para testar.
              Varredura, acesso ou ataque a sistemas de terceiros sem permissão é crime. Nada de
              negação de serviço, alvo em massa ou evasão de detecção — isso não faz parte do
              NEXUS.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={acknowledged}
            onClick={() =>
              update((d) => ({
                ...d,
                guards: { ...d.guards, securityAckAt: acknowledged ? 0 : Date.now() },
              }))
            }
            className="flex min-h-[44px] w-full items-start gap-3 text-left"
          >
            <span
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center border text-[0.6rem] ${
                acknowledged ? 'border-danger bg-danger/25 text-danger' : 'border-ice/25 text-transparent'
              }`}
            >
              ✓
            </span>
            <span className="font-mono text-[0.7rem] leading-snug text-ice/80">
              Declaro que só usarei estas ferramentas em sistemas próprios ou com autorização
              expressa.
            </span>
          </button>

          <Toggle
            danger
            label="Ativar ferramentas de pentest"
            hint="Libera a categoria Pentest. Exige a declaração acima."
            checked={active}
            onChange={(v) =>
              update((d) => ({
                ...d,
                guards: { ...d.guards, allowSecurity: v && acknowledged },
              }))
            }
          />
          {active && !acknowledged ? (
            <p className="font-mono text-[0.64rem] text-danger">
              Aceite a declaração para manter o modo ativo.
            </p>
          ) : null}

          <div className="border-t border-blue/15 pt-3">
            <button
              type="button"
              className="nx-btn nx-clip-btn w-full !text-[0.6rem]"
              onClick={importAll}
              disabled={missing.length === 0}
            >
              {missing.length === 0
                ? 'ARSENAL JÁ IMPORTADO'
                : `IMPORTAR ${missing.length} FERRAMENTAS DE SEGURANÇA`}
            </button>
            <p className="mt-1 font-mono text-[0.6rem] text-ice/30">
              Adiciona nmap, whois, nikto e outras à aba Ferramentas (desativadas). Você instala
              cada uma e ativa individualmente.
            </p>
          </div>
        </div>
      </Panel>

      <Panel title="Arsenal registrado" meta="SEC-02">
        {grouped.every((g) => g.tools.length === 0) ? (
          <p className="font-mono text-[0.68rem] text-ice/35">
            Nenhuma ferramenta de segurança registrada. Use o botão IMPORTAR ao lado.
          </p>
        ) : (
          <div className="space-y-3">
            {grouped.map(({ cat, tools }) =>
              tools.length === 0 ? null : (
                <div key={cat}>
                  <p className="nx-label mb-1">{CATEGORY_LABEL[cat]}</p>
                  <ul className="space-y-1">
                    {tools.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center gap-2 font-mono text-[0.66rem] text-ice/60"
                      >
                        <span
                          className={`h-1.5 w-1.5 rotate-45 ${t.enabled ? 'bg-cyan' : 'bg-ice/25'}`}
                        />
                        <span className="flex-1 text-ice/80">{t.name}</span>
                        <span className="text-ice/30">{t.command}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ),
            )}
            <p className="border-t border-blue/15 pt-2 font-mono text-[0.62rem] text-ice/30">
              Ative e edite cada ferramenta na aba Ferramentas. As de Pentest só rodam com o modo
              segurança ligado.
            </p>
          </div>
        )}
      </Panel>
    </div>
  );
}

function DiagnosticsSection(): JSX.Element {
  const bridge = desktop();
  const reset = useConfigStore((s) => s.reset);
  const [result, setResult] = useState<string>('');

  const test = useCallback(
    (id: SystemActionId) => {
      if (!bridge) {
        setResult('Ações de sistema exigem o app de desktop.');
        return;
      }
      void bridge.runAction({ kind: 'system', target: id }).then((r) => {
        setResult(`${SYSTEM_ACTION_LABEL[id]}: ${r.ok ? 'ok' : r.message}`);
      });
    },
    [bridge],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Testar ações" meta="DIA-01">
        <p className="mb-2 font-mono text-[0.66rem] text-ice/40">
          Dispara a ação agora, sem passar pela voz. Útil para descobrir se algo está bloqueado
          nas permissões.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(['volume-up', 'volume-down', 'mute', 'play-pause', 'next-track', 'prev-track'] as SystemActionId[]).map(
            (id) => (
              <button
                key={id}
                type="button"
                className="nx-btn nx-clip-btn !text-[0.58rem]"
                onClick={() => test(id)}
              >
                {SYSTEM_ACTION_LABEL[id].toUpperCase()}
              </button>
            ),
          )}
        </div>
        {result ? (
          <p className="mt-3 font-mono text-[0.66rem] text-cyan" role="status">
            {result}
          </p>
        ) : null}
      </Panel>

      <Panel title="Ambiente" meta="DIA-02">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 font-mono text-[0.66rem]">
          <dt className="text-ice/40">Modo</dt>
          <dd className="text-ice/80">{bridge ? 'App de desktop (Electron)' : 'Navegador'}</dd>
          <dt className="text-ice/40">Plataforma</dt>
          <dd className="text-ice/80">{bridge?.platform ?? navigator.platform}</dd>
          <dt className="text-ice/40">Electron</dt>
          <dd className="text-ice/80">{bridge?.version ?? '—'}</dd>
        </dl>

        <div className="mt-4 space-y-2 border-t border-blue/15 pt-3">
          <button
            type="button"
            className="nx-btn nx-clip-btn w-full !text-[0.6rem]"
            disabled={!bridge}
            onClick={() => bridge?.showHud()}
          >
            MOSTRAR HUD
          </button>
          <button
            type="button"
            className="nx-btn nx-btn--ghost nx-clip-btn w-full !text-[0.6rem]"
            onClick={() => void reset()}
          >
            RESTAURAR PADRÕES
          </button>
        </div>
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Painel                                                              */
/* ------------------------------------------------------------------ */

const TABS = [
  { id: 'perfil', label: 'Perfil' },
  { id: 'voz', label: 'Voz' },
  { id: 'comportamento', label: 'Comportamento' },
  { id: 'esfera', label: 'Esfera' },
  { id: 'sites', label: 'Sites' },
  { id: 'programas', label: 'Programas' },
  { id: 'comandos', label: 'Comandos' },
  { id: 'ferramentas', label: 'Ferramentas' },
  { id: 'seguranca', label: 'Segurança' },
  { id: 'ia', label: 'IA' },
  { id: 'diagnostico', label: 'Diagnóstico' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export interface ConfigPanelProps {
  onClose: () => void;
}

export function ConfigPanel({ onClose }: ConfigPanelProps): JSX.Element {
  const sound = useSound();
  const config = useConfigStore((s) => s.config);
  const loaded = useConfigStore((s) => s.loaded);
  const saving = useConfigStore((s) => s.saving);
  const load = useConfigStore((s) => s.load);
  const save = useConfigStore((s) => s.save);

  const [tab, setTab] = useState<TabId>('perfil');
  const [draft, setDraft] = useState<NexusConfig>(config);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  // Sincroniza o rascunho quando a config chega ou muda por fora — mas nunca
  // por cima de alterações não salvas.
  useEffect(() => {
    if (!dirty) setDraft(config);
  }, [config, dirty, loaded]);

  const update = useCallback((mutate: (d: NexusConfig) => NexusConfig) => {
    setDraft((current) => mutate(current));
    setDirty(true);
  }, []);

  const commit = useCallback(() => {
    void save(draft).then(() => setDirty(false));
    sound.play('confirm');
  }, [draft, save, sound]);

  const discard = useCallback(() => {
    setDraft(config);
    setDirty(false);
  }, [config]);

  const body = useMemo(() => {
    switch (tab) {
      case 'perfil':
        return <ProfileSection config={draft} update={update} />;
      case 'voz':
        return <VoiceSection config={draft} update={update} />;
      case 'comportamento':
        return <BehaviorSection config={draft} update={update} />;
      case 'esfera':
        return <SphereSection config={draft} update={update} />;
      case 'sites':
        return <SitesSection config={draft} update={update} />;
      case 'programas':
        return <AppsSection config={draft} update={update} />;
      case 'comandos':
        return <CommandsSection config={draft} update={update} />;
      case 'ferramentas':
        return <ToolsSection config={draft} update={update} />;
      case 'seguranca':
        return <SecuritySection config={draft} update={update} />;
      case 'ia':
        return <AiSection config={draft} update={update} />;
      case 'diagnostico':
        return <DiagnosticsSection />;
      default:
        return null;
    }
  }, [tab, draft, update]);

  return (
    <div className="fixed inset-0 z-[58] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6">
      <div className="flex h-full w-full max-w-6xl flex-col">
        <SystemWindow
          title="Configuração"
          badge="⚙"
          meta="CFG-00"
          onClose={onClose}
          className="flex min-h-0 flex-1 flex-col"
          bodyClassName="flex min-h-0 flex-1 flex-col !p-0"
          footer={
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-[0.64rem] text-ice/35">
                {dirty ? 'alterações não salvas' : saving ? 'salvando...' : 'tudo salvo'}
              </span>
              <span className="ml-auto flex gap-2">
                <button
                  type="button"
                  className="nx-btn nx-btn--ghost nx-clip-btn !text-[0.6rem]"
                  disabled={!dirty}
                  onClick={discard}
                >
                  DESCARTAR
                </button>
                <button
                  type="button"
                  className="nx-btn nx-clip-btn !text-[0.6rem]"
                  disabled={!dirty || saving}
                  onClick={commit}
                >
                  SALVAR
                </button>
              </span>
            </div>
          }
        >
          <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-blue/20 px-3 py-2">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                onMouseEnter={sound.hover}
                aria-current={tab === item.id}
                className={`shrink-0 border px-3 py-1.5 font-display text-[0.6rem] font-bold uppercase tracking-[0.2em] transition-colors duration-200 ${
                  tab === item.id
                    ? 'border-cyan/70 bg-blue/20 text-cyan'
                    : 'border-transparent text-ice/40 hover:border-blue/30 hover:text-ice/70'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="nx-scroll min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">{body}</div>
        </SystemWindow>
      </div>
    </div>
  );
}
