import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const temp = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-nav-'))
process.env.DATA_DIR = temp
process.env.SESSION_DIR = path.join(temp, 'session')
process.env.ADMIN_WEB_TOKEN = 'nav-smoke-admin-token'

const labels = {
  go: 'Go',
  preloaded: 'Preloaded content',
  pages: 'pages',
  image: 'Image',
  noVisibleContent: 'No visible content.',
  links: 'Links',
  unavailableTitle: 'URL not preloaded',
  networkBlocked: 'Network blocked',
  unavailableBody: 'This URL was not preloaded.',
  networkExplanation: 'Send this command to the bot:',
  copyCommand: 'Copy command',
  commandCopied: 'Command copied',
  initialPackFailed: 'Initial navigation failed.',
  runtimeWarning: 'Fallback remains visible.',
  runtimeError: 'Interactive mode error',
  postUnsupported: 'POST is unavailable.',
}

try {
  const nav = await import('../apps/bot/dist/services/offline-browser.js')

  const raw = {
    status: 200,
    bytes: 999999,
    finalUrl: 'https://example.com/',
    subrecursos: 4,
    title: 'Example',
    html: [
      '<style>.hero{background-image:url(https://cdn.example.com/bg.png)}</style>',
      '<link rel="stylesheet" href="https://cdn.example.com/site.css">',
      '<script>alert(1)</script>',
      '<div class="gn-document">',
      '<h1>Example page</h1>',
      '<img src="https://cdn.example.com/image.jpg" alt="Cover">',
      '<a href="#" data-gn-url="https://example.com/next">Next page</a>',
      '<p>Hello from the offline page.</p>',
      '</div>',
    ].join(''),
  }

  const compact = nav.compactOfflineBrowserPage(raw, 80 * 1024, labels)
  assert.ok(compact.html.includes('Example page'))
  assert.ok(compact.html.includes('[Cover]'))
  assert.ok(compact.html.includes('data-gn-url="https://example.com/next"'))
  assert.equal(/<script\b/i.test(compact.html), false, 'packed page must not contain scripts')
  assert.equal(/<link\b/i.test(compact.html), false, 'packed page must not depend on external stylesheets')
  assert.equal(/<img\b/i.test(compact.html), false, 'packed page must not depend on external images')
  assert.equal(/https:\/\/cdn\.example\.com/i.test(compact.html), false, 'remote resource URLs must be removed')

  const extra = {
    ...compact,
    finalUrl: 'https://example.com/next',
    title: 'Next',
    html: '<div class="gn-text"><h2>Next</h2><p>' + 'x'.repeat(140 * 1024) + '</p></div>',
    bytes: 140 * 1024,
  }
  const bundle = {
    pages: [compact, extra],
    aliases: {
      'https://example.com/': 'https://example.com/',
      'https://example.com/next': 'https://example.com/next',
    },
    initialUrl: 'https://example.com/',
  }

  const shell = nav.buildOfflineBrowserShell({
    startUrl: 'https://example.com/',
    bundle,
    locale: 'en',
    labels,
  })
  assert.equal((shell.match(/<script\b/g) || []).length, 1, 'shell must contain exactly one script tag')
  assert.equal(shell.includes('type="application/json"'), false, 'data must be embedded in the single runtime script')
  assert.ok(shell.includes('<div id="viewport">'))
  assert.ok(shell.indexOf('Example page') < shell.indexOf('<script>'), 'initial page must exist before JS runs')

  const prepared = nav.prepareOfflineBrowserPayload({
    startUrl: 'https://example.com/',
    bundle,
    locale: 'en',
    labels,
    responseId: 'message-nav-smoke',
  })
  assert.ok(prepared.htmlBytes <= nav.OFFLINE_BROWSER_LIMITS.hardHtmlBytes)
  assert.ok(prepared.unifiedBytes <= nav.OFFLINE_BROWSER_LIMITS.hardUnifiedBytes)
  assert.equal(nav.offlineBrowserPayloadWithinHardLimit(prepared), true)
  assert.ok(prepared.pages.length <= 2)

  const minimal = nav.prepareOfflineBrowserPayload({
    startUrl: 'https://example.com/',
    bundle,
    locale: 'en',
    labels,
    responseId: 'message-nav-minimal-smoke',
    minimal: true,
  })
  assert.equal(minimal.pages.length, 1, 'minimal retry must send exactly one page')
  assert.equal(nav.offlineBrowserPayloadWithinHardLimit(minimal), true)

  assert.match(nav.resolveBrowserStartUrl([], 'ghost nexora bot', 'en'), /kl=us-en/)
  assert.match(nav.resolveBrowserStartUrl([], 'ghost nexora bot', 'es'), /kl=mx-es/)

  console.log('[nav-offline-smoke] OK · one script · no-JS fallback · offline resources · adaptive limits · minimal retry')
} finally {
  await rm(temp, { recursive: true, force: true })
}
