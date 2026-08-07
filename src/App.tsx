import { useCallback, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ParticleCanvas } from './components/ParticleCanvas';
import { HudOverlay } from './components/HudOverlay';
import { BootSequence } from './components/BootSequence';
import { SplashScreen } from './components/SplashScreen';
import { LoginScreen } from './components/LoginScreen';
import { Dashboard } from './components/Dashboard';
import { LevelUpCinematic } from './components/LevelUpCinematic';
import { ConfigPanel } from './components/ConfigPanel';
import { CodePanel } from './components/CodePanel';
import { PreflightScreen } from './components/PreflightScreen';
import { TitleBar } from './components/TitleBar';
import { UpdateSplash } from './components/UpdateSplash';
import { Toast } from './components/Toast';
import { sphereController } from './hooks/useSphere';
import { audio } from './engine/AudioEngine';
import { speech } from './engine/SpeechEngine';
import { personalize } from './engine/personalize';
import { runCommand } from './engine/commands';
import { bindCodeStream } from './engine/codegen';
import { bindToolOutput } from './engine/assistant';
import { applyTheme } from './engine/themes';
import { usePlayerStore } from './store/usePlayerStore';
import { useSystemStore } from './store/useSystemStore';
import { subscribeConfigChanges, useConfigStore } from './store/useConfigStore';
import { desktop, desktopInternal } from './desktop/bridge';

