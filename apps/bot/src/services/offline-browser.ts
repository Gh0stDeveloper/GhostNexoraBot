import { load } from 'cheerio'
import { fetchBrowserDocument, type BrowserDocument } from './browser-proxy.js'
import { logger } from '../utils/logger.js'

function envInt(name: string, fallback: number, min: number, max: number) {
  const raw = Number(process.env[name])
  if (!Number.isFinite(raw)) return fallback
  return Math.max(min, Math.min(max, Math.floor(raw)))
}

export const OFFLINE_BROWSER_LIMITS = {
  targetHtmlBytes: envInt('NAV_MAX_HTML_KB', 220, 80, 512) * 1024,
  hardHtmlBytes: envInt('NAV_HARD_HTML_KB', 300, 100, 768) * 1024,
  hardUnifiedBytes: envInt('NAV_HARD_UNIFIED_KB', 420, 140, 1024) * 1024,
  initialPageBytes: envInt('NAV_INITIAL_PAGE_KB', 110, 40, 240) * 1024,
  extraPageBytes: envInt('NAV_EXTRA_PAGE_KB', 32, 12, 96) * 1024,
  emergencyPageBytes: envInt('NAV_EMERGENCY_PAGE_KB', 56, 24, 120) * 1024,
  maxPages: envInt('NAV_PRELOAD_PAGES', 3, 1, 5),
  maxCandidates: envInt('NAV_PRELOAD_CANDIDATES', 12, 3, 24),
} as const

export type BrowserLabels = {
  go: string
  preloaded: string
  pages: string
  image: string
  noVisibleContent: string
  links: string
  unavailableTitle: string
  networkBlocked: string
  unavailableBody: string
  networkExplanation: string
  copyCommand: string
  commandCopied: string
  initialPackFailed: string
  runtimeWarning: string
  runtimeError: string
  postUnsupported: string
}

export type PackedPage = BrowserDocument

export type OfflineBrowserBundle = {
  pages: PackedPage[]
  aliases: Record<string, string>
  initialUrl: string
}

export type PreparedOfflineBrowser = {
  html: string
  htmlBytes: number
  unifiedData: string
  unifiedBytes: number
  pages: PackedPage[]
  compacted: boolean
}

function escapeHtml(value: string) {
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

function truncateUtf8(value: string, maxBytes: number) {
  if (maxBytes <= 0) return ''
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) return value
  let low = 0
  let high = value.length
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (Buffer.byteLength(value.slice(0, mid), 'utf8') <= maxBytes) low = mid
    else high = mid - 1
  }
  return value.slice(0, low).trimEnd()
}

