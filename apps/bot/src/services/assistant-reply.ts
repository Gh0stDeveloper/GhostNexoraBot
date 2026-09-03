/**
 * Envío unificado de respuestas de asistente (OpenRouter/DeepSeek, Ollama/Qwen, etc.).
 * Si hay código → richResponseMessage (codeMetadata); si no → texto normal.
 * Créditos: Ghost Nexora Bot / Ghost Developer
 */
import type { WAMessage, WASocket } from 'baileys'
import { formatAssistantResponse } from './response-format.js'
import { sendRichAiCodeMessage, shouldUseRichCode } from './rich-code-message.js'
import { logger } from '../utils/logger.js'

function normalizeCodeFences(input: string) {
  const lines = input.replace(/\r\n/g, '\n').split('\n')
  let inside = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const match = /^```\s*([^\s`]*)\s*$/.exec(line)
    if (!match) continue
    if (inside) {
      inside = false
      lines[i] = '```'
      continue
    }
    inside = true
    if (!match[1]) lines[i] = '```text'
  }
  if (inside) lines.push('```')
  return lines.join('\n').trim()
}

function splitChunks(input: string, limit = 3500) {
  const text = normalizeCodeFences(input)
  const lines = text.split('\n')
  const chunks: string[] = []
  let current = ''
  let activeFence: string | null = null

  const flush = () => {
    const trimmed = current.trimEnd()
    if (!trimmed) return
    chunks.push(activeFence ? `${trimmed}\n\`\`\`` : trimmed)
    current = activeFence ? `${activeFence}\n` : ''
  }

  for (const line of lines) {
    const fence = /^```[^\s`]*\s*$/.exec(line)
    if (current.length + line.length + 1 > limit && current) flush()
    current += `${current ? '\n' : ''}${line}`
    if (fence) activeFence = activeFence ? null : line
  }
  if (current.trim()) chunks.push(current.trimEnd())
  return chunks
}

export type AssistantReplyOptions = {
  userPrompt?: string
  model?: string
  title?: string
  quoted?: WAMessage
  /** Si false, no intenta rich (solo texto). Default true. */
  preferRich?: boolean
}

/**
 * Envía respuesta de cualquier modelo (Qwen/Ollama, DeepSeek/OpenRouter, etc.)
 * con el mismo formato que `.ai`.
 */
export async function sendAssistantReply(
  socket: WASocket,
  chatId: string,
  rawText: string,
  options: AssistantReplyOptions = {},
) {
  const userPrompt = options.userPrompt || ''
  const text = formatAssistantResponse(userPrompt, normalizeCodeFences(rawText))
  const model = options.model
  const title = options.title || 'Ghost Nexora · Asistente'
  const preferRich = options.preferRich !== false

  if (preferRich && shouldUseRichCode(text)) {
    try {
      await sendRichAiCodeMessage(
        socket,
        chatId,
        {
          title,
          fullText: text,
          model,
        },
        options.quoted,
      )
      return { mode: 'rich' as const }
    } catch (error) {
      logger.warn({ error }, 'assistant rich code failed; plain fallback')
    }
  }

  const footer =
    model
      ? `\n\n_✧ Ghost Nexora Bot · Ghost Developer · ${model} ✧_`
      : '\n\n_✧ Ghost Nexora Bot · Ghost Developer ✧_'
  const chunks = splitChunks(text)
  for (let i = 0; i < chunks.length; i++) {
    const body = i === chunks.length - 1 ? `${chunks[i]}${footer}` : chunks[i]!
    await socket.sendMessage(chatId, { text: body }, { quoted: options.quoted })
  }
  return { mode: 'plain' as const }
}
