import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SystemWindow } from './SystemWindow';
import { Terminal } from './Terminal';
import { AnimatedNumber } from './AnimatedNumber';
import { QuickActions } from './QuickActions';
import { OsHud } from './OsHud';
import { StatusPanel, RANK_STYLE } from './panels/StatusPanel';
import { AttributesPanel } from './panels/AttributesPanel';
import { QuestPanel } from './panels/QuestPanel';
import { SystemPanel } from './panels/SystemPanel';
import { useSound } from '../hooks/useSound';
import { voiceHandle } from '../hooks/useSpeechRecognition';
import { isDesktop } from '../desktop/bridge';
import { themeById } from '../engine/themes';
import { COMMANDS, runCommand } from '../engine/commands';
import { audio } from '../engine/AudioEngine';
import { speech } from '../engine/SpeechEngine';
import {
  ATTRIBUTE_META,
  usePlayerStore,
  xpForLevel,
} from '../store/usePlayerStore';
import { useSystemStore } from '../store/useSystemStore';

/* ------------------------------------------------------------------ */
/* Nível ao lado do logo                                               */
/* ------------------------------------------------------------------ */

/**
 * Indicador compacto de progressão, colado no logo: rank, nível e uma barra
 * fina de XP. Fica visível em qualquer aba, inclusive na do terminal.
 */
