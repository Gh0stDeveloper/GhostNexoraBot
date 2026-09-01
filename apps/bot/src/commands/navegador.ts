/**
 * .nav | .navegador | .view
 *
 * Estrategia "navegador real":
 * 1) Página interactiva en https://ghostnexorabot.duckdns.org/browser?url=...
 *    (JS completo + BUSCAR + iframe con HTML del proxy)
 * 2) En WhatsApp se embebe esa URL en un iframe del mensaje GenAI
 *    (mismo origen trusted) + enlace para abrir a pantalla completa.
 */
import { randomBytes } from 'node:crypto'
import { generateWAMessageFromContent } from 'baileys'
import type { BotCommand, CommandContext } from '../types.js'
import { config } from '../config.js'
import { fetchBrowserDocument } from '../services/browser-proxy.js'
import { logger } from '../utils/logger.js'

const PUBLIC_ORIGIN =
  process.env.PUBLIC_WEB_URL?.replace(/\/$/, '') ||
  'https://ghostnexorabot.duckdns.org'

const PUBLIC_PROXY =
  process.env.BROWSER_PROXY_PUBLIC_URL ||
  (config as { browserProxyPublicUrl?: string }).browserProxyPublicUrl ||
  `${PUBLIC_ORIGIN}/proxy`

const MAX_TEXT_CHARS = 8_000

const STATIC_TRUSTED = [
  PUBLIC_ORIGIN,
  'https://ghostnexorabot.duckdns.org',
  'https://www.google.com',
  'https://google.com',
  'https://whatsapp.com',
  'https://example.com',
  'https://es.wikipedia.org',
  'https://en.wikipedia.org',
]

function originOf(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    return url.origin
  } catch {
    return null
  }
}

function trustedSourcesFor(startUrl: string) {
  return [...new Set(
    [...STATIC_TRUSTED, originOf(PUBLIC_PROXY), originOf(startUrl)].filter(
      (v): v is string => Boolean(v),
    ),
  )]
}

