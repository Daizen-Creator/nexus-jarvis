import type { CliTool, NexusConfig, SphereDesign } from '../types/desktop';

export const CONFIG_VERSION = 3;

interface PresetDef extends Omit<SphereDesign, 'preset'> {
  label: string;
  /** Tema sugerido ao escolher o preset (opcional). */
  theme?: string;
}

/** Presets de aparência da esfera. Cada um dá um "visual" bem distinto. */
export const SPHERE_PRESETS: Record<string, PresetDef> = {
  // Holograma dourado no estilo J.A.R.V.I.S.: denso, raios radiais, incandescente.
  hologram: { label: 'J.A.R.V.I.S.', density: 1.6, rings: 3, filaments: true, radial: true, glow: 1.55, speed: 0.9, coreSize: 1.35, theme: 'stark' },
  nucleo: { label: 'Núcleo', density: 1, rings: 3, filaments: true, radial: false, glow: 1, speed: 1, coreSize: 1 },
  nebulosa: { label: 'Nebulosa', density: 1.5, rings: 1, filaments: false, radial: false, glow: 1.35, speed: 0.7, coreSize: 1.25 },
  grade: { label: 'Grade', density: 0.7, rings: 2, filaments: true, radial: true, glow: 0.85, speed: 0.8, coreSize: 0.85 },
  reator: { label: 'Reator', density: 0.85, rings: 3, filaments: true, radial: false, glow: 1.5, speed: 1.5, coreSize: 1.4, theme: 'amber' },
  constelacao: { label: 'Constelação', density: 0.55, rings: 0, filaments: true, radial: true, glow: 1.15, speed: 0.6, coreSize: 0.9 },
  minimo: { label: 'Mínimo', density: 0.5, rings: 1, filaments: false, radial: false, glow: 0.7, speed: 0.6, coreSize: 0.8 },
};

/** Tema sugerido por um preset, se houver. */
export const presetTheme = (preset: string): string | undefined => SPHERE_PRESETS[preset]?.theme;

export const sphereFromPreset = (preset: string): SphereDesign => {
  const p = SPHERE_PRESETS[preset] ?? SPHERE_PRESETS.nucleo;
  return {
    preset: SPHERE_PRESETS[preset] ? preset : 'nucleo',
    density: p.density,
    rings: p.rings,
    filaments: p.filaments,
    radial: p.radial,
    glow: p.glow,
    speed: p.speed,
    coreSize: p.coreSize,
  };
};

/**
 * Senha padrão gravada como SHA-256 de um valor definido pelo dono do app.
 * O texto puro não existe em nenhum arquivo do repositório, e pode ser trocado
 * no painel de configuração.
 *
 * Dito o óbvio: isto é uma tranca local e cosmética de um app offline de
 * usuário único — não é uma fronteira de segurança.
 */
export const DEFAULT_PASSWORD_HASH =
  '94c6e070eeb4dae5775ab2f8e292199d4afca0f36f875a48ae1c955a6a67e327';

const id = (prefix: string, n: number): string => `${prefix}-${n}`;

