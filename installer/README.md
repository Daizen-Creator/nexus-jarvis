# Instalador próprio do NEXUS (janela preta e temática)

Um instalador que **É** uma janela do NEXUS — preto, com o reator e a barra de
progresso temática — em vez do assistente branco do Windows.

Instala **por usuário** (`%LOCALAPPDATA%\Programs\NEXUS`), então **não exige
administrador**. Ele faz, por conta própria, tudo que o instalador do Windows faz:

1. Copia os arquivos do NEXUS para a pasta de instalação.
2. Cria atalhos no Menu Iniciar e na Área de trabalho.
3. Registra no Windows (aparece em "Adicionar ou remover programas").
4. Gera um desinstalador (`desinstalar.cmd`) e a chave de desinstalação.

## Como está montado

| Arquivo | Papel |
| --- | --- |
| `main.js` | processo Electron: copia arquivos, cria atalhos, registra, desinstala |
| `preload.js` | ponte segura entre a janela e o main |
| `ui.html` | a janela preta temática (reator, progresso, botões) |
| `package.json` | config do electron-builder (alvo `portable`) |

O instalador **empacota** a build `release/win-unpacked` do NEXUS como recurso
(`app-payload`) e a copia na instalação.

## Como gerar (fluxo)

```bash
# 1. gerar a build do NEXUS (cria release/win-unpacked)
cd D:\jarvis
npm run build && npm run build:electron
npx electron-builder --win dir --publish never   # só a pasta, sem instalador NSIS

# 2. gerar o instalador próprio
cd installer
npm install          # instala electron + electron-builder locais do instalador
npm run dist         # gera ../release-installer/NEXUS-Installer-1.0.0.exe
```

O resultado é **um único `.exe`** que, ao abrir, mostra a janela preta e instala.

## Como testar (antes de confiar)

1. Rode `npm start` na pasta `installer/` para ver a **janela** (em dev ele usa a
   `release/win-unpacked`).
2. Clique em INSTALAR e confira:
   - a pasta `%LOCALAPPDATA%\Programs\NEXUS` foi criada com os arquivos;
   - o atalho apareceu na Área de trabalho e no Menu Iniciar;
   - o NEXUS aparece em "Adicionar ou remover programas";
   - o `desinstalar.cmd` remove tudo.

## PENDENTE (continuar na próxima sessão)

- [ ] Rodar `npm install` dentro de `installer/` (baixa o Electron do instalador).
- [ ] Gerar a build `win-unpacked` do NEXUS.
- [ ] `npm run dist` para gerar o `.exe` do instalador.
- [ ] **Testar de verdade:** instalar, abrir, e desinstalar — confirmar que limpa
      tudo.
- [ ] Ajustar o tamanho do `.exe` (ele carrega o Electron do instalador + o app;
      pode passar de 400 MB — avaliar se compensa vs o NSIS).
- [ ] Opcional: publicar como asset separado na release do GitHub.

> O instalador NSIS atual (`npm run dist` na raiz) **continua funcionando** — este
> instalador próprio é uma alternativa, não um substituto. Nada foi quebrado.
