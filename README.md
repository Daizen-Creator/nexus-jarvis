# NEXUS

Interface web cinematográfica que funde a estética do **J.A.R.V.I.S.** (Homem de Ferro)
com a mecânica do **"Sistema"** de *Solo Leveling*.

Esfera de partículas 3D em Canvas 2D puro, HUD com progressão de Jogador (nível, rank,
atributos, missões diárias), terminal de comandos com voz em português e cinemática de
level up. Tudo roda no cliente — sem backend, sem chave de API, sem arquivo de áudio.

---

## Instalação

```bash
npm install
```

```bash
npm run dev
```

A aplicação sobe em `http://localhost:5173`.

### Build de produção

```bash
npm run build
```

O bundle estático vai para `dist/`. Para conferir localmente:

```bash
npm run preview
```

Alternativa sem Node (script auxiliar opcional, serve a pasta `dist/`):

```bash
python scripts/serve.py 4173
```

### Deploy

Qualquer host estático. Em Vercel ou Netlify, use `npm run build` como comando
de build e `dist` como diretório de saída — não há configuração adicional.

---

## Duas formas de rodar

| | Web (`npm run dev`) | **Desktop (`npm run desktop`)** |
| --- | --- | --- |
| HUD, terminal, progressão | ✅ | ✅ |
| Voz — falar | Web Speech API | Web Speech API |
| Voz — escutar | Chrome/Edge, aba aberta | **Vosk offline, segundo plano** |
| Abrir sites | ✅ | ✅ |
| Abrir programas locais | ❌ | ✅ |
| Volume, mídia, bloquear tela | ❌ | ✅ |
| Bandeja, atalho global, autostart | ❌ | ✅ |

