/**
 * Casamento tolerante de frases faladas.
 *
 * Motivo de existir: o modelo pt-BR do Vosk não transcreve literalmente.
 * Medido nos testes deste projeto:
 *   "abrir youtube"    -> "abrir o youtube"   (insere artigo)
 *   "bloquear a tela"  -> "bloquear a terra"  (troca fonética)
 *   "jarvis"           -> "já vos"            (fora do vocabulário)
 *
 * Comparação literal descarta a maioria desses. Aqui a frase é normalizada,
 * limpa de palavras vazias e comparada por similaridade de Levenshtein.
 */

const DIACRITICS = /[̀-ͯ]/g;

export const normalize = (input: string): string =>
  input
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Artigos, preposições e muletas que o reconhecedor adiciona sozinho. */
const STOPWORDS = new Set([
  'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas',
  'de', 'do', 'da', 'dos', 'das', 'no', 'na', 'nos', 'nas',
  'em', 'para', 'pra', 'pro', 'por', 'com', 'ao', 'aos',
  'me', 'meu', 'minha', 'e', 'ai', 'ali', 'la', 'ae',
  'por favor', 'favor', 'ta', 'ne',
]);

export const tokenize = (input: string): string[] =>
  normalize(input).split(' ').filter((t) => t.length > 0);

/** Remove palavras vazias, mas nunca devolve vazio. */
export const stripFiller = (tokens: string[]): string[] => {
  const kept = tokens.filter((t) => !STOPWORDS.has(t));
  return kept.length > 0 ? kept : tokens;
};

/** Forma canônica usada em todas as comparações. */
export const canonical = (input: string): string => stripFiller(tokenize(input)).join(' ');

/* ------------------------------------------------------------------ */
/* Similaridade                                                        */
/* ------------------------------------------------------------------ */

export const levenshtein = (a: string, b: string): number => {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Uma linha só: O(min(a,b)) de memória.
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j += 1) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  return prev[b.length];
};

/** 0 = nada a ver, 1 = idêntico. */
export const similarity = (a: string, b: string): number => {
  if (a.length === 0 && b.length === 0) return 1;
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
};

/* ------------------------------------------------------------------ */
/* Wake word                                                           */
/* ------------------------------------------------------------------ */

/**
 * Variantes observadas na prática. "jarvis" é a pior: não existe no
 * vocabulário pt-BR do Vosk, então sai como "já vos", "javis", "jarbas"...
 */
const WAKE_VARIANTS: Record<string, string[]> = {
  jarvis: ['jarvis', 'jarves', 'jarvez', 'javis', 'javos', 'ja vos', 'jarbas', 'charvis', 'jarvi'],
  sistema: ['sistema', 'sistemas', 'cistema', 'sistem'],
  nexus: ['nexus', 'nexos', 'nexo', 'necks'],
};

const WAKE_THRESHOLD = 0.74;

export interface WakeResult {
  awake: boolean;
  /** O que sobrou depois de tirar a wake word. */
  rest: string;
}

/**
 * Detecta a wake word no início da frase e devolve o resto como comando.
 * Uma frase que seja *só* a wake word acorda o sistema com `rest` vazio.
 */
export const detectWakeWord = (input: string, wakeWords: string[]): WakeResult => {
  const tokens = tokenize(input);
  if (tokens.length === 0) return { awake: false, rest: '' };

  for (const raw of wakeWords) {
    const word = normalize(raw);
    if (word.length === 0) continue;
    const variants = WAKE_VARIANTS[word] ?? [word];

    for (const variant of variants) {
      const parts = variant.split(' ');
      const head = tokens.slice(0, parts.length).join(' ');
      if (head === variant) {
        return { awake: true, rest: tokens.slice(parts.length).join(' ') };
      }
    }

    // Fallback fonético no primeiro token — e nos dois primeiros juntos,
    // porque "jarvis" costuma virar duas palavras ("já vos").
    if (similarity(tokens[0], word) >= WAKE_THRESHOLD) {
      return { awake: true, rest: tokens.slice(1).join(' ') };
    }
    if (tokens.length >= 2 && similarity(tokens[0] + tokens[1], word) >= WAKE_THRESHOLD) {
      return { awake: true, rest: tokens.slice(2).join(' ') };
    }
  }

  return { awake: false, rest: tokens.join(' ') };
};

/* ------------------------------------------------------------------ */
/* Melhor candidato                                                    */
/* ------------------------------------------------------------------ */

export interface Candidate<T> {
  value: T;
  phrases: string[];
}

export interface MatchResult<T> {
  value: T;
  score: number;
  phrase: string;
}

export const DEFAULT_THRESHOLD = 0.72;

/**
 * Escolhe o melhor candidato para uma frase.
 *
 * Prioridade: igualdade exata > frase contida > similaridade acima do limiar.
 * A comparação usa a forma canônica dos dois lados, então "abrir o youtube"
 * e "abrir youtube" caem no mesmo lugar.
 */
export const bestMatch = <T>(
  input: string,
  candidates: Array<Candidate<T>>,
  threshold: number = DEFAULT_THRESHOLD,
): MatchResult<T> | null => {
  const target = canonical(input);
  if (target.length === 0) return null;

  let best: MatchResult<T> | null = null;

  for (const candidate of candidates) {
    for (const rawPhrase of candidate.phrases) {
      const phrase = canonical(rawPhrase);
      if (phrase.length === 0) continue;

      let score: number;
      if (target === phrase) {
        score = 1;
      } else if (target.startsWith(`${phrase} `) || target.endsWith(` ${phrase}`) || target.includes(` ${phrase} `)) {
        // Frase inteira contida: forte, mas abaixo da igualdade exata.
        score = 0.94;
      } else {
        score = similarity(target, phrase);
      }

      if (score >= threshold && (best === null || score > best.score)) {
        best = { value: candidate.value, score, phrase: rawPhrase };
      }
    }
  }

  return best;
};

/**
 * Separa um verbo inicial ("abrir", "executar") do seu argumento, tolerando
 * variações. Devolve null quando nenhum verbo casa.
 */
export const splitVerb = (
  input: string,
  verbs: string[],
  threshold = 0.8,
): { verb: string; rest: string } | null => {
  const tokens = tokenize(input);
  if (tokens.length === 0) return null;

  for (const raw of verbs) {
    const verb = normalize(raw);
    const parts = verb.split(' ');
    const head = tokens.slice(0, parts.length).join(' ');
    if (head === verb || similarity(head, verb) >= threshold) {
      return { verb, rest: stripFiller(tokens.slice(parts.length)).join(' ') };
    }
  }
  return null;
};
