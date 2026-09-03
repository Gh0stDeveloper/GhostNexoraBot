import type { BotCommand, CommandContext } from '../types.js'
import { askAI, aiConfigured, getAIStatus } from '../services/ai.js'
import { googleSearch, wikipediaSearch, type WebSearchResult } from '../services/web-search.js'
import { formatAssistantResponse } from '../services/response-format.js'
import { sendRichAiCodeMessage, shouldUseRichCode } from '../services/rich-code-message.js'
import { logger } from '../utils/logger.js'

const SYSTEM_PROMPT = [
  'Eres el asistente de Ghost Nexora Bot (Ghost Developer). Responde en el idioma del usuario; si no es claro, usa español.',
  'Sé preciso, útil y directo. No inventes hechos, enlaces ni fuentes.',
  'Cuando incluyas código, SIEMPRE usa bloques Markdown con lenguaje explícito: ```python, ```typescript, ```bash, ```json, etc.',
  'No uses bloques ``` sin lenguaje. Mantén el formato compatible con WhatsApp.',
  'No reveles razonamiento interno ni cadenas de pensamiento; entrega conclusiones y explicaciones útiles.',
  'Puedes firmar mentalmente como Ghost Nexora, pero no repitas el watermark en cada línea.',
].join(' ')

function requirePrompt(value: string) {
  const text = value.trim()
  if (!text) throw new Error('Escribe una pregunta o tema.')
  return text.slice(0, 6000)
}

