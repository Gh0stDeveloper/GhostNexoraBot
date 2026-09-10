#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const root = process.cwd()
const temp = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-wa-adapter-'))
process.env.DATA_DIR = temp
process.env.SESSION_DIR = path.join(temp, 'session')
process.env.OLLAMA_ENABLED = 'false'
process.env.WEB_ENABLED = 'false'

const read = (file) => readFile(path.join(root, file), 'utf8')

try {
  const {
    WHATSAPP_CAPABILITIES,
    createWhatsAppAdapter,
    normalizeWhatsAppMessage,
  } = await import('../apps/bot/dist/platform/whatsapp/adapter.js')

  assert.equal(WHATSAPP_CAPABILITIES.editMessage, true)
  assert.equal(WHATSAPP_CAPABILITIES.reactions, true)
  assert.equal(WHATSAPP_CAPABILITIES.typing, true)
  assert.equal(WHATSAPP_CAPABILITIES.buttons, true)
  assert.equal(WHATSAPP_CAPABILITIES.carousel, true)
  assert.equal(WHATSAPP_CAPABILITIES.files, true)
  assert.ok(WHATSAPP_CAPABILITIES.maxUploadBytes > 0)

  const incoming = {
    key: {
      remoteJid: '120363000000000000@g.us',
      participant: '5215550000000@s.whatsapp.net',
      id: 'incoming-1',
      fromMe: false,
    },
    pushName: 'Tester',
    message: {
      imageMessage: {
        caption: '.ping',
        mimetype: 'image/jpeg',
        fileLength: 1234,
        contextInfo: { stanzaId: 'quoted-1' },
      },
    },
  }

  const normalized = normalizeWhatsAppMessage(incoming, 'main')
  assert.equal(normalized.platform, 'whatsapp')
  assert.equal(normalized.botInstanceId, 'main')
  assert.equal(normalized.chatId, incoming.key.remoteJid)
  assert.equal(normalized.senderId, incoming.key.participant)
  assert.equal(normalized.messageId, 'incoming-1')
  assert.equal(normalized.text, '.ping')
  assert.equal(normalized.isGroup, true)
  assert.equal(normalized.replyTo, 'quoted-1')
  assert.equal(normalized.media?.kind, 'image')
  assert.equal(normalized.media?.mimeType, 'image/jpeg')
  assert.equal(normalized.media?.sizeBytes, 1234)
  assert.equal(normalized.raw, incoming)

  const sentCalls = []
  const presenceCalls = []
  let nextId = 0
  const socket = {
    user: { id: '5215551111111:1@s.whatsapp.net' },
    async sendMessage(jid, content, options) {
      nextId += 1
      const sent = {
        key: { remoteJid: jid, fromMe: true, id: `out-${nextId}` },
        message: content,
      }
      sentCalls.push({ jid, content, options, sent })
      return sent
    },
    async sendPresenceUpdate(value, jid) {
      presenceCalls.push({ value, jid })
    },
  }

  const adapter = createWhatsAppAdapter(socket, 7)
  assert.equal(adapter.id, 'whatsapp')
  assert.equal(adapter.botInstanceId, 'subbot-7')
  adapter.rememberMessage(incoming)

  const textResult = await adapter.sendText(incoming.key.remoteJid, 'hola', {
    replyTo: incoming.key.id,
    mentions: [incoming.key.participant],
  })
  assert.equal(textResult.platform, 'whatsapp')
  assert.equal(textResult.chatId, incoming.key.remoteJid)
  assert.equal(textResult.messageId, 'out-1')
  assert.equal(textResult.raw, sentCalls[0].sent)
  assert.equal(sentCalls[0].content.text, 'hola')
  assert.deepEqual(sentCalls[0].content.mentions, [incoming.key.participant])
  assert.equal(sentCalls[0].options.quoted, incoming)

  const mediaResult = await adapter.sendMedia(incoming.key.remoteJid, {
    kind: 'document',
    source: { kind: 'bytes', value: new Uint8Array([1, 2, 3]) },
    mimeType: 'application/octet-stream',
    fileName: 'test.bin',
    caption: 'archivo',
  })
  assert.equal(mediaResult.messageId, 'out-2')
  assert.ok(Buffer.isBuffer(sentCalls[1].content.document))
  assert.equal(sentCalls[1].content.fileName, 'test.bin')
  assert.equal(sentCalls[1].content.mimetype, 'application/octet-stream')

  const uiText = await adapter.sendUi(incoming.key.remoteJid, { kind: 'text', text: 'ui-text' })
  assert.equal(uiText.messageId, 'out-3')
  assert.equal(sentCalls[2].content.text, 'ui-text')

  await adapter.editMessage(incoming.key.remoteJid, 'out-1', 'editado')
  assert.equal(sentCalls[3].content.text, 'editado')
  assert.deepEqual(sentCalls[3].content.edit, {
    remoteJid: incoming.key.remoteJid,
    fromMe: true,
    id: 'out-1',
  })

  await adapter.react(incoming.key.remoteJid, incoming.key.id, '⚡')
  assert.equal(sentCalls[4].content.react.text, '⚡')
  assert.equal(sentCalls[4].content.react.key, incoming.key)

  await adapter.setTyping(incoming.key.remoteJid, true)
  await adapter.setTyping(incoming.key.remoteJid, false)
  assert.deepEqual(presenceCalls, [
    { value: 'composing', jid: incoming.key.remoteJid },
    { value: 'paused', jid: incoming.key.remoteJid },
  ])

  const router = await read('apps/bot/src/core/router.ts')
  const types = await read('apps/bot/src/types.ts')
  const interactiveShim = await read('apps/bot/src/services/interactive.ts')
  const mediaShim = await read('apps/bot/src/services/whatsapp-media.ts')
  const localizedShim = await read('apps/bot/src/services/localized-socket.ts')
  const interactive = await read('apps/bot/src/platform/whatsapp/interactive.ts')
  const edit = await read('apps/bot/src/commands/edit.ts')
  const main = await read('apps/bot/src/index.ts')

  assert.match(router, /createWhatsAppAdapter/)
  assert.match(router, /platform: 'whatsapp'/)
  assert.match(router, /adapter,\s*\n\s*normalizedMessage/)
  assert.match(router, /adapter\.sendText\(chatId, replyText/)
  assert.match(types, /adapter: PlatformAdapter/)
  assert.match(types, /normalizedMessage: NormalizedMessage/)

  assert.match(interactiveShim, /platform\/whatsapp\/interactive\.js/)
  assert.match(mediaShim, /platform\/whatsapp\/media\.js/)
  assert.match(localizedShim, /platform\/whatsapp\/localized-socket\.js/)
  assert.match(interactive, /NativeFlowMessage/)
  assert.match(interactive, /carouselMessage/)
  assert.match(interactive, /interactiveRelayNodes/)
  assert.match(interactive, /sendTextFallback/)

  // La PoC Valley queda fuera de la abstracción estándar: su comportamiento y
  // guardas continúan protegidos por la suite V23 existente.
  assert.match(edit, /executeEditMessageIdPoc/)
  assert.match(edit, /executeValleyInvisibleMessageIdCollision/)
  assert.match(edit, /isPocChatAllowed\(ctx\.chatId\)/)
  assert.doesNotMatch(edit, /WhatsAppAdapter|ctx\.adapter/)

  assert.match(main, /startTypingIndicator\(transport, chatId\)/)
  assert.doesNotMatch(main, /function startTypingIndicator\(socket:/)

  console.log('[V2 PHASE 1] OK — WhatsApp adapter preserves V1 compatibility while exposing normalized transport APIs.')
} finally {
  await rm(temp, { recursive: true, force: true })
}
