/**
 * Extração do código durante o streaming.
 *
 * Enquanto o modelo escreve, o texto ainda não fechou a cerca markdown — então
 * a extração final (`extractCode`, no processo principal) não serve aqui.
 * Esta versão mostra o que já dá para mostrar, sem esperar o fim.
 */
export const extractPreview = (raw: string): string => {
  if (raw.length === 0) return '';

  const open = raw.indexOf('```');
  if (open < 0) {
    // O modelo ainda não abriu a cerca — mostra o texto cru mesmo.
    return raw;
  }

  const afterFence = raw.slice(open + 3);
  const firstNewline = afterFence.indexOf('\n');
  if (firstNewline < 0) return '';

  const body = afterFence.slice(firstNewline + 1);
  const close = body.indexOf('```');
  return (close >= 0 ? body.slice(0, close) : body).replace(/\s+$/, '');
};
