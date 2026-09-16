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

  const interactive = await read('apps/bot/src/platform/whatsapp/interactive.ts')
  const richPreview = await read('apps/bot/src/services/rich-link-preview.ts')
  const moderation = await read('apps/bot/src/services/moderation-v2.ts')
  const menu = await read('apps/bot/src/commands/menu-v5.ts')
  const shop = await read('apps/bot/src/commands/shop-style-v13.ts')
  const valley = await read('apps/bot/src/commands/valley-compat-v21.ts')
  const valleyPoc = await read('apps/bot/src/commands/valley-poc-v22.ts')
  const pocScope = await read('apps/bot/src/services/security-poc-scope.ts')
  const edit = await read('apps/bot/src/commands/edit.ts')
  const session = await read('apps/bot/src/core/session.ts')
  const valleySticker = await read('apps/bot/src/services/valley-sticker-v21.ts')
  const stickers = await read('apps/bot/src/commands/stickers.ts')
  const privatePolicy = await read('apps/bot/src/services/private-chat-policy.ts')

  // Interactive cards still preload their media. Phase 2 intentionally removes
  // native carouselMessage and routes legacy carousel callers through select-first
  // or actionable text, avoiding client-side "update WhatsApp" placeholders.
  assert.match(interactive, /preloadWhatsAppMedia\(imageUrl/, 'interactive cards must preload their image source')
  assert.match(interactive, /generateWAMessageContent\(\{ image \}/, 'interactive cards must upload the materialized media')
  assert.doesNotMatch(interactive, /generateWAMessageContent\(\{ image: \{ url: imageUrl \} \}/, 'old direct-url interactive upload must not return')
  assert.match(interactive, /planCarousel/, 'legacy carousel callers must pass through the compatibility planner')
  assert.match(interactive, /mode === 'text-fallback'/, 'carousel transport must expose a safe text fallback')
  assert.doesNotMatch(interactive, /carouselMessage|CarouselMessage/, 'native carousel payload must stay out of stable transport')

  // externalAdReply remains available for welcome/goodbye/shop, but the menu was
  // intentionally restored to the single full interactive card that works across
  // the user's current WhatsApp clients.
  assert.match(richPreview, /externalAdReply/, 'rich preview service must remain available for other surfaces')
  assert.match(richPreview, /renderLargerThumbnail: true/, 'rich preview must request the large thumbnail layout')
  assert.doesNotMatch(menu, /sendRichLinkPreview/, 'menu must not use the broken externalAdReply layout')
  assert.match(menu, /sendInteractiveCard/, 'menu must use the original full interactive card')
  assert.match(menu, /body,\s*\n\s*imageUrl: visual\.imageUrl/, 'menu card must include the complete body and selected waifu/avatar')

  // Registry ordering: the safe/general Valley layer is present first; canonical
  // .edit and the explicitly scoped V22 PoC layer override only their special
  // tokens afterwards.
  assert.match(menu, /import \{ valleyCompatV21Commands \} from '\.\/valley-compat-v21\.js'/, 'Valley compatibility layer must be imported')
  assert.match(menu, /import \{ editCommands \} from '\.\/edit\.js'/, 'canonical edit PoC must be imported')
  assert.match(menu, /import \{ valleyPocV22Commands \} from '\.\/valley-poc-v22\.js'/, 'V22 PoC commands must be imported')
  assert.match(menu, /\.\.\.valleyCompatV21Commands,\s*\n\s*\.\.\.editCommands,\s*\n\s*\.\.\.valleyPocV22Commands,/, 'V22 PoC layer must be registered after the general Valley layer')

  // Canonical edit.ts intentionally exercises arbitrary quoted stanzaIds, but
  // only in a command-managed PoC group and only for owner/staff.
  assert.match(edit, /name: 'edit'/, 'edit.ts must expose the canonical edit command')
  assert.match(edit, /aliases: \['editbot', 'editar', 'valleyedit'\]/, 'edit aliases must remain available')
  assert.match(edit, /staffOnly: true/, 'edit command must be restricted to owner/staff by the router')
  assert.match(edit, /groupOnly: true/, 'edit PoC must only run in group chats')
  assert.doesNotMatch(edit, /subbotOwnerAllowed:\s*true/, 'subbot owner alone must not be allowed to use edit')
  assert.match(edit, /if \(!ctx\.isOwner && !ctx\.isBotStaff\)/, 'edit handler must enforce owner/staff in depth')
  assert.match(edit, /isPocChatAllowed\(ctx\.chatId\)/, 'edit PoC must use the persistent command-managed group allowlist')
  assert.match(edit, /executeEditMessageIdPoc/, 'edit PoC must delegate the stanzaId experiment to the scoped service')
  assert.doesNotMatch(edit, /sameIdentity|quotedSender|botIdentityCandidates/, 'bug-bounty edit PoC must not silently reintroduce same-bot target validation')
  assert.doesNotMatch(edit, /global\.ownerNumbers|\{ sock, msg, args, body, from \}/, 'old incompatible command contract must not return')

  // Persistent PoC scope. MainBot/subbots use the shared control DB but every
  // row is partitioned by opsInstanceKey.
  assert.match(pocScope, /CREATE TABLE IF NOT EXISTS security_poc_chats/, 'PoC test groups must persist in SQLite')
  assert.match(pocScope, /CREATE TABLE IF NOT EXISTS security_poc_editall/, 'EditAll state must persist in SQLite')
  assert.match(pocScope, /opsInstanceKey\(\)/, 'PoC scope must be partitioned per MainBot/subbot instance')
  assert.match(pocScope, /export function addPocChat/, 'PoC groups must be addable at runtime')
  assert.match(pocScope, /export function removePocChat/, 'PoC groups must be removable at runtime')
  assert.match(pocScope, /export function listPocChats/, 'PoC group list must be queryable at runtime')
  assert.match(pocScope, /EDITALL_MAX_MESSAGES = 20/, 'EditAll PoC must have a hard message ceiling')
  assert.match(pocScope, /EDITALL_TTL_MS = 10 \* 60_000/, 'EditAll PoC must have a ten-minute TTL')
  assert.match(pocScope, /messageId: targetMessageId/, 'scoped PoC service must preserve the target messageId collision primitive')
  assert.match(pocScope, /legacyEnvAllowed/, 'legacy EDIT_POC env configuration may remain as bootstrap fallback')
  assert.match(pocScope, /export function registerSecurityPocSocket/, 'EditAll must register on every active WhatsApp socket')
  assert.match(pocScope, /update\.type !== 'notify'/, 'EditAll watcher must ignore history/append syncs')
  assert.match(pocScope, /NEXORA_SUBBOT_OWNER_JID/, 'subbot owner messages must be protected from EditAll')
  assert.match(pocScope, /settings\.isBotAdmin/, 'staff messages must be protected from EditAll')
  assert.match(pocScope, /registeredSockets/, 'a socket must not receive duplicate PoC watchers')
  assert.match(session, /registerSecurityPocSocket/, 'MainBot and subbot sockets must install the persistent PoC watcher')

  // Special/non-common Valley capabilities requested by the user. These are not
  // duplicated from ordinary commands such as ping/sticker/restart.
  for (const name of ['pocgroup', 'editall', 'msg', 'pv', 'relayraw']) {
    assert.match(valleyPoc, new RegExp(`name: '${name}'`), `V22 special command ${name} must be present`)
  }
  assert.match(valleyPoc, /staffOnly: true/, 'V22 research commands must remain owner/staff-only')
  assert.match(valleyPoc, /groupFetchAllParticipating\(\)/, 'explicit group targets must be verified against the current bot instance')
  assert.match(valleyPoc, /isPocChatAllowed/, 'all V22 primitives must depend on the registered PoC scope')
  assert.match(valleyPoc, /executeMessageIdCollisionPoc/, 'ValleyInvisible-style next-message ID collision must be wired')
  assert.match(valleyPoc, /messages\.upsert/, 'invisible/PV PoCs must capture a fresh target message event')
  assert.match(valleyPoc, /LISTENER_TTL_MS = 90_000/, 'one-shot target listeners must expire after 90 seconds')
  assert.match(valleyPoc, /enableEditAllPoc/, 'EditAll command must persist its bounded state')
  assert.match(valleyPoc, /disableEditAllPoc/, 'EditAll command must be immediately switchable off')
  assert.match(valleyPoc, /JSON\.parse\(raw\)/, 'relayraw must accept the Valley-style JSON research payload')
  assert.match(valleyPoc, /protocolMessage/, 'relayraw must block destructive/control message families')
  assert.doesNotMatch(valleyPoc, /\beval\s*\(/, 'V22 must not expose raw process eval/RCE')
  assert.doesNotMatch(valleyPoc, /name: 'sticker'|name: 'ping'|name: 'restart'/, 'V22 must not duplicate common Valley commands')

  assert.match(moderation, /getBrandingAsset\('welcome'/, 'welcome must honor a custom welcome banner')
  assert.match(moderation, /const welcomeImage = welcomeAsset\?\.kind === 'image' \? welcomeAsset\.path : visual\?\.imageUrl/, 'welcome image priority must be custom banner then active visual')
  assert.match(moderation, /sendRichLinkPreview\(localizedSocket, update\.id/, 'welcome/goodbye may keep clickable large previews')
  assert.match(moderation, /const goodbyeImage = goodbyeAsset\?\.kind === 'image' \? goodbyeAsset\.path : visual\?\.imageUrl/, 'goodbye must fall back to the active visual image')
  assert.match(moderation, /sendPreloadedVideo/, 'welcome/goodbye GIF-video branding must still preload local media')

  assert.match(shop, /sendRichLinkPreview/, 'shop may keep a clickable waifu preview before the compatibility carousel layer')
  assert.match(shop, /imageSource: imageUrl/, 'shop rich preview must use the active visual image')
  assert.match(shop, /sendCarousel/, 'shop must remain routed through the compatibility carousel API')

  // General Valley utilities remain safe outside the PoC scope. V22 overrides
  // only the exploit-specific msg/pv tokens after this layer.
  for (const name of ['grupos', 'partcjid', 'getmsg', 'mymsg', 'gettype', 'codeblock', 'relay', 'evalsafe', 'msg', 'pv', 'editbot']) {
    assert.match(valley, new RegExp(`name: '${name}'`), `Valley-compatible command ${name} must be present`)
  }
  assert.match(valley, /grantOneShotPrivateSend\(target, ctx\.instanceOwnerJid\)/, 'general private Valley-style messaging must use an instance-scoped one-shot firewall permit')
  assert.match(privatePolicy, /oneShotOutboundPermits/, 'private policy must contain ephemeral outbound permits')
  assert.match(privatePolicy, /remaining: 1/, 'private permit must authorize exactly one outbound message')
  assert.match(privatePolicy, /permitScope\(instanceOwnerJid/, 'one-shot private permits must be partitioned by MainBot/subbot owner scope')
  assert.match(valley, /vm\.createContext/, 'general eval compatibility must use an isolated VM context')
  assert.match(valley, /codeGeneration: \{ strings: false, wasm: false \}/, 'safe eval must disable dynamic code generation')
  assert.match(valley, /relayMessage\(ctx\.chatId, \{ conversation: text \}/, 'general relay compatibility must remain constrained to text/current chat')
  assert.doesNotMatch(valley, /JSON\.parse\(ctx\.argText/, 'raw arbitrary relay JSON must not be accepted by the general layer')
  assert.doesNotMatch(valley, /messageId:\s*(?:context\.stanzaId|captured|targetMessage)/, 'message-id collision must stay out of the general compatibility layer')
  assert.match(valley, /edit: \{ remoteJid: ctx\.chatId, fromMe: true, id: stanzaId \}/, 'general Valley edit compatibility must remain legitimate outside the scoped PoC')

  // Existing sticker compatibility remains tested, but V22 deliberately adds no
  // new sticker feature because those are common functionality.
  assert.match(valleySticker, /type ValleyStickerMode = 'crop' \| 'bars' \| 'stretch'/, 'all existing Valley sticker sizing modes must remain intact')
  assert.match(valleySticker, /mediaToValleySticker/, 'existing Valley sticker converter must remain exported')
  assert.match(valleySticker, /sticker-pack-name/, 'existing Valley sizing modes must preserve Ghost Nexora sticker metadata')
  assert.match(stickers, /mediaToValleySticker/, 'main sticker command must still call Valley sizing converter')

  console.log('V20/V21/V22 media, menu, Valley compatibility and command-managed PoC scope: OK')
} finally {
  await rm(temp, { recursive: true, force: true })
}
