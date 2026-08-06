/**
 * Utilitários locais para os comandos — tudo roda no cliente, nada sai da
 * máquina. Usados pelos comandos de cálculo, hash, senha e codificação.
 */

/* ------------------------------------------------------------------ */
/* Calculadora segura                                                  */
/* ------------------------------------------------------------------ */

/**
 * Avalia uma expressão aritmética simples.
 *
 * A entrada é restrita a dígitos e operadores por uma allowlist antes de
 * qualquer avaliação — não há superfície para injeção de código. Devolve null
 * se a expressão for inválida.
 */
export const safeCalc = (input: string): number | null => {
  const expr = input
    .toLowerCase()
    .replace(/\bmais\b/g, '+')
    .replace(/\bmenos\b/g, '-')
    .replace(/\b(vezes|multiplicado por|x)\b/g, '*')
    .replace(/\b(dividido por|dividido)\b/g, '/')
    .replace(/,/g, '.')
    .replace(/[^0-9+\-*/().%\s]/g, '')
    .trim();

  if (expr.length === 0 || !/[0-9]/.test(expr)) return null;

  try {
    // A allowlist acima garante que só há aritmética aqui.
    // eslint-disable-next-line no-new-func
    const value = Function(`"use strict"; return (${expr});`)() as unknown;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    return null;
  } catch {
    return null;
  }
};

/* ------------------------------------------------------------------ */
/* Hash e codificação                                                  */
/* ------------------------------------------------------------------ */

export const sha256Hex = async (text: string): Promise<string> => {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

export const toBase64 = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
};

export const fromBase64 = (encoded: string): string | null => {
  try {
    const binary = atob(encoded.trim());
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
};

/* ------------------------------------------------------------------ */
/* Gerador de senha                                                    */
/* ------------------------------------------------------------------ */

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%&*?-_=+';

/**
 * Gera uma senha forte com `crypto.getRandomValues`. Garante ao menos um
 * caractere de cada classe e embaralha o resultado.
 */
export const generatePassword = (length = 16): string => {
  const size = Math.max(8, Math.min(64, length));
  const all = UPPER + LOWER + DIGITS + SYMBOLS;

  const pick = (set: string): string => {
    const idx = crypto.getRandomValues(new Uint32Array(1))[0] % set.length;
    return set[idx];
  };

  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < size) chars.push(pick(all));

  // Embaralhamento Fisher–Yates com fonte criptográfica.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
};

/* ------------------------------------------------------------------ */
/* Área de transferência                                               */
/* ------------------------------------------------------------------ */

export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

/** Fala números casa a casa fica ruim; devolve um texto legível para a voz. */
export const numberForSpeech = (value: number): string => {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace('.', ' vírgula ');
};
