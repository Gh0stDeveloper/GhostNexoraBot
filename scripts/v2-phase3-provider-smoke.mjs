#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const root = process.cwd()
const temp = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-v2-phase3-'))
process.env.DATA_DIR = path.join(temp, 'data')
process.env.SESSION_DIR = path.join(temp, 'session')
process.env.OLLAMA_ENABLED = 'false'
process.env.WEB_ENABLED = 'false'
process.env.X_BEARER_TOKEN = ''
process.env.VK_ACCESS_TOKEN = ''

const source = (file) => readFile(path.join(root, file), 'utf8')

try {
  const x = await import('../apps/bot/dist/services/download-providers/x.js')
  const vk = await import('../apps/bot/dist/services/download-providers/vk.js')
  const apk = await import('../apps/bot/dist/services/download-providers/apk-stores.js')
  const runtime = await import('../apps/bot/dist/services/download-providers/runtime.js')

  assert.equal(x.xPostIdFromUrl('https://x.com/XDevelopers/status/1263145271946551300'), '1263145271946551300')
  assert.equal(x.xPostIdFromUrl('https://twitter.com/user/status/1234567890123456789?s=20'), '1234567890123456789')
  assert.throws(() => x.xPostIdFromUrl('https://example.com/user/status/1234567890123456789'))

  assert.deepEqual(vk.vkVideoRefFromUrl('https://vkvideo.ru/video-193889314_456239866'), {
    ownerId: '-193889314', videoId: '456239866', id: '-193889314_456239866',
  })
  assert.deepEqual(vk.vkVideoRefFromUrl('https://vk.com/video-110924669_456243846'), {
    ownerId: '-110924669', videoId: '456243846', id: '-110924669_456243846',
  })
  assert.equal(vk.vkVideoRefFromUrl('https://live.vkvideo.ru/example/record/67a7f123-1234-5678-9000-abcdefabcdef'), undefined)
  assert.deepEqual(vk.chooseVkMp4({ mp4_360: 'https://cdn.test/360.mp4', mp4_720: 'https://cdn.test/720.mp4', mp4_1440: 'https://cdn.test/1440.mp4' }), {
    url: 'https://cdn.test/1440.mp4', quality: 1440,
  })

  const mirrorSearch = new URL(apk.apkMirrorSearchUrl('WhatsApp'))
  assert.equal(mirrorSearch.hostname, 'www.apkmirror.com')
  assert.equal(mirrorSearch.searchParams.get('post_type'), 'app_release')
  assert.equal(mirrorSearch.searchParams.get('searchtype'), 'apk')
  assert.equal(mirrorSearch.searchParams.get('s'), 'WhatsApp')

  const mirrorRelease = 'https://www.apkmirror.com/apk/google-inc/com-google-android-appsearch-apk/com-google-android-appsearch-apk-17-release/'
  const mirrorVariant = `${mirrorRelease}com-google-android-appsearch-apk-17-android-apk-download/`
  const mirrorSearchHtml = `<div class="appRow"><a href="${mirrorRelease}">Google AppSearch APK</a><span>Version: 17 beta File size: 316 KB</span></div>`
  const mirrorRows = apk.parseApkMirrorSearchHtml('Google AppSearch', mirrorSearchHtml, 'https://www.apkmirror.com/')
  assert.equal(mirrorRows.length, 1)
  assert.equal(mirrorRows[0].pageUrl, mirrorRelease)
  assert.equal(apk.findApkMirrorVariantUrl(`<a href="${mirrorVariant}">APK</a>`, mirrorRelease), mirrorVariant)

  const dynamicIntermediate = `${mirrorVariant}download/?key=dynamic-nonce-123`
  assert.equal(apk.findApkMirrorIntermediateUrl(`<a href="${dynamicIntermediate}">Download APK</a>`, mirrorVariant), dynamicIntermediate)
  const signed = 'https://www.apkmirror.com/wp-content/themes/APKMirror/download.php?id=9768165&key=dynamic-signature'
  assert.equal(apk.findApkMirrorSignedDownloadUrl(`<a id="download-link" href="${signed}">here</a>`, dynamicIntermediate), signed)
  assert.equal(apk.findApkMirrorSignedDownloadUrl('<a id="download-link" href="/wp-content/themes/APKMirror/download.php?id=9768165">bad</a>', dynamicIntermediate), undefined)

  const pureLookup = new URL(apk.apkPureLookupUrl('com.apkpure.aegon'))
  assert.equal(pureLookup.hostname, 'apkpure.net')
  assert.equal(pureLookup.pathname, '/es/apk-downloader')
  assert.equal(pureLookup.searchParams.get('p'), 'com.apkpure.aegon')
  const pureDetail = 'https://apkpure.net/es/apkpure/com.apkpure.aegon'
  const pureHtml = `<div class="app"><a href="${pureDetail}"><h3>APKPure</h3></a><span>Versión: 3.20.77 20 MB</span></div>`
  const pureRows = apk.parseApkPureLookupHtml('com.apkpure.aegon', pureHtml, pureLookup.toString())
  assert.equal(pureRows.length, 1)
  assert.equal(pureRows[0].packageName, 'com.apkpure.aegon')
  const pureSigned = 'https://d.apkpure.net/custom/com.apkpure.aegon-3207737.apk?key=live-signed-value&k=nonce'
  assert.equal(apk.findApkPureDirectUrl(`<a href="${pureSigned}">Descargar APK</a>`, `${pureDetail}/download`), pureSigned)

  runtime.resetProviderHealthForTests()
  assert.equal(await runtime.withProviderTelemetry('apkpure-html', 'search', async () => 7), 7)
  await assert.rejects(runtime.withProviderTelemetry('apkmirror-html', 'search', async () => { throw new Error('synthetic failure') }))
  const health = runtime.providerHealthSnapshot()
  assert.equal(health.find((row) => row.provider === 'apkpure-html')?.successes, 1)
  assert.equal(health.find((row) => row.provider === 'apkmirror-html')?.failures, 1)

  const catalog = JSON.parse(await source('docs/v2/baselines/providers-v2-phase3.json'))
  assert.equal(catalog.totalProviders, 21)
  for (const id of ['twitter', 'vk', 'apkmirror', 'apkpure']) assert.ok(catalog.providers.some((provider) => provider.id === id), `provider catalog missing ${id}`)

  const { commands } = await import('../apps/bot/dist/commands/index.js')
  const expectedCommands = ['vk', 'apkmirror', 'apkmirrordl', 'apkpure', 'apkpuredl', 'providerhealth']
  for (const name of expectedCommands) {
    assert.equal(commands.filter((command) => command.name === name).length, 1, `${name} must be registered exactly once`)
  }
  const twitter = commands.findLast((command) => command.name === 'twitter')
  assert.ok(twitter)
  assert.deepEqual(twitter.aliases, ['x', 'tweet'])
  assert.equal(twitter.category, 'downloads')
  assert.equal(twitter.description, 'Descarga un enlace público de X/Twitter.')
  assert.equal(commands.find((command) => command.name === 'providerhealth')?.staffOnly, true)

  const [xSource, vkSource, apkSource, envSource, termuxSource] = await Promise.all([
    source('apps/bot/src/services/download-providers/x.ts'),
    source('apps/bot/src/services/download-providers/vk.ts'),
    source('apps/bot/src/services/download-providers/apk-stores.ts'),
    source('.env.example'),
    source('apps/bot/src/commands/termux-lite.ts'),
  ])
  assert.match(xSource, /https:\/\/api\.x\.com\/2\/tweets\/\$\{postId\}/)
  assert.match(xSource, /attachments\.media_keys/)
  assert.match(xSource, /media\.fields/)
  assert.match(xSource, /variants/)
  assert.match(vkSource, /https:\/\/api\.vk\.com\/method\/video\.get/)
  assert.match(vkSource, /'5\.199'/)
  assert.match(vkSource, /mp4_/)
  assert.match(apkSource, /post_type.*app_release/s)
  assert.match(apkSource, /searchtype.*apk/s)
  assert.match(apkSource, /\/es\/apk-downloader/)
  assert.match(apkSource, /d\\?\.apkpure\\?\.net|d\.apkpure\.net/)
  assert.doesNotMatch(apkSource, /download\.php\?id=\d+&key=[A-Za-z0-9_-]{8,}/, 'APKMirror signed id/key must never be hardcoded')
  assert.doesNotMatch(apkSource, /com\.apkpure\.aegon-\d+\.apk\?/, 'APKPure signed CDN URL must never be hardcoded')
  assert.match(envSource, /^X_BEARER_TOKEN=/m)
  assert.match(envSource, /^VK_ACCESS_TOKEN=/m)
  assert.match(termuxSource, /downloadProgressV2Commands/, 'Termux Lite must inherit the same Phase 3 provider command array')

  console.log('[V2 PHASE 3] OK — X/VK/APKMirror/APKPure contracts, dynamic signed URLs, telemetry and shared command registration validated.')
} finally {
  await rm(temp, { recursive: true, force: true })
}