function LevelBadge(): JSX.Element {
  const level = usePlayerStore((s) => s.level);
  const rank = usePlayerStore((s) => s.rank);
  const xp = usePlayerStore((s) => s.xp);
  const points = usePlayerStore((s) => s.points);

  const needed = xpForLevel(level);
  const pct = Math.min(100, (xp / needed) * 100);
  const style = RANK_STYLE[rank];

  return (
    <div
      className="nx-clip-sm flex shrink-0 items-center gap-2 border border-blue/25 bg-blue/5 px-2 py-1"
      aria-label={`Rank ${rank}, nível ${level}, ${pct.toFixed(0)} por cento de experiência`}
    >
      <span
        className={`grid h-5 w-5 shrink-0 place-items-center border font-display text-[0.62rem] font-black ${style.text} ${style.border} ${style.bg} ${style.extra}`}
      >
        {rank}
      </span>

      <span className="flex flex-col leading-none">
        <span className="flex items-baseline gap-1">
          <span className="nx-label !text-[0.5rem]">NV</span>
          <AnimatedNumber
            value={level}
            className="font-display text-sm font-black text-cyan nx-glow"
          />
          {points > 0 ? (
            <span className="ml-0.5 font-display text-[0.55rem] font-bold text-gold">
              +{points}
            </span>
          ) : null}
        </span>
        <span className="nx-bar mt-0.5 h-1 w-16 sm:w-24">
          <motion.span
            className="nx-bar__fill bg-gradient-to-r from-blue to-cyan"
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
          />
        </span>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Barra superior                                                      */
/* ------------------------------------------------------------------ */

function TopBar(): JSX.Element {
  const sound = useSound();
  const theme = useSystemStore((s) => s.theme);
  const toggleTheme = useSystemStore((s) => s.toggleTheme);
  const soundEnabled = useSystemStore((s) => s.soundEnabled);
  const toggleSound = useSystemStore((s) => s.toggleSound);
  const micActive = useSystemStore((s) => s.micActive);
  const micSupported = useSystemStore((s) => s.micSupported);
  const name = usePlayerStore((s) => s.name);

  const handleTheme = useCallback(() => {
    audio.unlock();
    // Só troca no store; o App aplica os tokens e atualiza a esfera.
    toggleTheme();
    usePlayerStore.getState().trackQuest('theme');
    sound.play('hover');
  }, [toggleTheme, sound]);

  const handleSound = useCallback(() => {
    audio.unlock();
    const enabled = toggleSound();
    audio.setMuted(!enabled);
    if (enabled) audio.play('confirm');
  }, [toggleSound]);

  const handleLogout = useCallback(() => {
    audio.unlock();
    runCommand('sair', 'text');
  }, []);

  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-blue/20 bg-bg/55 px-3 py-2 backdrop-blur-md sm:px-5">
      <h1 className="font-display text-base font-black tracking-[0.42em] text-cyan nx-chroma sm:text-lg">
        NEXUS
      </h1>

      <LevelBadge />

      <span className="hidden font-mono text-[0.58rem] tracking-[0.24em] text-ice/25 lg:inline">
        // {name.toUpperCase()}
      </span>

      {/* Indicador de microfone */}
      <span className="ml-auto flex items-center gap-2" aria-live="polite">
        <span
          aria-hidden="true"
          className={`h-2 w-2 rounded-full transition-colors duration-300 ${
            micActive ? 'animate-pulse bg-cyan' : micSupported ? 'bg-ice/20' : 'bg-danger/50'
          }`}
          style={micActive ? { boxShadow: '0 0 10px rgb(var(--c-cyan))' } : undefined}
        />
        <span className="hidden font-mono text-[0.56rem] tracking-[0.22em] text-ice/35 sm:inline">
          {micActive ? 'OUVINDO' : micSupported ? 'MIC PRONTO' : 'MIC N/D'}
        </span>
      </span>

      <button
        type="button"
        onClick={handleTheme}
        onMouseEnter={sound.hover}
        aria-label={`Próximo tema (atual: ${themeById(theme).label})`}
        className="grid h-9 w-9 place-items-center border border-blue/40 text-cyan transition-colors duration-200 hover:bg-blue/15"
      >
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgb(var(--c-cyan)), rgb(var(--c-blue)))',
            boxShadow: '0 0 10px rgb(var(--c-blue))',
          }}
        />
      </button>

      <button
        type="button"
        onClick={handleSound}
        onMouseEnter={sound.hover}
        aria-label={soundEnabled ? 'Desativar som' : 'Ativar som'}
        aria-pressed={soundEnabled}
        className={`grid h-9 w-9 place-items-center border transition-colors duration-200 ${
          soundEnabled
            ? 'border-blue/40 text-cyan hover:bg-blue/15'
            : 'border-ice/15 text-ice/30 hover:border-blue/40'
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
          <path
            d="M4 9v6h4l5 4V5L8 9H4z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          {soundEnabled ? (
            <path
              d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          ) : (
            <path d="M17 9.5l4 5m0-5l-4 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          )}
        </svg>
      </button>

      <button
        type="button"
        onClick={() => {
          audio.unlock();
          useSystemStore.getState().setConfigOpen(true);
        }}
        onMouseEnter={sound.hover}
        aria-label="Abrir configuração"
        className="grid h-9 w-9 place-items-center border border-blue/40 text-cyan transition-colors duration-200 hover:bg-blue/15"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6L18 18M18 6l-1.4 1.4M7.4 16.6L6 18"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </button>

      <button
        type="button"
        onClick={handleLogout}
        onMouseEnter={sound.hover}
        className="nx-btn nx-btn--ghost nx-clip-btn !min-h-[2.25rem] !px-3 !py-1.5 !text-[0.6rem]"
      >
        SAIR
      </button>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Modais                                                              */
/* ------------------------------------------------------------------ */

function HelpModalBody(): JSX.Element {
  return (
    <div className="nx-scroll max-h-[55vh] overflow-y-auto pr-1">
      <ul className="space-y-2.5">
        {COMMANDS.map((command) => (
          <li key={command.id} className="border-l border-blue/30 pl-3">
            <p className="font-display text-[0.68rem] font-bold uppercase tracking-[0.2em] text-cyan">
              {command.usage ?? command.aliases[0]}
            </p>
            <p className="font-mono text-[0.7rem] leading-snug text-ice/65">
              {command.description}
            </p>
            <p className="mt-0.5 font-mono text-[0.6rem] text-ice/25">
              sinônimos: {command.aliases.join(' · ')}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-4 border-t border-blue/20 pt-3 font-mono text-[0.62rem] text-ice/35">
        Cada comando executado concede +15 XP. Os comandos funcionam por texto e por voz.
      </p>
    </div>
  );
}

function StatusModalBody(): JSX.Element {
  const player = usePlayerStore();
  const needed = xpForLevel(player.level);
  const style = RANK_STYLE[player.rank];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <span
          className={`grid h-14 w-14 shrink-0 place-items-center border font-display text-2xl font-black ${style.text} ${style.border} ${style.bg} ${style.extra}`}
        >
          {player.rank}
        </span>
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-bold tracking-[0.1em] text-ice nx-glow">
            {player.name}
          </p>
          <p className="font-mono text-[0.68rem] text-ice/50">
            Nível {player.level} · {player.xp}/{needed} XP · {player.totalCommands} comandos
          </p>
        </div>
      </div>

      <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 border-t border-blue/20 pt-3 font-mono text-xs sm:grid-cols-2">
        {ATTRIBUTE_META.map((meta) => (
          <li key={meta.key} className="flex items-center justify-between">
            <span className="text-ice/55">
              <span aria-hidden="true" className="mr-2 text-cyan">
                {meta.icon}
              </span>
              {meta.label}
            </span>
            <span className="font-display font-bold text-ice">{player.attributes[meta.key]}</span>
          </li>
        ))}
      </ul>

      <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 border-t border-blue/20 pt-3 font-mono text-xs sm:grid-cols-2">
        <li className="flex justify-between">
          <span className="text-ice/55">Pontos livres</span>
          <span className="text-gold">{player.points}</span>
        </li>
        <li className="flex justify-between">
          <span className="text-ice/55">HP</span>
          <span className="text-ice">{Math.round(player.hp)}</span>
        </li>
        <li className="flex justify-between">
          <span className="text-ice/55">Mana</span>
          <span className="text-ice">{Math.round(player.mana)}</span>
        </li>
        <li className="flex justify-between">
          <span className="text-ice/55">Voz</span>
          <span className="truncate text-ice/70">{speech.getVoiceName()}</span>
        </li>
      </ul>
    </div>
  );
}

function QuestModalBody(): JSX.Element {
  const quests = usePlayerStore((s) => s.quests);
  return (
    <ul className="space-y-3">
      {quests.map((quest) => (
        <li key={quest.id} className="border-l border-blue/30 pl-3">
          <div className="flex items-baseline justify-between gap-3">
            <p
              className={`font-display text-[0.7rem] font-bold uppercase tracking-[0.18em] ${
                quest.completed ? 'text-gold line-through' : 'text-ice/85'
              }`}
            >
              {quest.title}
            </p>
            <span className={`font-mono text-[0.66rem] ${quest.completed ? 'text-gold' : 'text-cyan/70'}`}>
              +{quest.xp} XP
            </span>
          </div>
          <p className="font-mono text-[0.68rem] text-ice/50">{quest.description}</p>
          <p className="mt-0.5 font-mono text-[0.62rem] text-ice/30">
            progresso {Math.min(quest.progress, quest.target)}/{quest.target}
            {quest.completed ? ' · CONCLUÍDA' : ''}
          </p>
        </li>
      ))}
    </ul>
  );
}

function ModalLayer(): JSX.Element {
  const modal = useSystemStore((s) => s.modal);
  const setModal = useSystemStore((s) => s.setModal);

  const close = useCallback(() => setModal(null), [setModal]);

  const title =
    modal === 'help' ? 'Comandos' : modal === 'status' ? 'Status' : modal === 'quests' ? 'Missões' : '';

  return (
    <AnimatePresence>
      {modal ? (
        <motion.div
          key={modal}
          className="fixed inset-0 z-[55] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.24 }}
          onClick={close}
        >
          <motion.div
            className="w-full max-w-lg"
            initial={{ opacity: 0, scale: 0.92, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.34, ease: [0.2, 0.8, 0.2, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <SystemWindow title={title} badge="!" meta="SYS-WIN" onClose={close}>
              {modal === 'help' ? <HelpModalBody /> : null}
              {modal === 'status' ? <StatusModalBody /> : null}
              {modal === 'quests' ? <QuestModalBody /> : null}
            </SystemWindow>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

const panelVariants = {
  hidden: { opacity: 0, y: 26, filter: 'blur(8px)' },
  visible: { opacity: 1, y: 0, filter: 'blur(0px)' },
};

const TABS = [
  { id: 'level', label: 'Level' },
  { id: 'os', label: 'JARVIS OS' },
  { id: 'terminal', label: 'Terminal' },
] as const;

type DashboardTab = (typeof TABS)[number]['id'];

export function Dashboard(): JSX.Element {
  const cinematicActive = useSystemStore((s) => s.cinematicActive);
  const sound = useSound();
  const [tab, setTab] = useState<DashboardTab>('level');

  // Sair do dashboard fecha o microfone — nada continua ouvindo em segundo plano.
  useEffect(() => () => voiceHandle.stop(), []);

  return (
    <motion.div
      className="fixed inset-0 z-30 flex flex-col"
      // No app de desktop, deixa passar a barra de título sem moldura (32px).
      style={{ paddingTop: isDesktop() ? '2rem' : undefined }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, filter: 'blur(10px)' }}
      transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <TopBar />

      {/* Abas: progressão de um lado, terminal do outro */}
      <nav
        className="flex shrink-0 gap-1 border-b border-blue/15 bg-bg/40 px-3 py-1.5 backdrop-blur-md sm:px-5"
        aria-label="Seções"
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            onMouseEnter={sound.hover}
            aria-current={tab === item.id ? 'page' : undefined}
            className={`nx-clip-btn min-h-[2.25rem] border px-4 py-1 font-display text-[0.62rem] font-bold uppercase tracking-[0.28em] transition-colors duration-200 ${
              tab === item.id
                ? 'border-cyan/70 bg-blue/20 text-cyan'
                : 'border-transparent text-ice/40 hover:border-blue/30 hover:text-ice/75'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <main
        className={`nx-scroll flex min-h-0 flex-1 flex-col overflow-y-auto p-3 transition-[filter] duration-300 sm:p-5 ${
          cinematicActive ? 'blur-sm' : ''
        }`}
      >
        {/* Painéis de progressão — montados só na aba Level. */}
        {tab === 'level' ? (
          <motion.div
            key="level"
            className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
            initial="hidden"
            animate="visible"
            transition={{ staggerChildren: 0.08, delayChildren: 0.06 }}
          >
            <motion.div variants={panelVariants} transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}>
              <StatusPanel />
            </motion.div>

            <motion.div variants={panelVariants} transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}>
              <AttributesPanel />
            </motion.div>

            <motion.div variants={panelVariants} transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}>
              <QuestPanel />
            </motion.div>

            <motion.div
              variants={panelVariants}
              transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
              className="md:col-span-2 xl:col-span-3"
            >
              <SystemPanel />
            </motion.div>
          </motion.div>
        ) : null}

        {tab === 'os' ? (
          <motion.div
            key="os"
            className="flex min-h-0 flex-1 flex-col"
            initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <OsHud />
          </motion.div>
        ) : null}

        {/*
          Terminal fica SEMPRE montado (só escondido na aba Level). Se ele
          desmontasse, o reconhecimento de voz — que vive nele — pararia ao
          trocar de aba, e o microfone deixaria de escutar em segundo plano.
        */}
        <div
          className={
            tab === 'terminal'
              ? 'mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-2'
              : 'hidden'
          }
        >
          <QuickActions />
          <div className="flex min-h-0 flex-1 flex-col">
            <Terminal />
          </div>
        </div>
      </main>

      <ModalLayer />
    </motion.div>
  );
}