function neutralizeRemoteCss(value: string) {
  return value
    .replace(/@import\s+(?:url\()?\s*["']?[^;"')]+["']?\)?\s*;?/gi, '')
    .replace(/url\(\s*["']?(?:https?:)?\/\/[^)]+\)/gi, 'none')
}

function safeHostname(rawUrl: string) {
  try { return new URL(rawUrl).hostname }
  catch { return rawUrl.slice(0, 120) }
}

function pageHeading(page: BrowserDocument) {
  return page.title || safeHostname(page.finalUrl) || 'Ghost Nexora Browser'
}

export function resolveBrowserStartUrl(args: string[], argText: string, locale: string) {
  const input = (argText || args.join(' ')).trim()
  if (!input) {
    const kl = locale === 'en' ? 'us-en' : 'mx-es'
    return `https://html.duckduckgo.com/html/?kl=${kl}`
  }
  if (/^https?:\/\//i.test(input)) return input
  if (/^[^\s/]+\.[A-Za-z]{2,}(?:\/\S*)?$/.test(input)) return `https://${input}`
  const params = new URLSearchParams({ q: input, kl: locale === 'en' ? 'us-en' : 'mx-es' })
  return `https://html.duckduckgo.com/html/?${params.toString()}`
}

function extractPageLinks(html: string, sourceUrl: string, maxCandidates: number) {
  const $ = load(html)
  const links: string[] = []
  const seen = new Set<string>()

  $('a[data-gn-url]').each((_, node) => {
    const raw = ($(node).attr('data-gn-url') || '').trim()
    if (!raw || seen.has(raw)) return
    try {
      const url = new URL(raw)
      if (!['http:', 'https:'].includes(url.protocol)) return
      if (/\.(?:png|jpe?g|gif|webp|svg|ico|mp[34]|m4a|webm|zip|rar|7z|pdf)(?:$|[?#])/i.test(url.pathname)) return
      if (/(?:^|\/)(?:logout|log-out|signout|sign-out|delete|remove|unsubscribe)(?:\/|$|[?#])/i.test(url.pathname + url.search)) return
      seen.add(raw)
      links.push(raw)
    } catch {
      // malformed candidate
    }
  })

  const sourceHost = safeHostname(sourceUrl)
  const isSearch = /(^|\.)duckduckgo\.com$/i.test(sourceHost)
  if (!isSearch) {
    links.sort((a, b) => Number(safeHostname(b) === sourceHost) - Number(safeHostname(a) === sourceHost))
  }
  return links.slice(0, maxCandidates)
}

function emergencyTextPage(page: BrowserDocument, maxBytes: number) {
  const $ = load(page.html, { xmlMode: false })
  const heading = escapeHtml(pageHeading(page))
  const prefix = '<style>:host{display:block;background:#fff;color:#17191c;font-family:system-ui,Arial,sans-serif}.gn-text{padding:16px;line-height:1.5;overflow-wrap:anywhere}</style><div class="gn-text"><h2>' + heading + '</h2><p>'
  const suffix = '</p></div>'
  const allowance = Math.max(512, maxBytes - Buffer.byteLength(prefix + suffix, 'utf8') - 128)
  const rawText = $('body').text().replace(/\s+/g, ' ').trim() || $.root().text().replace(/\s+/g, ' ').trim()
  const text = escapeHtml(truncateUtf8(rawText, allowance))
  const html = prefix + text + suffix
  return { ...page, html, bytes: Buffer.byteLength(html, 'utf8') }
}

/**
 * Produces a deterministic offline-safe page. Remote resources are removed even
 * when the original page is already small, because WhatsApp's HTML Primitive
 * cannot be relied on to fetch them from the network.
 */
export function compactOfflineBrowserPage(page: BrowserDocument, maxBytes: number, labels: BrowserLabels): PackedPage {
  const $ = load(page.html, { xmlMode: false })

  $('script,link,base,svg,canvas,video,audio,source,track,iframe,object,embed,noscript').remove()

  $('style').each((_, node) => {
    const el = $(node)
    el.text(neutralizeRemoteCss(el.text()))
  })
  $('[style]').each((_, node) => {
    const el = $(node)
    const style = el.attr('style')
    if (style) el.attr('style', neutralizeRemoteCss(style))
  })

  $('img,input[type="image"]').each((_, node) => {
    const el = $(node)
    const alt = (el.attr('alt') || el.attr('title') || labels.image).replace(/\s+/g, ' ').trim().slice(0, 100)
    el.replaceWith(`<span class="gn-image-placeholder">[${escapeHtml(alt || labels.image)}]</span>`)
  })

  $('*').each((_, node) => {
    const el = $(node)
    const attrs = (node as { attribs?: Record<string, string> }).attribs
    if (!attrs) return
    for (const name of Object.keys(attrs)) {
      const lower = name.toLowerCase()
      const keep =
        lower === 'data-gn-url' ||
        lower === 'data-gn-fragment' ||
        lower === 'data-gn-action' ||
        lower === 'data-gn-method' ||
        lower === 'data-gn-formaction' ||
        lower === 'id' ||
        lower === 'name' ||
        lower === 'value' ||
        lower === 'type' ||
        lower === 'placeholder' ||
        lower === 'checked' ||
        lower === 'selected' ||
        lower === 'disabled' ||
        lower === 'class' ||
        lower === 'style' ||
        lower === 'role' ||
        lower.startsWith('aria-')
      if (!keep) el.removeAttr(name)
    }
  })

  const body = $('.gn-document').first().length
    ? $('.gn-document').first().html() || ''
    : $('body').html() || $.root().html() || ''

  const rich = [
    '<style>',
    ':host{display:block;background:#fff;color:#15171a;font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif}',
    '.gn-lite{padding:14px;line-height:1.45;overflow-wrap:anywhere}',
    '.gn-lite a,[data-gn-url],[data-gn-fragment]{color:#1769e0;text-decoration:none;cursor:pointer}',
    '.gn-lite h1,.gn-lite h2,.gn-lite h3{line-height:1.2}',
    '.gn-lite input,.gn-lite button,.gn-lite select,.gn-lite textarea{max-width:100%;font:inherit}',
    '.gn-image-placeholder{display:inline-block;padding:6px 9px;margin:2px;background:#f1f3f5;color:#727780;border-radius:6px;font-size:11px}',
    '</style>',
    `<div class="gn-lite">${body}</div>`,
  ].join('')

  if (Buffer.byteLength(rich, 'utf8') <= maxBytes) {
    return { ...page, html: rich, bytes: Buffer.byteLength(rich, 'utf8') }
  }

  const textParts: string[] = []
  $('h1,h2,h3,p,li,article,section').each((_, node) => {
    const text = $(node).text().replace(/\s+/g, ' ').trim()
    if (text && text.length >= 12) textParts.push(text.slice(0, 600))
  })

  const links: Array<{ text: string; url: string }> = []
  $('[data-gn-url]').each((_, node) => {
    if (links.length >= 40) return
    const url = ($(node).attr('data-gn-url') || '').trim()
    if (!url) return
    const text = $(node).text().replace(/\s+/g, ' ').trim() || url
    links.push({ text: text.slice(0, 160), url })
  })

  const lite = [
    '<style>:host{display:block;background:#fff;color:#17191c;font-family:system-ui,Arial,sans-serif}.gn-text{padding:16px;line-height:1.48;overflow-wrap:anywhere}.gn-text a{display:block;padding:9px 0;color:#1769e0;text-decoration:none;border-bottom:1px solid #eee}.gn-text p{margin:0 0 12px}</style>',
    '<div class="gn-text">',
    `<h2>${escapeHtml(pageHeading(page))}</h2>`,
    ...textParts.slice(0, 36).map((text) => `<p>${escapeHtml(text)}</p>`),
    links.length ? `<h3>${escapeHtml(labels.links)}</h3>` : '',
    ...links.slice(0, 32).map((item) => `<a href="#" data-gn-url="${escapeHtml(item.url)}">${escapeHtml(item.text)}</a>`),
    '</div>',
  ].join('')

  if (Buffer.byteLength(lite, 'utf8') <= maxBytes) {
    return { ...page, html: lite, bytes: Buffer.byteLength(lite, 'utf8') }
  }

  return emergencyTextPage({ ...page, html: lite }, maxBytes)
}

export async function buildOfflineBrowserBundle(options: {
  startUrl: string
  sid: string
  locale: string
  labels: BrowserLabels
  maxPages?: number
}) {
  const maxPages = Math.max(1, Math.min(options.maxPages ?? OFFLINE_BROWSER_LIMITS.maxPages, OFFLINE_BROWSER_LIMITS.maxPages))
  const initialRaw = await fetchBrowserDocument(options.startUrl, { sid: options.sid, language: options.locale })
  const initial = compactOfflineBrowserPage(initialRaw, OFFLINE_BROWSER_LIMITS.initialPageBytes, options.labels)
  const pages: PackedPage[] = [initial]
  const aliases = new Map<string, string>()
  aliases.set(options.startUrl, initial.finalUrl)
  aliases.set(initial.finalUrl, initial.finalUrl)

  const candidates = extractPageLinks(initialRaw.html, initial.finalUrl, OFFLINE_BROWSER_LIMITS.maxCandidates)
  for (const url of candidates) {
    if (pages.length >= maxPages) break
    if (aliases.has(url)) continue
    try {
      const raw = await fetchBrowserDocument(url, { sid: options.sid, language: options.locale })
      if (pages.some((page) => page.finalUrl === raw.finalUrl)) {
        aliases.set(url, raw.finalUrl)
        continue
      }
      const packed = compactOfflineBrowserPage(raw, OFFLINE_BROWSER_LIMITS.extraPageBytes, options.labels)
      pages.push(packed)
      aliases.set(url, packed.finalUrl)
      aliases.set(packed.finalUrl, packed.finalUrl)
    } catch (error) {
      logger.debug({ error, url }, 'browser preload page skipped')
    }
  }

  return { pages, aliases: Object.fromEntries(aliases), initialUrl: initial.finalUrl } satisfies OfflineBrowserBundle
}

export function buildOfflineBrowserShell(options: {
  startUrl: string
  bundle: OfflineBrowserBundle
  locale: string
  labels: BrowserLabels
}) {
  const initial = options.bundle.pages[0]
  if (!initial) throw new Error('offline browser bundle has no initial page')

  // The initial page is already in the DOM as a no-JavaScript fallback. Avoid
  // duplicating its HTML inside the JS payload; the runtime captures it before
  // attaching a shadow root.
  const clientPages = options.bundle.pages.map((page, index) => ({
    ...page,
    html: index === 0 ? '' : page.html,
    initial: index === 0,
  }))
  const clientData = {
    pages: clientPages,
    aliases: options.bundle.aliases,
    initialUrl: options.bundle.initialUrl,
    labels: options.labels,
  }

  return `<!doctype html>
<html lang="${escapeHtml(options.locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#0d0f12;color:#f5f7fa;font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif}body{padding:10px}.browser{overflow:hidden;border:1px solid #292d34;border-radius:16px;background:#111419}.bar{display:flex;align-items:center;gap:6px;padding:8px;background:#171a20;border-bottom:1px solid #292d34}.icon{width:34px;height:34px;border:0;border-radius:9px;background:#22262e;color:#eef1f5;font-size:20px;line-height:34px;text-align:center;padding:0}.icon:disabled{opacity:.35}.address{display:flex;align-items:center;gap:6px;padding:8px;background:#171a20}#url{flex:1;min-width:0;height:38px;border:1px solid #333842;border-radius:11px;background:#0e1116;color:#f5f7fa;padding:0 12px;outline:none;font-size:13px}#url:focus{border-color:#4d88ff}#go{height:38px;border:0;border-radius:11px;padding:0 14px;background:#3b82f6;color:#fff;font-weight:700}.meta{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 10px;border-top:1px solid #242830;border-bottom:1px solid #242830;background:#12151a;color:#98a0ad;font-size:10px}#title{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:#c9ced7;max-width:58%}#status{text-align:right;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.runtime-warning{display:none;padding:9px 11px;background:#fff3cd;color:#664d03;border-bottom:1px solid #ffecb5;font-size:11px;line-height:1.35}#viewport{height:min(66vh,620px);min-height:360px;overflow:auto;background:#fff;color:#111;contain:layout paint;isolation:isolate;overscroll-behavior:contain}.error{padding:24px;color:#5d2525;background:#fff;font-size:13px;line-height:1.55}.error code{display:block;margin:12px 0;padding:10px;background:#f2f4f7;color:#25282d;border-radius:8px;overflow-wrap:anywhere;white-space:pre-wrap}.copy{border:0;border-radius:9px;padding:9px 12px;background:#22262e;color:#fff;font-weight:700}
</style>
</head>
<body>
<div class="browser">
<div class="bar"><button id="back" class="icon" type="button">‹</button><button id="forward" class="icon" type="button">›</button><button id="reload" class="icon" type="button">↻</button><button id="home" class="icon" type="button">⌂</button></div>
<div class="address"><input id="url" value="${escapeHtml(options.startUrl)}" autocomplete="off" spellcheck="false" inputmode="url"><button id="go" type="button">${escapeHtml(options.labels.go)}</button></div>
<div class="meta"><span id="title">${escapeHtml(pageHeading(initial))}</span><span id="status">${escapeHtml(options.labels.preloaded)}</span></div>
<div id="runtime-warning" class="runtime-warning"></div>
<div id="viewport">${initial.html}</div>
</div>
<script>
(function(){
'use strict';
var viewport=document.getElementById('viewport'),warning=document.getElementById('runtime-warning');
try{
var data=${safeJson(clientData)},labels=data.labels||{},initialHtml=viewport.innerHTML;
var address=document.getElementById('url'),titleEl=document.getElementById('title'),statusEl=document.getElementById('status'),backBtn=document.getElementById('back'),forwardBtn=document.getElementById('forward');
var shadow=viewport.attachShadow?viewport.attachShadow({mode:'open'}):null,pages=Object.create(null),aliases=data.aliases||{},stack=[],index=-1,current='';
(data.pages||[]).forEach(function(page){if(page.initial&&!page.html)page.html=initialHtml;pages[page.finalUrl]=page;});
function root(){return shadow||viewport;}function setContent(html){if(shadow)shadow.innerHTML=html;else viewport.innerHTML=html;}
function humanBytes(value){var n=Number(value||0);if(n<1024)return n+' B';if(n<1048576)return(n/1024).toFixed(1)+' KB';return(n/1048576).toFixed(1)+' MB';}
function normalize(value){var v=String(value||'').trim();if(!v)return'';if(/^https?:\\/\\//i.test(v))return v;if(/^[^\\s/]+\\.[A-Za-z]{2,}(?:\\/\\S*)?$/.test(v))return'https://'+v;var p=new URLSearchParams({q:v});return'https://html.duckduckgo.com/html/?'+p.toString();}
function resolveKey(url){if(pages[url])return url;if(aliases[url]&&pages[aliases[url]])return aliases[url];try{var u=new URL(url);u.hash='';var clean=u.toString();if(pages[clean])return clean;if(aliases[clean]&&pages[aliases[clean]])return aliases[clean];}catch(_){}return'';}
function updateButtons(){backBtn.disabled=index<=0;forwardBtn.disabled=index<0||index>=stack.length-1;}
function renderKey(key,push){var page=pages[key];if(!page)return false;current=key;address.value=page.finalUrl;titleEl.textContent=page.title||'Ghost Nexora Browser';statusEl.textContent='HTTP '+page.status+' · '+humanBytes(page.bytes)+' · '+(data.pages||[]).length+' '+labels.pages;setContent(page.html||'<div class="error">'+labels.noVisibleContent+'</div>');if(push!==false){stack=stack.slice(0,index+1);stack.push(key);index=stack.length-1;}updateButtons();return true;}
function copyText(text){var ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');}catch(_){}ta.remove();}
function showUnavailable(url){current='';address.value=url;titleEl.textContent=labels.unavailableTitle;statusEl.textContent=labels.networkBlocked;var command='.view '+url;var box=document.createElement('div');box.className='error';var strong=document.createElement('strong');strong.textContent=labels.unavailableBody;var p=document.createElement('p');p.textContent=labels.networkExplanation;var code=document.createElement('code');code.textContent=command;var btn=document.createElement('button');btn.className='copy';btn.type='button';btn.textContent=labels.copyCommand;btn.addEventListener('click',function(){copyText(command);statusEl.textContent=labels.commandCopied;});box.appendChild(strong);box.appendChild(p);box.appendChild(code);box.appendChild(btn);setContent(box.outerHTML);var renderedBtn=root().querySelector?root().querySelector('.copy'):null;if(renderedBtn)renderedBtn.addEventListener('click',function(){copyText(command);statusEl.textContent=labels.commandCopied;});}
function navigate(url,push){var target=normalize(url),key=resolveKey(target);if(key)renderKey(key,push);else showUnavailable(target);}
function findAnchor(target){while(target&&target!==root()){if(target.nodeType===1&&target.matches&&target.matches('[data-gn-url],[data-gn-fragment]'))return target;target=target.parentNode;}return null;}
function onClick(event){var a=findAnchor(event.target);if(!a)return;var fragment=a.getAttribute('data-gn-fragment');if(fragment){event.preventDefault();var node=root().getElementById?root().getElementById(fragment):null;if(node&&node.scrollIntoView)node.scrollIntoView({block:'start'});return;}var url=a.getAttribute('data-gn-url');if(url){event.preventDefault();navigate(url,true);}}
function onSubmit(event){event.preventDefault();var form=event.target,method=(form&&form.getAttribute?form.getAttribute('data-gn-method'):'GET')||'GET',action=form&&form.getAttribute?form.getAttribute('data-gn-action'):'';if(!action)return;if(String(method).toUpperCase()==='POST'){statusEl.textContent=labels.postUnsupported;return;}var params=new URLSearchParams(new FormData(form)),next=new URL(action);params.forEach(function(value,key){next.searchParams.append(key,value);});navigate(next.toString(),true);}
root().addEventListener('click',onClick);root().addEventListener('submit',onSubmit);
document.getElementById('go').addEventListener('click',function(){navigate(address.value,true);});address.addEventListener('keydown',function(event){if(event.key==='Enter')navigate(address.value,true);});document.getElementById('reload').addEventListener('click',function(){if(current)renderKey(current,false);});document.getElementById('home').addEventListener('click',function(){navigate(data.initialUrl||'',true);});backBtn.addEventListener('click',function(){if(index<=0)return;index-=1;renderKey(stack[index],false);updateButtons();});forwardBtn.addEventListener('click',function(){if(index>=stack.length-1)return;index+=1;renderKey(stack[index],false);updateButtons();});
var initialKey=resolveKey(data.initialUrl||'');if(initialKey)renderKey(initialKey,true);else{warning.textContent=labels.initialPackFailed;warning.style.display='block';}
}catch(err){var msg=(err&&err.message)?err.message:String(err);warning.textContent=((${safeJson(options.labels.runtimeError)})||'Browser runtime error')+': '+String(msg).slice(0,180);warning.style.display='block';}
})();
</script>
</body>
</html>`
}

function encodeUnifiedResponse(responseId: string, html: string) {
  const payload = {
    response_id: responseId,
    sections: [{ view_model: { primitive: { __typename: 'GenAIaeacdsnwHtmlPrimitive', payload: html, trusted_sources: [] }, __typename: 'GenAISingleLayoutViewModel' } }],
  }
  return Buffer.from(JSON.stringify(payload)).toString('base64')
}

export function prepareOfflineBrowserPayload(options: {
  startUrl: string
  bundle: OfflineBrowserBundle
  locale: string
  labels: BrowserLabels
  responseId: string
  minimal?: boolean
}): PreparedOfflineBrowser {
  let pages = options.minimal ? options.bundle.pages.slice(0, 1) : options.bundle.pages.slice()
  let compacted = Boolean(options.minimal)

  if (options.minimal && pages[0]) {
    pages[0] = compactOfflineBrowserPage(pages[0], OFFLINE_BROWSER_LIMITS.emergencyPageBytes, options.labels)
  }

  const render = () => {
    const bundle: OfflineBrowserBundle = { ...options.bundle, pages }
    const html = buildOfflineBrowserShell({ startUrl: options.startUrl, bundle, locale: options.locale, labels: options.labels })
    const unifiedData = encodeUnifiedResponse(options.responseId, html)
    return {
      html,
      htmlBytes: Buffer.byteLength(html, 'utf8'),
      unifiedData,
      unifiedBytes: Buffer.byteLength(unifiedData, 'utf8'),
    }
  }

  let rendered = render()
  while ((rendered.htmlBytes > OFFLINE_BROWSER_LIMITS.targetHtmlBytes || rendered.unifiedBytes > OFFLINE_BROWSER_LIMITS.hardUnifiedBytes) && pages.length > 1) {
    pages = pages.slice(0, -1)
    compacted = true
    rendered = render()
  }

  if (rendered.htmlBytes > OFFLINE_BROWSER_LIMITS.targetHtmlBytes && pages[0] && !options.minimal) {
    pages[0] = compactOfflineBrowserPage(pages[0], OFFLINE_BROWSER_LIMITS.emergencyPageBytes, options.labels)
    compacted = true
    rendered = render()
  }

  return { ...rendered, pages, compacted }
}

export function offlineBrowserPayloadWithinHardLimit(payload: PreparedOfflineBrowser) {
  return payload.htmlBytes <= OFFLINE_BROWSER_LIMITS.hardHtmlBytes && payload.unifiedBytes <= OFFLINE_BROWSER_LIMITS.hardUnifiedBytes
}

export function humanBrowserBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1048576) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1048576).toFixed(1)} MB`
}
