/**
 * O package.json da raiz declara "type": "module" por causa do Vite, mas o
 * processo principal do Electron é compilado para CommonJS. Sem este marcador
 * o Node lê `dist-electron/electron/main.js` como ESM e quebra logo na carga
 * com "exports is not defined in ES module scope".
 *
 * Um package.json próprio na pasta de saída restringe o escopo para CommonJS.
 */
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const outDir = join(__dirname, '..', 'dist-electron');
mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, 'package.json'),
  `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`,
  'utf8',
);
console.log('[nexus] dist-electron marcado como CommonJS');
