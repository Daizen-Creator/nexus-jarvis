import { useSound } from '../hooks/useSound';
import { runCommand } from '../engine/commands';
import { useCodeStore } from '../store/useCodeStore';
import { useSystemStore } from '../store/useSystemStore';

interface QuickAction {
  label: string;
  icon: string;
  hint: string;
  run: () => void;
}

/**
 * Barra de ações rápidas — soluções que o NEXUS oferece com um clique, no
 * espírito de uma paleta de comandos: abrir, iniciar, limpar, status...
 *
 * Cada botão dispara o mesmo caminho de `runCommand` que o terminal e a voz
 * usam, então o comportamento é idêntico ao de falar ou digitar.
 */
const ACTIONS: QuickAction[] = [
  { label: 'Ajuda', icon: '?', hint: 'Lista os comandos', run: () => runCommand('ajuda') },
  { label: 'Status', icon: '◈', hint: 'Abre o status completo', run: () => runCommand('status') },
  { label: 'Missões', icon: '★', hint: 'Missões do dia', run: () => runCommand('quests') },
  { label: 'YouTube', icon: '▶', hint: 'Abrir o YouTube', run: () => runCommand('abrir youtube') },
  { label: 'Gmail', icon: '✉', hint: 'Abrir o e-mail', run: () => runCommand('abrir gmail') },
  { label: 'Música', icon: '♪', hint: 'YouTube Music', run: () => runCommand('musica') },
  {
    label: 'Programar',
    icon: '{ }',
    hint: 'Gerar código com a IA',
    run: () => useCodeStore.getState().setOpen(true),
  },
  { label: 'Tema', icon: '◐', hint: 'Alternar azul / âmbar', run: () => runCommand('tema') },
  { label: 'Limpar', icon: '⌫', hint: 'Limpa o terminal', run: () => runCommand('limpar') },
];

export function QuickActions(): JSX.Element {
  const sound = useSound();

  return (
    <div
      className="nx-scroll flex shrink-0 gap-2 overflow-x-auto pb-1"
      role="toolbar"
      aria-label="Ações rápidas"
    >
      {ACTIONS.map((action) => (
        <button
          key={action.label}
          type="button"
          title={action.hint}
          aria-label={action.hint}
          onMouseEnter={sound.hover}
          onClick={() => {
            sound.unlock();
            useSystemStore.getState().setModal(null);
            action.run();
          }}
          className="nx-clip-btn group flex shrink-0 items-center gap-2 border border-blue/30 bg-blue/5 px-3 py-2 transition-colors duration-200 hover:border-cyan/70 hover:bg-blue/15"
        >
          <span
            aria-hidden="true"
            className="font-display text-xs font-bold text-cyan/80 group-hover:text-cyan"
          >
            {action.icon}
          </span>
          <span className="font-display text-[0.6rem] font-bold uppercase tracking-[0.2em] text-ice/70 group-hover:text-ice">
            {action.label}
          </span>
        </button>
      ))}
    </div>
  );
}
