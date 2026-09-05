/**
 * .nav | .navegador | .view
 *
 * Navegador DOM interactivo dentro del mensaje enriquecido de WhatsApp.
 * No usa capturas: el servidor obtiene y transforma HTML real, y el cliente
 * navega por enlaces/formularios a través del proxy same-origin de Ghost Nexora.
 */
import { randomBytes } from 'node:crypto'
import { generateWAMessageFromContent } from 'baileys'
import type { BotCommand, CommandContext } from '../types.js'
import { config } from '../config.js'
import { fetchBrowserDocument, type BrowserDocument } from '../services/browser-proxy.js'
import { logger } from '../utils/logger.js'

const PUBLIC_ORIGIN = (process.env.PUBLIC_WEB_URL || 'https://ghostnexorabot.duckdns.org').replace(/\/$/, '')
const PUBLIC_PROXY = process.env.BROWSER_PROXY_PUBLIC_URL || config.browserProxyPublicUrl || `${PUBLIC_ORIGIN}/proxy`
const MAX_INLINE_INITIAL_BYTES = 450 * 1024

function originOf(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).origin
  } catch {
    return null
  }
}

function trustedSources() {
  return [...new Set([PUBLIC_ORIGIN, originOf(PUBLIC_PROXY)].filter((value): value is string => Boolean(value)))]
}

