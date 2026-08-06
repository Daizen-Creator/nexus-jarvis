import type { Command, CommandContext, TerminalKind } from '../types';
import type { SystemReportKind } from '../types/desktop';
import { usePlayerStore, XP_PER_COMMAND } from '../store/usePlayerStore';
import { useSystemStore } from '../store/useSystemStore';
import { useConfigStore } from '../store/useConfigStore';
import { sphereController } from '../hooks/useSphere';
import { voiceHandle } from '../hooks/useSpeechRecognition';
import { useCodeStore } from '../store/useCodeStore';
import { desktop } from '../desktop/bridge';
import { bestMatch } from './matcher';
import { CODE_VERBS, generate, parseCodeRequest } from './codegen';
import { ask, matchTool, runTool } from './assistant';
import { THEMES, themeById } from './themes';
import { useNotesStore } from '../store/useNotesStore';
import {
  copyToClipboard,
  fromBase64,
  generatePassword,
  numberForSpeech,
  safeCalc,
  sha256Hex,
  toBase64,
} from './localtools';
import { audio } from './AudioEngine';
import { speech } from './SpeechEngine';

/* ------------------------------------------------------------------ */
/* Normalização                                                        */
/* ------------------------------------------------------------------ */

/** Marcas diacríticas combinantes, escritas em escape para evitar surpresas. */
const DIACRITICS = /[̀-ͯ]/g;

