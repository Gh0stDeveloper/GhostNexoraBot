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
  const valley = await read('apps/bot/src/commands/valley-compat-v21.ts')
  const edit = await read('apps/bot/src/commands/edit.ts')
  const valleySticker = await read('apps/bot/src/services/valley-sticker-v21.ts')
  const stickers = await read('apps/bot/src/commands/stickers.ts')
  const privatePolicy = await read('apps/bot/src/services/private-chat-policy.ts')

  // Interactive cards/carousels preload media for their own headers.
  assert.match(interactive, /preloadWhatsAppMedia\(imageUrl/, 'interactive cards must preload their image source')
  assert.match(interactive, /generateWAMessageContent\(\{ image \}/, 'interactive cards must upload the materialized media')
  assert.doesNotMatch(interactive, /generateWAMessageContent\(\{ image: \{ url: imageUrl \} \}/, 'old direct-url interactive upload must not return')
  assert.match(interactive, /const imageCache = new Map/, 'carousels must deduplicate repeated artwork uploads')

  // externalAdReply remains available for welcome/goodbye/shop, but the menu was
  // intentionally restored to the single full interactive card that works across
  // the user's current WhatsApp clients.
  assert.match(richPreview, /externalAdReply/, 'rich preview service must remain available for other surfaces')
  assert.match(richPreview, /renderLargerThumbnail: true/, 'rich preview must request the large thumbnail layout')
  assert.doesNotMatch(menu, /sendRichLinkPreview/, 'menu must not use the broken externalAdReply layout')
  assert.match(menu, /sendInteractiveCard/, 'menu must use the original full interactive card')
  assert.match(menu, /body,\s*\n\s*imageUrl: visual\.imageUrl/, 'menu card must include the complete body and selected waifu/avatar')
  assert.match(menu, /\.\.\.valleyCompatV21Commands/, 'Valley compatibility commands must be registered in the full command set')

  // Canonical edit.ts integration. It is registered after Valley compatibility,
  // therefore .edit/.editbot resolve to this implementation in the router map.
  assert.match(menu, /import \{ editCommands \} from '\.\/edit\.js'/, 'canonical edit command must be imported into the active registry')
  assert.match(menu, /\.\.\.valleyCompatV21Commands,\s*\n\s*\.\.\.editCommands,/, 'canonical edit command must override the inherited Valley edit alias')
  assert.match(edit, /name: 'edit'/, 'edit.ts must expose the canonical edit command')
  assert.match(edit, /aliases: \['editbot', 'editar'\]/, 'edit aliases must remain available')
  assert.match(edit, /staffOnly: true/, 'edit command must be restricted to owner/staff by the router')
  assert.doesNotMatch(edit, /subbotOwnerAllowed:\s*true/, 'subbot owner alone must not be allowed to use edit')
  assert.match(edit, /if \(!ctx\.isOwner && !ctx\.isBotStaff\)/, 'edit handler must enforce owner/staff in depth')
  assert.match(edit, /fromMe: true/, 'edit key must identify a message owned by the bot instance')
  assert.match(edit, /edit: editKey/, 'edit command must use Baileys legitimate message editing')
  assert.match(edit, /delete: ctx\.message\.key/, 'edit command should clean the invoking command when WhatsApp permissions allow it')
  assert.doesNotMatch(edit, /global\.ownerNumbers|\{ sock, msg, args, body, from \}/, 'old incompatible command contract must not return')

  assert.match(moderation, /getBrandingAsset\('welcome'/, 'welcome must honor a custom welcome banner')
  assert.match(moderation, /const welcomeImage = welcomeAsset\?\.kind === 'image' \? welcomeAsset\.path : visual\?\.imageUrl/, 'welcome image priority must be custom banner then active visual')
  assert.match(moderation, /sendRichLinkPreview\(localizedSocket, update\.id/, 'welcome/goodbye may keep clickable large previews')
  assert.match(moderation, /const goodbyeImage = goodbyeAsset\?\.kind === 'image' \? goodbyeAsset\.path : visual\?\.imageUrl/, 'goodbye must fall back to the active visual image')
  assert.match(moderation, /sendPreloadedVideo/, 'welcome/goodbye GIF-video branding must still preload local media')

  assert.match(shop, /sendRichLinkPreview/, 'shop may keep a clickable waifu preview before the carousel')
  assert.match(shop, /imageSource: imageUrl/, 'shop rich preview must use the active visual image')
  assert.match(shop, /sendCarousel/, 'shop product carousel must remain available after the preview')

  // ValleyBot / ValleyInvisible compatibility: useful capabilities are ported,
  // while raw arbitrary relay, process eval and message-id spoofing stay excluded.
  for (const name of ['grupos', 'partcjid', 'getmsg', 'mymsg', 'gettype', 'codeblock', 'relay', 'evalsafe', 'msg', 'pv', 'editbot']) {
    assert.match(valley, new RegExp(`name: '${name}'`), `Valley-compatible command ${name} must be present`)
  }
  assert.match(valley, /grantOneShotPrivateSend\(target, ctx\.instanceOwnerJid\)/, 'private Valley-style messaging must use an instance-scoped one-shot firewall permit')
  assert.match(privatePolicy, /oneShotOutboundPermits/, 'private policy must contain ephemeral outbound permits')
  assert.match(privatePolicy, /remaining: 1/, 'private permit must authorize exactly one outbound message')
  assert.match(privatePolicy, /permitScope\(instanceOwnerJid/, 'one-shot private permits must be partitioned by MainBot/subbot owner scope')
  assert.match(valley, /vm\.createContext/, 'eval compatibility must use an isolated VM context')
  assert.match(valley, /codeGeneration: \{ strings: false, wasm: false \}/, 'safe eval must disable dynamic code generation')
  assert.match(valley, /relayMessage\(ctx\.chatId, \{ conversation: text \}/, 'relay compatibility must be constrained to text/current chat')
  assert.doesNotMatch(valley, /JSON\.parse\(ctx\.argText/, 'raw arbitrary relay JSON must not be accepted')
  assert.doesNotMatch(valley, /messageId:\s*(?:context\.stanzaId|captured|targetMessage)/, 'Valley message-id spoofing must not be introduced')
  assert.match(valley, /edit: \{ remoteJid: ctx\.chatId, fromMe: true, id: stanzaId \}/, 'edit compatibility must use legitimate edits of bot-owned messages')

  assert.match(valleySticker, /type ValleyStickerMode = 'crop' \| 'bars' \| 'stretch'/, 'all Valley sticker sizing modes must exist')
  assert.match(valleySticker, /mediaToValleySticker/, 'Valley sticker converter must be exported')
  assert.match(valleySticker, /sticker-pack-name/, 'Valley sizing modes must preserve Ghost Nexora sticker metadata')
  assert.match(stickers, /mediaToValleySticker/, 'main sticker command must call Valley sizing converter')
  assert.match(stickers, /barras: 'bars'/, 'sticker barras mode must be available')
  assert.match(stickers, /estirar: 'stretch'/, 'sticker stretch mode must be available')
  assert.match(stickers, /encaixar: 'crop'/, 'Valley Portuguese crop alias must remain compatible')

  console.log('V20/V21 media, restored menu, Valley compatibility and canonical edit: OK')
} finally {
  await rm(temp, { recursive: true, force: true })
}
