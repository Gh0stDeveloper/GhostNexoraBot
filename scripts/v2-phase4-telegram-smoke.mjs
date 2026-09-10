#!/usr/bin/env node
import assert from 'node:assert/strict'

const { TelegramAdapter } = await import('../apps/bot/dist/platform/telegram/adapter.js')
const { normalizeTelegramMessage, telegramFileId } = await import('../apps/bot/dist/platform/telegram/normalize.js')

class FakeTelegramClient {
  calls = []
  nextId = 100
  async getMe() { this.calls.push(['getMe']); return { id: 77, is_bot: true, username: 'GhostNexoraTestBot' } }
  async sendMessage(chatId, text, extra = {}) {
    this.calls.push(['sendMessage', chatId, text, extra])
    return { message_id: this.nextId++, chat: { id: Number(chatId), type: 'private' }, text }
  }
  async sendMedia(method, chatId, fieldName, media, extra = {}) {
    this.calls.push(['sendMedia', method, chatId, fieldName, media, extra])
    return { message_id: this.nextId++, chat: { id: Number(chatId), type: 'private' }, caption: extra.caption }
  }
  async editMessageText(chatId, messageId, text) { this.calls.push(['editMessageText', chatId, messageId, text]); return true }
  async editMessageCaption(chatId, messageId, caption) { this.calls.push(['editMessageCaption', chatId, messageId, caption]); return true }
  async sendChatAction(chatId, action) { this.calls.push(['sendChatAction', chatId, action]); return true }
  async setMessageReaction(chatId, messageId, emoji) { this.calls.push(['setMessageReaction', chatId, messageId, emoji]); return true }
}

const fake = new FakeTelegramClient()
const adapter = new TelegramAdapter(fake, 'telegram-smoke')
await adapter.start()
assert.equal(adapter.id, 'telegram')
assert.equal(adapter.botInstanceId, 'telegram-smoke')
assert.equal(adapter.capabilities.buttons, true)
assert.equal(adapter.capabilities.carousel, false)
assert.equal(adapter.capabilities.maxUploadBytes, 50 * 1024 * 1024)

const incoming = {
  message_id: 42,
  chat: { id: -100123456, type: 'supergroup', title: 'Nexora Test' },
  from: { id: 9988, is_bot: false, first_name: 'Ghost', username: 'ghost_test' },
  caption: '/vk https://vkvideo.ru/video-1_2',
  photo: [{ file_id: 'small', width: 90, height: 90 }, { file_id: 'large', width: 1280, height: 720, file_size: 12345 }],
  reply_to_message: { message_id: 41, chat: { id: -100123456, type: 'supergroup' } },
}
const normalized = normalizeTelegramMessage(incoming, 'telegram-smoke')
assert.equal(normalized.platform, 'telegram')
assert.equal(normalized.senderId, 'telegram:9988')
assert.equal(normalized.chatId, '-100123456')
assert.equal(normalized.isGroup, true)
assert.equal(normalized.replyToMessageId, '41')
assert.equal(normalized.media?.kind, 'image')
assert.equal(telegramFileId(incoming), 'large')

const long = `${'a'.repeat(4050)}\n${'b'.repeat(4050)}\n${'c'.repeat(4050)}`
const longSent = await adapter.sendText('123', long, { replyTo: '7' })
assert.ok(Number(longSent.messageId) >= 100)
const longCalls = fake.calls.filter((call) => call[0] === 'sendMessage' && call[1] === '123')
assert.ok(longCalls.length >= 3, '4096-char Telegram text must be split')
assert.deepEqual(longCalls[0][3].reply_parameters, { message_id: 7, allow_sending_without_reply: true })

const hugeCommand = `apkmirrordl ${'x'.repeat(100)}`
await adapter.sendUi('123', {
  kind: 'card',
  title: 'APKMirror',
  body: 'Selecciona una acción',
  buttons: [
    { kind: 'command', label: 'Descargar', value: hugeCommand },
    { kind: 'url', label: 'Proyecto', value: 'https://github.com/Gh0stDeveloper/GhostNexoraBot' },
  ],
})
const uiCall = [...fake.calls].reverse().find((call) => call[0] === 'sendMessage' && call[3]?.reply_markup)
assert.ok(uiCall)
const keyboard = uiCall[3].reply_markup.inline_keyboard
const callbackData = keyboard[0][0].callback_data
assert.ok(Buffer.byteLength(callbackData, 'utf8') <= 64)
assert.equal(adapter.resolveCallbackData(callbackData), hugeCommand)
assert.equal(keyboard[1][0].url, 'https://github.com/Gh0stDeveloper/GhostNexoraBot')

const textMessage = await adapter.sendText('123', 'editable')
await adapter.editMessage('123', textMessage.messageId, 'edited')
assert.ok(fake.calls.some((call) => call[0] === 'editMessageText' && String(call[2]) === textMessage.messageId))

const mediaMessage = await adapter.sendMedia('123', {
  kind: 'image',
  source: { kind: 'url', value: 'https://example.com/image.jpg' },
  mimeType: 'image/jpeg',
  caption: 'image',
})
await adapter.editMessage('123', mediaMessage.messageId, 'new caption')
assert.ok(fake.calls.some((call) => call[0] === 'editMessageCaption' && String(call[2]) === mediaMessage.messageId))

await adapter.setTyping('123', true)
await adapter.setTyping('123', false)
assert.equal(fake.calls.filter((call) => call[0] === 'sendChatAction').length, 1, 'Telegram has no explicit typing cancel')
await adapter.react('123', '42', '👍')
assert.ok(fake.calls.some((call) => call[0] === 'setMessageReaction' && call[3] === '👍'))

console.log('[V2 PHASE 4] OK — Telegram adapter normalizes updates and supports text, media, UI callbacks, edits, typing and reactions.')