export const defaultConfig = (): NexusConfig => ({
  version: CONFIG_VERSION,
  profile: {
    userName: 'Daniel',
    address: 'Senhor',
    passwordHash: DEFAULT_PASSWORD_HASH,
    assistantName: 'NEXA',
  },
  voice: {
    enabled: true,
    // "sistema" é reconhecido com confiança 1,00 pelo modelo pt-BR do Vosk.
    // "jarvis" não existe no vocabulário e sai como "já vos" — o matcher cobre
    // as variantes, mas por isso "sistema" vem primeiro.
    wakeWords: ['sistema', 'jarvis', 'nexus'],
    // Desligado por padrão: falar já executa. Ligue para exigir "sistema ..."
    // antes de cada comando (útil na escuta contínua em segundo plano).
    requireWakeWord: false,
    deviceIndex: null,
    modelPath: null,
    minConfidence: 0.45,
    speakResponses: true,
    voiceGender: 'female',
    // Mais rápido e tom natural — as vozes offline do Windows soam robóticas
    // quando lentas ou com pitch alterado.
    voiceRate: 1.18,
    voicePitch: 1.0,
  },
  behavior: {
    autostart: false,
    // Vale só para o início automático com o Windows; abrir na mão sempre mostra.
    startMinimized: true,
    hudTimeoutMs: 6000,
    globalShortcut: 'Control+Shift+Space',
    showHudOnWake: true,
    soundEnabled: true,
    theme: 'stark',
    splash: true,
    // Assistente pessoal: entra direto e conversa, sem tela de identificação.
    skipLogin: true,
  },
  sphere: sphereFromPreset('hologram'),
  ai: {
    enabled: true,
    baseUrl: 'http://127.0.0.1:11434',
    // 3B cabe inteiro em 4 GB de VRAM. O 7B é melhor, mas transborda para a RAM
    // em placas pequenas e a geração fica lenta demais para uso por voz.
    model: 'qwen2.5-coder:3b',
    // Generalista para conversa: o coder alucina em conhecimento geral.
    chatModel: 'llama3.2:3b',
    temperature: 0.2,
    maxTokens: 1400,
    contextSize: 2048,
    projectsDir: '',
    editorCommand: 'code',
    saveToFile: true,
    openInEditor: true,
    // Executar código gerado por um LLM sem ler antes é o caminho mais curto
    // para estragar alguma coisa. Fica atrás de um interruptor consciente.
    allowExecute: false,
    executeTimeoutSec: 20,
    conversational: true,
    historyTurns: 6,
  },
  guards: {
    allowShutdown: false,
    allowRestart: false,
    allowSleep: true,
    allowLock: true,
    allowApps: true,
    allowSecurity: false,
    securityAckAt: 0,
  },
  sites: [
    { id: id('site', 1), name: 'YouTube', phrases: ['youtube', 'you tube'], url: 'https://www.youtube.com' },
    { id: id('site', 2), name: 'Google', phrases: ['google'], url: 'https://www.google.com' },
    { id: id('site', 3), name: 'Gmail', phrases: ['gmail', 'email', 'e-mail'], url: 'https://mail.google.com' },
    { id: id('site', 4), name: 'GitHub', phrases: ['github', 'git hub'], url: 'https://github.com' },
    { id: id('site', 5), name: 'WhatsApp', phrases: ['whatsapp', 'whats app', 'zap'], url: 'https://web.whatsapp.com' },
    { id: id('site', 6), name: 'ChatGPT', phrases: ['chatgpt', 'chat gpt'], url: 'https://chat.openai.com' },
    { id: id('site', 7), name: 'Spotify', phrases: ['spotify'], url: 'https://open.spotify.com' },
    { id: id('site', 8), name: 'Netflix', phrases: ['netflix'], url: 'https://www.netflix.com' },
    { id: id('site', 9), name: 'Google Maps', phrases: ['maps', 'mapa', 'mapas'], url: 'https://maps.google.com' },
    { id: id('site', 10), name: 'Google Drive', phrases: ['drive'], url: 'https://drive.google.com' },
    {
      id: id('site', 11),
      name: 'YouTube Music',
      phrases: ['musica', 'música', 'youtube music', 'tocar musica', 'tocar música', 'colocar musica'],
      url: 'https://music.youtube.com',
    },
  ],
  apps: [
    { id: id('app', 1), name: 'Bloco de Notas', phrases: ['bloco de notas', 'notepad'], path: 'notepad.exe', args: [] },
    { id: id('app', 2), name: 'Calculadora', phrases: ['calculadora', 'calculator'], path: 'calc.exe', args: [] },
    { id: id('app', 3), name: 'Explorador de Arquivos', phrases: ['explorador', 'arquivos', 'explorer'], path: 'explorer.exe', args: [] },
    { id: id('app', 4), name: 'Prompt de Comando', phrases: ['prompt', 'terminal', 'cmd'], path: 'cmd.exe', args: [] },
    { id: id('app', 5), name: 'Configurações do Windows', phrases: ['configuracoes do windows'], path: 'ms-settings:', args: [] },
    { id: id('app', 6), name: 'Gerenciador de Tarefas', phrases: ['gerenciador de tarefas'], path: 'taskmgr.exe', args: [] },
    { id: id('app', 7), name: 'Paint', phrases: ['paint'], path: 'mspaint.exe', args: [] },
  ],
  tools: [
    {
      id: id('tool', 1),
      name: 'Sherlock',
      phrases: ['sherlock', 'xerloque', 'char lock', 'procurar usuario', 'caçar usuário'],
      command: 'sherlock',
      args: ['{args}'],
      description: 'Procura um nome de usuário em centenas de redes sociais.',
      install: 'pip install sherlock-project',
      category: 'recon',
      enabled: true,
    },
    {
      id: id('tool', 2),
      name: 'Ping',
      phrases: ['ping', 'pingar', 'testar conexao'],
      command: 'ping',
      args: ['-n', '4', '{args}'],
      description: 'Testa a conectividade com um host.',
      category: 'geral',
      enabled: true,
    },
    {
      id: id('tool', 3),
      name: 'IP',
      phrases: ['ipconfig', 'meu ip', 'configuracao de rede'],
      command: 'ipconfig',
      args: [],
      description: 'Mostra a configuração de rede.',
      category: 'geral',
      enabled: true,
    },
    {
      id: id('tool', 4),
      name: 'yt-dlp',
      phrases: ['baixar video', 'yt-dlp', 'youtube dl'],
      command: 'yt-dlp',
      args: ['{args}'],
      description: 'Baixa vídeos.',
      install: 'pip install yt-dlp',
      category: 'geral',
      enabled: false,
    },
  ],
  customCommands: [],
});