function escapeAttr(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function safeJson(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

function resolveStartUrl(args: string[], argText: string): string {
  const input = (argText || args.join(' ')).trim()
  if (!input) return 'https://html.duckduckgo.com/html/'
  if (/^https?:\/\//i.test(input)) return input
  if (/^[^\s/]+\.[A-Za-z]{2,}(?:\/\S*)?$/.test(input)) return `https://${input}`
  return `https://html.duckduckgo.com/html/?q=${encodeURIComponent(input)}`
}

function buildBrowserShell(options: {
  sid: string
  startUrl: string
  initialPage: BrowserDocument | null
}) {
  const proxy = escapeAttr(PUBLIC_PROXY)
  const sid = escapeAttr(options.sid)
  const startUrl = escapeAttr(options.startUrl)
  const initial = options.initialPage
    ? {
        ok: true,
        status: options.initialPage.status,
        bytes: options.initialPage.bytes,
        html: options.initialPage.html,
        finalUrl: options.initialPage.finalUrl,
        subrecursos: options.initialPage.subrecursos,
        title: options.initialPage.title,
      }
    : null

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
  *{box-sizing:border-box}
  html,body{margin:0;min-height:100%;background:#0d0f12;color:#f5f7fa;font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif}
  body{padding:10px}
  .browser{overflow:hidden;border:1px solid #292d34;border-radius:16px;background:#111419;box-shadow:0 8px 30px rgba(0,0,0,.25)}
  .bar{display:flex;align-items:center;gap:6px;padding:8px;background:#171a20;border-bottom:1px solid #292d34}
  .icon{width:34px;height:34px;border:0;border-radius:9px;background:#22262e;color:#eef1f5;font-size:20px;line-height:34px;text-align:center;padding:0}
  .icon:disabled{opacity:.35}
  .address{display:flex;align-items:center;gap:6px;padding:8px;background:#171a20}
  #url{flex:1;min-width:0;height:38px;border:1px solid #333842;border-radius:11px;background:#0e1116;color:#f5f7fa;padding:0 12px;outline:none;font-size:13px}
  #url:focus{border-color:#4d88ff}
  #go{height:38px;border:0;border-radius:11px;padding:0 14px;background:#3b82f6;color:#fff;font-weight:700}
  .meta{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 10px;border-top:1px solid #242830;border-bottom:1px solid #242830;background:#12151a;color:#98a0ad;font-size:10px}
  #title{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:#c9ced7;max-width:58%}
  #status{text-align:right;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
  #viewport{height:min(66vh,620px);min-height:360px;overflow:auto;background:#fff;color:#111;contain:layout paint;isolation:isolate;overscroll-behavior:contain}
  .loading{display:flex;align-items:center;justify-content:center;height:100%;color:#707784;background:#fff;font-size:13px}
  .error{padding:24px;color:#8b1e1e;background:#fff;font-size:13px;line-height:1.5}
</style>
</head>
<body>
<div class="browser">
  <div class="bar">
    <button id="back" class="icon" type="button" aria-label="Atrás">‹</button>
    <button id="forward" class="icon" type="button" aria-label="Adelante">›</button>
    <button id="reload" class="icon" type="button" aria-label="Recargar">↻</button>
    <button id="home" class="icon" type="button" aria-label="Inicio">⌂</button>
  </div>
  <div class="address">
    <input id="url" value="${startUrl}" autocomplete="off" spellcheck="false" inputmode="url">
    <button id="go" type="button">Ir</button>
  </div>
  <div class="meta"><span id="title">Ghost Nexora Browser</span><span id="status">Preparando…</span></div>
  <div id="viewport"><div class="loading">Cargando página…</div></div>
</div>
<script id="gn-initial" type="application/json">${safeJson(initial)}</script>
<script>
(function(){
  'use strict';
  var PROXY = "${proxy}";
  var SID = "${sid}";
  var START = "${startUrl}";
  var viewport = document.getElementById('viewport');
  var address = document.getElementById('url');
  var titleEl = document.getElementById('title');
  var statusEl = document.getElementById('status');
  var backBtn = document.getElementById('back');
  var forwardBtn = document.getElementById('forward');
  var shadow = viewport.attachShadow ? viewport.attachShadow({mode:'open'}) : null;
  var historyStack = [];
  var historyIndex = -1;
  var currentPage = null;

  function root(){ return shadow || viewport; }
  function setContent(html){
    if (shadow) shadow.innerHTML = html;
    else viewport.innerHTML = html;
  }
  function setBusy(text){ statusEl.textContent = text || 'Cargando…'; }
  function updateButtons(){
    backBtn.disabled = historyIndex <= 0;
    forwardBtn.disabled = historyIndex < 0 || historyIndex >= historyStack.length - 1;
  }
  function humanBytes(value){
    var n = Number(value || 0);
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n/1024).toFixed(1) + ' KB';
    return (n/1048576).toFixed(1) + ' MB';
  }
  function normalizeInput(value){
    var v = String(value || '').trim();
    if (!v) return 'https://html.duckduckgo.com/html/';
    if (/^https?:\/\//i.test(v)) return v;
    if (/^[^\s/]+\.[A-Za-z]{2,}(?:\/\S*)?$/.test(v)) return 'https://' + v;
    return 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(v);
  }
  function remember(page){
    if (historyIndex >= 0 && historyStack[historyIndex] && historyStack[historyIndex].finalUrl === page.finalUrl) {
      historyStack[historyIndex] = page;
      return;
    }
    historyStack = historyStack.slice(0, historyIndex + 1);
    historyStack.push(page);
    historyIndex = historyStack.length - 1;
  }
  function render(page, pushHistory){
    currentPage = page;
    address.value = page.finalUrl || address.value;
    titleEl.textContent = page.title || 'Ghost Nexora Browser';
    statusEl.textContent = 'HTTP ' + page.status + ' · ' + humanBytes(page.bytes) + ' · ' + (page.subrecursos || 0) + ' recursos';
    setContent(page.html || '<div class="error">La página no devolvió contenido visible.</div>');
    if (pushHistory !== false) remember(page);
    updateButtons();
  }
  function showError(message){
    setContent('<div class="error"><strong>No se pudo cargar la página.</strong><br><br>' + String(message || 'Error desconocido').replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c];}) + '</div>');
    statusEl.textContent = 'Error';
  }
  async function requestPage(url, options){
    options = options || {};
    var target = normalizeInput(url);
    setBusy('Cargando…');
    var endpoint = PROXY + '?mode=document&sid=' + encodeURIComponent(SID) + '&url=' + encodeURIComponent(target);
    var init = {method:'GET',headers:{'accept':'application/json'}};
    if (options.method === 'POST') {
      init.method = 'POST';
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify({url:target,method:'POST',body:options.body || '',contentType:options.contentType || 'application/x-www-form-urlencoded;charset=UTF-8'});
    }
    try {
      var response = await fetch(endpoint, init);
      var data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || ('HTTP ' + response.status));
      render(data, options.pushHistory !== false);
      return data;
    } catch (error) {
      showError(error && error.message ? error.message : String(error));
      return null;
    }
  }
  function findAnchor(target){
    while (target && target !== root()) {
      if (target.nodeType === 1 && target.matches && target.matches('a[data-gn-url],a[data-gn-fragment]')) return target;
      target = target.parentNode;
    }
    return null;
  }
  function handleClick(event){
    var anchor = findAnchor(event.target);
    if (!anchor) return;
    var fragment = anchor.getAttribute('data-gn-fragment');
    if (fragment) {
      event.preventDefault();
      var node = root().getElementById ? root().getElementById(fragment) : null;
      if (node && node.scrollIntoView) node.scrollIntoView({block:'start'});
      return;
    }
    var url = anchor.getAttribute('data-gn-url');
    if (url) {
      event.preventDefault();
      requestPage(url, {pushHistory:true});
    }
  }
  function serializeForm(form, submitter){
    var params = new URLSearchParams();
    var data = new FormData(form);
    data.forEach(function(value,key){ if (typeof value === 'string') params.append(key,value); });
    if (submitter && submitter.name) params.append(submitter.name, submitter.value || '');
    return params;
  }
  function handleSubmit(event){
    var form = event.target;
    if (!form || !form.getAttribute) return;
    var action = (event.submitter && event.submitter.getAttribute && event.submitter.getAttribute('data-gn-formaction')) || form.getAttribute('data-gn-action');
    if (!action) return;
    event.preventDefault();
    var method = (form.getAttribute('data-gn-method') || 'GET').toUpperCase();
    var params = serializeForm(form, event.submitter);
    if (method === 'POST') {
      requestPage(action, {method:'POST',body:params.toString(),pushHistory:true});
    } else {
      var next = new URL(action);
      params.forEach(function(value,key){ next.searchParams.append(key,value); });
      requestPage(next.toString(), {pushHistory:true});
    }
  }
  function bindRoot(){
    root().addEventListener('click', handleClick);
    root().addEventListener('submit', handleSubmit);
  }

  document.getElementById('go').addEventListener('click', function(){ requestPage(address.value, {pushHistory:true}); });
  address.addEventListener('keydown', function(event){ if (event.key === 'Enter') requestPage(address.value, {pushHistory:true}); });
  document.getElementById('reload').addEventListener('click', function(){ if (currentPage) requestPage(currentPage.finalUrl, {pushHistory:false}); else requestPage(address.value, {pushHistory:false}); });
  document.getElementById('home').addEventListener('click', function(){ requestPage('https://html.duckduckgo.com/html/', {pushHistory:true}); });
  backBtn.addEventListener('click', function(){
    if (historyIndex <= 0) return;
    historyIndex -= 1;
    render(historyStack[historyIndex], false);
    updateButtons();
  });
  forwardBtn.addEventListener('click', function(){
    if (historyIndex >= historyStack.length - 1) return;
    historyIndex += 1;
    render(historyStack[historyIndex], false);
    updateButtons();
  });

  bindRoot();
  updateButtons();
  var initial = null;
  try { initial = JSON.parse(document.getElementById('gn-initial').textContent || 'null'); } catch (_) {}
  if (initial && initial.ok && initial.html) render(initial, true);
  else requestPage(START, {pushHistory:true});
})();
</script>
</body>
</html>`
}

async function sendBrowserMessage(ctx: CommandContext, startUrl: string) {
  const sid = randomBytes(16).toString('hex')
  let initialPage: BrowserDocument | null = null

  try {
    const page = await fetchBrowserDocument(startUrl, { sid })
    if (Buffer.byteLength(page.html, 'utf8') <= MAX_INLINE_INITIAL_BYTES) initialPage = page
  } catch (error) {
    logger.warn({ error, startUrl }, 'initial interactive browser fetch failed')
  }

  const msgId = `message-${Date.now()}-${randomBytes(4).toString('hex')}`
  const html = buildBrowserShell({ sid, startUrl, initialPage })
  const payload = {
    response_id: msgId,
    sections: [
      {
        view_model: {
          primitive: {
            __typename: 'GenAIaeacdsnwHtmlPrimitive',
            payload: html,
            trusted_sources: trustedSources(),
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
          submessages: [{ messageType: 2, messageText: 'Navegador Ghost Nexora' }],
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
    description: 'Navegador web interactivo mediante el proxy de Ghost Nexora.',
    usage: 'nav [url|búsqueda]',
    async handler(ctx) {
      const startUrl = resolveStartUrl(ctx.args, ctx.argText)
      try {
        await sendBrowserMessage(ctx, startUrl)
      } catch (error) {
        logger.warn({ error }, 'interactive browser send failed')
        const message = error instanceof Error ? error.message : String(error)
        await ctx.reply(`No se pudo iniciar el navegador: ${message.slice(0, 240)}`)
      }
    },
  },
]
