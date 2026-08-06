# Guia: GitHub, versão e auto-update do NEXUS

Escrito para quem **nunca fez isso à mão**. Siga na ordem. Cada bloco de comando
você cola no terminal (PowerShell), dentro da pasta `D:\jarvis`.

---

## Parte 0 — Os conceitos em 1 minuto

- **Git** é um "histórico com desfazer" do seu código. Cada foto do projeto é um
  **commit**. Já criei o primeiro para você.
- **GitHub** é onde esse histórico fica hospedado na internet (um **repositório**).
- **Versão** (ex.: `1.0.0`) é um número que cresce a cada lançamento. Segue o
  padrão **SemVer**: `MAIOR.MENOR.CORREÇÃO`
  - `1.0.0 → 1.0.1` = correção de bug
  - `1.0.1 → 1.1.0` = recurso novo
  - `1.1.0 → 2.0.0` = mudança grande/incompatível
- **Release** é um lançamento publicado no GitHub, com o instalador anexado. O
  **auto-update** do app olha para a última release e se atualiza sozinho.

> Você **não precisa** entender git a fundo. Precisa de 4 comandos, que estão aqui.

---

## Parte 1 — Criar o repositório no GitHub (uma vez só)

Eu **não posso** fazer isso por você porque exige entrar na sua conta. É rápido:

1. Entre em **https://github.com/new**
2. **Repository name:** `nexus-jarvis`
   (se usar outro nome, veja a Parte 5 para ajustar)
3. Deixe **Public** ou **Private** — os dois funcionam.
4. **NÃO** marque "Add a README" nem ".gitignore" (o projeto já tem os seus).
5. Clique em **Create repository**.

O GitHub vai mostrar uma URL tipo `https://github.com/Daizen-Creator/nexus-jarvis.git`.
Guarde ela.

---

## Parte 2 — Enviar o código (a primeira vez)

Cole isto, trocando a URL se o seu usuário/nome for diferente:

```bash
git remote add origin https://github.com/Daizen-Creator/nexus-jarvis.git
git push -u origin main
```

Na primeira vez o Git vai pedir para você **fazer login no GitHub** (abre uma
janela do navegador). Isso é normal e seguro — é a sua conta, na sua máquina.

Pronto: seu código está no GitHub. Da próxima vez que mudar algo, são só três
comandos (Parte 4).

---

## Parte 3 — Publicar uma versão com instalador (release + auto-update)

Para o auto-update funcionar, o GitHub precisa de uma **release** com o instalador.
O `electron-builder` faz isso sozinho — mas precisa de um **token** do GitHub para
ter permissão de publicar.

### 3.1 — Criar o token (uma vez)

1. Vá em **https://github.com/settings/tokens** → **Generate new token** →
   **classic**.
2. Nome: `nexus-release`. Marque a permissão **`repo`** (a caixa inteira).
3. Gere e **copie** o token (começa com `ghp_...`). Você só vê uma vez.

### 3.2 — Publicar

Cole (trocando pelo seu token). O token fica só nesta janela, não é gravado:

```bash
$env:GH_TOKEN="ghp_SEU_TOKEN_AQUI"
npm run release
```

Isso compila, gera o instalador e cria a **release** no GitHub automaticamente
com os arquivos `NEXUS Setup x.y.z.exe` e o `latest.yml` (o arquivo que o
auto-update lê).

> A partir daqui, quem tiver o app instalado recebe a atualização sozinho.

---

## Parte 4 — O dia a dia (depois que já está tudo montado)

Mudou alguma coisa no código? Salve no histórico e envie:

```bash
git add .
git commit -m "descreva o que mudou"
git push
```

Quer **lançar uma nova versão** (para os usuários atualizarem)?

```bash
npm version patch
git push --follow-tags
$env:GH_TOKEN="ghp_SEU_TOKEN_AQUI"
npm run release
```

- `npm version patch` sobe `1.0.0 → 1.0.1` **e** cria um commit + tag sozinho.
  - Use `npm version minor` para recurso novo (`1.1.0`).
  - Use `npm version major` para mudança grande (`2.0.0`).

É só isso. O app dos usuários vai detectar a versão nova, baixar em segundo plano
e mostrar **"Pronta — reiniciar e instalar"**.

---

## Parte 5 — Se você usou outro nome de repositório

Abra `package.json`, ache o bloco `"publish"` e troque `owner` (seu usuário
GitHub) e `repo` (o nome que você deu):

```json
"publish": [
  { "provider": "github", "owner": "SEU-USUARIO", "repo": "SEU-REPO" }
]
```

Depois `git add . && git commit -m "ajusta publish" && git push`.

---

## Como o auto-update funciona por dentro

1. Ao abrir (só no app **instalado**, não em desenvolvimento), o
   `electron-updater` pergunta ao GitHub qual é a última release.
2. Compara com a versão instalada (a do `package.json`).
3. Se a de lá for maior, **baixa em segundo plano**.
4. Emite eventos que o NEXUS mostra no canto: *Verificando → Baixando X% →
   Pronta*.
5. Você clica em **Reiniciar e instalar** e ele troca a versão.

O código disso está em:
- `electron/updater.ts` — a lógica (checar, baixar, instalar).
- `src/components/UpdateSplash.tsx` — o aviso visual.
- `package.json → build.publish` — para onde ele olha.

Nada de servidor próprio, nada de custo: o GitHub Releases é a "loja" de updates.

---

## Gerar o instalador personalizado (.exe)

O NEXUS tem um instalador com tema próprio (arte em `build/`, cores e textos do
Sistema). Para gerá-lo:

```bash
npm run dist
```

O `.exe` sai em `release/NEXUS-Setup-1.0.0.exe`.

### Se der erro "Cannot create symbolic link"

O Windows bloqueia links simbólicos sem permissão. É **uma vez só** — escolha um:

**Opção 1 (recomendada): ligar o Modo de Desenvolvedor**
Configurações → Privacidade e segurança → Para desenvolvedores → **Modo de
desenvolvedor: Ativado**. Depois rode `npm run dist` de novo.

**Opção 2: rodar como administrador**
Abra o PowerShell com botão direito → *Executar como administrador*, vá até
`D:\jarvis` e rode `npm run dist`.

Para regerar a arte do instalador (se quiser mudar):

```bash
powershell -File scripts\make-installer-assets.ps1
```

## Erros comuns

| Sintoma | Causa / solução |
| --- | --- |
| `git push` pede login toda vez | Instale o **Git Credential Manager** (vem com o Git novo) — ele lembra o login após a 1ª vez. |
| `npm run release` diz "GH_TOKEN not set" | Você esqueceu o `$env:GH_TOKEN="..."` antes. |
| Release cria, mas o app não atualiza | O app precisa estar **instalado** (não rodando por `npm run desktop`). Auto-update não roda em dev. |
| "403" ao publicar | O token não tem a permissão `repo`, ou expirou. Gere outro. |
| Repositório privado | Funciona, mas o token é obrigatório para o app baixar o update. |