export default function App(): JSX.Element {
  const phase = useSystemStore((s) => s.phase);
  const setPhase = useSystemStore((s) => s.setPhase);
  const theme = useSystemStore((s) => s.theme);
  const soundEnabled = useSystemStore((s) => s.soundEnabled);
  const voiceEnabled = useSystemStore((s) => s.voiceEnabled);
  const reducedMotion = useSystemStore((s) => s.reducedMotion);
  const setReducedMotion = useSystemStore((s) => s.setReducedMotion);
  const pushToast = useSystemStore((s) => s.pushToast);
  const print = useSystemStore((s) => s.print);

  const loggedIn = usePlayerStore((s) => s.loggedIn);
  const questFlash = usePlayerStore((s) => s.questFlash);
  const consumeQuestFlash = usePlayerStore((s) => s.consumeQuestFlash);

  const configOpen = useSystemStore((s) => s.configOpen);
  const setConfigOpen = useSystemStore((s) => s.setConfigOpen);
  const loadConfig = useConfigStore((s) => s.load);

  const greetedRef = useRef(false);

  /* ---------------------------------------------------------------- */
  /* Configuração e tratamento personalizado                           */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    // Toda fala passa por `personalize`, então trocar "Senhor" por "Chefe" no
    // painel muda a voz e o terminal inteiros sem tocar em nenhuma string.
    speech.setTransform(personalize);
    void loadConfig();
    const offConfig = subscribeConfigChanges();
    const offStream = bindCodeStream();
    const offTools = bindToolOutput();
    return () => {
      offConfig();
      offStream();
      offTools();
    };
  }, [loadConfig]);

  /* ---------------------------------------------------------------- */
  /* Voz vinda do processo principal (app de desktop)                   */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const bridge = desktop();
    const internal = desktopInternal();
    if (!bridge || !internal) return undefined;

    const offConfig = bridge.onOpenConfig(() => setConfigOpen(true));
    // O que o processo principal não resolveu sozinho cai no registry local.
    const offCommand = internal.onVoiceCommand((text) => runCommand(text, 'voice'));
    const offReply = internal.onVoiceReply(({ reply, ok, said }) => {
      // Mostra o que foi ouvido (feedback de "digitou") antes da resposta.
      if (said && said.trim().length > 0) {
        useSystemStore.getState().print(`🎙 ${said}`, 'user');
      }
      useSystemStore.getState().print(reply, ok ? 'system' : 'error');
      if (useSystemStore.getState().voiceEnabled) speech.speak(reply);
    });

    return () => {
      offConfig();
      offCommand();
      offReply();
    };
  }, [setConfigOpen]);

  /* ---------------------------------------------------------------- */
  /* Tema                                                              */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    // Escreve os tokens do tema nas variáveis CSS e manda a esfera reler as
    // cores. Um único caminho para os dois, na ordem certa.
    applyTheme(theme);
    sphereController.setTheme(theme);
    // Persiste no config para a janela do HUD (outro processo) acompanhar.
    const cfg = useConfigStore.getState().config;
    if (cfg.behavior.theme !== theme) {
      void useConfigStore.getState().patch((d) => ({
        ...d,
        behavior: { ...d.behavior, theme },
      }));
    }
  }, [theme]);

  // Quando a configuração muda (carga inicial ou outra janela), adota o tema
  // salvo. Guardado por igualdade para não brigar com o efeito acima.
  const cfgTheme = useConfigStore((s) => s.config.behavior.theme);
  useEffect(() => {
    if (cfgTheme && cfgTheme !== useSystemStore.getState().theme) {
      useSystemStore.getState().setTheme(cfgTheme);
    }
  }, [cfgTheme]);

  /* ---------------------------------------------------------------- */
  /* prefers-reduced-motion                                            */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(query.matches);
    const onChange = (e: MediaQueryListEvent): void => setReducedMotion(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [setReducedMotion]);

  /* ---------------------------------------------------------------- */
  /* "Lembrar-me": sem isso a sessão salva não é restaurada             */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const { remember } = useSystemStore.getState();
    const player = usePlayerStore.getState();
    if (player.loggedIn && !remember) player.logout();
    player.ensureDailyQuests();
    // Executa uma única vez, na hidratação.
  }, []);

  /* ---------------------------------------------------------------- */
  /* Áudio: o AudioContext só nasce após um gesto do usuário           */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const unlock = (): void => {
      audio.unlock();
      audio.setMuted(!useSystemStore.getState().soundEnabled);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    audio.setMuted(!soundEnabled);
  }, [soundEnabled]);

  useEffect(() => {
    speech.setEnabled(voiceEnabled);
  }, [voiceEnabled]);

  // Persona: aplica o gênero de voz configurado (feminina por padrão).
  const voiceGender = useConfigStore((s) => s.config.voice.voiceGender);
  const voiceName = useConfigStore((s) => s.config.voice.voiceName);
  const voiceRate = useConfigStore((s) => s.config.voice.voiceRate);
  const voicePitch = useConfigStore((s) => s.config.voice.voicePitch);
  useEffect(() => {
    speech.setGender(voiceGender);
    speech.setVoiceName(voiceName);
    speech.setTuning(voiceRate, voicePitch);
  }, [voiceGender, voiceName, voiceRate, voicePitch]);

  // Aparência da esfera (preset + ajustes) vinda da configuração.
  const sphereDesign = useConfigStore((s) => s.config.sphere);
  useEffect(() => {
    sphereController.setDesign(sphereDesign);
  }, [sphereDesign]);

  useEffect(() => () => audio.dispose(), []);

  /* ---------------------------------------------------------------- */
  /* Esfera reage à fala                                               */
  /* ---------------------------------------------------------------- */

  useEffect(
    () =>
      speech.onSpeakingChange((speaking) => {
        if (speaking) {
          sphereController.setState('speaking');
        } else if (sphereController.getState() === 'speaking') {
          sphereController.setState(useSystemStore.getState().micActive ? 'listening' : 'idle');
        }
      }),
    [],
  );

  /* ---------------------------------------------------------------- */
  /* Missão concluída → toast + som                                    */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!questFlash) return;
    audio.play('quest');
    pushToast('quest', 'Missão concluída', `${questFlash.title} · +${questFlash.xp} XP`);
    print(`MISSÃO CONCLUÍDA: ${questFlash.title} (+${questFlash.xp} XP)`, 'info');
    consumeQuestFlash();
  }, [questFlash, pushToast, print, consumeQuestFlash]);

  /* ---------------------------------------------------------------- */
  /* Fluxo de telas                                                    */
  /* ---------------------------------------------------------------- */

  // Decide entre login e dashboard, respeitando "entrar direto".
  const enterAfterChecks = useCallback(() => {
    const player = usePlayerStore.getState();
    const { behavior } = useConfigStore.getState().config;
    if (player.loggedIn) {
      setPhase('dashboard');
      return;
    }
    if (behavior.skipLogin) {
      player.login(useConfigStore.getState().config.profile.userName);
      setPhase('dashboard');
      return;
    }
    setPhase('login');
  }, [setPhase]);

  const handleBootComplete = useCallback(() => {
    // No app de desktop, confere os requisitos antes de entrar.
    if (desktop()) {
      setPhase('preflight');
      return;
    }
    enterAfterChecks();
  }, [setPhase, enterAfterChecks]);

  const handleAuthenticated = useCallback(() => {
    setPhase('dashboard');
  }, [setPhase]);

  // Mensagem de boas-vindas no terminal, uma vez por sessão de dashboard.
  useEffect(() => {
    if (phase !== 'dashboard') {
      greetedRef.current = false;
      return;
    }
    if (greetedRef.current) return;
    greetedRef.current = true;
    const name = usePlayerStore.getState().name;
    print(`NÚCLEO SINCRONIZADO. Sessão aberta para ${name}.`, 'info');
    print("Digite 'ajuda' para ver todos os comandos disponíveis.", 'system');
  }, [phase, print]);

  // Volta ao login se o store for limpo por fora (ex.: comando SAIR).
  useEffect(() => {
    if (phase === 'dashboard' && !loggedIn) setPhase('login');
  }, [phase, loggedIn, setPhase]);

  /* ---------------------------------------------------------------- */

  return (
    <div className="relative h-full w-full overflow-hidden bg-bg nx-vignette">
      <TitleBar />
      <ParticleCanvas />
      <HudOverlay />

      <AnimatePresence mode="wait">
        {phase === 'boot' ? (
          useConfigStore.getState().config.behavior.splash ? (
            <SplashScreen key="splash" onComplete={handleBootComplete} />
          ) : (
            <BootSequence key="boot" onComplete={handleBootComplete} />
          )
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {phase === 'preflight' ? (
          <PreflightScreen key="preflight" onComplete={enterAfterChecks} />
        ) : null}
      </AnimatePresence>

      {phase === 'login' ? <LoginScreen onAuthenticated={handleAuthenticated} /> : null}

      <AnimatePresence>{phase === 'dashboard' ? <Dashboard key="dash" /> : null}</AnimatePresence>

      <Toast />
      <LevelUpCinematic />
      {configOpen ? <ConfigPanel onClose={() => setConfigOpen(false)} /> : null}
      <CodePanel />
      <UpdateSplash />

      {/* Overlays de textura — desligados em prefers-reduced-motion */}
      {!reducedMotion ? (
        <>
          <div aria-hidden="true" className="nx-grain" />
          <div
            aria-hidden="true"
            className="nx-scanlines pointer-events-none fixed inset-0 z-[92]"
          />
        </>
      ) : null}
    </div>
  );
}
