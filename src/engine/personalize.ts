import { addressOf, useConfigStore } from '../store/useConfigStore';

/**
 * Troca o tratamento padrão pelo que você configurou ("Chefe", "Daniel",
 * "Capitão"...).
 *
 * As respostas são escritas com "Senhor" no código porque é a forma canônica
 * do J.A.R.V.I.S.; a substituição acontece num ponto só, na saída — assim
 * mudar o tratamento não exige tocar em nenhuma string de comando.
 */
export const personalize = (text: string): string => {
  const address = addressOf(useConfigStore.getState().config);
  if (address === 'Senhor') return text;
  return text.replace(/\bSenhor\b/g, address);
};
