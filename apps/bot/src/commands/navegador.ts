/**
 * .nav | .navegador | .view — navegador embebido Ghost Nexora
 * Proxy: https://ghostnexorabot.duckdns.org/proxy  → 127.0.0.1:3847
 */
import { randomBytes } from 'node:crypto'
import { generateWAMessageFromContent } from 'baileys'
import type { BotCommand, CommandContext } from '../types.js'
import { config } from '../config.js'
import { fetchBrowserDocument } from '../services/browser-proxy.js'
import { logger } from '../utils/logger.js'

const PUBLIC_PROXY =
  process.env.BROWSER_PROXY_PUBLIC_URL ||
  (config as { browserProxyPublicUrl?: string }).browserProxyPublicUrl ||
  'https://ghostnexorabot.duckdns.org/proxy'

const STATIC_TRUSTED = [
  'https://ghostnexorabot.duckdns.org',
  'https://www.google.com',
  'https://google.com',
  'https://whatsapp.com',
  'https://es.wikipedia.org',
  'https://en.wikipedia.org',
  'https://www.wikipedia.org',
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
  const targetOrigin = originOf(startUrl)
  const proxyOrigin = originOf(PUBLIC_PROXY)
  return [...new Set([
    ...STATIC_TRUSTED,
    proxyOrigin,
    targetOrigin,
  ].filter((value): value is string => Boolean(value)))]
}

function escapeAttribute(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;')
}

function buildHtml(startUrl: string, initialPageHtml = '') {
  const safeStart = escapeAttribute(startUrl)
  const safeProxy = escapeAttribute(PUBLIC_PROXY)
  const initialHref = `${PUBLIC_PROXY}?url=${encodeURIComponent(startUrl)}&format=html`
  const initialAttr = initialPageHtml
    ? ` srcdoc="${escapeAttribute(initialPageHtml)}"`
    : ` src="${escapeAttribute(initialHref)}"`
  const statusText = initialPageHtml
    ? 'Resultado cargado desde Ghost Nexora'
    : 'Cargando página…'

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<style>
  *{box-sizing:border-box}
  body{margin:0;padding:12px;background:#0f1115;color:#fff;font-family:system-ui,-apple-system,Arial,sans-serif}
  .top{display:flex;gap:6px;align-items:center}
  .label{font-size:11px;color:#9aa0a6;min-width:28px}
  #url{flex:1;background:#1b1d22;border:1.5px solid #ffb300;color:#fff;padding:10px 12px;border-radius:10px;outline:none;font-size:13px}
  #btn{width:100%;margin-top:10px;background:linear-gradient(90deg,#7c5cff,#5a8bff);color:#fff;border:none;padding:12px;border-radius:12px;font-weight:700;font-size:14px;letter-spacing:.5px}
  #btn:active{opacity:.85}
  #status{font-size:11px;color:#9aa0a6;margin-top:8px;text-align:center;white-space:pre-wrap;word-break:break-word}
  #view{width:100%;height:min(65vh,560px);border:none;background:#fff;border-radius:12px;margin-top:12px;display:block}
</style>
</head>
<body>
  <div class="top">
    <span class="label">url</span>
    <input id="url" value="${safeStart}" inputmode="url" autocomplete="off" />
  </div>
  <button id="btn" type="button">BUSCAR</button>
  <div id="status">${statusText}</div>
  <iframe id="view"${initialAttr} sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads" referrerpolicy="no-referrer"></iframe>
<script>
const PROXY = "${safeProxy}";
function norm(u){
  u = (u||"").trim();
  if(!u) return "";
  if(!/^https?:\\/\\//i.test(u)) u = "https://" + u;
  return u;
}
function navigate(force){
  const input = document.getElementById("url");
  const status = document.getElementById("status");
  const view = document.getElementById("view");
  const url = norm(force || input.value);
  if(!url){ status.textContent = "Escribe una URL"; return; }
  input.value = url;
  status.textContent = "Cargando " + url + "…";
  view.removeAttribute("srcdoc");
  view.src = PROXY + "?url=" + encodeURIComponent(url) + "&format=html";
}
document.getElementById("btn").addEventListener("click", function(){ navigate(); });
document.getElementById("url").addEventListener("keydown", function(e){ if(e.key==="Enter") navigate(); });
document.getElementById("view").addEventListener("load", function(){ document.getElementById("status").textContent = "Página cargada"; });
</script>
</body>
</html>`
}

function resolveStartUrl(args: string[], argText: string): string {
  const q = (argText || args.join(' ')).trim()
  if (!q) return 'https://www.google.com'
  if (/^https?:\/\//i.test(q)) return q
  if (/\./.test(q) && !/\s/.test(q)) return `https://${q}`
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`
}

async function sendBrowserMessage(ctx: CommandContext, startUrl: string) {
  let initialPageHtml = ''
  try {
    const result = await fetchBrowserDocument(startUrl)
    // WhatsApp rich HTML messages are bounded in size; inline the initial page
    // so the first render does not depend on WebView fetch/navigation support.
    if (Buffer.byteLength(result.html, 'utf8') <= 1_500_000) {
      initialPageHtml = result.html
    }
  } catch (error) {
    logger.warn({ error, startUrl }, 'initial browser page fetch failed; using proxy navigation fallback')
  }

  const msgId = `message-${Date.now()}-${randomBytes(4).toString('hex')}`
  const HTML = buildHtml(startUrl, initialPageHtml)
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
  if (!userJid) throw new Error('No se pudo determinar el JID del bot para generar el mensaje enriquecido.')
  const msg = generateWAMessageFromContent(ctx.chatId, slots as never, { userJid })
  await ctx.socket.relayMessage(ctx.chatId, msg.message!, {})
}

export const navegadorCommands: BotCommand[] = [
  {
    name: 'nav',
    aliases: ['navegador', 'view', 'browser', 'browse'],
    category: 'tools',
    description: 'Abre un navegador embebido vía proxy del bot.',
    usage: 'nav [url|búsqueda]',
    async handler(ctx) {
      const startUrl = resolveStartUrl(ctx.args, ctx.argText)
      try {
        await sendBrowserMessage(ctx, startUrl)
        await ctx.reply(`🌐 *Navegador enviado*\nURL: ${startUrl}\nProxy: \`${PUBLIC_PROXY}\``)
      } catch (error) {
        logger.warn({ error }, 'navegador send failed')
        const err = error instanceof Error ? error.message : String(error)
        await ctx.reply(
          [
            '❌ *No se pudo abrir el navegador*',
            '',
            `Motivo: ${err}`,
            '',
            `Comprueba el proxy con: ${PUBLIC_PROXY}?url=https://example.com`,
          ].join('\n'),
        )
      }
    },
  },
]
