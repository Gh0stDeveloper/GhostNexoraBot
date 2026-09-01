/**
 * .nav | .navegador | .view — navegador embebido Ghost Nexora
 *
 * WhatsApp NO navega bien iframes con src externo. Por eso:
 * 1) La página inicial se inyecta con srcdoc desde base64 (sin depender del proxy público).
 * 2) BUSCAR hace fetch al proxy (JSON) y aplica srcdoc (como el diseño original).
 * 3) No se envía mensaje de texto de confirmación.
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

/** Límite seguro para el payload GenAI de WhatsApp */
const MAX_INLINE_BYTES = 900_000

const STATIC_TRUSTED = [
  'https://ghostnexorabot.duckdns.org',
  'https://www.google.com',
  'https://google.com',
  'https://whatsapp.com',
  'https://es.wikipedia.org',
  'https://en.wikipedia.org',
  'https://www.wikipedia.org',
  'https://example.com',
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
  return [...new Set(
    [...STATIC_TRUSTED, proxyOrigin, targetOrigin].filter((v): v is string => Boolean(v)),
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

/** Quita scripts pesados que rompen el sandbox del WebView de WhatsApp */
function lightenHtml(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
}

function buildHtml(startUrl: string, initialPageHtml: string) {
  const safeStart = escapeAttribute(startUrl)
  const safeProxy = escapeAttribute(PUBLIC_PROXY)
  // base64 evita límites y escapes rotos del atributo srcdoc="..."
  const b64 = Buffer.from(initialPageHtml || '', 'utf8').toString('base64')
  const hasInitial = Boolean(initialPageHtml)

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
  <div id="status">${hasInitial ? 'Cargando vista…' : 'Sin precarga — usa BUSCAR'}</div>
  <iframe id="view" sandbox="allow-same-origin allow-scripts allow-forms allow-popups" referrerpolicy="no-referrer"></iframe>
<script>
(function(){
  var PROXY = "${safeProxy}";
  var INITIAL_B64 = "${b64}";
  var statusEl = document.getElementById("status");
  var view = document.getElementById("view");
  var input = document.getElementById("url");

  function setStatus(t){ statusEl.textContent = t; }

  function b64ToHtml(b64){
    try {
      var bin = atob(b64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder("utf-8").decode(bytes);
    } catch (e) {
      // fallback Latin1
      try { return decodeURIComponent(escape(atob(b64))); } catch (e2) { return ""; }
    }
  }

  function showHtml(html, label){
    if (!html || html.length < 20) {
      setStatus("Sin contenido HTML");
      return;
    }
    view.removeAttribute("src");
    view.srcdoc = html;
    setStatus(label || ("OK · " + html.length + " chars"));
  }

  function norm(u){
    u = (u || "").trim();
    if (!u) return "";
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    return u;
  }

  async function buscar(force){
    var url = norm(force || input.value);
    if (!url) { setStatus("Escribe una URL"); return; }
    input.value = url;
    setStatus("⏳ Consultando proxy…");
    try {
      var res = await fetch(PROXY + "?url=" + encodeURIComponent(url));
      var data = await res.json();
      if (data.error || data.ok === false) throw new Error(data.error || data.message || "error proxy");
      var html = data.html || "";
      if (!html) throw new Error("Proxy sin html");
      showHtml(html, "HTTP " + (data.status || res.status) + " · " + (data.bytes || html.length) + " bytes · " + (data.subrecursos || 0) + " subrecursos");
    } catch (e) {
      setStatus("❌ " + (e && e.message ? e.message : String(e)));
    }
  }

  document.getElementById("btn").addEventListener("click", function(){ buscar(); });
  input.addEventListener("keydown", function(e){ if (e.key === "Enter") buscar(); });

  if (INITIAL_B64 && INITIAL_B64.length > 8) {
    showHtml(b64ToHtml(INITIAL_B64), "Vista inicial");
  } else {
    setStatus("Listo — pulsa BUSCAR");
  }
})();
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
    let html = lightenHtml(result.html)
    if (Buffer.byteLength(html, 'utf8') > MAX_INLINE_BYTES) {
      html = html.slice(0, MAX_INLINE_BYTES) + '\n<!-- truncated by Ghost Nexora -->'
    }
    initialPageHtml = html
    logger.info(
      { startUrl, bytes: Buffer.byteLength(html, 'utf8'), status: result.status },
      'navegador initial page ready',
    )
  } catch (error) {
    logger.warn({ error, startUrl }, 'navegador initial fetch failed; UI still opens')
    initialPageHtml = `<!doctype html><html><body style="font-family:system-ui;padding:16px;background:#111;color:#eee">
      <p>No se pudo precargar <b>${escapeAttribute(startUrl)}</b>.</p>
      <p>Pulsa <b>BUSCAR</b> (necesita proxy público OK).</p>
    </body></html>`
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
        // sin mensaje de confirmación (solo el panel)
      } catch (error) {
        logger.warn({ error }, 'navegador send failed')
        const err = error instanceof Error ? error.message : String(error)
        await ctx.reply(`❌ No se pudo abrir el navegador.\n${err.slice(0, 200)}`)
      }
    },
  },
]
