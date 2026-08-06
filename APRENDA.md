# APRENDA — entendendo o NEXUS por dentro

Guia para você **dominar** o que construímos. Não é só "o que faz" — é "por que é
assim". Leia na ordem; cada parte prepara a próxima.

---

## 1. As linguagens e ferramentas (o time)

Pensa num filme: cada uma tem um papel.

| Ferramenta | Papel | Onde aparece |
| --- | --- | --- |
| **TypeScript** | JavaScript **com tipos** (avisa erros antes de rodar) | quase tudo (`.ts`, `.tsx`) |
| **React** | monta a interface em "componentes" reutilizáveis | `src/components/*.tsx` |
| **Vite** | empacota e serve o front-end, com recarga instantânea | `vite.config.ts` |
| **Tailwind CSS** | estilo por "classes utilitárias" no HTML | classes tipo `text-cyan` |
| **Zustand** | guarda o "estado" (dados) do app de forma central | `src/store/*.ts` |
| **Canvas 2D** | desenha a esfera pixel a pixel | `ParticleSphere.ts` |
| **Electron** | transforma o site num app de desktop (Windows) | `electron/*.ts` |
| **Python** | ouve o microfone e transcreve a voz (offline) | `python/*.py` |
| **Ollama** | roda a IA (código e conversa) na sua máquina | `electron/ai.ts` |
| **electron-builder** | gera o instalador `.exe` | config no `package.json` |
| **Git / GitHub** | histórico do código e hospedagem | `.git`, `GUIA-GITHUB.md` |

**Dica de estudo:** você não precisa aprender tudo de uma vez. A ordem natural é:
JavaScript → TypeScript → React → depois Electron.

---

## 2. A ideia central: dois "mundos"

Um app Electron tem **dois processos** (dois programas rodando juntos):

```
┌─────────────────────────┐        ┌──────────────────────────┐
│   MAIN (processo pai)    │  IPC   │   RENDERER (a tela)      │
│   electron/main.ts      │◄─────► │   src/ (React)           │
│                         │        │                          │
│ - abre janelas          │        │ - desenha a interface    │
│ - acesso ao sistema:    │        │ - a esfera, os painéis   │
│   arquivos, processos,  │        │ - NÃO acessa o sistema   │
│   microfone, atualizar  │        │   direto (segurança)     │
└─────────────────────────┘        └──────────────────────────┘
```

- O **renderer** é a parte visual (React). Por segurança, ele **não** pode mexer
  em arquivos, processos, etc.
- O **main** é o que tem poder de sistema.
- Eles conversam por **IPC** (mensagens). O `preload.ts` é a "ponte" segura entre
  os dois — só expõe funções específicas, nunca o sistema inteiro.

> **Por que isso importa:** se um site malicioso rodasse no renderer, ele não
> conseguiria apagar seus arquivos, porque o renderer não tem esse poder. Toda
> ação de sistema passa por uma ponte controlada.

---

## 3. A regra de ouro da esfera (arquitetura de performance)

`src/engine/ParticleSphere.ts` é uma **classe pura** — não é React. Ela tem seu
próprio loop de animação (`requestAnimationFrame`) rodando a 60 quadros por
segundo.

**Por quê?** Se cada partícula fosse um "estado React", o React redesenharia a
tela 60 vezes por segundo e travaria. Em vez disso:

- A esfera é criada **uma vez** e roda sozinha no canvas.
- O React só manda **comandos**: `sphere.setState('listening')`, `sphere.pulse()`.

Essa separação (motor pesado fora do React) é a decisão mais importante do projeto.
Vale para qualquer app com gráficos: **não coloque animação de 60fps no estado da
interface.**

---

## 4. Passeio pelos arquivos (o que cada pasta ensina)

### `src/` — o front-end (React + TypeScript)

- **`components/`** — cada arquivo é um pedaço da tela.
  - `ParticleCanvas.tsx` — a casca fina que monta a esfera (ensina `useRef` +
    `useEffect`).
  - `Dashboard.tsx` — o HUD com abas (ensina estado local e composição).
  - `OsHud.tsx` — o painel JARVIS OS (ensina `setInterval`, gauges em SVG).
  - `ConfigPanel.tsx` — a configuração gigante (ensina formulários e listas).
- **`store/`** — o estado global com Zustand.
  - `usePlayerStore.ts` — nível, XP, atributos (ensina lógica de negócio pura).
  - `useSystemStore.ts` — tema, som, terminal.
  - `useConfigStore.ts` — a config que sincroniza com o disco.
- **`engine/`** — a lógica "de verdade", sem React.
  - `ParticleSphere.ts` — o canvas (matemática 3D projetada em 2D).
  - `commands.ts` — o interpretador de comandos (ensina padrões de projeto).
  - `matcher.ts` — casamento de texto tolerante (ensina algoritmos: Levenshtein).
  - `themes.ts` — os 31 temas (ensina como dados viram visual).
- **`hooks/`** — funções reutilizáveis do React (`use...`).
- **`types/`** — os "contratos" de dados em TypeScript (`interface`).

### `electron/` — o processo principal

- `main.ts` — o coração: cria janelas, registra os "canais" IPC, inicia tudo.
- `preload.ts` — a ponte segura entre main e renderer.
- `voice.ts` — supervisiona o daemon Python da voz.
- `ai.ts` — fala com o Ollama (gerar código e conversar).
- `system.ts` — lê CPU/RAM/disco via PowerShell.
- `updater.ts` — o **auto-update** (explicado na parte 6).