function escapeAttribute(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function extractReadableText(html: string): string {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')
    .replace(/<[^>]+>/g, '')
    .trim()
  let body = html.replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
  body = body.replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
  body = body.replace(/<[^>]+>/g, ' ')
  body = body.replace(/&nbsp;/gi, ' ')
  body = body.replace(/\s+/g, ' ').trim()
  const text = [title ? `「 ${title} 」` : '', body].filter(Boolean).join('\n\n')
  return text.slice(0, MAX_TEXT_CHARS)
}

function browserPageUrl(startUrl: string) {
  return `${PUBLIC_ORIGIN}/browser?url=${encodeURIComponent(startUrl)}`
}

function proxyHtmlUrl(startUrl: string) {
  return `${PUBLIC_PROXY}?url=${encodeURIComponent(startUrl)}&format=html`
}

function buildHtml(startUrl: string, readable: string) {
  const safeStart = escapeAttribute(startUrl)
  const pageUrl = escapeAttribute(browserPageUrl(startUrl))
  const directHtml = escapeAttribute(proxyHtmlUrl(startUrl))
  const safeReadable = escapeHtml(readable || '')

  // iframe src = página /browser (JS real) + fallback iframe al HTML del proxy
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<style>
  *{box-sizing:border-box}
  body{margin:0;padding:10px;background:#0f1115;color:#fff;font-family:system-ui,-apple-system,Arial,sans-serif}
  a.open{display:block;text-align:center;margin:0 0 10px;padding:12px;border-radius:12px;background:linear-gradient(90deg,#7c5cff,#5a8bff);color:#fff;text-decoration:none;font-weight:700;font-size:14px}
  #view{width:100%;height:min(62vh,520px);border:none;background:#fff;border-radius:12px;display:block}
  #text{margin-top:10px;padding:12px;background:#1b1d22;border-radius:12px;font-size:12px;line-height:1.45;max-height:180px;overflow:auto;white-space:pre-wrap;word-break:break-word;color:#e8eaed}
  .hint{font-size:10px;color:#6b7280;margin:8px 0;text-align:center}
  .url{font-size:11px;color:#9aa0a6;margin-bottom:8px;word-break:break-all}
</style>
</head>
<body>
  <a class="open" href="${pageUrl}" target="_blank" rel="noopener">🌐 Abrir navegador completo</a>
  <div class="url">${safeStart}</div>
  <iframe id="view" src="${pageUrl}" sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer"></iframe>
  <div class="hint">Si el marco sale en blanco, usa el botón de arriba o lee el resumen</div>
  <div id="text">${safeReadable}</div>
  <!-- fallback oculto: carga directa HTML del proxy si el WebView bloquea /browser -->
  <iframe src="${directHtml}" style="display:none" title="fallback"></iframe>
</body>
</html>`
}

function resolveStartUrl(args: string[], argText: string): string {
  const q = (argText || args.join(' ')).trim()
  if (!q) return 'https://example.com'
  if (/^https?:\/\//i.test(q)) return q
  if (/\./.test(q) && !/\s/.test(q)) return `https://${q}`
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`
}

async function sendBrowserMessage(ctx: CommandContext, startUrl: string) {
  let readable = 'Cargando resumen…'
  try {
    const result = await fetchBrowserDocument(startUrl)
    readable = extractReadableText(result.html)
    logger.info({ startUrl, bytes: result.bytes, status: result.status }, 'navegador page fetched')
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    logger.warn({ error: msg, startUrl }, 'navegador fetch failed')
    readable = `No se pudo precargar el resumen.\nAbre: ${browserPageUrl(startUrl)}`
  }

  const msgId = `message-${Date.now()}-${randomBytes(4).toString('hex')}`
  const HTML = buildHtml(startUrl, readable)
  const payload = {
    response_id: msgId,
    sections: [
      {
        view_model: {
          primitive: {
            __typename: 'GenAIaeacdsnwHtmlPrimitive',
            payload: HTML,
            trusted_sources: trustedSourcesFor(startUrl),
          },
          __typename: 'GenAISingleLayoutViewModel',
        },
      },
    ],
  }

  const slots: Record<string, unknown> = {
    messageContextInfo: {
      deviceListMetadata: {},
      deviceListMetadataVersion: 2,
      messageSecret: randomBytes(32).toString('base64'),
      botMetadata: { messageDisclaimerText: '', botResponseId: msgId },
    },
    botForwardedMessage: {
      message: {
        richResponseMessage: {
          messageType: 1,
          submessages: [{ messageType: 2, messageText: '🌐 Navegador Ghost Nexora' }],
          unifiedResponse: {
            data: Buffer.from(JSON.stringify(payload)).toString('base64'),
          },
          contextInfo: {
            mentionedJid: [],
            groupMentions: [],
            statusAttributions: [],
            forwardingScore: 1,
            isForwarded: true,
            forwardedAiBotMessageInfo: { botJid: '867051314767696@bot' },
            forwardOrigin: 4,
          },
        },
      },
    },
  }

  const userJid = ctx.socket.user?.id ?? ctx.sender
  if (!userJid) throw new Error('No se pudo determinar el JID del bot.')
  const msg = generateWAMessageFromContent(ctx.chatId, slots as never, { userJid })
  await ctx.socket.relayMessage(ctx.chatId, msg.message!, {})
}

export const navegadorCommands: BotCommand[] = [
  {
    name: 'nav',
    aliases: ['navegador', 'view', 'browser', 'browse'],
    category: 'tools',
    description: 'Navegador embebido (página real + BUSCAR en /browser).',
    usage: 'nav [url|búsqueda]',
    async handler(ctx) {
      const startUrl = resolveStartUrl(ctx.args, ctx.argText)
      try {
        await sendBrowserMessage(ctx, startUrl)
      } catch (error) {
        logger.warn({ error }, 'navegador send failed')
        const err = error instanceof Error ? error.message : String(error)
        await ctx.reply(
          `❌ No se pudo abrir el navegador.\n${err.slice(0, 180)}\n\nPrueba abrir:\n${browserPageUrl(startUrl)}`,
        )
      }
    },
  },
]