function inferFenceLanguage(lines: string[]) {
  const sample = lines.slice(0, 8).join('\n')
  if (/^\s*(?:from\s+\S+\s+import|import\s+\S+|def\s+\w+\(|class\s+\w+[:(]|print\s*\()/m.test(sample)) return 'python'
  if (/\b(?:const|let|var|function|interface|type)\s+\w+|=>|console\.log\(/.test(sample)) return /interface\s+\w+|type\s+\w+\s*=|:\s*(?:string|number|boolean)\b/.test(sample) ? 'typescript' : 'javascript'
  if (/^\s*(?:sudo\s+|apt\s+|npm\s+|git\s+|curl\s+|systemctl\s+|journalctl\s+|#!\/bin\/(?:ba)?sh)/m.test(sample)) return 'bash'
  if (/^\s*[\[{][\s\S]*[}\]]\s*$/.test(sample.trim())) return 'json'
  if (/<(?:html|div|span|script|body|head|section)\b/i.test(sample)) return 'html'
  if (/\bSELECT\b[\s\S]+\bFROM\b|\bCREATE\s+TABLE\b/i.test(sample)) return 'sql'
  if (/^[.#]?[\w-]+\s*\{[^}]*:[^}]*\}/m.test(sample)) return 'css'
  return 'text'
}

function normalizeCodeFences(input: string) {
  const lines = input.replace(/\r\n/g, '\n').split('\n')
  let inside = false
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!
    const match = /^```\s*([^\s`]*)\s*$/.exec(line)
    if (!match) continue
    if (inside) {
      inside = false
      lines[index] = '```'
      continue
    }
    inside = true
    if (!match[1]) lines[index] = `\`\`\`${inferFenceLanguage(lines.slice(index + 1, index + 9))}`
  }
  if (inside) lines.push('```')
  return lines.join('\n').trim()
}

function splitForWhatsApp(input: string, limit = 3500) {
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
    const addition = `${current ? '\n' : ''}${line}`
    if (current.length + addition.length > limit && current) flush()
    current += `${current ? '\n' : ''}${line}`
    if (fence) activeFence = activeFence ? null : line
  }
  if (current.trim()) chunks.push(current.trimEnd())
  return chunks
}

async function sendPlainChunks(ctx: CommandContext, text: string, model?: string) {
  const chunks = splitForWhatsApp(text)
  for (let index = 0; index < chunks.length; index += 1) {
    const footer =
      index === chunks.length - 1
        ? `\n\n_✧ Ghost Nexora Bot · Ghost Developer${model ? ` · ${model}` : ''} ✧_`
        : ''
    await ctx.reply(`${chunks[index]}${footer}`)
  }
}

/** Preferir rich code; si falla, texto con fences. */
async function sendAI(ctx: CommandContext, userPrompt: string, rawText: string, model?: string) {
  const text = formatAssistantResponse(userPrompt, normalizeCodeFences(rawText))

  if (shouldUseRichCode(text)) {
    try {
      await sendRichAiCodeMessage(
        ctx.socket,
        ctx.chatId,
        {
          title: 'Ghost Nexora · Asistente',
          fullText: text,
          model,
        },
        ctx.message,
      )
      return
    } catch (error) {
      logger.warn({ error }, 'rich AI code failed; fallback plain')
    }
  }

  await sendPlainChunks(ctx, text, model)
}

function uniqueSources(results: WebSearchResult[]) {
  const seen = new Set<string>()
  return results.filter((result) => {
    if (seen.has(result.url)) return false
    seen.add(result.url)
    return true
  })
}

async function researchSources(query: string) {
  const [google, wikiEs, wikiEn] = await Promise.allSettled([
    googleSearch(query, 5),
    wikipediaSearch(query, 4, 'es'),
    wikipediaSearch(query, 3, 'en'),
  ])
  const combined = [
    ...(google.status === 'fulfilled' ? google.value : []),
    ...(wikiEs.status === 'fulfilled' ? wikiEs.value : []),
    ...(wikiEn.status === 'fulfilled' ? wikiEn.value : []),
  ]
  return uniqueSources(combined).slice(0, 8)
}

export const aiCommands: BotCommand[] = [
  {
    name: 'aistatus',
    aliases: ['iastatus'],
    category: 'general',
    staffOnly: true,
    description: 'Diagnostica la configuración de IA sin mostrar la API key.',
    async handler(ctx) {
      const status = await getAIStatus()
      const lines = [
        '╭━━〔 🤖 *IA · DIAGNÓSTICO* 〕━━╮',
        `┃ Configurada » *${status.configured ? 'SÍ' : 'NO'}*`,
        `┃ Proveedor » *${status.provider}*`,
        `┃ Endpoint » *${status.endpointHost}*`,
        `┃ Modelo » *${status.model}*`,
        `┃ Formato key » *${status.keyFormat}*`,
        `┃ Autenticación » *${status.auth}*`,
        'httpStatus' in status ? `┃ HTTP » *${status.httpStatus}*` : '',
        'freeTier' in status && status.freeTier !== undefined
          ? `┃ Free tier » *${status.freeTier ? 'SÍ' : 'NO'}*`
          : '',
        'limitRemaining' in status &&
        status.limitRemaining !== undefined &&
        status.limitRemaining !== null
          ? `┃ Límite restante » *${status.limitRemaining}*`
          : '',
        'detail' in status && status.detail ? `┃ Detalle » ${status.detail}` : '',
        '╰━━━━━━━━━━━━━━━━╯',
        '_Ghost Nexora Bot · Ghost Developer_',
      ].filter(Boolean)
      await ctx.reply(lines.join('\n'))
    },
  },
  {
    name: 'ai',
    aliases: ['ia', 'ask', 'chat'],
    category: 'general',
    description: 'Consulta el asistente de IA (código con resaltado rich).',
    usage: 'ai <pregunta>',
    async handler(ctx) {
      if (!aiConfigured()) {
        throw new Error(
          'La IA gratuita aún no está configurada. El owner debe añadir OPENROUTER_API_KEY en el .env del servidor.',
        )
      }
      const prompt = requirePrompt(ctx.argText)
      await ctx.socket.sendPresenceUpdate('composing', ctx.chatId).catch(() => undefined)
      const result = await askAI(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        1800,
      )
      await sendAI(ctx, prompt, result.text, result.model)
    },
  },
  {
    name: 'investiga',
    aliases: ['investigar', 'research'],
    category: 'general',
    description: 'Investiga un tema con búsquedas web y síntesis de IA.',
    usage: 'investiga <tema>',
    async handler(ctx) {
      if (!aiConfigured()) {
        throw new Error(
          'La IA gratuita aún no está configurada. El owner debe añadir OPENROUTER_API_KEY en el .env del servidor.',
        )
      }
      const query = requirePrompt(ctx.argText)
      await ctx.socket.sendPresenceUpdate('composing', ctx.chatId).catch(() => undefined)
      const sources = await researchSources(query)
      if (!sources.length) throw new Error('No pude obtener fuentes públicas para investigar ese tema.')

      const sourceContext = sources
        .map((source, index) =>
          [
            `[${index + 1}] ${source.title}`,
            `URL: ${source.url}`,
            source.snippet ? `Resumen: ${source.snippet}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
        )
        .join('\n\n')

      const result = await askAI(
        [
          {
            role: 'system',
            content: `${SYSTEM_PROMPT} Para investigación, usa únicamente las fuentes entregadas como evidencia factual. Cita afirmaciones importantes con [1], [2], etc. Si las fuentes no permiten confirmar algo, dilo explícitamente. Termina con una sección "Fuentes" que conserve las URLs proporcionadas.`,
          },
          {
            role: 'user',
            content: `Tema de investigación: ${query}\n\nFuentes obtenidas:\n${sourceContext}\n\nElabora una síntesis clara, separa hechos de incertidumbres y cita las fuentes por número.`,
          },
        ],
        2300,
      )
      await sendAI(ctx, query, result.text, result.model)
    },
  },
]
