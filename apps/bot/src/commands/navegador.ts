/**
 * .nav | .navegador | .view
 *
 * WhatsApp a menudo NO ejecuta <script> en GenAI HTML.
 * Por eso la vista inicial va en:
 *  - iframe srcdoc="..." (atributo HTML, sin JS)
 *  - y un resumen de texto visible si el iframe falla
 *
 * BUSCAR solo funciona si el WebView ejecuta JS y el proxy público responde JSON.
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

/** Límite del atributo srcdoc dentro del mensaje GenAI */
const MAX_SRCDOC_BYTES = 350_000
const MAX_TEXT_CHARS = 12_000

const STATIC_TRUSTED = [
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
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#39;')
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
}

function lightenHtml(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '')
}

function extractReadableText(html: string): string {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')
    .replace(/<[^>]+>/g, '')
    .trim()
  let body = html.replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
  body = body.replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
  body = body.replace(/<[^>]+>/g, ' ')
  body = body.replace(/&nbsp;/gi, ' ').replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>')
  body = body.replace(/\s+/g, ' ').trim()
  const text = [title ? `「 ${title} 」` : '', body].filter(Boolean).join('\n\n')
  return text.slice(0, MAX_TEXT_CHARS)
}

function buildHtml(startUrl: string, pageHtml: string, readable: string) {
  const safeStart = escapeAttribute(startUrl)
  const safeProxy = escapeAttribute(PUBLIC_PROXY)
  let srcdoc = lightenHtml(pageHtml)
  if (Buffer.byteLength(srcdoc, 'utf8') > MAX_SRCDOC_BYTES) {
    srcdoc = srcdoc.slice(0, MAX_SRCDOC_BYTES) + '\n<!-- truncated -->'
  }
  const safeSrcdoc = escapeAttribute(srcdoc)
  const safeReadable = escapeHtml(readable || 'Sin texto extraído')

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
  #btn{width:100%;margin-top:10px;background:linear-gradient(90deg,#7c5cff,#5a8bff);color:#fff;border:none;padding:12px;border-radius:12px;font-weight:700;font-size:14px}
  #status{font-size:11px;color:#9aa0a6;margin-top:8px;text-align:center;white-space:pre-wrap;word-break:break-word}
  #view{width:100%;height:min(42vh,360px);border:none;background:#fff;border-radius:12px;margin-top:12px;display:block}
  #text{margin-top:12px;padding:12px;background:#1b1d22;border-radius:12px;font-size:12px;line-height:1.45;max-height:220px;overflow:auto;white-space:pre-wrap;word-break:break-word;color:#e8eaed}
  .hint{font-size:10px;color:#6b7280;margin-top:6px;text-align:center}
</style>
</head>
<body>
  <div class="top">
    <span class="label">url</span>
    <input id="url" value="${safeStart}" inputmode="url" autocomplete="off" />
  </div>
  <button id="btn" type="button">BUSCAR</button>
  <div id="status">Vista precargada por el bot</div>
  <iframe id="view" srcdoc="${safeSrcdoc}" sandbox="allow-same-origin allow-scripts allow-forms" referrerpolicy="no-referrer"></iframe>
  <div class="hint">Si el marco sale en blanco, lee el texto debajo</div>
  <div id="text">${safeReadable}</div>
<script>
(function(){
  var PROXY = "${safeProxy}";
  var statusEl = document.getElementById("status");
  var view = document.getElementById("view");
  var textEl = document.getElementById("text");
  var input = document.getElementById("url");
  function setStatus(t){ if(statusEl) statusEl.textContent = t; }
  function norm(u){
    u = (u||"").trim();
    if(!u) return "";
    if(!/^https?:\/\//i.test(u)) u = "https://" + u;
    return u;
  }
  async function buscar(){
    var url = norm(input && input.value);
    if(!url){ setStatus("Escribe una URL"); return; }
    if(input) input.value = url;
    setStatus("⏳ Proxy…");
    try {
      var res = await fetch(PROXY + "?url=" + encodeURIComponent(url));
      var ct = (res.headers.get("content-type")||"").toLowerCase();
      if (ct.indexOf("application/json") === -1) {
        throw new Error("Proxy público devuelve HTML de Next, no JSON. Arregla nginx → :3847");
      }
      var data = await res.json();
      if (data.error || data.ok === false) throw new Error(data.error || "error");
      var html = data.html || "";
      if (!html) throw new Error("sin html");
      view.srcdoc = html;
      setStatus("HTTP " + (data.status||res.status) + " · " + (data.bytes||html.length) + " bytes");
      textEl.textContent = (html.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim()).slice(0, 8000);
    } catch(e) {
      setStatus("❌ " + (e && e.message ? e.message : String(e)));
    }
  }
  var btn = document.getElementById("btn");
  if (btn) btn.addEventListener("click", buscar);
  if (input) input.addEventListener("keydown", function(e){ if(e.key==="Enter") buscar(); });
})();
</script>
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
  let pageHtml = `<!doctype html><html><body style="font-family:system-ui;padding:16px"><p>Sin contenido</p></body></html>`
  let readable = 'Sin contenido'

  try {
    const result = await fetchBrowserDocument(startUrl)
    pageHtml = result.html
    readable = extractReadableText(result.html)
    logger.info({ startUrl, bytes: result.bytes, status: result.status }, 'navegador page fetched')
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    logger.warn({ error: msg, startUrl }, 'navegador fetch failed')
    pageHtml = `<!doctype html><html><body style="font-family:system-ui;padding:16px;background:#111;color:#eee"><h3>Error</h3><p>${escapeHtml(msg)}</p></body></html>`
    readable = `Error al cargar ${startUrl}: ${msg}`
  }

  const msgId = `message-${Date.now()}-${randomBytes(4).toString('hex')}`
  const HTML = buildHtml(startUrl, pageHtml, readable)
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
    description: 'Abre un navegador embebido vía proxy del bot.',
    usage: 'nav [url|búsqueda]',
    async handler(ctx) {
      const startUrl = resolveStartUrl(ctx.args, ctx.argText)
      try {
        await sendBrowserMessage(ctx, startUrl)
      } catch (error) {
        logger.warn({ error }, 'navegador send failed')
        const err = error instanceof Error ? error.message : String(error)
        await ctx.reply(`❌ No se pudo abrir el navegador.\n${err.slice(0, 200)}`)
      }
    },
  },
]