/* ------------------------------------------------------------------ */
/* Modo segurança — arsenal opcional                                   */
/* ------------------------------------------------------------------ */

/**
 * Ferramentas de segurança que o usuário pode importar para o registro.
 *
 * Isto é um LANÇADOR, não um kit de ataque: cada item apenas invoca uma
 * ferramenta padrão que você instala por conta própria. Nada aqui é empacotado,
 * e nenhuma linha de comando arbitrária é executada — só o que está registrado.
 *
 * O escopo é deliberado: reconhecimento, análise e defesa, além de ferramentas
 * de pentest usadas em testes AUTORIZADOS. Ficam de fora, por decisão de
 * projeto, ferramentas de negação de serviço, varredura em massa e evasão de
 * detecção — essas não entram independentemente de configuração.
 *
 * Use somente em sistemas seus ou que você tenha autorização explícita e por
 * escrito para testar. Acesso não autorizado é crime.
 */
export const SECURITY_TOOLS: Omit<CliTool, 'id'>[] = [
  // ---- Reconhecimento / OSINT ----
  {
    name: 'Nmap',
    phrases: ['nmap', 'escanear portas', 'scan de portas', 'mapear rede'],
    command: 'nmap',
    args: ['{args}'],
    description: 'Descoberta de hosts e varredura de portas/serviços.',
    install: 'https://nmap.org/download.html  (ou: winget install Insecure.Nmap)',
    category: 'recon',
    enabled: false,
  },
  {
    name: 'WHOIS',
    phrases: ['whois', 'quem e o dono do dominio', 'registro de dominio'],
    command: 'whois',
    args: ['{args}'],
    description: 'Consulta o registro de um domínio ou IP.',
    install: 'winget install --id GnuWin32.Whois  (ou use nslookup)',
    category: 'recon',
    enabled: false,
  },
  {
    name: 'DNS lookup',
    phrases: ['nslookup', 'dns', 'resolver dominio'],
    command: 'nslookup',
    args: ['{args}'],
    description: 'Resolve nomes e consulta registros DNS. Vem com o Windows.',
    category: 'recon',
    enabled: false,
  },
  {
    name: 'Traceroute',
    phrases: ['tracert', 'traceroute', 'rota ate o host'],
    command: 'tracert',
    args: ['{args}'],
    description: 'Mostra o caminho de rede até um host. Vem com o Windows.',
    category: 'recon',
    enabled: false,
  },
  // ---- Defesa / análise do próprio sistema ----
  {
    name: 'Conexões abertas',
    phrases: ['netstat', 'conexoes abertas', 'portas em uso', 'quem esta conectado'],
    command: 'netstat',
    args: ['-ano'],
    description: 'Lista as conexões e portas em uso NA SUA máquina. Vem com o Windows.',
    category: 'defesa',
    enabled: false,
  },
  {
    name: 'Verificação do sistema (SFC)',
    phrases: ['verificar sistema', 'sfc', 'checar arquivos do sistema'],
    command: 'sfc',
    args: ['/scannow'],
    description: 'Verifica a integridade dos arquivos do Windows. Vem com o Windows.',
    category: 'defesa',
    enabled: false,
  },
  {
    name: 'Antivírus (Defender)',
    phrases: ['escanear virus', 'antivirus', 'defender scan', 'verificar ameacas'],
    command: 'powershell',
    args: ['-NoProfile', '-Command', 'Start-MpScan -ScanType QuickScan'],
    description: 'Dispara uma varredura rápida do Windows Defender NA SUA máquina.',
    category: 'defesa',
    enabled: false,
  },
  {
    name: 'ARP (vizinhança de rede)',
    phrases: ['arp', 'vizinhos de rede', 'tabela arp'],
    command: 'arp',
    args: ['-a'],
    description: 'Mostra os dispositivos vistos na sua rede local. Vem com o Windows.',
    category: 'defesa',
    enabled: false,
  },
  {
    name: 'Cabeçalhos HTTP',
    phrases: ['cabecalhos http', 'headers do site', 'curl headers', 'ver cabecalhos'],
    command: 'curl',
    args: ['-sSIL', '{args}'],
    description: 'Mostra os cabeçalhos de resposta HTTP de um site. Vem com o Windows 10+.',
    category: 'recon',
    enabled: false,
  },
  {
    name: 'Hash de arquivo',
    phrases: ['hash do arquivo', 'checksum', 'certutil hash', 'verificar arquivo'],
    command: 'certutil',
    args: ['-hashfile', '{args}', 'SHA256'],
    description: 'Calcula o SHA-256 de um arquivo (forense/integridade). Vem com o Windows.',
    category: 'defesa',
    enabled: false,
  },
  {
    name: 'Perfis Wi-Fi',
    phrases: ['perfis wifi', 'redes salvas', 'netsh wlan'],
    command: 'netsh',
    args: ['wlan', 'show', 'profiles'],
    description: 'Lista as redes Wi-Fi salvas NA SUA máquina. Vem com o Windows.',
    category: 'defesa',
    enabled: false,
  },
  {
    name: 'Tabela de rotas',
    phrases: ['tabela de rotas', 'route print', 'rotas de rede'],
    command: 'route',
    args: ['print'],
    description: 'Mostra a tabela de roteamento da sua máquina. Vem com o Windows.',
    category: 'defesa',
    enabled: false,
  },
  // ---- Pentest autorizado ----
  {
    name: 'Nikto',
    phrases: ['nikto', 'scan de servidor web', 'auditar site'],
    command: 'nikto',
    args: ['-h', '{args}'],
    description: 'Varredura de vulnerabilidades conhecidas em servidores web.',
    install: 'perl; veja github.com/sullo/nikto',
    category: 'ataque',
    enabled: false,
  },
  {
    name: 'testssl',
    phrases: ['testssl', 'testar ssl', 'auditar certificado'],
    command: 'testssl',
    args: ['{args}'],
    description: 'Audita a configuração TLS/SSL de um serviço.',
    install: 'github.com/drwetter/testssl.sh',
    category: 'ataque',
    enabled: false,
  },
];