/** Remove acentos, baixa a caixa e colapsa espaços — parser tolerante. */
export const normalize = (input: string): string =>
  input
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(/[?!.,;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/* ------------------------------------------------------------------ */
/* Atalhos de site                                                     */
/* ------------------------------------------------------------------ */

// A lista de sites vive na configuração (`useConfigStore`), editável no painel
// e compartilhada com o resolvedor de voz do processo principal.

const openTab = (url: string): boolean => {
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  return win !== null;
};

/* ------------------------------------------------------------------ */
/* Registry                                                            */
/* ------------------------------------------------------------------ */

/**
 * Cada comando é um objeto autocontido. Adicionar um comando novo ao NEXUS é
 * literalmente adicionar mais um item neste array.
 */
export const COMMANDS: Command[] = [
  {
    id: 'ajuda',
    aliases: ['ajuda', 'help', 'comandos', 'menu', 'me ajuda'],
    description: 'Lista todos os comandos disponíveis',
    run: (ctx) => {
      useSystemStore.getState().setModal('help');
      audio.play('notify');
      ctx.respond('Exibindo a lista de comandos, Senhor.');
    },
  },
  {
    id: 'status',
    aliases: ['status', 'perfil', 'meu status', 'ficha'],
    description: 'Abre a janela de status completa do Jogador',
    run: (ctx) => {
      useSystemStore.getState().setModal('status');
      audio.play('notify');
      const p = usePlayerStore.getState();
      ctx.respond(
        `Status carregado. Nível ${p.level}, rank ${p.rank}, ${p.points} pontos disponíveis.`,
      );
    },
  },
  {
    id: 'abrir',
    aliases: ['abrir', 'abre', 'open', 'acessar'],
    description: 'Abre um site em nova aba',
    usage: 'abrir [google | youtube | github | gmail | whatsapp | ...]',
    run: (ctx) => {
      const target = ctx.argString.trim();
      if (target.length === 0) {
        ctx.respond('Qual destino, Senhor? Exemplo: abrir youtube.');
        return;
      }

      // Mesma lista de sites e mesmo casamento fuzzy que o processo principal
      // usa na voz — assim "abrir o youtube" resolve igual nos dois caminhos.
      const { sites, apps } = useConfigStore.getState().config;

      const site = bestMatch(
        target,
        sites.map((s) => ({ value: s, phrases: [...s.phrases, s.name] })),
      );
      if (site) {
        const ok = openTab(site.value.url);
        if (ok) ctx.respond(`Abrindo ${site.value.name}, Senhor.`);
        else ctx.print(`POPUP BLOQUEADO — permita pop-ups para abrir ${site.value.name}.`, 'error');
        return;
      }

      // Programas só existem no app de desktop.
      const bridge = desktop();
      if (bridge) {
        const appMatch = bestMatch(
          target,
          apps.map((a) => ({ value: a, phrases: [...a.phrases, a.name] })),
        );
        if (appMatch) {
          void bridge
            .runAction({ kind: 'open-app', target: appMatch.value.path, args: appMatch.value.args })
            .then((result) => {
              if (result.ok) ctx.respond(`Abrindo ${appMatch.value.name}, Senhor.`);
              else ctx.print(`FALHA: ${result.message}`, 'error');
            });
          return;
        }
      }

      const ok = openTab(`https://www.google.com/search?q=${encodeURIComponent(target)}`);
      if (ok) ctx.respond(`Destino desconhecido. Buscando "${target}" no Google.`);
      else ctx.print('POPUP BLOQUEADO — permita pop-ups para abrir a busca.', 'error');
    },
  },
  {
    id: 'musica',
    aliases: ['musica', 'tocar musica', 'toca musica', 'som ambiente', 'play'],
    description: 'Abre o YouTube Music e ativa o tema ambiente sintetizado',
    run: (ctx) => {
      audio.unlock();
      const on = audio.toggleDrone();
      openTab('https://music.youtube.com');
      ctx.respond(
        on
          ? 'YouTube Music aberto. Tema ambiente do reator ativado.'
          : 'YouTube Music aberto. Tema ambiente desativado.',
      );
    },
  },
  {
    id: 'tocar',
    aliases: ['tocar', 'toque', 'poe a musica', 'coloca musica', 'colocar musica', 'ouvir', 'toca'],
    description: 'Toca uma música no YouTube pelo nome',
    usage: 'tocar [nome da música]',
    run: (ctx) => {
      const nome = ctx.argString.trim();
      if (nome.length === 0) {
        openTab('https://music.youtube.com');
        ctx.respond('Abrindo o YouTube Music, Senhor. Qual música?');
        return;
      }
      // Busca no YouTube pelo nome — o primeiro resultado é a faixa pedida.
      openTab(`https://www.youtube.com/results?search_query=${encodeURIComponent(nome)}`);
      ctx.respond(`Procurando "${nome}" no YouTube, Senhor.`);
    },
  },
  {
    id: 'roblox',
    aliases: ['roblox', 'jogo do roblox', 'abrir roblox', 'jogar roblox', 'jogo roblox', 'abre o roblox'],
    description: 'Abre um jogo do Roblox pelo nome',
    usage: 'roblox [nome do jogo]',
    run: (ctx) => {
      const nome = ctx.argString.trim();
      if (nome.length === 0) {
        openTab('https://www.roblox.com/games');
        ctx.respond('Abrindo o Roblox, Senhor. Qual jogo?');
        return;
      }
      openTab(`https://www.roblox.com/games/?Keyword=${encodeURIComponent(nome)}`);
      ctx.respond(`Procurando o jogo "${nome}" no Roblox, Senhor.`);
    },
  },
  {
    id: 'mapa',
    aliases: ['mapa', 'mapas', 'mostrar no mapa', 'como chegar', 'onde fica', 'localizar'],
    description: 'Abre o Google Maps num local',
    usage: 'mapa [local]',
    run: (ctx) => {
      const local = ctx.argString.trim();
      if (local.length === 0) {
        openTab('https://maps.google.com');
        ctx.respond('Abrindo o mapa, Senhor. Para onde?');
        return;
      }
      openTab(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(local)}`);
      ctx.respond(`Mostrando "${local}" no mapa, Senhor.`);
    },
  },
  {
    id: 'levelup',
    aliases: ['level up', 'levelup', 'subir de nivel', 'evoluir', 'upar'],
    description: 'Força a cinemática de subida de nível',
    run: (ctx) => {
      ctx.print('FORÇANDO SINCRONIA DE NÍVEL...', 'info');
      usePlayerStore.getState().forceLevelUp();
    },
  },
  {
    id: 'voz',
    aliases: ['ativar voz', 'desativar voz', 'voz', 'microfone', 'mic'],
    description: 'Liga ou desliga o microfone e a síntese de voz',
    usage: 'ativar voz / desativar voz',
    run: (ctx) => {
      const system = useSystemStore.getState();
      const wantsOff = /desativar|desliga|parar|off/.test(ctx.matched + ' ' + normalize(ctx.raw));
      const wantsOn = /ativar|liga|on/.test(ctx.matched + ' ' + normalize(ctx.raw));
      const enable = wantsOn ? true : wantsOff ? false : !system.voiceEnabled;

      system.setVoiceEnabled(enable);
      speech.setEnabled(enable);

      if (enable) {
        if (voiceHandle.supported) {
          voiceHandle.start();
          usePlayerStore.getState().trackQuest('voice');
          ctx.respond('Canal de voz aberto. Estou ouvindo, Senhor.');
        } else {
          ctx.print('RECONHECIMENTO DE VOZ INDISPONÍVEL NESTE NAVEGADOR.', 'error');
          ctx.respond('Síntese de voz ativada, mas o microfone não é suportado aqui.');
        }
      } else {
        voiceHandle.stop();
        useSystemStore.getState().setMicActive(false);
        speech.cancel();
        ctx.print('CANAL DE VOZ ENCERRADO.', 'info');
      }
    },
  },
  {
    id: 'tema',
    aliases: ['tema', 'mudar tema', 'trocar tema', 'proximo tema', 'cor', 'theme'],
    description: 'Passa para o próximo tema de cor (são dezenas)',
    usage: 'tema  /  tema [nome]',
    run: (ctx) => {
      const arg = ctx.argString.trim();
      let theme: string;
      if (arg.length > 0) {
        // "tema esmeralda" / "tema matrix": escolhe pelo nome ou id.
        const norm = arg.toLowerCase();
        const found = THEMES.find(
          (th) => th.id === norm || th.label.toLowerCase().includes(norm),
        );
        theme = found ? found.id : useSystemStore.getState().toggleTheme();
        if (found) useSystemStore.getState().setTheme(found.id);
      } else {
        theme = useSystemStore.getState().toggleTheme();
      }
      usePlayerStore.getState().trackQuest('theme');
      ctx.respond(`Espectro recalibrado para ${themeById(theme).label}.`);
    },
  },
  {
    id: 'quests',
    aliases: ['quests', 'missoes', 'missao', 'tarefas', 'diarias'],
    description: 'Mostra as missões diárias e o progresso',
    run: (ctx) => {
      const player = usePlayerStore.getState();
      player.ensureDailyQuests();
      useSystemStore.getState().setModal('quests');
      audio.play('notify');
      const pending = player.quests.filter((q) => !q.completed).length;
      ctx.respond(
        pending === 0
          ? 'Todas as missões do dia foram concluídas, Senhor.'
          : `Você tem ${pending} ${pending === 1 ? 'missão pendente' : 'missões pendentes'}.`,
      );
    },
  },
  {
    id: 'programar',
    aliases: CODE_VERBS,
    description: 'Gera código com a IA local (Python, Java, JS, Go, SQL...)',
    usage: 'programar em python uma calculadora',
    run: (ctx) => {
      const parsed = parseCodeRequest(ctx.argString);
      if (!parsed) {
        ctx.respond(
          'O que devo programar, Senhor? Exemplo: programar em python um jogo da velha.',
        );
        useCodeStore.getState().setOpen(true);
        return;
      }
      void generate(parsed);
    },
  },
  {
    id: 'pesquisar',
    aliases: ['pesquisar', 'pesquise', 'buscar', 'busca', 'procurar', 'google'],
    description: 'Pesquisa um termo no Google',
    usage: 'pesquisar [termo]',
    run: (ctx) => {
      const q = ctx.argString.trim();
      if (!q) {
        ctx.respond('O que devo pesquisar, Senhor?');
        return;
      }
      openTab(`https://www.google.com/search?q=${encodeURIComponent(q)}`);
      ctx.respond(`Pesquisando "${q}", Senhor.`);
    },
  },
  {
    id: 'youtube',
    aliases: ['pesquisar no youtube', 'buscar no youtube', 'youtube', 'video de', 'procurar video'],
    description: 'Pesquisa vídeos no YouTube',
    usage: 'youtube [termo]',
    run: (ctx) => {
      const q = ctx.argString.trim();
      if (!q) {
        openTab('https://www.youtube.com');
        ctx.respond('Abrindo o YouTube, Senhor.');
        return;
      }
      openTab(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`);
      ctx.respond(`Procurando "${q}" no YouTube, Senhor.`);
    },
  },
  {
    id: 'wikipedia',
    // Aliases explícitos: "quem foi X" / "o que é X" ficam para a conversa.
    aliases: ['wikipedia', 'wikipédia', 'verbete', 'buscar na wikipedia'],
    description: 'Consulta um verbete na Wikipédia',
    usage: 'wikipedia [termo]',
    run: (ctx) => {
      const q = ctx.argString.trim();
      if (!q) {
        ctx.respond('Sobre o que, Senhor?');
        return;
      }
      openTab(`https://pt.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(q)}`);
      ctx.respond(`Consultando "${q}" na Wikipédia, Senhor.`);
    },
  },
  {
    id: 'traduzir',
    aliases: ['traduzir', 'traduza', 'translate', 'tradução'],
    description: 'Abre o Google Tradutor com o texto',
    usage: 'traduzir [texto]',
    run: (ctx) => {
      const q = ctx.argString.trim();
      if (!q) {
        openTab('https://translate.google.com');
        ctx.respond('Abrindo o tradutor, Senhor.');
        return;
      }
      openTab(`https://translate.google.com/?sl=auto&tl=en&text=${encodeURIComponent(q)}&op=translate`);
      ctx.respond(`Traduzindo "${q}", Senhor.`);
    },
  },
  {
    id: 'noticias',
    aliases: ['noticias', 'notícias', 'news', 'jornal'],
    description: 'Abre as notícias do dia',
    run: (ctx) => {
      openTab('https://news.google.com/?hl=pt-BR');
      ctx.respond('Abrindo as notícias, Senhor.');
    },
  },
  {
    id: 'clima',
    aliases: ['clima', 'tempo', 'previsao do tempo', 'previsão', 'previsao'],
    description: 'Mostra a previsão do tempo',
    usage: 'clima [cidade]',
    run: (ctx) => {
      const cidade = ctx.argString.trim();
      const q = cidade.length > 0 ? `previsão do tempo ${cidade}` : 'previsão do tempo agora';
      openTab(`https://www.google.com/search?q=${encodeURIComponent(q)}`);
      ctx.respond(
        cidade.length > 0
          ? `Buscando o clima em ${cidade}, Senhor.`
          : 'Buscando a previsão do tempo, Senhor.',
      );
    },
  },
  {
    id: 'calcular',
    // "quanto é X" fica de fora: o modo conversa já resolve contas naturais.
    aliases: ['calcular', 'calcule', 'calculadora', 'faça a conta', 'faca a conta'],
    description: 'Faz uma conta e fala o resultado',
    usage: 'calcular 15 * 240',
    run: (ctx) => {
      const result = safeCalc(ctx.argString);
      if (result === null) {
        ctx.respond('Não entendi a conta, Senhor. Exemplo: calcular 15 vezes 240.');
        return;
      }
      ctx.respond(`O resultado é ${numberForSpeech(result)}, Senhor.`);
    },
  },
  {
    id: 'nota',
    aliases: ['nota', 'anotar', 'anota', 'anote', 'lembrete', 'lembrar'],
    description: 'Salva uma anotação rápida',
    usage: 'nota [texto]',
    run: (ctx) => {
      const text = ctx.argString.trim();
      if (!text) {
        ctx.respond('O que devo anotar, Senhor?');
        return;
      }
      useNotesStore.getState().add(text);
      audio.play('confirm');
      ctx.respond(`Anotado, Senhor: ${text}`);
    },
  },
  {
    id: 'notas',
    aliases: ['notas', 'minhas notas', 'ver notas', 'listar notas'],
    description: 'Lista as anotações salvas',
    run: (ctx) => {
      const { notes } = useNotesStore.getState();
      if (notes.length === 0) {
        ctx.respond('Você não tem anotações, Senhor.');
        return;
      }
      ctx.print('— ANOTAÇÕES —', 'info');
      notes.forEach((n, i) => ctx.print(`${i + 1}. ${n.text}`, 'system'));
      ctx.respond(`Você tem ${notes.length} ${notes.length === 1 ? 'anotação' : 'anotações'}, Senhor.`);
    },
  },
  {
    id: 'senha',
    aliases: ['senha', 'gerar senha', 'gere uma senha', 'nova senha', 'password'],
    description: 'Gera uma senha forte e copia',
    usage: 'senha [tamanho]',
    run: (ctx) => {
      const size = Number.parseInt(ctx.argString.trim(), 10);
      const password = generatePassword(Number.isFinite(size) ? size : 16);
      ctx.print(`SENHA: ${password}`, 'info');
      void copyToClipboard(password).then((ok) => {
        if (ok) ctx.print('(copiada para a área de transferência)', 'system');
      });
      ctx.respond('Senha forte gerada e copiada, Senhor.');
    },
  },
  {
    id: 'hash',
    aliases: ['hash', 'sha256', 'resumo', 'gerar hash'],
    description: 'Calcula o SHA-256 de um texto',
    usage: 'hash [texto]',
    run: (ctx) => {
      const text = ctx.argString;
      if (!text.trim()) {
        ctx.respond('Qual texto, Senhor?');
        return;
      }
      void sha256Hex(text).then((digest) => {
        ctx.print(`SHA-256: ${digest}`, 'info');
        void copyToClipboard(digest);
      });
      ctx.respond('Hash calculado e copiado, Senhor.');
    },
  },
  {
    id: 'base64',
    aliases: ['base64', 'codificar', 'decodificar', 'encode', 'decode'],
    description: 'Codifica ou decodifica em Base64',
    usage: 'base64 [texto]  /  base64 decodificar [texto]',
    run: (ctx) => {
      const raw = ctx.argString.trim();
      if (!raw) {
        ctx.respond('Qual texto, Senhor?');
        return;
      }
      const decode = /^(decodificar|decode|d)\s+/i.test(raw);
      if (decode) {
        const payload = raw.replace(/^(decodificar|decode|d)\s+/i, '');
        const out = fromBase64(payload);
        if (out === null) {
          ctx.print('BASE64 INVÁLIDO.', 'error');
          ctx.respond('Base64 inválido, Senhor.');
          return;
        }
        ctx.print(`TEXTO: ${out}`, 'info');
        void copyToClipboard(out);
      } else {
        const out = toBase64(raw);
        ctx.print(`BASE64: ${out}`, 'info');
        void copyToClipboard(out);
      }
      ctx.respond('Pronto, Senhor. Resultado copiado.');
    },
  },
  {
    id: 'desempenho',
    aliases: ['desempenho', 'status do pc', 'status do sistema', 'como esta o pc', 'nucleo', 'diagnostico do sistema'],
    description: 'Relatório de CPU, RAM, GPU e tempo ativo',
    run: (ctx) => reportSystem('stats', 'Aqui está o estado do núcleo, Senhor.', ctx),
  },
  {
    id: 'processos',
    aliases: ['processos', 'gerenciador de tarefas', 'o que esta rodando', 'programas abertos'],
    description: 'Os processos que mais consomem memória',
    run: (ctx) => reportSystem('processes', 'Estes são os processos mais pesados, Senhor.', ctx),
  },
  {
    id: 'disco',
    aliases: ['disco', 'armazenamento', 'espaco em disco', 'saude do disco', 'hd'],
    description: 'Espaço livre e saúde S.M.A.R.T. dos discos',
    run: (ctx) => reportSystem('disk', 'Relatório de armazenamento pronto, Senhor.', ctx),
  },
  {
    id: 'bateria',
    aliases: ['bateria', 'carga', 'energia'],
    description: 'Carga e estado da bateria',
    run: (ctx) => reportSystem('battery', '', ctx),
  },
  {
    id: 'temperatura',
    aliases: ['temperatura', 'temperaturas', 'calor', 'quente'],
    description: 'Temperatura de CPU e GPU',
    run: (ctx) => reportSystem('temp', '', ctx),
  },
  {
    id: 'inicializacao',
    aliases: ['inicializacao', 'programas de inicializacao', 'startup', 'o que abre com o windows'],
    description: 'Programas que iniciam com o Windows',
    run: (ctx) => reportSystem('startup', 'Estes programas iniciam com o Windows, Senhor.', ctx),
  },
  {
    id: 'limpeza',
    aliases: ['limpar sistema', 'limpeza', 'otimizar', 'limpar temporarios', 'liberar espaco'],
    description: 'Apaga arquivos temporários e libera espaço',
    run: (ctx) => {
      const bridge = desktop();
      if (!bridge) {
        ctx.print('LIMPEZA DE SISTEMA EXIGE O APP DE DESKTOP.', 'error');
        return;
      }
      ctx.print('VARRENDO TEMPORÁRIOS...', 'info');
      void bridge.systemClean().then((r) => {
        ctx.print(r.message, 'info');
        ctx.respond(r.message);
      });
    },
  },
  {
    id: 'fechar',
    aliases: ['fechar programa', 'encerrar processo', 'matar processo', 'fechar aplicativo'],
    description: 'Encerra um programa pelo nome',
    usage: 'fechar [programa]',
    run: (ctx) => {
      const bridge = desktop();
      if (!bridge) {
        ctx.print('ENCERRAR PROCESSOS EXIGE O APP DE DESKTOP.', 'error');
        return;
      }
      const alvo = ctx.argString.trim();
      if (!alvo) {
        ctx.respond('Qual programa devo encerrar, Senhor?');
        return;
      }
      void bridge.systemKill(alvo).then((r) => {
        ctx.print(r.message, r.ok ? 'info' : 'error');
        ctx.respond(r.message);
      });
    },
  },
  {
    id: 'ip-publico',
    aliases: ['meu ip publico', 'meu ip público', 'ip publico', 'qual meu ip', 'ip externo'],
    description: 'Mostra o seu IP público',
    run: (ctx) => {
      ctx.print('CONSULTANDO IP PÚBLICO...', 'info');
      fetch('https://api.ipify.org?format=json')
        .then((r) => r.json() as Promise<{ ip?: string }>)
        .then((data) => {
          if (data.ip) {
            ctx.print(`IP PÚBLICO: ${data.ip}`, 'info');
            ctx.respond(`Seu IP público é ${data.ip.replace(/\./g, ' ponto ')}, Senhor.`);
          } else {
            ctx.print('NÃO FOI POSSÍVEL OBTER O IP.', 'error');
          }
        })
        .catch(() => ctx.print('FALHA AO CONSULTAR O IP (sem internet?).', 'error'));
    },
  },
  {
    id: 'limpar',
    aliases: ['limpar', 'clear', 'cls', 'limpa'],
    description: 'Limpa o log do terminal',
    run: () => {
      useSystemStore.getState().clearLines();
      useSystemStore.getState().print('LOG LIMPO.', 'info');
    },
  },
  {
    id: 'hora',
    aliases: ['hora', 'horas', 'que horas sao', 'que horas'],
    description: 'Informa a hora atual',
    run: (ctx) => {
      const now = new Date();
      const h = now.getHours();
      const m = now.getMinutes();
      ctx.respond(
        `Agora são ${h} ${h === 1 ? 'hora' : 'horas'} e ${m} ${m === 1 ? 'minuto' : 'minutos'}, Senhor.`,
      );
    },
  },
  {
    id: 'data',
    aliases: ['data', 'dia', 'que dia e hoje', 'hoje'],
    description: 'Informa a data atual',
    run: (ctx) => {
      const formatted = new Date().toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      ctx.respond(`Hoje é ${formatted}, Senhor.`);
    },
  },
  {
    id: 'sair',
    aliases: ['sair', 'logout', 'desconectar', 'encerrar', 'exit'],
    description: 'Encerra a sessão e volta para a autenticação',
    run: (ctx) => {
      ctx.respond('Encerrando a sessão. Até logo, Senhor.');
      audio.play('confirm');
      window.setTimeout(() => {
        const system = useSystemStore.getState();
        voiceHandle.stop();
        audio.stopDrone();
        system.setMicActive(false);
        system.setModal(null);
        system.clearLines();
        system.setLoginVisible(true);
        system.setPhase('login');
        sphereController.setState('idle');
        usePlayerStore.getState().logout();
      }, 900);
    },
  },
];

/* ------------------------------------------------------------------ */
/* Parser                                                              */
/* ------------------------------------------------------------------ */

interface AliasEntry {
  alias: string;
  command: Command;
}

/** Aliases mais longos primeiro: "level up" vence "level". */
const ALIAS_INDEX: AliasEntry[] = COMMANDS.flatMap((command) =>
  command.aliases.map((alias) => ({ alias: normalize(alias), command })),
).sort((a, b) => b.alias.length - a.alias.length);

export interface ParsedCommand {
  command: Command;
  matched: string;
  argString: string;
}

export const parseCommand = (input: string): ParsedCommand | null => {
  const normalized = normalize(input);
  if (normalized.length === 0) return null;

  for (const entry of ALIAS_INDEX) {
    if (normalized === entry.alias) {
      return { command: entry.command, matched: entry.alias, argString: '' };
    }
    if (normalized.startsWith(`${entry.alias} `)) {
      // Recorta os argumentos do texto ORIGINAL, preservando acentos e caixa.
      const consumed = entry.alias.split(' ').length;
      const rest = input.trim().split(/\s+/).slice(consumed).join(' ');
      return { command: entry.command, matched: entry.alias, argString: rest };
    }
  }

  // Nada casou ao pé da letra. Antes de desistir, tenta por similaridade — é o
  // que salva o comando quando ele veio da voz ("abrir o youtube", "limpa").
  const fuzzy = bestMatch(
    normalized,
    COMMANDS.map((command) => ({ value: command, phrases: command.aliases })),
    0.78,
  );
  if (fuzzy) {
    return { command: fuzzy.value, matched: normalize(fuzzy.phrase), argString: '' };
  }

  return null;
};

/* ------------------------------------------------------------------ */
/* Execução                                                            */
/* ------------------------------------------------------------------ */

const print = (text: string, kind: TerminalKind = 'system'): void => {
  useSystemStore.getState().print(text, kind);
};

const respond = (text: string): void => {
  print(text, 'system');
  if (useSystemStore.getState().voiceEnabled) speech.speak(text);
};

/** Pede um relatório de sistema ao processo principal e imprime no terminal. */
const reportSystem = (kind: SystemReportKind, spoken: string, ctx: CommandContext): void => {
  const bridge = desktop();
  if (!bridge) {
    ctx.print('RELATÓRIOS DE SISTEMA EXIGEM O APP DE DESKTOP.', 'error');
    return;
  }
  ctx.print('CONSULTANDO O SISTEMA...', 'info');
  void bridge.systemReport(kind).then((report) => {
    for (const line of report.split('\n')) ctx.print(line, 'system');
    if (spoken) ctx.respond(spoken);
  });
};

/* ------------------------------------------------------------------ */
/* Comandos programados pelo usuário                                   */
/* ------------------------------------------------------------------ */

/**
 * Tenta resolver a frase como um comando personalizado do painel.
 * Devolve `true` quando assumiu a frase — quem chama para por aí.
 */
const runCustomCommand = (raw: string): boolean => {
  const { customCommands } = useConfigStore.getState().config;
  const enabled = customCommands.filter((c) => c.enabled && c.phrases.length > 0);
  if (enabled.length === 0) return false;

  const match = bestMatch(
    raw,
    enabled.map((c) => ({ value: c, phrases: c.phrases })),
  );
  if (!match) return false;

  const command = match.value;
  const reply = command.reply.trim() || `Executando ${command.description || 'comando'}, Senhor.`;
  const bridge = desktop();

  sphereController.pulse(1);

  if (command.action.kind === 'speak') {
    respond(command.action.target || reply);
    return true;
  }

  if (!bridge) {
    // No navegador só dá para abrir URL; o resto exige o app de desktop.
    if (command.action.kind === 'open-url') {
      openTab(command.action.target);
      respond(reply);
    } else {
      print('ESTA AÇÃO EXIGE O APP DE DESKTOP (NEXUS em segundo plano).', 'error');
    }
    return true;
  }

  void bridge.runAction(command.action).then((result) => {
    if (result.ok) respond(reply);
    else print(`FALHA: ${result.message}`, 'error');
  });
  return true;
};

/**
 * Ponto único de entrada — o Terminal e o reconhecimento de voz usam o mesmo
 * caminho, então todo comando funciona por texto e por fala sem duplicação.
 */
export const runCommand = (input: string, source: 'text' | 'voice' = 'text'): void => {
  const raw = input.trim();
  if (raw.length === 0) return;

  const player = usePlayerStore.getState();

  print(source === 'voice' ? `🎙 ${raw}` : raw, 'user');
  player.pushHistory(raw);

  sphereController.pulse(1);
  sphereController.setState('processing');
  window.setTimeout(() => {
    // Só volta para idle se nada mais tiver assumido a esfera nesse meio-tempo.
    if (sphereController.getState() === 'processing') sphereController.setState('idle');
  }, 700);

  // Comandos programados pelo usuário têm prioridade sobre os embutidos.
  if (runCustomCommand(raw)) {
    player.addXp(XP_PER_COMMAND);
    player.trackQuest('commands');
    return;
  }

  // Ferramenta de linha de comando registrada (sherlock, ping, ipconfig...).
  const tool = matchTool(raw);
  if (tool) {
    player.addXp(XP_PER_COMMAND);
    player.trackQuest('commands');
    void runTool(tool);
    return;
  }

  const parsed = parseCommand(raw);

  if (!parsed) {
    // Nada casou: em vez de recusar, pergunta ao modelo local e responde.
    void ask(raw).then((answered) => {
      if (answered) {
        usePlayerStore.getState().addXp(XP_PER_COMMAND);
        usePlayerStore.getState().trackQuest('commands');
        return;
      }
      audio.play('error');
      const message = "Comando não reconhecido, Senhor. Diga 'ajuda' para ver as opções.";
      print('COMANDO NÃO RECONHECIDO', 'error');
      respond(message);
    });
    return;
  }

  // Todo comando válido dá XP e conta para a missão diária.
  player.addXp(XP_PER_COMMAND);
  player.trackQuest('commands');
  audio.play('hover');

  const ctx: CommandContext = {
    raw,
    matched: parsed.matched,
    argString: parsed.argString,
    args: parsed.argString.length > 0 ? parsed.argString.split(/\s+/) : [],
    print,
    respond,
  };

  try {
    parsed.command.run(ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    print(`FALHA NA EXECUÇÃO: ${message}`, 'error');
    audio.play('error');
    sphereController.setState('alert');
    window.setTimeout(() => {
      if (sphereController.getState() === 'alert') sphereController.setState('idle');
    }, 1400);
  }
};
