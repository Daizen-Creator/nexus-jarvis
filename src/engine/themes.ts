import type { Theme } from '../types';

/**
 * Registro de temas do NEXUS.
 *
 * Cada tema é um conjunto de tokens no formato "r g b" (o mesmo usado pelas
 * variáveis CSS `--c-*`). Aplicar um tema é escrever esses tokens em
 * `document.documentElement` — a interface inteira e a esfera reagem, porque
 * ambas leem as variáveis. Assim dá para ter dezenas de temas sem uma linha de
 * CSS por tema.
 */
export interface ThemeDef {
  id: string;
  label: string;
  bg: string;
  surface: string;
  /** Cor primária (mapeada em --c-blue). */
  primary: string;
  /** Cor de destaque (--c-cyan). */
  accent: string;
  /** Texto (--c-ice). */
  ice: string;
  gold: string;
  danger: string;
  success: string;
  violet: string;
}

const t = (
  id: string,
  label: string,
  bg: string,
  surface: string,
  primary: string,
  accent: string,
  ice: string,
  gold: string,
  danger: string,
  success: string,
  violet: string,
): ThemeDef => ({ id, label, bg, surface, primary, accent, ice, gold, danger, success, violet });

export const THEMES: ThemeDef[] = [
  t('blue', 'Azul Elétrico', '5 5 8', '10 10 15', '0 212 255', '125 249 255', '232 246 255', '255 176 32', '255 51 85', '60 231 150', '168 120 255'),
  t('amber', 'Âmbar Reator', '8 5 3', '16 11 6', '255 176 32', '255 214 120', '255 244 224', '255 226 140', '255 74 58', '190 231 60', '255 140 60'),
  t('crimson', 'Carmesim', '10 4 6', '18 8 11', '255 51 85', '255 138 158', '255 232 236', '255 190 90', '255 40 60', '80 220 160', '220 90 255'),
  t('emerald', 'Esmeralda', '4 9 7', '8 16 13', '46 230 150', '150 255 210', '228 255 244', '240 220 120', '255 90 100', '120 255 180', '120 220 255'),
  t('violet', 'Violeta', '7 5 12', '13 10 22', '168 120 255', '210 180 255', '240 235 255', '255 210 120', '255 80 120', '110 235 180', '200 130 255'),
  t('cyber', 'Cyber Neon', '3 6 8', '7 12 16', '0 255 200', '120 255 240', '224 255 250', '255 60 180', '255 40 90', '80 255 160', '180 100 255'),
  t('sunset', 'Pôr do Sol', '12 6 6', '20 10 9', '255 110 80', '255 180 120', '255 238 226', '255 200 90', '255 70 70', '230 210 90', '255 120 170'),
  t('toxic', 'Tóxico', '5 8 3', '10 15 6', '170 255 40', '215 255 130', '240 255 220', '230 255 90', '255 90 60', '150 255 90', '120 220 255'),
  t('ice', 'Gelo', '6 9 12', '11 16 22', '120 200 255', '190 230 255', '235 246 255', '200 220 255', '255 100 130', '120 240 200', '170 160 255'),
  t('rose', 'Rosa', '11 5 8', '19 9 14', '255 100 170', '255 170 210', '255 235 245', '255 205 120', '255 70 110', '120 230 180', '220 120 255'),
  t('gold', 'Ouro', '9 7 3', '16 12 6', '255 200 60', '255 228 150', '255 248 224', '255 236 150', '255 90 70', '200 230 110', '255 170 90'),
  t('mono', 'Monocromo', '6 6 8', '12 12 15', '200 210 225', '235 240 250', '240 244 252', '220 200 140', '255 110 120', '150 220 180', '180 180 210'),
  t('inferno', 'Inferno', '10 3 3', '18 6 5', '255 90 30', '255 160 70', '255 232 216', '255 190 80', '255 50 40', '210 220 90', '255 110 130'),
  t('ocean', 'Oceano', '3 7 11', '6 13 20', '40 160 255', '110 220 255', '224 244 255', '255 205 110', '255 90 110', '90 230 200', '150 150 255'),
  t('matrix', 'Matrix', '2 6 3', '5 12 7', '40 255 90', '150 255 170', '220 255 228', '210 255 120', '255 90 80', '120 255 140', '120 220 200'),
  t('royal', 'Real', '5 6 12', '10 12 22', '90 130 255', '160 190 255', '234 240 255', '255 210 120', '255 90 120', '110 230 180', '180 140 255'),
  t('magma', 'Magma', '9 4 3', '16 8 5', '255 140 40', '255 90 60', '255 236 220', '255 200 90', '255 60 40', '210 220 90', '255 120 90'),
  t('mint', 'Menta', '4 9 8', '8 16 14', '90 240 200', '170 255 230', '230 255 248', '240 230 130', '255 100 110', '130 255 200', '150 210 255'),
  t('grape', 'Uva', '7 4 10', '13 8 18', '150 90 255', '200 160 255', '238 232 255', '255 200 120', '255 80 120', '110 230 180', '210 130 255'),
  t('coral', 'Coral', '11 6 6', '19 11 10', '255 130 110', '255 190 160', '255 240 232', '255 210 120', '255 80 80', '120 225 180', '255 130 180'),
  t('steel', 'Aço', '6 8 10', '11 14 18', '130 160 190', '190 210 230', '234 242 250', '210 200 150', '255 110 120', '140 210 180', '160 170 210'),
  t('neon-pink', 'Neon Rosa', '8 3 9', '15 6 16', '255 40 160', '255 130 210', '255 228 244', '255 200 120', '255 60 100', '90 255 190', '200 100 255'),
  t('lime', 'Limão', '5 8 4', '10 15 7', '190 255 60', '220 255 140', '244 255 224', '235 255 100', '255 100 70', '150 255 110', '130 220 255'),
  t('sky', 'Céu', '5 8 12', '10 15 21', '90 190 255', '160 220 255', '234 246 255', '255 210 120', '255 100 120', '110 235 190', '170 160 255'),
  t('blood', 'Sangue', '8 2 3', '15 5 6', '210 30 40', '255 100 100', '255 224 224', '255 180 80', '255 40 40', '200 210 90', '230 90 120'),
  t('aqua', 'Aqua', '3 8 9', '6 15 17', '40 220 220', '130 245 245', '224 252 252', '255 205 110', '255 90 110', '90 235 190', '150 160 255'),
  t('plasma', 'Plasma', '7 4 11', '13 8 20', '210 60 255', '240 150 255', '248 232 255', '255 200 120', '255 70 110', '110 230 180', '230 120 255'),
  t('sand', 'Areia', '10 8 5', '18 14 9', '230 200 140', '245 228 180', '255 248 232', '255 220 130', '255 100 80', '190 220 120', '230 170 120'),
  t('teal', 'Verde-azul', '4 8 8', '8 15 15', '40 200 180', '130 235 220', '224 250 246', '255 205 110', '255 95 110', '110 235 180', '150 170 240'),
  t('phantom', 'Fantasma', '5 5 9', '10 10 17', '120 140 200', '180 195 240', '232 238 252', '210 200 160', '255 100 130', '140 210 200', '170 150 230'),
  t('solar', 'Solar', '11 8 3', '19 13 6', '255 210 40', '255 160 60', '255 246 210', '255 226 120', '255 70 50', '210 225 90', '255 150 80'),
  // Dourado quente, no espírito do holograma do J.A.R.V.I.S.
  t('stark', 'Stark', '6 4 2', '13 9 4', '255 150 20', '255 205 80', '255 240 205', '255 200 60', '255 70 40', '210 220 90', '255 150 70'),
];

export const THEME_IDS: string[] = THEMES.map((theme) => theme.id);

export const themeById = (id: Theme): ThemeDef => THEMES.find((theme) => theme.id === id) ?? THEMES[0];

export const nextThemeId = (current: Theme): string => {
  const i = THEMES.findIndex((theme) => theme.id === current);
  return THEMES[(i + 1) % THEMES.length].id;
};

/**
 * Aplica um tema escrevendo os tokens nas variáveis CSS do documento.
 * Chamado antes de a esfera reler as cores.
 */
export const applyTheme = (id: Theme): void => {
  const theme = themeById(id);
  const root = document.documentElement;
  root.setAttribute('data-theme', theme.id);
  const set = (name: string, value: string): void => root.style.setProperty(name, value);
  set('--c-bg', theme.bg);
  set('--c-surface', theme.surface);
  set('--c-blue', theme.primary);
  set('--c-cyan', theme.accent);
  set('--c-ice', theme.ice);
  set('--c-steel', theme.surface);
  set('--c-gold', theme.gold);
  set('--c-danger', theme.danger);
  set('--c-success', theme.success);
  set('--c-violet', theme.violet);
};