### `python/` — a voz offline

- `nexus_voice.py` — captura o microfone e transcreve com o Vosk.

---

## 5. Como um comando de voz viaja pelo sistema (exemplo real)

Você diz **"abrir youtube"**. O caminho:

```
1. Microfone → python/nexus_voice.py transcreve → imprime JSON
2. electron/voice.ts lê o JSON → aplica wake word e confiança
3. electron/main.ts (handleHeard) → resolver.ts decide: é "abrir site"
4. electron/actions.ts → abre o YouTube no navegador
5. Volta um "reply" → renderer mostra no terminal e a voz responde
```

Entender esse fluxo (voz → main → ação → volta pro renderer) é entender **como
tudo se conecta**.

---

## 6. AUTO-UPDATE — passo a passo (o que você pediu)

### A ideia em uma frase

O app **compara a própria versão** com a **última release publicada no GitHub**.
Se a de lá for maior, baixa sozinho e avisa para reiniciar.

### As peças

```
┌────────────────────┐     pergunta      ┌─────────────────────┐
│  NEXUS instalado   │ ────────────────► │  GitHub Releases     │
│  versão 1.0.0      │                   │  última: 1.0.1       │
│                    │ ◄──────────────── │  latest.yml + .exe   │
└────────────────────┘     responde       └─────────────────────┘
        │
        │ 1.0.1 > 1.0.0 → baixa em segundo plano
        ▼
   splash "Baixando 47%" → "Pronta" → você clica "Reiniciar"
```

- **`package.json → build.publish`** diz PARA ONDE olhar (seu repo GitHub).
- **`latest.yml`** (gerado pelo electron-builder) é o "cartaz" com a versão nova.
- **`electron/updater.ts`** é a lógica que checa, baixa e instala.
- **`src/components/UpdateSplash.tsx`** é o aviso visual.

### O código, comentado (electron/updater.ts)

```ts
import { autoUpdater } from 'electron-updater';

// 1. Configura: baixar sozinho quando achar update.
autoUpdater.autoDownload = true;

// 2. Escuta os eventos e avisa a interface:
autoUpdater.on('update-available', (info) => emit({ status: 'available', version: info.version }));
autoUpdater.on('download-progress', (p) => emit({ status: 'downloading', pct: p.percent }));
autoUpdater.on('update-downloaded', () => emit({ status: 'ready' }));

// 3. Procura update (só no app instalado, não em desenvolvimento):
autoUpdater.checkForUpdates();

// 4. Quando você clica "Reiniciar e instalar":
autoUpdater.quitAndInstall();
```

### Por que só funciona no app instalado

Em desenvolvimento (`npm run desktop`) não há "versão instalada" para comparar.
Por isso o `updater.ts` checa `app.isPackaged` e só age no `.exe` instalado.

### Como VOCÊ lança uma versão nova (o ciclo)

```bash
npm version patch          # 1.0.0 → 1.0.1 (cria commit + tag)
git push --follow-tags     # envia a tag
$env:GH_TOKEN = gh auth token
npm run release            # compila + publica no GitHub
gh release edit v1.0.1 --draft=false   # tira do rascunho
```

Pronto: todo NEXUS instalado detecta a 1.0.1 e se atualiza.

---

## 7. Roteiro para DOMINAR (ordem de estudo)

Você tem um projeto real completo nas mãos — é o melhor material de estudo. Sugestão:

1. **JavaScript básico** (2–3 semanas): variáveis, funções, arrays, objetos,
   `if`, `for`. Sem isso, nada faz sentido.
2. **TypeScript** (1 semana): o que muda é só os **tipos** (`: string`,
   `interface`). Abra `src/types/index.ts` e leia — são só contratos de dados.
3. **React** (3–4 semanas): componentes, `props`, `useState`, `useEffect`. Estude
   um componente simples nosso: `src/components/MicButton.tsx`.
4. **Zustand** (2 dias): estado global. Leia `src/store/useSystemStore.ts`.
5. **Canvas** (opcional, avançado): `ParticleSphere.ts` — matemática e desenho.
6. **Electron** (2 semanas): os dois processos, IPC. Leia `electron/preload.ts` (é
   curto) para ver a ponte.
7. **Python** (paralelo): `python/nexus_voice.py` é um bom exemplo de script real.

**Método que funciona:** pegue UM arquivo pequeno, leia linha a linha, mude uma
coisa, rode (`npm run desktop`) e veja o que aconteceu. Errar e consertar é como
se aprende de verdade.

### Exercícios para praticar neste projeto

- **Fácil:** adicione um tema novo em `src/engine/themes.ts` (copie uma linha,
  mude as cores).
- **Fácil:** adicione um comando em `src/engine/commands.ts` (copie um objeto do
  array `COMMANDS`).
- **Médio:** adicione um card novo no `OsHud.tsx` mostrando outro dado do sistema.
- **Difícil:** crie um preset de esfera novo em `src/desktop/defaults.ts`.

Cada um desses te ensina uma camada diferente. Comece pelos fáceis.

---

## 8. Onde procurar quando travar

- **Erro de tipo (TypeScript):** rode `npm run typecheck` — ele aponta a linha.
- **App não abre:** rode `npm run desktop` num terminal e leia a mensagem.
- **Entender um arquivo:** todos têm comentários em português explicando o "porquê".
- **A arquitetura geral:** o `README.md` tem o mapa completo.

Bons estudos. Você construiu (comigo) um app de verdade — agora é desmontar peça
por peça para entender cada uma.
