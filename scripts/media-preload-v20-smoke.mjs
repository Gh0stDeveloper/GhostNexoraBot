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
  assert.ok(Buffer.isBuffer(local), 'local artwork must be materialized as a Buffer before Baileys upload')
  assert.deepEqual(local, sample, 'preloaded local artwork must preserve bytes')

  const interactive = await read('apps/bot/src/services/interactive.ts')
  const moderation = await read('apps/bot/src/services/moderation-v2.ts')
  const menu = await read('apps/bot/src/commands/menu-v5.ts')
  const shop = await read('apps/bot/src/commands/shop-style-v13.ts')

  assert.match(interactive, /preloadWhatsAppMedia\(imageUrl/, 'interactive cards must preload their image source')
  assert.match(interactive, /generateWAMessageContent\(\{ image \}/, 'interactive cards must upload the materialized media')
  assert.doesNotMatch(interactive, /generateWAMessageContent\(\{ image: \{ url: imageUrl \} \}/, 'old direct-url interactive upload must not return')
  assert.match(interactive, /const imageCache = new Map/, 'carousels must deduplicate repeated artwork uploads')
  assert.match(interactive, /imageCache\.get\(card\.imageUrl\)/, 'carousel image cache must key repeated card artwork')

  assert.match(menu, /imageUrl: visual\.imageUrl/, 'menu must continue using the selected visual image')
  assert.match(menu, /sendInteractiveCard/, 'menu must inherit the preloaded interactive media path')
  assert.match(shop, /imageUrl,/, 'shop cards must use the active visual image')
  assert.match(shop, /sendCarousel/, 'shop must inherit preloaded carousel artwork')

  assert.match(moderation, /getBrandingAsset\('welcome'/, 'welcome must honor a custom welcome banner')
  assert.match(moderation, /welcomeAsset\?\.kind === 'image' \? welcomeAsset\.path : visual\?\.imageUrl/, 'welcome image priority must be custom banner then active visual')
  assert.match(moderation, /const goodbyeImage = goodbyeAsset\?\.kind === 'image' \? goodbyeAsset\.path : visual\?\.imageUrl/, 'goodbye must fall back to the active visual image')
  assert.match(moderation, /sendPreloadedImage/, 'goodbye images must be preloaded before sendMessage')
  assert.match(moderation, /sendPreloadedVideo/, 'welcome/goodbye GIF-video branding must also preload local media')

  console.log('V20 preloaded menu, welcome, goodbye and shop artwork: OK')
} finally {
  await rm(temp, { recursive: true, force: true })
}
