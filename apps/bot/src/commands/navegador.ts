/**
 * .nav | .navegador | .view
 *
 * Navegador server-rendered para el HTML Primitive de WhatsApp.
 * El WebView de WhatsApp no permite red saliente, así que las páginas
 * navegables se obtienen antes de enviar el mensaje y se empacan como DOM.
 */
import { randomBytes } from 'node:crypto'
import { generateWAMessageFromContent } from 'baileys'
import { load } from 'cheerio'
import type { BotCommand, CommandContext } from '../types.js'
import { fetchBrowserDocument, type BrowserDocument } from '../services/browser-proxy.js'
import { logger } from '../utils/logger.js'

const MAX_STANZA_HTML_BYTES = 760 * 1024
const INITIAL_PAGE_BUDGET = 360 * 1024
const EXTRA_PAGE_BUDGET = 115 * 1024
const MAX_PRELOADED_PAGES = 4
const MAX_LINK_CANDIDATES = 14

type PackedPage = {
  status: number
  bytes: number
  html: string
  finalUrl: string
  subrecursos: number
  title: string
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

function extractPageLinks(html: string) {
  const $ = load(html)
  const links: string[] = []
  const seen = new Set<string>()

  $('a[data-gn-url]').each((_, node) => {
    const raw = ($(node).attr('data-gn-url') || '').trim()
    if (!raw || seen.has(raw)) return
    try {
      const url = new URL(raw)
      if (!['http:', 'https:'].includes(url.protocol)) return
      seen.add(raw)
      links.push(raw)
    } catch {
      // ignore malformed URL
    }
  })

  return links.slice(0, MAX_LINK_CANDIDATES)
}

function compactPage(page: BrowserDocument, maxBytes: number): PackedPage {
  if (Buffer.byteLength(page.html, 'utf8') <= maxBytes) return { ...page }

  const $ = load(page.html, { xmlMode: false })

  $('style,link,svg,canvas,video,audio,source,track,iframe,object,embed,noscript,script').remove()

  $('img').each((_, node) => {
    const el = $(node)
    const alt = (el.attr('alt') || el.attr('title') || 'Imagen').trim().slice(0, 100)
    el.replaceWith(`<span class="gn-image-placeholder">[${escapeAttr(alt || 'Imagen')}]</span>`)
  })

  $('*').each((_, node) => {
    const el = $(node)
    const attrs = (node as { attribs?: Record<string, string> }).attribs
    if (!attrs) return
    for (const name of Object.keys(attrs)) {
      const keep =
        name === 'data-gn-url' ||
        name === 'data-gn-fragment' ||
        name === 'data-gn-action' ||
        name === 'data-gn-method' ||
        name === 'data-gn-formaction' ||
        name === 'id' ||
        name === 'name' ||
        name === 'value' ||
        name === 'type' ||
        name === 'placeholder' ||
        name === 'checked' ||
        name === 'selected' ||
        name === 'disabled'
      if (!keep) el.removeAttr(name)
    }
  })

  const body = $('.gn-document').first().length
    ? $('.gn-document').first().html() || ''
    : $('body').html() || $.root().html() || ''

  const shell = [
    '<style>',
    ':host{display:block;background:#fff;color:#15171a;font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif}',
    '.gn-lite{padding:14px;line-height:1.45;overflow-wrap:anywhere}',
    '.gn-lite a{color:#1769e0;text-decoration:none;cursor:pointer}',
    '.gn-lite h1,.gn-lite h2,.gn-lite h3{line-height:1.2}',
    '.gn-lite input,.gn-lite button,.gn-lite select,.gn-lite textarea{max-width:100%;font:inherit}',
    '.gn-image-placeholder{display:inline-block;padding:6px 9px;margin:2px;background:#f1f3f5;color:#727780;border-radius:6px;font-size:11px}',
    '</style>',
    `<div class="gn-lite">${body}</div>`,
  ].join('')

  if (Buffer.byteLength(shell, 'utf8') <= maxBytes) {
    return { ...page, html: shell, bytes: Buffer.byteLength(shell, 'utf8') }
  }

  const textParts: string[] = []
  $('h1,h2,h3,p,li,article,section').each((_, node) => {
    const text = $(node).text().replace(/\s+/g, ' ').trim()
    if (text && text.length >= 12) textParts.push(text.slice(0, 700))
  })

  const links: Array<{ text: string; url: string }> = []
  $('a[data-gn-url]').each((_, node) => {
    if (links.length >= 60) return
    const url = ($(node).attr('data-gn-url') || '').trim()
    if (!url) return
    const text = $(node).text().replace(/\s+/g, ' ').trim() || url
    links.push({ text: text.slice(0, 180), url })
  })

  let lite = [
    '<style>:host{display:block;background:#fff;color:#17191c;font-family:system-ui,Arial,sans-serif}.gn-text{padding:16px;line-height:1.48}.gn-text a{display:block;padding:9px 0;color:#1769e0;text-decoration:none;border-bottom:1px solid #eee}.gn-text p{margin:0 0 12px}</style>',
    '<div class="gn-text">',
    `<h2>${escapeAttr(page.title || new URL(page.finalUrl).hostname)}</h2>`,
    ...textParts.slice(0, 70).map((text) => `<p>${escapeAttr(text)}</p>`),
    links.length ? '<h3>Enlaces</h3>' : '',
    ...links.map((item) => `<a href="#" data-gn-url="${escapeAttr(item.url)}">${escapeAttr(item.text)}</a>`),
    '</div>',
  ].join('')

  if (Buffer.byteLength(lite, 'utf8') > maxBytes) {
    lite = [
      '<style>:host{display:block;background:#fff;color:#17191c;font-family:system-ui,Arial,sans-serif}.gn-text{padding:16px;line-height:1.45}.gn-text a{display:block;padding:8px 0;color:#1769e0;text-decoration:none}</style>',
      '<div class="gn-text">',
      `<h2>${escapeAttr(page.title || new URL(page.finalUrl).hostname)}</h2>`,
      ...textParts.slice(0, 24).map((text) => `<p>${escapeAttr(text.slice(0, 420))}</p>`),
      ...links.slice(0, 30).map((item) => `<a href="#" data-gn-url="${escapeAttr(item.url)}">${escapeAttr(item.text)}</a>`),
      '</div>',
    ].join('')
  }

  return { ...page, html: lite, bytes: Buffer.byteLength(lite, 'utf8') }
}

async function buildOfflineBundle(startUrl: string, sid: string) {
  const initialRaw = await fetchBrowserDocument(startUrl, { sid })
  const initial = compactPage(initialRaw, INITIAL_PAGE_BUDGET)
  const pages: PackedPage[] = [initial]
  const aliases = new Map<string, string>()
  aliases.set(startUrl, initial.finalUrl)
  aliases.set(initial.finalUrl, initial.finalUrl)

  let totalBytes = Buffer.byteLength(initial.html, 'utf8')
  const candidates = extractPageLinks(initialRaw.html)

  for (const url of candidates) {
    if (pages.length >= MAX_PRELOADED_PAGES) break
    if (aliases.has(url)) continue
    try {
      const raw = await fetchBrowserDocument(url, { sid })
      const packed = compactPage(raw, EXTRA_PAGE_BUDGET)
      const size = Buffer.byteLength(packed.html, 'utf8')
      if (totalBytes + size > MAX_STANZA_HTML_BYTES) continue
      totalBytes += size
      pages.push(packed)
      aliases.set(url, packed.finalUrl)
      aliases.set(packed.finalUrl, packed.finalUrl)
    } catch (error) {
      logger.debug({ error, url }, 'browser preload page skipped')
    }
  }

  return {
    pages,
    aliases: Object.fromEntries(aliases),
    initialUrl: initial.finalUrl,
  }
}

function buildBrowserShell(options: {
  startUrl: string
  pages: PackedPage[]
  aliases: Record<string, string>
  initialUrl: string
}) {
  const startUrl = escapeAttr(options.startUrl)
  const bundle = {
    pages: options.pages,
    aliases: options.aliases,
    initialUrl: options.initialUrl,
  }

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#0d0f12;color:#f5f7fa;font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif}body{padding:10px}.browser{overflow:hidden;border:1px solid #292d34;border-radius:16px;background:#111419}.bar{display:flex;align-items:center;gap:6px;padding:8px;background:#171a20;border-bottom:1px solid #292d34}.icon{width:34px;height:34px;border:0;border-radius:9px;background:#22262e;color:#eef1f5;font-size:20px;line-height:34px;text-align:center;padding:0}.icon:disabled{opacity:.35}.address{display:flex;align-items:center;gap:6px;padding:8px;background:#171a20}#url{flex:1;min-width:0;height:38px;border:1px solid #333842;border-radius:11px;background:#0e1116;color:#f5f7fa;padding:0 12px;outline:none;font-size:13px}#url:focus{border-color:#4d88ff}#go{height:38px;border:0;border-radius:11px;padding:0 14px;background:#3b82f6;color:#fff;font-weight:700}.meta{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 10px;border-top:1px solid #242830;border-bottom:1px solid #242830;background:#12151a;color:#98a0ad;font-size:10px}#title{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:#c9ced7;max-width:58%}#status{text-align:right;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}#viewport{height:min(66vh,620px);min-height:360px;overflow:auto;background:#fff;color:#111;contain:layout paint;isolation:isolate;overscroll-behavior:contain}.error{padding:24px;color:#5d2525;background:#fff;font-size:13px;line-height:1.55}.error code{display:block;margin:12px 0;padding:10px;background:#f2f4f7;color:#25282d;border-radius:8px;overflow-wrap:anywhere}.copy{border:0;border-radius:9px;padding:9px 12px;background:#22262e;color:#fff;font-weight:700}
</style>
</head>
<body>
<div class="browser">
<div class="bar"><button id="back" class="icon" type="button">‹</button><button id="forward" class="icon" type="button">›</button><button id="reload" class="icon" type="button">↻</button><button id="home" class="icon" type="button">⌂</button></div>
<div class="address"><input id="url" value="${startUrl}" autocomplete="off" spellcheck="false" inputmode="url"><button id="go" type="button">Ir</button></div>
<div class="meta"><span id="title">Ghost Nexora Browser</span><span id="status">Contenido precargado</span></div>
<div id="viewport"></div>
</div>
<script id="gn-bundle" type="application/json">${safeJson(bundle)}</script>
<script>
(function(){
'use strict';
var data=JSON.parse(document.getElementById('gn-bundle').textContent||'{}');
var viewport=document.getElementById('viewport'),address=document.getElementById('url'),titleEl=document.getElementById('title'),statusEl=document.getElementById('status'),backBtn=document.getElementById('back'),forwardBtn=document.getElementById('forward');
var shadow=viewport.attachShadow?viewport.attachShadow({mode:'open'}):null,pages=Object.create(null),aliases=data.aliases||{},stack=[],index=-1,current='';
(data.pages||[]).forEach(function(page){pages[page.finalUrl]=page;});
function root(){return shadow||viewport;}function setContent(html){if(shadow)shadow.innerHTML=html;else viewport.innerHTML=html;}
function humanBytes(value){var n=Number(value||0);if(n<1024)return n+' B';if(n<1048576)return(n/1024).toFixed(1)+' KB';return(n/1048576).toFixed(1)+' MB';}
function normalize(value){var v=String(value||'').trim();if(!v)return'';if(/^https?:\/\//i.test(v))return v;if(/^[^\s/]+\.[A-Za-z]{2,}(?:\/\S*)?$/.test(v))return'https://'+v;return'https://html.duckduckgo.com/html/?q='+encodeURIComponent(v);}
function resolveKey(url){if(pages[url])return url;if(aliases[url]&&pages[aliases[url]])return aliases[url];try{var u=new URL(url);u.hash='';var clean=u.toString();if(pages[clean])return clean;if(aliases[clean]&&pages[aliases[clean]])return aliases[clean];}catch(_){}return'';}
function updateButtons(){backBtn.disabled=index<=0;forwardBtn.disabled=index<0||index>=stack.length-1;}
function renderKey(key,push){var page=pages[key];if(!page)return false;current=key;address.value=page.finalUrl;titleEl.textContent=page.title||'Ghost Nexora Browser';statusEl.textContent='HTTP '+page.status+' · '+humanBytes(page.bytes)+' · '+(data.pages||[]).length+' páginas';setContent(page.html||'<div class="error">Sin contenido visible.</div>');if(push!==false){stack=stack.slice(0,index+1);stack.push(key);index=stack.length-1;}updateButtons();return true;}
function copyText(text){var ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');}catch(_){}ta.remove();}
function showUnavailable(url){current='';address.value=url;titleEl.textContent='URL no precargada';statusEl.textContent='WhatsApp bloquea la red';var command='.view '+url;setContent('<div class="error"><strong>Esta URL no está precargada.</strong><br><br>WhatsApp bloquea las conexiones de red de esta tarjeta. Para abrirla, envía al bot:<code id="gn-command"></code><button class="copy" id="gn-copy" type="button">Copiar comando</button></div>');var cmd=root().querySelector?root().querySelector('#gn-command'):null;if(cmd)cmd.textContent=command;var btn=root().querySelector?root().querySelector('#gn-copy'):null;if(btn)btn.addEventListener('click',function(){copyText(command);statusEl.textContent='Comando copiado';});}
function navigate(url,push){var target=normalize(url),key=resolveKey(target);if(key)renderKey(key,push);else showUnavailable(target);}
function findAnchor(target){while(target&&target!==root()){if(target.nodeType===1&&target.matches&&target.matches('a[data-gn-url],a[data-gn-fragment]'))return target;target=target.parentNode;}return null;}
function onClick(event){var a=findAnchor(event.target);if(!a)return;var fragment=a.getAttribute('data-gn-fragment');if(fragment){event.preventDefault();var node=root().getElementById?root().getElementById(fragment):null;if(node&&node.scrollIntoView)node.scrollIntoView({block:'start'});return;}var url=a.getAttribute('data-gn-url');if(url){event.preventDefault();navigate(url,true);}}
function onSubmit(event){event.preventDefault();var form=event.target,action=form&&form.getAttribute?form.getAttribute('data-gn-action'):'';if(!action)return;var params=new URLSearchParams(new FormData(form)),next=new URL(action);params.forEach(function(value,key){next.searchParams.append(key,value);});navigate(next.toString(),true);}
root().addEventListener('click',onClick);root().addEventListener('submit',onSubmit);
document.getElementById('go').addEventListener('click',function(){navigate(address.value,true);});address.addEventListener('keydown',function(event){if(event.key==='Enter')navigate(address.value,true);});document.getElementById('reload').addEventListener('click',function(){if(current)renderKey(current,false);});document.getElementById('home').addEventListener('click',function(){navigate(data.initialUrl||'',true);});backBtn.addEventListener('click',function(){if(index<=0)return;index-=1;renderKey(stack[index],false);updateButtons();});forwardBtn.addEventListener('click',function(){if(index>=stack.length-1)return;index+=1;renderKey(stack[index],false);updateButtons();});
var initialKey=resolveKey(data.initialUrl||'');if(initialKey)renderKey(initialKey,true);else setContent('<div class="error">No se pudo empacar la página inicial.</div>');
})();
</script>
</body>
</html>`
}

async function sendBrowserMessage(ctx: CommandContext, startUrl: string) {
  const sid = randomBytes(16).toString('hex')
  let bundle: Awaited<ReturnType<typeof buildOfflineBundle>>

  try {
    bundle = await buildOfflineBundle(startUrl, sid)
  } catch (error) {
    logger.warn({ error, startUrl }, 'offline browser bundle fetch failed')
    const message = error instanceof Error ? error.message : String(error)
    await ctx.reply(`No se pudo cargar la página: ${message.slice(0, 240)}`)
    return
  }

  const msgId = `message-${Date.now()}-${randomBytes(4).toString('hex')}`
  const html = buildBrowserShell({ startUrl, pages: bundle.pages, aliases: bundle.aliases, initialUrl: bundle.initialUrl })
  const payload = {
    response_id: msgId,
    sections: [{ view_model: { primitive: { __typename: 'GenAIaeacdsnwHtmlPrimitive', payload: html, trusted_sources: [] }, __typename: 'GenAISingleLayoutViewModel' } }],
  }

  const slots: Record<string, unknown> = {
    messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2, messageSecret: randomBytes(32).toString('base64'), botMetadata: { messageDisclaimerText: '', botResponseId: msgId } },
    botForwardedMessage: {
      message: {
        richResponseMessage: {
          messageType: 1,
          submessages: [{ messageType: 2, messageText: 'Navegador Ghost Nexora' }],
          unifiedResponse: { data: Buffer.from(JSON.stringify(payload)).toString('base64') },
          contextInfo: { mentionedJid: [], groupMentions: [], statusAttributions: [], forwardingScore: 1, isForwarded: true, forwardedAiBotMessageInfo: { botJid: '867051314767696@bot' }, forwardOrigin: 4 },
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
    description: 'Navegador server-rendered para WhatsApp con páginas precargadas.',
    usage: 'nav [url|búsqueda]',
    async handler(ctx) {
      const startUrl = resolveStartUrl(ctx.args, ctx.argText)
      try {
        await sendBrowserMessage(ctx, startUrl)
      } catch (error) {
        logger.warn({ error }, 'offline browser send failed')
        const message = error instanceof Error ? error.message : String(error)
        await ctx.reply(`No se pudo iniciar el navegador: ${message.slice(0, 240)}`)
      }
    },
  },
]
