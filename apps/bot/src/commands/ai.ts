import type { BotCommand, CommandContext } from '../types.js'
import { askAI, aiConfigured, getAIStatus } from '../services/ai.js'
import { googleSearch, wikipediaSearch, type WebSearchResult } from '../services/web-search.js'
import { sendAssistantReply } from '../services/assistant-reply.js'

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
      await sendAssistantReply(ctx.socket, ctx.chatId, result.text, {
        userPrompt: prompt,
        model: result.model,
        title: 'Ghost Nexora · Asistente',
        quoted: ctx.message,
      })
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
      await sendAssistantReply(ctx.socket, ctx.chatId, result.text, {
        userPrompt: query,
        model: result.model,
        title: 'Ghost Nexora · Investigación',
        quoted: ctx.message,
      })
    },
  },
]
