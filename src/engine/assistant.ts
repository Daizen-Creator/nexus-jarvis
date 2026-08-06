import { desktop } from '../desktop/bridge';
import { useConfigStore } from '../store/useConfigStore';
import { useSystemStore } from '../store/useSystemStore';
import { sphereController } from '../hooks/useSphere';
import { bestMatch, canonical } from './matcher';
import { speech } from './SpeechEngine';

/* ------------------------------------------------------------------ */
/* Conversa                                                            */
/* ------------------------------------------------------------------ */

type Turn = { role: 'user' | 'assistant'; content: string };

/** Memória curta da conversa. Só do processo, não é persistida. */
const history: Turn[] = [];

export const clearConversation = (): void => {
  history.length = 0;
};

/**
 * Responde uma pergunta livre com o modelo local.
 *
 * É o que o NEXUS faz quando a frase não é nenhum comando conhecido — em vez
 * de "comando não reconhecido", ele simplesmente responde.
 */
export const ask = async (question: string): Promise<boolean> => {
  const bridge = desktop();
  const system = useSystemStore.getState();
  const { ai } = useConfigStore.getState().config;

  if (!bridge || !ai.enabled || !ai.conversational) return false;

  sphereController.setState('processing');
  system.print('PENSANDO...', 'info');

  const result = await bridge.aiAsk(question, [...history]);

  if (!result.ok) {
    sphereController.setState('idle');
    system.print(result.message, 'error');
    return false;
  }

  history.push({ role: 'user', content: question });
  history.push({ role: 'assistant', content: result.answer });
  // Mantém a memória curta: o modelo é pequeno e contexto longo o confunde.
  const max = Math.max(1, ai.historyTurns) * 2;
  if (history.length > max) history.splice(0, history.length - max);

  system.print(result.answer, 'system');
  if (system.voiceEnabled) speech.speak(result.answer);
  sphereController.setState('idle');
  return true;
};

/* ------------------------------------------------------------------ */
/* Ferramentas CLI                                                     */
/* ------------------------------------------------------------------ */

export interface ToolMatch {
  id: string;
  name: string;
  args: string;
}

/** Encontra uma ferramenta registrada dentro da frase e separa os argumentos. */
export const matchTool = (input: string): ToolMatch | null => {
  const { tools } = useConfigStore.getState().config;
  const enabled = tools.filter((t) => t.enabled && t.phrases.length > 0);
  if (enabled.length === 0) return null;

  const words = input.trim().split(/\s+/);
  const candidates = enabled.map((t) => ({ value: t, phrases: [...t.phrases, t.name] }));

  // Testa prefixos do MENOR para o maior: o nome da ferramenta vem no começo e
  // o resto são argumentos. Ir do maior para o menor fazia "nmap 10.0.0.1"
  // casar a frase inteira com "nmap" (contida) e engolir o alvo, deixando os
  // argumentos vazios. Exige casamento quase exato do prefixo, não "contido".
  for (let span = 1; span <= Math.min(4, words.length); span += 1) {
    const head = words.slice(0, span).join(' ');
    const match = bestMatch(head, candidates, 0.9);
    if (match && canonical(match.phrase) === canonical(head)) {
      return { id: match.value.id, name: match.value.name, args: words.slice(span).join(' ') };
    }
  }
  // Sem prefixo exato: última tentativa mais tolerante para o nome sozinho.
  const loose = bestMatch(input, candidates, 0.9);
  if (loose) return { id: loose.value.id, name: loose.value.name, args: '' };
  return null;
};

/** Roda a ferramenta despejando a saída ao vivo no terminal. */
export const runTool = async (tool: ToolMatch): Promise<void> => {
  const bridge = desktop();
  const system = useSystemStore.getState();

  if (!bridge) {
    system.print('FERRAMENTAS CLI EXIGEM O APP DE DESKTOP.', 'error');
    return;
  }

  system.print(`> ${tool.name} ${tool.args}`.trim(), 'info');
  sphereController.setState('processing');
  if (system.voiceEnabled) speech.speak(`Executando ${tool.name}, Senhor.`);

  const result = await bridge.runTool(tool.id, tool.args);
  sphereController.setState(result.ok ? 'idle' : 'alert');
  system.print(result.message, result.ok ? 'info' : 'error');

  if (!result.ok) {
    if (system.voiceEnabled) speech.speak(result.message);
  } else if (system.voiceEnabled) {
    speech.speak(`${tool.name} concluído, Senhor.`);
  }
  window.setTimeout(() => {
    if (sphereController.getState() === 'alert') sphereController.setState('idle');
  }, 1600);
};

/** Liga a saída ao vivo das ferramentas ao terminal. Chamado uma vez no App. */
export const bindToolOutput = (): (() => void) => {
  const bridge = desktop();
  if (!bridge) return () => undefined;

  let pending = '';
  return bridge.onToolOutput(({ text, stream }) => {
    pending += text;
    // Emite por linha completa: meia linha no terminal fica ilegível.
    let index = pending.indexOf('\n');
    while (index >= 0) {
      const line = pending.slice(0, index).replace(/\r$/, '');
      pending = pending.slice(index + 1);
      index = pending.indexOf('\n');
      if (line.trim().length > 0) {
        useSystemStore.getState().print(line, stream === 'err' ? 'error' : 'system');
      }
    }
    if (pending.length > 4000) pending = '';
  });
};
