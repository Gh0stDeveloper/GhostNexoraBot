/**
 * .nav | .navegador | .view
 *
 * El status se veía bien porque iba en HTML estático, pero el iframe
 * quedaba en blanco: el HTML solo se inyectaba con JS y WhatsApp a menudo
 * no ejecuta scripts en GenAI.
 *
 * Ahora:
 *  1) iframe srcdoc="..." con el HTML ya escapado (sin JS)
 *  2) fallback iframe src = proxy?format=html (si trusted_sources lo permite)
 *  3) JS solo para BUSCAR (si el WebView lo permite)
 */
import { randomBytes } from 'node:crypto'
import { generateWAMessageFromContent } from 'baileys'
import type { BotCommand, CommandContext } from '../types.js'
import { config } from '../config.js'
import { fetchBrowserDocument } from '../services/browser-proxy.js'
import { logger } from '../utils/logger.js'

const PUBLIC_ORIGIN =
  (process.env.PUBLIC_WEB_URL || 'https://ghostnexorabot.duckdns.org').replace(/\/$/, '')

const PUBLIC_PROXY =
  process.env.BROWSER_PROXY_PUBLIC_URL ||
  (config as { browserProxyPublicUrl?: string }).browserProxyPublicUrl ||
  `${PUBLIC_ORIGIN}/proxy`

/** srcdoc en atributo: páginas grandes se acortan; el resto va por src=proxy */
const MAX_SRCDOC_BYTES = 400_000

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
    [
      PUBLIC_ORIGIN,
      'https://ghostnexorabot.duckdns.org',
      'https://www.google.com',
      'https://google.com',
      'https://whatsapp.com',
      'https://www.whatsapp.com',
      'https://example.com',
      originOf(PUBLIC_PROXY),
      originOf(startUrl),
    ].filter((v): v is string => Boolean(v)),
  )]
}

/** Escape real para atributos HTML (el anterior estaba roto y no escapaba). */
function escapeAttr(value: string) {
  return value
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#39;')
}