/** Mescla o salvo por cima do padrão, para configs antigas não quebrarem. */
export const mergeConfig = (saved: Partial<NexusConfig>): NexusConfig => {
  const base = defaultConfig();
  const voice = { ...base.voice, ...(saved.voice ?? {}) };
  const behavior = { ...base.behavior, ...(saved.behavior ?? {}) };
  let sphere = { ...base.sphere, ...(saved.sphere ?? {}) };
  const savedVersion = saved.version ?? 1;

  // Migração v1 → v2: a wake word deixou de ser exigida por padrão.
  if (savedVersion < 2) {
    voice.requireWakeWord = false;
  }

  // Migração v2 → v3: aplica o visual "J.A.R.V.I.S." (esfera dourada com raios)
  // uma única vez, deixando o resto da configuração intacto.
  if (savedVersion < 3) {
    sphere = sphereFromPreset('hologram');
    behavior.theme = 'stark';
  }

  return {
    version: CONFIG_VERSION,
    profile: { ...base.profile, ...(saved.profile ?? {}) },
    voice,
    behavior,
    sphere,
    guards: { ...base.guards, ...(saved.guards ?? {}) },
    ai: { ...base.ai, ...(saved.ai ?? {}) },
    sites: Array.isArray(saved.sites) ? saved.sites : base.sites,
    apps: Array.isArray(saved.apps) ? saved.apps : base.apps,
    tools: Array.isArray(saved.tools) ? saved.tools : base.tools,
    customCommands: Array.isArray(saved.customCommands) ? saved.customCommands : base.customCommands,
  };
};
