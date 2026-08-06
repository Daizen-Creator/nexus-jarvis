import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ParticleCanvas } from './ParticleCanvas';
import { sphereController } from '../hooks/useSphere';
import { speech } from '../engine/SpeechEngine';
import { personalize } from '../engine/personalize';
import { applyTheme } from '../engine/themes';
import { runCommand } from '../engine/commands';
import { useConfigStore, subscribeConfigChanges } from '../store/useConfigStore';
import { useSystemStore } from '../store/useSystemStore';
import { desktop, desktopInternal } from '../desktop/bridge';
import type { VoiceStatePayload } from '../types/desktop';

const STATUS_LABEL: Record<VoiceStatePayload['status'], string> = {
  stopped: 'ESCUTA PARADA',
  starting: 'INICIANDO',
  listening: 'OUVINDO',
  'no-model': 'MODELO AUSENTE',
  'no-microphone': 'SEM MICROFONE',
  'no-python': 'PYTHON AUSENTE',
  error: 'FALHA',
};

/**
 * Sobreposição transparente sempre-no-topo.
 *
 * É a cara do NEXUS em segundo plano: a esfera responde à voz, o cartão mostra
 * o que foi ouvido e o que foi feito, e a janela some sozinha depois. Cliques
 * atravessam tudo — quem cuida disso é `setIgnoreMouseEvents` no processo
 * principal.
 */
export function HudApp(): JSX.Element {
  const theme = useConfigStore((s) => s.config.behavior.theme);
  const loadConfig = useConfigStore((s) => s.load);
  const setReducedMotion = useSystemStore((s) => s.setReducedMotion);

  const [voiceState, setVoiceState] = useState<VoiceStatePayload>({
    status: 'stopped',
    message: '',
  });
  const [heard, setHeard] = useState('');
  const [partial, setPartial] = useState('');
  const [reply, setReply] = useState<{ text: string; ok: boolean } | null>(null);

  /* Configuração e tema */
  useEffect(() => {
    void loadConfig();
    return subscribeConfigChanges();
  }, [loadConfig]);

  useEffect(() => {
    applyTheme(theme);
    sphereController.setTheme(theme);
  }, [theme]);

  const sphereDesign = useConfigStore((s) => s.config.sphere);
  useEffect(() => {
    sphereController.setDesign(sphereDesign);
  }, [sphereDesign]);

  useEffect(() => {
    speech.setTransform(personalize);
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(query.matches);
    const onChange = (e: MediaQueryListEvent): void => setReducedMotion(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [setReducedMotion]);

  /* Eventos de voz vindos do processo principal */
  useEffect(() => {
    const bridge = desktop();
    const internal = desktopInternal();
    if (!bridge || !internal) return undefined;

    const offState = bridge.onVoiceState((state) => {
      setVoiceState(state);
      sphereController.setState(state.status === 'listening' ? 'listening' : 'idle');
    });

    const offPartial = bridge.onVoicePartial((text) => setPartial(text));

    const offHeard = bridge.onVoiceHeard((payload) => {
      setPartial('');
      if (!payload.awake) return;
      setHeard(payload.text);
      setReply(null);
      sphereController.setState('processing');
      sphereController.pulse(1.2);
    });

    const offReply = internal.onVoiceReply(({ reply: text, ok }) => {
      setReply({ text, ok });
      if (useConfigStore.getState().config.voice.speakResponses) speech.speak(text);
      sphereController.setState(ok ? 'speaking' : 'alert');
      window.setTimeout(() => sphereController.setState('idle'), 1600);
    });

    // Comandos que o processo principal não resolveu caem no registry local.
    const offCommand = internal.onVoiceCommand((text) => {
      runCommand(text, 'voice');
      setReply({ text: `Comando: ${text}`, ok: true });
    });

    void bridge.getVoiceState().then(setVoiceState);

    return () => {
      offState();
      offPartial();
      offHeard();
      offReply();
      offCommand();
    };
  }, []);

  const active = voiceState.status === 'listening';
  const broken =
    voiceState.status === 'error' ||
    voiceState.status === 'no-model' ||
    voiceState.status === 'no-microphone' ||
    voiceState.status === 'no-python';

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden bg-transparent">
      <ParticleCanvas transparent />

      <div className="pointer-events-none absolute inset-x-0 bottom-16 flex flex-col items-center gap-3 px-6">
        {/* Estado do canal de voz */}
        <div
          className={`nx-window nx-clip-sm flex items-center gap-2.5 px-3 py-1.5 ${
            broken ? 'nx-window--alert' : ''
          }`}
        >
          <span
            aria-hidden="true"
            className={`h-2 w-2 rounded-full ${
              active ? 'animate-pulse bg-cyan' : broken ? 'bg-danger' : 'bg-ice/25'
            }`}
            style={active ? { boxShadow: '0 0 10px rgb(var(--c-cyan))' } : undefined}
          />
          <span
            className={`font-display text-[0.58rem] font-bold tracking-[0.3em] ${
              broken ? 'text-danger' : active ? 'text-cyan' : 'text-ice/45'
            }`}
          >
            {STATUS_LABEL[voiceState.status]}
          </span>
          {broken && voiceState.message ? (
            <span className="max-w-sm truncate font-mono text-[0.6rem] text-ice/50">
              {voiceState.message}
            </span>
          ) : null}
        </div>

        {/* Transcrição parcial, em cinza */}
        <AnimatePresence>
          {partial.length > 0 ? (
            <motion.p
              key="partial"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="font-mono text-sm text-ice/30"
            >
              {partial}
            </motion.p>
          ) : null}
        </AnimatePresence>

        {/* O que foi ouvido e o que foi feito */}
        <AnimatePresence mode="popLayout">
          {heard.length > 0 ? (
            <motion.div
              key={heard}
              layout
              initial={{ opacity: 0, y: 18, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -10, filter: 'blur(6px)' }}
              transition={{ duration: 0.36, ease: [0.2, 0.8, 0.2, 1] }}
              className={`nx-window nx-clip w-full max-w-lg px-4 py-3 ${
                reply && !reply.ok ? 'nx-window--alert' : ''
              }`}
            >
              <p className="font-mono text-[0.68rem] tracking-[0.16em] text-cyan/70">
                &gt; {heard}
              </p>
              {reply ? (
                <p
                  className={`mt-1.5 font-display text-sm tracking-[0.06em] ${
                    reply.ok ? 'text-ice nx-glow' : 'text-danger'
                  }`}
                >
                  {personalize(reply.text)}
                </p>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