function resolveStartUrl(args: string[], argText: string): string {
  const q = (argText || args.join(' ')).trim()
  if (!q) return 'https://www.google.com'
  if (/^https?:\/\//i.test(q)) return q
  if (/\./.test(q) && !/\s/.test(q)) return `https://${q}`
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`
}

function buildShell(
  startUrl: string,
  initialHtml: string,
  meta: { status: number; bytes: number; subrecursos: number },
) {
  const safeUrl = escapeAttr(startUrl)
  const safeProxy = escapeAttr(PUBLIC_PROXY)
  const proxyHtml = `${PUBLIC_PROXY}?url=${encodeURIComponent(startUrl)}&format=html`
  const safeProxyHtml = escapeAttr(proxyHtml)

  const status0 = initialHtml
    ? `HTTP ${meta.status} - ${meta.bytes} bytes - ${meta.subrecursos} subrecursos`
    : 'esperando…'

  // Preferir srcdoc con HTML real (sin JS). Si es muy grande, solo src al proxy.
  let iframeOpen: string
  if (initialHtml && Buffer.byteLength(initialHtml, 'utf8') <= MAX_SRCDOC_BYTES) {
    iframeOpen = `<iframe id="view" srcdoc="${escapeAttr(initialHtml)}" src="${safeProxyHtml}"`
  } else if (initialHtml) {
    iframeOpen = `<iframe id="view" src="${safeProxyHtml}"`
  } else {
    iframeOpen = `<iframe id="view" src="${safeProxyHtml}"`
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body{margin:0;padding:12px;background:#0f1115;color:white;font-family:Arial,sans-serif}
  .top{display:flex;gap:6px;align-items:center}
  .label{font-size:11px;color:#9aa0a6;min-width:25px}
  #url{flex:1;background:#1b1d22;border:1.5px solid #ffb300;color:white;padding:10px 12px;border-radius:10px;outline:none;font-size:13px}
  #btn{width:100%;margin-top:10px;background:linear-gradient(90deg,#7c5cff,#5a8bff);color:white;border:none;padding:12px;border-radius:12px;font-weight:bold;font-size:14px;letter-spacing:1px}
  #status{font-size:11px;color:#9aa0a6;margin-top:8px;text-align:center;white-space:pre}
  #view{width:100%;height:420px;border:none;background:white;border-radius:12px;margin-top:12px}
</style>
</head>
<body>
  <div class="top">
    <span class="label">url</span>
    <input id="url" value="${safeUrl}" />
  </div>
  <button id="btn" type="button">BUSCAR</button>
  <div id="status">${escapeAttr(status0)}</div>
  ${iframeOpen} sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads" referrerpolicy="no-referrer"></iframe>
<script>
(function(){
  var PROXY = "${safeProxy}";
  function norm(u){
    u = (u || "").trim();
    if (!u) return "";
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    return u;
  }
  function show(html, statusText){
    var view = document.getElementById("view");
    var st = document.getElementById("status");
    if (st && statusText) st.textContent = statusText;
    if (!view) return;
    view.removeAttribute("src");
    view.srcdoc = html || "";
  }
  async function buscar(){
    var input = document.getElementById("url");
    var st = document.getElementById("status");
    var url = norm(input && input.value);
    if (!url) { if (st) st.textContent = "Escribe una URL"; return; }
    if (input) input.value = url;
    if (st) st.textContent = "Cargando…";
    try {
      var res = await fetch(PROXY + "?url=" + encodeURIComponent(url));
      var data = await res.json();
      if (data.error) throw new Error(data.error);
      var html = data.html || "";
      var line = "HTTP " + (data.status || res.status) + " - " + (data.bytes || html.length) + " bytes - " + (data.subrecursos || 0) + " subrecursos";
      show(html, line);
    } catch (e) {
      if (st) st.textContent = "Error: " + (e && e.message ? e.message : e);
    }
  }
  var btn = document.getElementById("btn");
  if (btn) btn.addEventListener("click", buscar);
  var input = document.getElementById("url");
  if (input) input.addEventListener("keydown", function(e){ if (e.key === "Enter") buscar(); });
})();
</script>
</body>
</html>`
}

async function sendBrowserMessage(ctx: CommandContext, startUrl: string) {
  let initialHtml = ''
  let meta = { status: 0, bytes: 0, subrecursos: 0 }

  try {
    const result = await fetchBrowserDocument(startUrl)
    let html = result.html
    if (Buffer.byteLength(html, 'utf8') > MAX_SRCDOC_BYTES) {
      // Sigue en el mensaje vía src=proxy; no forzar srcdoc gigante
      logger.info({ startUrl, bytes: result.bytes }, 'navegador page large; using proxy src')
    }
    initialHtml = html
    meta = {
      status: result.status,
      bytes: result.bytes,
      subrecursos: result.subrecursos ?? 0,
    }
    logger.info({ startUrl, ...meta }, 'navegador initial ok')
  } catch (error) {
    logger.warn({ error, startUrl }, 'navegador initial fetch failed')
  }

  const msgId = `message-${Date.now()}-${randomBytes(4).toString('hex')}`
  const HTML = buildShell(startUrl, initialHtml, meta)

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
          submessages: [{ messageType: 2, messageText: '🌐 Navegador' }],
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
    description: 'Navegador embebido (HTML real vía proxy).',
    usage: 'nav [url|búsqueda]',
    async handler(ctx) {
      const startUrl = resolveStartUrl(ctx.args, ctx.argText)
      try {
        await sendBrowserMessage(ctx, startUrl)
      } catch (error) {
        logger.warn({ error }, 'navegador send failed')
        const err = error instanceof Error ? error.message : String(error)
        await ctx.reply(`❌ Navegador: ${err.slice(0, 200)}`)
      }
    },
  },
]
