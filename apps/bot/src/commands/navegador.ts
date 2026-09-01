/**
 * .nav | .navegador | .view
 *
 * WhatsApp no pinta bien iframes/srcdoc en GenAI en muchos clientes.
 * Estrategia "proyector":
 *  1) El servidor abre la página con Chromium (Playwright), ejecuta JS y captura JPEG.
 *  2) El mensaje GenAI muestra esa imagen (como un monitor).
 *  3) BUSCAR: si el WebView ejecuta JS, pide /proxy y recarga; si no, el usuario
 *     vuelve a mandar .view url
 *  4) Además se envía la imagen como mensaje de foto (siempre visible).
 */
import { randomBytes } from 'node:crypto'
import { generateWAMessageFromContent } from 'baileys'
import type { BotCommand, CommandContext } from '../types.js'
import { config } from '../config.js'
import { fetchBrowserDocument } from '../services/browser-proxy.js'
import { capturePageScreenshot } from '../services/browser-screenshot.js'
import { logger } from '../utils/logger.js'

const PUBLIC_ORIGIN =
  (process.env.PUBLIC_WEB_URL || 'https://ghostnexorabot.duckdns.org').replace(/\/$/, '')

const PUBLIC_PROXY =
  process.env.BROWSER_PROXY_PUBLIC_URL ||
  (config as { browserProxyPublicUrl?: string }).browserProxyPublicUrl ||
  `${PUBLIC_ORIGIN}/proxy`

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
      originOf(PUBLIC_PROXY),
      originOf(startUrl),
    ].filter((v): v is string => Boolean(v)),
  )]
}

function escapeAttr(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function resolveStartUrl(args: string[], argText: string): string {
  const q = (argText || args.join(' ')).trim()
  if (!q) return 'https://www.google.com'
  if (/^https?:\/\//i.test(q)) return q
  if (/\./.test(q) && !/\s/.test(q)) return `https://${q}`
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`
}

function buildShell(opts: {
  startUrl: string
  statusLine: string
  /** data:image/jpeg;base64,... */
  imageDataUrl: string
}) {
  const safeUrl = escapeAttr(opts.startUrl)
  const safeProxy = escapeAttr(PUBLIC_PROXY)
  const safeStatus = escapeAttr(opts.statusLine)
  const safeImg = escapeAttr(opts.imageDataUrl)

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
  #status{font-size:11px;color:#9aa0a6;margin-top:8px;text-align:center;white-space:pre-wrap}
  #shot{width:100%;margin-top:12px;border-radius:12px;background:#fff;display:block}
</style>
</head>
<body>
  <div class="top">
    <span class="label">url</span>
    <input id="url" value="${safeUrl}" />
  </div>
  <button id="btn" type="button">BUSCAR</button>
  <div id="status">${safeStatus}</div>
  <img id="shot" alt="captura" src="${safeImg}" />
<script>
(function(){
  var PROXY = "${safeProxy}";
  function norm(u){
    u = (u || "").trim();
    if (!u) return "";
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    return u;
  }
  async function buscar(){
    var input = document.getElementById("url");
    var st = document.getElementById("status");
    var shot = document.getElementById("shot");
    var url = norm(input && input.value);
    if (!url) { if (st) st.textContent = "Escribe una URL"; return; }
    if (input) input.value = url;
    if (st) st.textContent = "Cargando… (usa .view url si no actualiza)";
    try {
      var res = await fetch(PROXY + "?url=" + encodeURIComponent(url));
      var data = await res.json();
      if (data.error) throw new Error(data.error);
      if (st) st.textContent = "HTTP " + (data.status||res.status) + " - " + (data.bytes||0) + " bytes - " + (data.subrecursos||0) + " subrecursos\n(Recarga con .view " + url + " para nueva captura)";
    } catch (e) {
      if (st) st.textContent = "Error: " + (e && e.message ? e.message : e);
    }
  }
  var btn = document.getElementById("btn");
  if (btn) btn.addEventListener("click", buscar);
})();
</script>
</body>
</html>`
}

async function sendBrowserMessage(ctx: CommandContext, startUrl: string) {
  let statusLine = 'Capturando página en el servidor…'
  let imageDataUrl =
    'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
  let jpeg: Buffer | null = null
  let meta = { status: 0, bytes: 0, subrecursos: 0 }

  // 1) Metadata del proxy (bytes / subrecursos)
  try {
    const doc = await fetchBrowserDocument(startUrl)
    meta = {
      status: doc.status,
      bytes: doc.bytes,
      subrecursos: doc.subrecursos ?? 0,
    }
  } catch (error) {
    logger.warn({ error, startUrl }, 'navegador meta fetch failed')
  }

  // 2) Screenshot real en el servidor
  try {
    const shot = await capturePageScreenshot(startUrl)
    jpeg = shot.jpeg
    imageDataUrl = `data:image/jpeg;base64,${shot.jpeg.toString('base64')}`
    statusLine = `HTTP ${meta.status || 200} - ${meta.bytes || shot.jpeg.length} bytes - ${meta.subrecursos} subrecursos · captura ${shot.width}x${shot.height}`
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    logger.warn({ error: msg, startUrl }, 'navegador screenshot failed')
    statusLine = `Sin captura: ${msg.slice(0, 120)}`
  }

  // 3) Foto normal de WhatsApp (siempre se ve)
  if (jpeg && jpeg.length > 500) {
    try {
      await ctx.socket.sendMessage(ctx.chatId, {
        image: jpeg,
        caption: `🌐 ${startUrl}\n${statusLine}`,
      })
    } catch (error) {
      logger.warn({ error }, 'navegador send image failed')
    }
  }

  // 4) Panel GenAI con la misma imagen (proyector)
  const msgId = `message-${Date.now()}-${randomBytes(4).toString('hex')}`
  const HTML = buildShell({ startUrl, statusLine, imageDataUrl })
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
    description: 'Navegador: captura de página en el servidor (proyector).',
    usage: 'nav [url|búsqueda]',
    async handler(ctx) {
      const startUrl = resolveStartUrl(ctx.args, ctx.argText)
      try {
        await sendBrowserMessage(ctx, startUrl)
      } catch (error) {
        logger.warn({ error }, 'navegador send failed')
        const err = error instanceof Error ? error.message : String(error)
        await ctx.reply(`❌ Navegador: ${err.slice(0, 240)}`)
      }
    },
  },
]
