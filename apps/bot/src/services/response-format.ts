const CODE_REQUEST_RE = /\b(c[oó]digo|code|script|programa|programar|typescript|javascript|python|bash|shell|sql|java|kotlin|php|c\+\+|c#|html|css|json|regex|comando|funci[oó]n|clase|api|endpoint|snippet)\b/i
const CODE_MARKER_RE = /(```|\b(import|export|const|let|var|function|async\s+function|class|interface|type\s+\w+\s*=|def|SELECT\s+.+\s+FROM|#!\/|npm\s+(?:install|run)|curl\s+-|git\s+(?:clone|pull|checkout)|<\/?[a-z][^>]*>)\b)/im

function inferLanguage(userText: string): string {
  const t = userText.toLowerCase()
  if (/typescript|\.ts\b/.test(t)) return 'ts'
  if (/javascript|node(?:\.js)?\b|\.js\b/.test(t)) return 'js'
  if (/python|\.py\b/.test(t)) return 'python'
  if (/bash|shell|terminal|linux|\.sh\b/.test(t)) return 'bash'
  if (/sql|mysql|postgres|postgresql/.test(t)) return 'sql'
  if (/kotlin|android/.test(t)) return 'kotlin'
  if (/java\b/.test(t)) return 'java'
  if (/php\b/.test(t)) return 'php'
  if (/html/.test(t)) return 'html'
  if (/css|scss/.test(t)) return 'css'
  if (/json/.test(t)) return 'json'
  return ''
}

function alreadyFenced(text: string) {
  return /```[\s\S]*```/m.test(text)
}

function wrapBareCode(answer: string, language: string) {
  const lines = answer.replace(/\r/g, '').trim().split('\n')
  if (lines.length < 3) return answer

  const codeLines = lines.filter((line) => {
    const s = line.trim()
    if (!s) return false
    return /^(import\s|export\s|const\s|let\s|var\s|function\s|async\s+function\s|class\s|interface\s|type\s|def\s|return\s|if\s*\(|for\s*\(|while\s*\(|from\s+\S+\s+import|npm\s|curl\s|git\s|SELECT\s|INSERT\s|UPDATE\s|DELETE\s|#!\/|<\/?[a-z][^>]*>|[{}[\];]=?$)/i.test(s)
  })

  if (codeLines.length < Math.ceil(lines.length * 0.55)) return answer

  const lang = language ? language : ''
  return `\`\`\`${lang}\n${answer}\n\`\`\``
}

/**
 * Adapta respuestas del LLM al formato que WhatsApp representa como bloque de código.
 * No toca texto normal ni bloques que el modelo ya haya formateado.
 */
export function formatAssistantResponse(userText: string, answer: string) {
  const text = answer.replace(/\u0000/g, '').trim()
  if (!text) return text
  if (alreadyFenced(text)) return text
  if (!CODE_REQUEST_RE.test(userText) && !CODE_MARKER_RE.test(text)) return text
  return wrapBareCode(text, inferLanguage(userText))
}

/** Respuesta determinista para preguntas de identidad del bot. */
export function asksBotName(text: string) {
  const normalized = text
    .toLocaleLowerCase('es-MX')
    .normalize('NFKC')
    .replace(/[¿?¡!.,;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return /\b(c[oó]mo te llamas|cu[aá]l es tu nombre|cual es tu nombre|dime tu nombre|qui[eé]n eres|quien eres|nombre del bot|nombre eres|eres ghost|eres nexora)\b/i.test(normalized)
}