O desktop é a versão completa. Veja **[App em segundo plano](#app-em-segundo-plano-electron--vosk)**.

---

## Stack

| Camada | Escolha |
| --- | --- |
| UI | React 18 + TypeScript (strict) + Vite 5 |
| Estilo | Tailwind CSS 3 com tokens em variáveis CSS |
| Estado | Zustand + middleware `persist` |
| Cinemáticas | GSAP (timelines) |
| Transições de painel | Framer Motion |
| Esfera | Canvas 2D nativo — sem three.js, sem biblioteca de partículas |
| Áudio | Web Audio API (osciladores + envelopes) |
| Voz | Web Speech API (`speechSynthesis` + `SpeechRecognition`) |

---

## A decisão de arquitetura que importa

**O motor da esfera não vive no ciclo de render do React.**

`src/engine/ParticleSphere.ts` é uma classe TypeScript pura com o próprio loop de
`requestAnimationFrame`. Ela é instanciada **uma única vez** dentro de um `useEffect`
com `useRef` em `ParticleCanvas.tsx`, e o React apenas envia comandos imperativos:

```ts
sphere.setState('listening');
sphere.pulse();
sphere.setTheme('amber');
```

Nenhum `useState` roda a 60 fps. Se as partículas virassem estado React, a aplicação
renderizaria 60 vezes por segundo e engasgaria. O mesmo princípio vale para o motor de
áudio (`AudioEngine`) e o de voz (`SpeechEngine`): singletons expostos por hooks.

O contador animado (`AnimatedNumber`) segue a mesma regra — escreve direto no
`textContent` do nó via Framer Motion, sem re-render por frame. O mini-gráfico de
atividade do `SystemPanel` também desenha direto no canvas.

Para verificar: abra o React DevTools Profiler, grave alguns segundos com a esfera
girando e confirme que não há commits enquanto nada é interagido.

---

## Estrutura

```
src/
  main.tsx
  App.tsx
  styles/globals.css          tokens de tema, scanlines, grain, vinheta
  engine/
    ParticleSphere.ts         motor canvas: partículas, filamentos, anéis, glow, estados
    AudioEngine.ts            osciladores + envelopes, sons 100% sintetizados
    SpeechEngine.ts           seleção de voz pt-BR masculina, fila de falas
    commands.ts               registry de comandos + parser tolerante
  store/
    usePlayerStore.ts         nível, xp, rank, atributos, quests (persist: nexus_save)
    useSystemStore.ts         tema, som, voz, UI, log do terminal (persist: nexus_system)
  hooks/
    useSphere.ts              ponte imperativa React → motor
    useSpeechRecognition.ts   webkitSpeechRecognition, interim results, wake word
    useTypewriter.ts
    useSound.ts
  components/
    BootSequence.tsx          abertura de ~6s, pulável
    ParticleCanvas.tsx        casca fina em volta do motor
    SystemWindow.tsx          janela base + variante Panel
    LoginScreen.tsx
    Dashboard.tsx             HUD, barra superior e modais
    panels/StatusPanel.tsx
    panels/AttributesPanel.tsx
    panels/QuestPanel.tsx
    panels/SystemPanel.tsx
    Terminal.tsx
    MicButton.tsx
    LevelUpCinematic.tsx
    HudOverlay.tsx            anéis de canto, tickmarks, textos técnicos em SVG
    AnimatedNumber.tsx
    Toast.tsx
  types/
    index.ts                  Player, Attribute, Quest, Command, Rank, SphereState
    speech.d.ts               tipos da Web Speech API de reconhecimento
```

---

## Comandos

Funcionam por texto **e** por voz. O parser normaliza acentos e maiúsculas e aceita
sinônimos — `MISSÕES`, `missoes` e `quests` chegam ao mesmo lugar.

| Comando | Sinônimos | Ação |
| --- | --- | --- |
| `ajuda` | `help`, `comandos`, `menu` | Lista todos os comandos numa janela do Sistema |
| `status` | `perfil`, `ficha` | Janela de status completa com todos os atributos |
| `abrir [site]` | `abre`, `open`, `acessar` | Nova aba; termo desconhecido vira busca no Google |
| `musica` | `tocar musica`, `som ambiente`, `play` | Abre o YouTube Music e alterna o tema ambiente sintetizado |
| `tocar [nome]` | `toca`, `coloca musica`, `ouvir` | Toca uma música no YouTube pelo nome |
| `roblox [nome]` | `jogo do roblox`, `jogar roblox` | Abre um jogo do Roblox pelo nome |
| `mapa [local]` | `mapas`, `como chegar`, `onde fica` | Abre o Google Maps num local |
| `level up` | `levelup`, `subir de nivel`, `upar` | Dispara a cinemática |
| `ativar voz` / `desativar voz` | `voz`, `microfone`, `mic` | Liga/desliga microfone e fala |
| `tema` / `tema [nome]` | `mudar tema`, `próximo tema`, `cor` | Passa ao próximo tema, ou vai direto a um pelo nome (`tema matrix`) |
| `quests` | `missoes`, `missão`, `tarefas`, `diarias` | Mostra as missões do dia |
| `limpar` | `clear`, `cls` | Limpa o log |
| `hora` | `horas`, `que horas são` | Fala a hora atual |
| `data` | `dia`, `que dia é hoje`, `hoje` | Fala a data atual |
| `sair` | `logout`, `desconectar`, `encerrar` | Encerra a sessão |

**Comandos de utilidade** (funcionam por texto e por voz):

| Comando | Ação |
| --- | --- |
| `pesquisar [termo]` | Busca no Google |
| `youtube [termo]` | Pesquisa vídeos no YouTube |
| `wikipedia [termo]` | Abre o verbete na Wikipédia |
| `traduzir [texto]` | Abre o Google Tradutor |
| `noticias` | Notícias do dia |
| `clima [cidade]` | Previsão do tempo |
| `calcular [conta]` | Faz a conta e fala o resultado |
| `nota [texto]` / `notas` | Salva e lista anotações |

**Comandos de segurança / trabalho** (tudo local, nada sai da máquina):

| Comando | Ação |
| --- | --- |
| `senha [tamanho]` | Gera uma senha forte e copia |
| `hash [texto]` | SHA-256 do texto, copiado |
| `base64 [texto]` / `base64 decodificar [texto]` | Codifica / decodifica Base64 |
| `meu ip publico` | Mostra o seu IP público |

Qualquer pergunta livre que não seja um comando vira conversa com o modelo local
(ver *Modo conversa*) — não mais "comando não reconhecido".

Cada comando válido concede **+15 XP** e dispara um pulso na esfera.

Sites mapeados em `abrir`: `google`, `youtube`, `github`, `gmail`, `whatsapp`,
`chatgpt`, `spotify`, `netflix`, `maps`, `drive`.

**Adicionar um comando novo** é adicionar um objeto ao array `COMMANDS` em
`src/engine/commands.ts`:

```ts
{
  id: 'reator',
  aliases: ['reator', 'status do reator'],
  description: 'Relata a carga do reator arc',
  run: (ctx) => ctx.respond('Reator arc em 100%, Senhor.'),
}
```

---

## Suporte de voz

**Síntese de fala** (`speechSynthesis`) funciona na maioria dos navegadores modernos.
O `SpeechEngine` escolhe automaticamente uma voz masculina pt-BR (`Daniel`, `Ricardo`,
`Google português do Brasil`…), com fallback para pt genérico e depois en-US, e aplica
`pitch: 0.8` / `rate: 1.05` para o timbre grave. As falas entram numa fila, então duas
respostas nunca se sobrepõem.

**Reconhecimento de voz** (`SpeechRecognition` / `webkitSpeechRecognition`) tem duas
limitações que não dependem deste projeto:

- só existe em **Chrome e Edge** — Firefox e Safari não implementam;
- exige **https ou localhost**. Em `http://` de rede local o navegador bloqueia.

Sem suporte, o botão de microfone é escondido e a UI mostra
`RECONHECIMENTO DE VOZ INDISPONÍVEL NESTE NAVEGADOR`. Todo o resto continua
funcionando por texto.

**Se a voz não funcionar no app de desktop**, abra *Configuração → Voz*. O painel
"Microfone e modelo" tem um diagnóstico direto que mostra, item a item, o que está
faltando:

- **Microfone** — se não houver dispositivo de entrada, a voz não tem como
  funcionar. Conecte um microfone e clique em Reexaminar.
- **Modelo de voz** — o Vosk precisa do modelo pt-BR baixado.
- **Python** — o daemon de escuta é Python; precisa estar no PATH.
- **Escutando agora** — mostra se o daemon está ativo. Clique em Escutar.

A causa mais comum de "não grava" é simplesmente não haver microfone conectado —
o diagnóstico deixa isso explícito em vez de falhar em silêncio.

**Microfone de headset:** se o mic é do seu fone (USB ou sem fio) e o Windows não
o definiu como dispositivo de gravação padrão, o daemon agora **testa os
dispositivos em ordem** e usa o primeiro que abrir de fato — preferindo os que se
identificam como "microfone". Foi assim que o headset `H868 Wireless` passou a ser
reconhecido sem mexer no Windows. Para fixar um específico, selecione-o na lista
"Dispositivo de entrada" e a escuta reinicia sozinha.

**Detalhe técnico que quebrava a voz:** o launcher `py` do Windows lê o shebang do
script e pode redirecionar para o Python da Microsoft Store — que não tem os
pacotes. O NEXUS agora prefere o `python.exe` real (que ignora shebang) e só
aceita um interpretador que realmente importe `vosk` e `sounddevice`. Sem isso, o
daemon caía em laço de reconexão com "No module named 'sounddevice'".

O **wake word** (`Jarvis` / `Sistema`) vem **desligado por padrão** — basta falar
e o comando executa. Ligue "Exigir wake word" em *Configuração → Voz* (ou pelo
botão no cabeçalho do terminal) se quiser que só frases começadas por "Sistema..."
sejam interpretadas — útil na escuta contínua em segundo plano, para não disparar
com qualquer conversa.

Um detalhe que causava confusão: com o wake word exigido, falar um comando direto
não fazia nada (a frase era descartada por não começar com a palavra de ativação).
Agora, por padrão, falar já funciona.

**Áudio:** o `AudioContext` só pode ser criado depois de um gesto do usuário — por isso
o primeiro clique ou tecla na página destrava o som. É uma regra dos navegadores, não
uma escolha de implementação.

---

## Progressão

- **XP por nível:** `100 × 1,22^(nível-1)` — 100 no nível 1, 122 no 2, 599 no 10.
- **Pontos de atributo:** +3 por nível, distribuíveis no painel de Atributos.
- **Ranks por limiar de nível:** `E` (1) → `D` (5) → `C` (10) → `B` (20) → `A` (35) → `S` (50).
- **Missões diárias:** 4 por dia, resetadas 24 h após o último reset (timestamp no store).
- **HP/Mana:** regeneram em tempo real e são restaurados por completo a cada nível.
- **Persistência:** `nexus_save` (jogador, quests, últimos 50 comandos) e `nexus_system`
  (tema, som, voz, "Lembrar-me"). Sem "Lembrar-me", a sessão não é restaurada no próximo boot.

---

## Acessibilidade e responsividade

- Grade de 3 colunas no desktop, 2 no tablet, 1 no celular. Testado a partir de 360 px.
- Alvos de toque de no mínimo 44 px.
- `prefers-reduced-motion` desliga partículas (a esfera vira um núcleo estático),
  glitch, grain e scanlines.
- `aria-label` em todos os botões de ícone, navegação por teclado, foco visível.
- O log do terminal é `role="log"` com `aria-live="polite"`; os toasts, `role="status"`.

---

## App em segundo plano (Electron + Vosk)

O NEXUS também roda como aplicativo de bandeja no Windows: escuta o microfone
continuamente, abre sites e programas, controla volume e mídia, e mostra a esfera
por cima de tudo quando você chama.

### Por que Electron, e por que não a Web Speech API

**A Web Speech API de reconhecimento não funciona nem em Electron nem em Tauri.**
O Chromium do Electron é compilado sem as chaves da API de fala do Google —
`webkitSpeechRecognition` falha com erro de rede. O Tauri no Windows usa WebView2,
que simplesmente não implementa a interface. Portar a versão web como está
resultaria em microfone morto nos dois.

Por isso a escuta é um daemon Python com **Vosk**: offline, gratuito, sem chave de
API, e nenhum áudio sai da máquina. Electron ficou na frente do Tauri por não exigir
a toolchain Rust e por reaproveitar direto o build do Vite.

### Instalação

```bash
npm install
```

```bash
npm run voice:setup
```

O `voice:setup` instala `vosk` e `sounddevice` e baixa o modelo pt-BR
(`vosk-model-small-pt-0.3`, ~31 MB) para `python/models/`. Também dá para baixar
pelo próprio painel de configuração, aba **Voz**.

Para o modelo grande (~1,5 GB, bem mais preciso):

```bash
python python/download_model.py --large
```

### Rodar

```bash
npm run desktop
```

Desenvolvimento com hot reload do renderer:

```bash
npm run dev:desktop
```

Gerar o instalador NSIS em `release/`:

```bash
npm run dist
```

O app abre **minimizado na bandeja**. Clique duplo no ícone abre a configuração;
`Ctrl+Shift+Space` (configurável) mostra e esconde o HUD.

### Credenciais

Usuário padrão **Daniel**. A senha é guardada apenas como SHA-256 — o texto puro
não existe em nenhum arquivo do repositório — e se troca na aba **Perfil**.

Vale dizer o óbvio: é uma tranca local e cosmética de um app offline de usuário
único, não uma fronteira de segurança. Não protege nada de um atacante com acesso
à máquina.

### Como prefere ser chamado

Na aba **Perfil**, o campo *Como prefere ser chamado* substitui "Senhor" em toda
fala e todo texto do terminal — "Chefe", "Daniel", "Capitão". A troca acontece num
ponto só (`src/engine/personalize.ts`), aplicado na saída de voz e de texto, então
nenhuma string de comando precisa ser tocada.

### Painel de configuração

Sete abas:

| Aba | O que tem |
| --- | --- |
| **Perfil** | Usuário, tratamento, troca de senha |
| **Voz** | Wake words, microfone, modelo Vosk, confiança mínima, falar respostas |
| **Comportamento** | Autostart, atalho global, tempo do HUD, tema, permissões de sistema |
| **Sites** | CRUD dos sites, com as frases que os disparam |
| **Programas** | CRUD dos programas, com seletor de arquivo |
| **Comandos** | Programe seus próprios comandos: frase → ação |
| **Diagnóstico** | Testar ações, estado do ambiente, restaurar padrões |

### Programar comandos

Na aba **Comandos** você cria comandos próprios — frase falada ou digitada → ação.
Eles têm prioridade sobre os embutidos, então dá para sobrescrever qualquer um.
Tipos de ação: abrir URL, abrir programa, ação de sistema, buscar no Google, ou só
responder.

Exemplo: frases `modo foco, foco total` → abrir URL → resposta *"Modo foco ativado,
Senhor."*

### Comandos de voz nativos

Além dos 12 comandos do terminal, o processo principal resolve sozinho:

- **`abrir <site|programa>`** — casamento fuzzy contra as listas da configuração;
  o que não casar vira busca no Google.
- **Volume**: `aumentar volume`, `diminuir volume`, `mudo`
- **Mídia**: `pausar`, `próxima faixa`, `faixa anterior`
- **Sistema**: `bloquear a tela`, `suspender`, `reiniciar o computador`,
  `desligar o computador`

Ações destrutivas (desligar, reiniciar) vêm **desligadas** e precisam ser liberadas
em *Comportamento → Permissões de sistema*. Um comando mal entendido não deve
conseguir desligar a máquina.

### Reconhecimento tolerante — e por que ele é obrigatório

O modelo pt-BR do Vosk não transcreve ao pé da letra. Medido neste projeto, com voz
sintetizada pelo SAPI do Windows:

| falado | transcrito | conf. |
| --- | --- | --- |
| abrir youtube | abrir **o** youtube | 0,79 |
| bloquear a tela | bloquear a **terra** | 0,84 |
| **jarvis** abrir google | **já vos** abrir google | 0,68 |
| sistema tocar música | sistema tocar música ✅ | 1,00 |
| aumentar volume | aumentar volume ✅ | 1,00 |

Comparação literal descartaria metade disso. Por isso `src/engine/matcher.ts`
normaliza acentos e caixa, remove artigos que o reconhecedor inventa, e compara por
similaridade de Levenshtein. Com ele, os três casos que falhavam passam a resolver
certo.

Duas consequências de projeto:

- **`sistema` é a wake word mais confiável.** "Jarvis" não existe no vocabulário
  pt-BR e sai como "já vos" — o matcher tem uma lista de variantes para cobrir isso,
  mas `sistema` acerta direto.
- **Ações de sistema usam um limiar mais alto (0,82)** que abrir sites (0,72).
  No limiar frouxo, "tocar musica" casava com "voltar musica" (0,77) e virava
  "faixa anterior" em vez de abrir o YouTube Music.

### IA que programa (Ollama local)

O NEXUS gera código em Python, Java, JavaScript, Go, SQL, PowerShell e mais, usando
um modelo rodando **na sua máquina**. Nenhum prompt sai daqui, sem chave de API e
sem custo por uso.

```
programar em python uma função que valida CPF
codar java um jogo da velha no terminal
criar script powershell que limpa a pasta de downloads
```

Por voz funciona igual: *"sistema, programe em python um conversor de moedas"*.

Sem linguagem explícita, assume Python.

#### Instalação

1. Instale o [Ollama](https://ollama.com/download).
2. Baixe um modelo de código:

```bash
ollama pull qwen2.5-coder:3b
```

Ou use o botão **BAIXAR MODELO** em *Configuração → IA*.

### Modo conversa

O que não casa com nenhum comando vira pergunta ao modelo local, em vez de
"comando não reconhecido". A resposta é escrita no terminal e falada.

```
quem foi Santos Dumont
quanto é 15 por cento de 240
me explica o que é uma API
```

Mantém as últimas trocas em memória (configurável), então dá para perguntar em
sequência. A memória vive só no processo — nada é gravado em disco.

Desligue em *Configuração → IA → Modo conversa* se preferir o comportamento
estrito de comandos.

### Dois modelos, de propósito

| Uso | Padrão | Por quê |
| --- | --- | --- |
| Código | `qwen2.5-coder:3b` | Treinado em código; acerta sintaxe |
| Conversa | `llama3.2:3b` | Generalista; muito menos alucinação |

Isso não é excesso de zelo — é resultado de teste. Perguntado *"quem foi Santos
Dumont"*, o `qwen2.5-coder:3b` respondeu com toda a confiança que ele era um
**piloto francês** que criou a **Flyer I**. Ele era brasileiro, e a Flyer I era
dos irmãos Wright. O `llama3.2:3b` acertou.

Modelos de código são ótimos em código e péssimos em fatos. Use cada um no que
ele sabe fazer.

Ainda assim: um modelo de 3B erra. Confira o que importa.

### Ferramentas de linha de comando

Ferramentas cadastradas em *Configuração → Ferramentas* rodam por voz ou texto,
com a saída ao vivo no terminal.

```
sherlock fulano123
ping google.com
meu ip
```

Já vêm registradas: **Sherlock** (procura um nome de usuário em centenas de redes
sociais — `pip install sherlock-project`), **ping**, **ipconfig** e **yt-dlp**
(desativada por padrão).

O `{args}` no campo de argumentos recebe o que você falou depois do nome da
ferramenta.

Uma escolha de projeto: o NEXUS **só executa o que está cadastrado**. O renderer
manda um `id`, nunca uma linha de comando. Um comando de voz mal entendido não
vira execução livre de shell. Ferramentas ausentes do PATH aparecem marcadas como
`NÃO ENCONTRADA` no painel.

Limites: 5 minutos por execução e 200 000 caracteres de saída.

### NEXA — o cérebro do sistema (persona feminina)

Inspirado nas funções de PC do J.A.R.V.I.S., o NEXUS traz uma persona — **NEXA**,
feminina por padrão (voz Maria pt-BR) — e comandos que fazem o papel de "cérebro
do sistema". Só o que é real e seguro num PC; nada de controle de armadura,
overclock automático ou "contra-atacar" invasores (isso é ilegal e fica de fora).

| Comando | O que faz (real) |
| --- | --- |
| `desempenho` / `status do pc` | CPU, RAM, GPU (uso + temperatura), tempo ativo |
| `processos` | Os processos que mais consomem memória |
| `disco` | Espaço livre + saúde S.M.A.R.T. dos discos |
| `bateria` | Carga e estado (avisa se for desktop) |
| `temperatura` | Temperatura de CPU e GPU |
| `inicializacao` | Programas que abrem com o Windows |
| `limpeza` / `limpar sistema` | Apaga temporários e libera espaço (só %TEMP%) |
| `fechar [programa]` | Encerra um processo — protege os críticos do Windows |

Tudo lido via WMI/PowerShell, sem novas dependências. O `fechar` se recusa a
derrubar processos essenciais (svchost, lsass, explorer…) para não travar o
Windows.

**Persona e voz:** o nome da assistente (`NEXA`, `SEXTA-FEIRA`, o que preferir) e o
gênero da voz ficam em *Configuração → Perfil* e *→ Voz*. A voz feminina é a
padrão — o NEXUS escolhe automaticamente uma voz feminina pt-BR (Maria) com timbre
um pouco mais agudo.

**O que NÃO é viável** (e por que não finjo que é): hologramas e realidade
aumentada, controle por gestos/olhar, overclock/undervolt automático, e
"hackeamento reverso" de quem te ataca. Isso é ficção de cinema ou ilegal — o
NEXUS entrega o que um PC real permite de forma segura.

### Aparência da esfera

A esfera tem **6 presets** em *Configuração → Esfera*, com prévia ao vivo:

| Preset | Visual |
| --- | --- |
| **Núcleo** | O padrão — partículas densas, 3 anéis, teia de filamentos |
| **Nebulosa** | Nuvem difusa e brilhante, sem filamentos, 1 anel |
| **Grade** | Menos partículas, teia forte — cara de circuito |
| **Reator** | Brilho e núcleo intensos, anéis rápidos — reator arc |
| **Constelação** | Esparsa, sem anéis, como estrelas |
| **Mínimo** | Leve, para máquinas modestas |

E cinco ajustes finos: densidade de partículas, número de anéis (0–3), brilho,
rotação e tamanho do núcleo, mais o toggle da teia de filamentos. Tudo persistido
e aplicado ao vivo — inclusive no HUD transparente.

### Temas de cor

São **31 temas** — azul elétrico, âmbar, carmesim, esmeralda, violeta, cyber neon,
matrix, plasma e por aí. Troque de três formas:

- o botão de tema na barra superior (cicla para o próximo);
- o comando `tema` (próximo) ou `tema <nome>` (`tema esmeralda`, `tema matrix`);
- a grade de amostras em *Configuração → Comportamento*, com prévia ao vivo.

Os temas são só dados: cada um é um conjunto de tokens escrito nas variáveis CSS
`--c-*`. A interface **e a esfera** leem essas variáveis, então a esfera se
recolore junto — sem uma linha de CSS ou uma paleta embutida por tema. Adicionar
um tema novo é acrescentar uma linha em `src/engine/themes.ts`.

### Verificação de requisitos (preflight)

No app de desktop, antes de entrar, o NEXUS confere os requisitos numa janela do
Sistema: Python 3, dependências de voz (vosk, sounddevice), modelo Vosk, Ollama e
os modelos de IA. O que estiver faltando pode ser **instalado ali mesmo**, um
botão por item — sem sair do NEXUS nem abrir um terminal.

Quando está tudo pronto, ele entra sozinho. Se algo falta, pausa para você
resolver (ou seguir mesmo assim — os itens opcionais não bloqueiam).

### Janela sem moldura

A moldura nativa do Windows dá lugar a uma barra de título no estilo do Sistema —
faixa arrastável, com os controles de minimizar/maximizar/fechar desenhados no
tema. Combina com o resto da interface em vez de destoar.

### Abertura e entrada direta

O NEXUS abre com um **splash** curto (~1,6 s) em vez da sequência de boot longa,
e por padrão **entra direto** com o seu perfil — sem tela de identificação. É um
assistente pessoal de usuário único; a parede de login não faz sentido no uso
diário.

Ambos são ajustáveis em *Configuração → Comportamento*: desligue "Abertura rápida"
para ter a sequência de boot completa, ou "Entrar direto" para exigir a
autenticação com usuário e senha.

### Ações rápidas

Na aba Terminal, uma barra de botões oferece as ações mais comuns com um clique —
Ajuda, Status, Missões, YouTube, Gmail, Música, Programar, Tema, Limpar. Cada
botão dispara o mesmo caminho que falar ou digitar o comando.

### Modo segurança

Em *Configuração → Segurança*, o NEXUS pode registrar um conjunto de ferramentas
de segurança: reconhecimento (nmap, whois, nslookup, traceroute, sherlock,
cabeçalhos HTTP), defesa do próprio sistema (netstat, SFC, Windows Defender, ARP,
hash de arquivo, perfis Wi-Fi, tabela de rotas) e pentest autorizado (nikto,
testssl).

Três coisas importam:

- **É um lançador, não um kit de ataque.** Cada item apenas invoca uma ferramenta
  padrão que você instala por conta própria. Nada é empacotado, e o NEXUS só
  executa o que está no registro — nunca uma linha de comando arbitrária vinda da
  voz.
- **As ferramentas de pentest ficam atrás de um gate.** Você precisa marcar a
  declaração de uso autorizado e ativar o modo segurança; sem isso, elas se
  recusam a rodar.
- **Escopo deliberado.** Reconhecimento, análise e defesa, mais pentest em testes
  autorizados. Ficam de fora — e não entram por configuração — ferramentas de
  negação de serviço, varredura em massa e evasão de detecção.

> Use somente em sistemas seus ou que você tenha autorização explícita e por
> escrito para testar. Acesso ou varredura de sistemas de terceiros sem permissão
> é crime.

Depois de importar, cada ferramenta aparece **desativada** na aba Ferramentas —
você instala e ativa uma a uma. Ferramentas ausentes do PATH aparecem marcadas.

### Abas do painel

O dashboard tem duas abas:

- **Level** — status, atributos, missões diárias e sistema.
- **Terminal** — o terminal ocupando a tela inteira.

O indicador de nível (rank, nível, barra de XP e pontos livres) fica colado no
logo NEXUS, visível nas duas abas.

#### Escolha do modelo

| Modelo | Tamanho | Precisa de |
| --- | --- | --- |
| `qwen2.5-coder:1.5b` | ~1 GB | Qualquer GPU, ou só CPU |
| `qwen2.5-coder:3b` | ~2 GB | **4 GB de VRAM** — o padrão |
| `qwen2.5-coder:7b` | ~4,7 GB | 6–8 GB de VRAM |
| `qwen2.5-coder:14b` | ~9 GB | 12+ GB de VRAM |

O padrão é o 3B porque cabe inteiro em placas de 4 GB. Um 7B numa placa de 4 GB
transborda para a RAM e a geração fica lenta demais para uso por voz.

**Velocidade medida** numa GTX 1050 Ti (4 GB), com `qwen2.5-coder:3b` inteiro na
GPU: **~10 tokens/s**. Na prática, um trecho curto sai em ~20 s e uma função com
exemplo de uso em ~60–90 s. Reduzir a janela de contexto quase não muda isso
(9,8 tok/s em 2048 contra 10,2 em 1024) — o limite é a placa, não o contexto.
Numa GPU moderna esses números sobem várias vezes.

Seja realista com o que um modelo local pequeno entrega: ele escreve bem funções,
scripts e exercícios. Não espere dele arquitetura de projeto ou código de produção.

#### Saída

Em *Configuração → IA* você decide o que acontece com o código:

- **Terminal** — sempre. O código aparece em streaming, com botão de copiar.
- **Salvar em arquivo** — grava em `Documentos\NEXUS` (ou na pasta que escolher),
  com a extensão certa. Em Java, o arquivo recebe o nome da classe pública.
- **Abrir no editor** — abre no VS Code (ou no comando que configurar).
- **Executar** — roda e mostra a saída, com timeout.

#### Sobre executar código gerado

A execução vem **desligada** e assim deve ficar até você confiar no fluxo.
Código escrito por um LLM pode apagar arquivos, abrir conexões ou entrar em laço
infinito — não porque seja malicioso, mas porque ele erra. Leia antes de rodar.

Quando ligada, o NEXUS ainda protege: timeout configurável (20 s por padrão),
saída truncada em 20 000 caracteres, e o processo roda na pasta de projetos, não
na raiz do sistema. Isso reduz o estrago, não elimina.

Linguagens que o NEXUS executa: Python, Java (arquivo único, Java 11+),
JavaScript, Go e PowerShell. As outras são geradas e salvas, mas não executadas —
compilar C#, C++ ou Rust exige toolchain que nem toda máquina tem.

#### Se o disco C: estiver cheio

O Ollama instala em `%LOCALAPPDATA%` e guarda os modelos em `%USERPROFILE%\.ollama`
— os dois em C:, e juntos passam de 3 GB. Para jogar tudo em outro disco:

```bash
setx OLLAMA_MODELS D:\Ollama\models
```

E instale com `OllamaSetup.exe /DIR=D:\Ollama\app`.

---

### Arquitetura do desktop

```
electron/
  main.ts        bandeja, atalho global, janelas, IPC, autostart
  preload.ts     contextBridge — o renderer nunca vê ipcRenderer nem Node
  config.ts      persistência em userData/nexus-config.json
  actions.ts     executor: URLs, programas, teclas de mídia, energia
  resolver.ts    frase falada -> ação, usando a config e o matcher
  voice.ts       supervisiona o daemon Python, religa com backoff
python/
  nexus_voice.py     captura o mic e transcreve; uma linha JSON por evento
  download_model.py  baixa o modelo pt-BR
  selftest.py        transcreve arquivos WAV (testar sem microfone)
```

O daemon emite JSON por linha no stdout; o processo principal aplica wake word e
limiar de confiança, resolve o que consegue executar, e encaminha o resto ao
renderer, que tem os comandos conversacionais. Não há lógica de comando duplicada
entre os dois lados.

O HUD é uma janela transparente, sem foco e sempre no topo, com
`setIgnoreMouseEvents` — os cliques atravessam, ela nunca bloqueia o que está
atrás. O mesmo bundle serve as duas caras via `?mode=hud`.

### Diagnóstico

```bash
npm run voice:devices
```

Lista os microfones que o daemon enxerga. Sem nenhum dispositivo de entrada, o
daemon sai com código 2 e o supervisor **não** tenta religar — a bandeja e o HUD
mostram `SEM MICROFONE`.

Para testar o reconhecimento sem microfone, transcreva arquivos WAV (PCM 16 bits
mono):

```bash
python python/selftest.py meu_audio.wav
```

Códigos de saída do daemon: `2` sem microfone, `3` sem modelo — os dois são
definitivos e não disparam reconexão.

---

## Notas de performance

- `devicePixelRatio` respeitado, com teto em 2×.
- Densidade de partículas por viewport: 420 (&lt;480 px) · 600 (&lt;768 px) · 900 (&lt;1280 px) · 1100 (acima).
- Se o FPS médio cair abaixo de 40, o motor reduz a contagem em ~28% (até 3 vezes, piso de 260).
- Os filamentos entre partículas são calculados **uma vez**: a esfera é rígida, então a
  vizinhança 3D não muda com a rotação — só a projeção. As linhas são agrupadas em 4
  faixas de profundidade para virar 4 `stroke()` por frame em vez de milhares.
- `ResizeObserver` para redimensionamento e `destroy()` cancelando o `rAF` no unmount.
