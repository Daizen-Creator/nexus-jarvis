import type { NexusAction, NexusConfig, SystemActionId } from '../src/types/desktop';
import { bestMatch, canonical, splitVerb } from '../src/engine/matcher';

/** Frases que disparam cada ação de sistema. */
const SYSTEM_PHRASES: Array<{ value: SystemActionId; phrases: string[] }> = [
  {
    value: 'volume-up',
    phrases: ['aumentar volume', 'aumentar o volume', 'subir volume', 'mais volume', 'volume mais alto'],
  },
  {
    value: 'volume-down',
    phrases: ['diminuir volume', 'abaixar volume', 'baixar volume', 'menos volume', 'volume mais baixo'],
  },
  { value: 'mute', phrases: ['mudo', 'silenciar', 'tirar o som', 'sem som', 'desligar o som'] },
  { value: 'play-pause', phrases: ['pausar', 'despausar', 'play', 'pause', 'continuar a musica'] },
  { value: 'next-track', phrases: ['proxima faixa', 'proxima musica', 'pular musica', 'proxima'] },
  // "voltar musica" ficava a 0,77 de "tocar musica" e sequestrava o comando de
  // abrir o YouTube Music. "voltar faixa" não colide com nada.
  { value: 'prev-track', phrases: ['faixa anterior', 'musica anterior', 'voltar faixa'] },
  { value: 'lock', phrases: ['bloquear a tela', 'bloquear tela', 'travar a tela', 'trancar a tela'] },
  { value: 'sleep', phrases: ['suspender', 'suspender o computador', 'hibernar', 'dormir'] },
  { value: 'shutdown', phrases: ['desligar o computador', 'desligar o pc', 'desligar a maquina'] },
  { value: 'restart', phrases: ['reiniciar o computador', 'reiniciar o pc', 'reiniciar a maquina'] },
];

const OPEN_VERBS = ['abrir', 'abre', 'abra', 'executar', 'executa', 'iniciar', 'inicia', 'rodar', 'open'];

/** Ações de sistema exigem mais certeza que abrir um site. */
const SYSTEM_THRESHOLD = 0.82;

const SYSTEM_REPLY: Record<SystemActionId, string> = {
  'volume-up': 'Aumentando o volume',
  'volume-down': 'Diminuindo o volume',
  mute: 'Som no mudo',
  'play-pause': 'Alternando a reprodução',
  'next-track': 'Próxima faixa',
  'prev-track': 'Faixa anterior',
  lock: 'Bloqueando a tela',
  sleep: 'Suspendendo o sistema',
  shutdown: 'Desligando o computador',
  restart: 'Reiniciando o computador',
};

export type Resolution =
  | { handled: true; action: NexusAction; reply: string }
  | { handled: false; text: string };

/**
 * Traduz uma frase falada numa ação executável pelo processo principal.
 *
 * O que não for "abrir algo" nem controle de sistema volta com `handled: false`
 * e segue para o renderer, que tem os comandos conversacionais (hora, status,
 * tema, level up...). Assim não há lógica de comando duplicada nos dois lados.
 */
export const resolve = (input: string, config: NexusConfig): Resolution => {
  const text = canonical(input);
  if (text.length === 0) return { handled: false, text: '' };

  const address = config.profile.address.trim() || 'Senhor';
  const withAddress = (message: string): string => `${message}, ${address}.`;

  /* 1. Comandos do usuário vêm primeiro — eles sobrepõem os embutidos. */
  const custom = bestMatch(
    text,
    config.customCommands
      .filter((c) => c.enabled && c.phrases.length > 0)
      .map((c) => ({ value: c, phrases: c.phrases })),
  );
  if (custom) {
    const reply = custom.value.reply.trim();
    return {
      handled: true,
      action: custom.value.action,
      reply: reply.length > 0 ? reply : withAddress(custom.value.description || 'Executando'),
    };
  }

  /* 2. Controle de sistema.
   * Limiar mais alto que o padrão de propósito: bloquear a tela ou desligar a
   * máquina por engano custa muito mais caro do que não entender um comando. */
  const system = bestMatch(text, SYSTEM_PHRASES, SYSTEM_THRESHOLD);
  if (system) {
    return {
      handled: true,
      action: { kind: 'system', target: system.value },
      reply: withAddress(SYSTEM_REPLY[system.value]),
    };
  }

  /* 3. "abrir <alvo>" — site, programa e, por último, busca. */
  const verb = splitVerb(text, OPEN_VERBS);
  if (verb && verb.rest.length > 0) {
    const target = verb.rest;

    const site = bestMatch(target, config.sites.map((s) => ({ value: s, phrases: [...s.phrases, s.name] })));
    if (site) {
      return {
        handled: true,
        action: { kind: 'open-url', target: site.value.url },
        reply: withAddress(`Abrindo ${site.value.name}`),
      };
    }

    const appMatch = bestMatch(target, config.apps.map((a) => ({ value: a, phrases: [...a.phrases, a.name] })));
    if (appMatch) {
      return {
        handled: true,
        action: { kind: 'open-app', target: appMatch.value.path, args: appMatch.value.args },
        reply: withAddress(`Abrindo ${appMatch.value.name}`),
      };
    }

    return {
      handled: true,
      action: { kind: 'search', target },
      reply: withAddress(`Destino desconhecido. Buscando "${target}" no Google`),
    };
  }

  /* 4. Só o nome do site ou do programa, sem verbo. */
  const bareSite = bestMatch(text, config.sites.map((s) => ({ value: s, phrases: [...s.phrases, s.name] })), 0.86);
  if (bareSite) {
    return {
      handled: true,
      action: { kind: 'open-url', target: bareSite.value.url },
      reply: withAddress(`Abrindo ${bareSite.value.name}`),
    };
  }

  const bareApp = bestMatch(text, config.apps.map((a) => ({ value: a, phrases: [...a.phrases, a.name] })), 0.86);
  if (bareApp) {
    return {
      handled: true,
      action: { kind: 'open-app', target: bareApp.value.path, args: bareApp.value.args },
      reply: withAddress(`Abrindo ${bareApp.value.name}`),
    };
  }

  /* 5. O renderer resolve o resto. */
  return { handled: false, text };
};
