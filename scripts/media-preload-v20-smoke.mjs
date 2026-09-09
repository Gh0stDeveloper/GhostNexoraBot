#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const root = process.cwd()
const read = (file) => readFile(path.join(root, file), 'utf8')

const temp = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-media-v20-'))
try {
  const sample = Buffer.from('ghost-nexora-preloaded-media-smoke')
  const samplePath = path.join(temp, 'sample.jpg')
  await writeFile(samplePath, sample)

  const { preloadWhatsAppMedia } = await import('../apps/bot/dist/services/whatsapp-media.js')
  const local = await preloadWhatsAppMedia(samplePath, { maxBytes: 1024, label: 'smoke-local' })
  assert.ok(Buffer.isBuffer(local), 'local artwork must be materialized as a Buffer before WhatsApp use')
  assert.deepEqual(local, sample, 'preloaded local artwork must preserve bytes')

  const interactive = await read('apps/bot/src/services/interactive.ts')
  const richPreview = await read('apps/bot/src/services/rich-link-preview.ts')
  const moderation = await read('apps/bot/src/services/moderation-v2.ts')
  const menu = await read('apps/bot/src/commands/menu-v5.ts')
  const shop = await read('apps/bot/src/commands/shop-style-v13.ts')

  // Legacy interactive cards/carousels still preload media for their own headers.
  assert.match(interactive, /preloadWhatsAppMedia\(imageUrl/, 'interactive cards must preload their image source')
  assert.match(interactive, /generateWAMessageContent\(\{ image \}/, 'interactive cards must upload the materialized media')
  assert.doesNotMatch(interactive, /generateWAMessageContent\(\{ image: \{ url: imageUrl \} \}/, 'old direct-url interactive upload must not return')
  assert.match(interactive, /const imageCache = new Map/, 'carousels must deduplicate repeated artwork uploads')

  // Screenshot-style preview: large image/title block linked to sourceUrl.
  assert.match(richPreview, /externalAdReply/, 'rich preview must use WhatsApp externalAdReply')
  assert.match(richPreview, /renderLargerThumbnail: true/, 'rich preview must request the large thumbnail layout')
  assert.match(richPreview, /showAdAttribution: false/, 'rich preview must not render advertising attribution')
  assert.match(richPreview, /sourceUrl,/, 'rich preview must expose a clickable URL')
  assert.match(richPreview, /thumbnail \? \{ thumbnail \}/, 'local waifu bytes must be embedded as the preview thumbnail')
  assert.match(richPreview, /richPreviewTargetUrl/, 'preview target must reject localhost/internal web URLs')

  assert.match(menu, /sendRichLinkPreview/, 'menu must use the screenshot-style clickable link preview')
  assert.match(menu, /imageSource: visual\.imageUrl/, 'menu preview must use the selected waifu/avatar')
  assert.match(menu, /url: config\.publicWebUrl/, 'menu preview click must target the public web URL')
  assert.match(menu, /sendInteractiveCard/, 'menu quick actions must remain available in a compact second block')

  assert.match(moderation, /getBrandingAsset\('welcome'/, 'welcome must honor a custom welcome banner')
  assert.match(moderation, /const welcomeImage = welcomeAsset\?\.kind === 'image' \? welcomeAsset\.path : visual\?\.imageUrl/, 'welcome image priority must be custom banner then active visual')
  assert.match(moderation, /sendRichLinkPreview\(localizedSocket, update\.id/, 'welcome/goodbye must use clickable large previews')
  assert.match(moderation, /const goodbyeImage = goodbyeAsset\?\.kind === 'image' \? goodbyeAsset\.path : visual\?\.imageUrl/, 'goodbye must fall back to the active visual image')
  assert.match(moderation, /sendPreloadedVideo/, 'welcome/goodbye GIF-video branding must still preload local media')

  assert.match(shop, /sendRichLinkPreview/, 'shop must send a clickable waifu preview before the carousel')
  assert.match(shop, /imageSource: imageUrl/, 'shop rich preview must use the active visual image')
  assert.match(shop, /sendCarousel/, 'shop product carousel must remain available after the preview')

  console.log('V20 clickable waifu link previews for menu, welcome, goodbye and shop: OK')
} finally {
  await rm(temp, { recursive: true, force: true })
}
