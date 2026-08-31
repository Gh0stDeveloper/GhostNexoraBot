export type CodeLanguage = string

export type CodeSegment =
  | { type: 'text'; content: string }
  | { type: 'code'; content: string; language: CodeLanguage }

const FENCED_BLOCK_RE = /```([^\n`]*)\n([\s\S]*?)```/g

function normalizeLanguage(raw: string): string {
  const value = raw.trim().toLowerCase()
  if (!value) return 'text'

  const aliases: Record<string, string> = {
    ts: 'typescript',
    typescript: 'typescript',
    js: 'javascript',
    javascript: 'javascript',
    jsx: 'javascript',
    tsx: 'typescript',
    py: 'python',
    python3: 'python',
    sh: 'bash',
    shell: 'bash',
    zsh: 'bash',
    yml: 'yaml',
    md: 'markdown',
    jsonc: 'json',
    ps1: 'powershell',
    ps: 'powershell',
    text: 'plaintext',
    txt: 'plaintext',
  }

  const firstToken = value.split(/\s+/)[0] ?? value
  return aliases[firstToken] ?? firstToken
}

export function parseCodeBlocks(markdown: string): CodeSegment[] {
  const input = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const segments: CodeSegment[] = []
  let cursor = 0
  let match: RegExpExecArray | null

  FENCED_BLOCK_RE.lastIndex = 0
  while ((match = FENCED_BLOCK_RE.exec(input)) !== null) {
    const [whole, language, code] = match
    const start = match.index

    if (start > cursor) {
      segments.push({ type: 'text', content: input.slice(cursor, start) })
    }

    segments.push({
      type: 'code',
      content: code.replace(/^\n/, '').replace(/\n$/, ''),
      language: normalizeLanguage(language),
    })

    cursor = start + whole.length
  }

  if (cursor < input.length) {
    segments.push({ type: 'text', content: input.slice(cursor) })
  }

  return segments.length ? segments : [{ type: 'text', content: input }]
}

export function languageLabel(language: string): string {
  const labels: Record<string, string> = {
    typescript: 'TypeScript',
    javascript: 'JavaScript',
    python: 'Python',
    bash: 'Bash',
    shell: 'Shell',
    sql: 'SQL',
    json: 'JSON',
    yaml: 'YAML',
    html: 'HTML',
    css: 'CSS',
    java: 'Java',
    kotlin: 'Kotlin',
    php: 'PHP',
    c: 'C',
    cpp: 'C++',
    csharp: 'C#',
    go: 'Go',
    rust: 'Rust',
    markdown: 'Markdown',
    plaintext: 'Texto',
    text: 'Texto',
  }

  return labels[language.toLowerCase()] ?? (language ? language.replace(/[-_]/g, ' ') : 'Código')
}

export function summarizeCode(code: string, maxLines = 3): string {
  return code
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .slice(0, maxLines)
    .join('\n')
}
