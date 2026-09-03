/**
 * Respuestas de IA con código (richResponseMessage + codeMetadata).
 * Texto de explicación se envía aparte (los clientes a menudo solo muestran el bloque code).
 * Créditos: Ghost Nexora Bot / Ghost Developer
 */
import { generateWAMessageFromContent, type WAMessage, type WASocket } from 'baileys'
import { logger } from '../utils/logger.js'

export type CodeBlock = {
  highlightType: number
  codeContent: string
}

const WATERMARK = '✧ Ghost Nexora Bot · Ghost Developer ✧'
const AI_BOT_JID = '867051314767696@bot'

const LANG_ALIASES: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  yml: 'yaml',
  md: 'markdown',
  '': 'text',
}

function normalizeLang(raw: string) {
  const key = (raw || 'text').trim().toLowerCase()
  return LANG_ALIASES[key] || key || 'text'
}

export function parseMarkdownParts(input: string): Array<
  | { kind: 'text'; text: string }
  | { kind: 'code'; language: string; code: string }
> {
  const text = input.replace(/\r\n/g, '\n')
  const parts: Array<{ kind: 'text'; text: string } | { kind: 'code'; language: string; code: string }> = []
  const re = /```([\w+-]*)\n?([\s\S]*?)```/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      const chunk = text.slice(last, match.index).trim()
      if (chunk) parts.push({ kind: 'text', text: chunk })
    }
    parts.push({
      kind: 'code',
      language: normalizeLang(match[1] || ''),
      code: (match[2] || '').replace(/\n$/, ''),
    })
    last = match.index + match[0].length
  }
  if (last < text.length) {
    const chunk = text.slice(last).trim()
    if (chunk) parts.push({ kind: 'text', text: chunk })
  }
  return parts
}

export function buildCodeBlocks(code: string): CodeBlock[] {
  const lines = code.replace(/\r\n/g, '\n').split('\n')
  const blocks: CodeBlock[] = []
  let current = ''
  let blockType = 1

  const flush = () => {
    if (!current) return
    blocks.push({ highlightType: blockType, codeContent: current })
    current = ''
  }

  for (const line of lines) {
    const trimmed = line.trim()
    let nextType = blockType

    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('#')) {
      nextType = 3
    } else if (
      /\b(export|import)\b/.test(trimmed) ||
      /\b(function|class|interface|type|def|async)\b/.test(trimmed) ||
      /handler\./.test(trimmed)
    ) {
      nextType = 2
    } else if (!trimmed || /^(const|let|var|from)\b/.test(trimmed)) {
      nextType = 1
    } else {
      nextType = 4
    }

    if (current && nextType !== blockType) {
      flush()
      blockType = nextType
    } else if (!current) {
      blockType = nextType
    }

    current += line + '\n'
  }
  flush()
  return blocks.length ? blocks : [{ highlightType: 1, codeContent: code }]
}

function botMetaContext() {
  return {
    isForwarded: true,
    forwardingScore: 1,
    forwardedAiBotMessageInfo: { botJid: AI_BOT_JID },
    forwardOrigin: 4,
  }
}

export type RichAiPayload = {
  title?: string
  body?: string
  code?: string
  language?: string
  /** Ya no se muestra en el mensaje (se ignora a propósito). */
  model?: string
  fullText?: string
  /** Si true, no envía el texto plano previo (solo rich). */
  skipPlainText?: boolean
}

export async function sendRichAiCodeMessage(
  socket: WASocket,
  chatId: string,
  payload: RichAiPayload,
  quoted?: WAMessage,
) {
  const userJid = socket.user?.id
  if (!userJid) throw new Error('Sesión de WhatsApp no autenticada.')

  const parts = payload.fullText ? parseMarkdownParts(payload.fullText) : []

  const textBits: string[] = []
  const codeSections: Array<{ language: string; code: string }> = []

  if (payload.body?.trim()) textBits.push(payload.body.trim())
  if (payload.code?.trim()) {
    codeSections.push({
      language: normalizeLang(payload.language || 'text'),
      code: payload.code,
    })
  }

  for (const part of parts) {
    if (part.kind === 'text') textBits.push(part.text)
    else codeSections.push({ language: part.language, code: part.code })
  }

  if (!parts.length && payload.fullText?.trim() && !payload.body && !codeSections.length) {
    textBits.push(payload.fullText.trim())
  }

  const title = payload.title || 'Ghost Nexora'
  const explanation = textBits.join('\n\n').trim()
  const totalCode = codeSections.reduce((n, s) => n + s.code.length, 0)
  const totalLines = codeSections.reduce((n, s) => n + s.code.split('\n').length, 0)
  const sizeKb = (totalCode / 1024).toFixed(2)

  // 1) Texto de explicación SIEMPRE en mensaje normal (así no se pierde)
  if (explanation && !payload.skipPlainText) {
    const plain = [
      explanation,
      '',
      WATERMARK,
    ].join('\n')
    await socket.sendMessage(chatId, { text: plain }, { quoted })
  }

  // 2) Solo código → rich (si no hay código, no hace falta)
  if (!codeSections.length) {
    if (!explanation) {
      await socket.sendMessage(chatId, { text: WATERMARK }, { quoted })
    }
    return null
  }

  const headerLines = [
    '🤖 *' + title + '*',
    '📦 ' + sizeKb + ' KB · 📝 ' + totalLines + ' líneas · 💻 ' + codeSections.map((c) => c.language).join(', '),
    WATERMARK,
  ]

  const submessages: Array<Record<string, unknown>> = [
    {
      messageType: 2,
      messageText: '\n' + headerLines.join('\n') + '\n',
    },
    {
      messageType: 2,
      messageText: '\n💻 *Código:*\n',
    },
  ]

  for (const section of codeSections) {
    submessages.push({
      messageType: 5,
      codeMetadata: {
        codeLanguage: section.language,
        codeBlocks: buildCodeBlocks(section.code),
      },
    })
  }

  const richMessage = {
    richResponseMessage: {
      messageType: 1,
      submessages,
      contextInfo: botMetaContext(),
    },
  }

  const msg = generateWAMessageFromContent(
    chatId,
    {
      botForwardedMessage: {
        message: richMessage,
      },
    } as never,
    {
      userJid,
      quoted,
    },
  )

  await socket.relayMessage(chatId, msg.message!, {
    messageId: msg.key.id!,
  })

  logger.info(
    {
      chatId,
      messageId: msg.key.id,
      codeSections: codeSections.length,
      textLen: explanation.length,
    },
    'rich AI code message sent',
  )

  return msg
}

export function shouldUseRichCode(text: string) {
  if (/```[\s\S]*```/.test(text)) return true
  return /\b(function|const|let|var|import|export|class|def|SELECT)\b/.test(text)
}
