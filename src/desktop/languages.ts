import type { CodeLanguage } from '../types/desktop';

/**
 * Linguagens que o NEXUS sabe gerar, salvar e executar.
 *
 * `run` descreve como rodar o arquivo; `{file}` é substituído pelo caminho
 * completo. `null` significa que a linguagem é gerada e salva, mas não
 * executada — compilar C# ou Rust exige toolchain que nem toda máquina tem.
 */
export const LANGUAGES: CodeLanguage[] = [
  {
    id: 'python',
    label: 'Python',
    extension: 'py',
    phrases: ['python', 'piton', 'py'],
    run: { command: 'python', args: ['{file}'] },
  },
  {
    id: 'java',
    label: 'Java',
    extension: 'java',
    phrases: ['java', 'javar'],
    // Java 11+ roda um arquivo único direto, sem javac.
    run: { command: 'java', args: ['{file}'] },
  },
  {
    id: 'javascript',
    label: 'JavaScript',
    extension: 'mjs',
    phrases: ['javascript', 'java script', 'js', 'node'],
    run: { command: 'node', args: ['{file}'] },
  },
  {
    id: 'typescript',
    label: 'TypeScript',
    extension: 'ts',
    phrases: ['typescript', 'type script', 'ts'],
    run: null,
  },
  {
    id: 'csharp',
    label: 'C#',
    extension: 'cs',
    phrases: ['c sharp', 'csharp', 'c#'],
    run: null,
  },
  {
    id: 'cpp',
    label: 'C++',
    extension: 'cpp',
    phrases: ['c mais mais', 'cpp', 'c plus plus'],
    run: null,
  },
  {
    id: 'go',
    label: 'Go',
    extension: 'go',
    phrases: ['go', 'golang'],
    run: { command: 'go', args: ['run', '{file}'] },
  },
  {
    id: 'rust',
    label: 'Rust',
    extension: 'rs',
    phrases: ['rust', 'haste'],
    run: null,
  },
  {
    id: 'sql',
    label: 'SQL',
    extension: 'sql',
    phrases: ['sql', 'esquiel', 'banco de dados'],
    run: null,
  },
  {
    id: 'bash',
    label: 'Shell',
    extension: 'sh',
    phrases: ['bash', 'shell', 'script de shell'],
    run: null,
  },
  {
    id: 'powershell',
    label: 'PowerShell',
    extension: 'ps1',
    phrases: ['powershell', 'power shell'],
    run: { command: 'powershell.exe', args: ['-NoProfile', '-File', '{file}'] },
  },
  {
    id: 'html',
    label: 'HTML',
    extension: 'html',
    phrases: ['html', 'pagina web', 'página web'],
    run: null,
  },
];

export const languageById = (id: string): CodeLanguage | undefined =>
  LANGUAGES.find((l) => l.id === id);

/** Nome de arquivo seguro a partir da descrição pedida. */
export const suggestFileName = (language: CodeLanguage, prompt: string, code: string): string => {
  // Java exige que o arquivo tenha o nome da classe pública.
  if (language.id === 'java') {
    const match = code.match(/public\s+(?:final\s+)?class\s+([A-Za-z_]\w*)/);
    if (match) return `${match[1]}.java`;
  }

  const slug = prompt
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);

  const base = slug.length > 0 ? slug : 'nexus_gerado';
  return `${base}.${language.extension}`;
};
