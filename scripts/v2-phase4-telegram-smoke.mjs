#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

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
assert.equal(normalized.replyTo, '41')
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

// Runtime completo sin red: configura el entorno antes de importar runtime/config.
const runtimeDir = await mkdtemp(path.join(os.tmpdir(), 'ghost-nexora-tg-phase4-'))
const runtimeStateFile = path.join(runtimeDir, 'state.json')
process.env.TELEGRAM_BOT_TOKEN = '123456:PHASE4_TEST_TOKEN'
process.env.TELEGRAM_PLATFORM_STATE_FILE = runtimeStateFile
process.env.TELEGRAM_POLL_TIMEOUT_SECONDS = '5'
process.env.TELEGRAM_RECONNECT_DELAY_MS = '1000'

const realFetch = globalThis.fetch
const apiCalls = []
let updatePolls = 0
function response(result, status = 200) {
  return new Response(JSON.stringify(status >= 400 ? result : { ok: true, result }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url)
  const method = url.pathname.split('/').at(-1)
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : {}
  apiCalls.push({ method, body })
  if (method === 'getWebhookInfo') return response({ url: '', pending_update_count: 0 })
  if (method === 'getMe') return response({ id: 77, is_bot: true, first_name: 'Ghost Nexora', username: 'GhostNexoraTestBot' })
  if (method === 'getUpdates') {
    updatePolls += 1
    if (updatePolls === 1) return response([{
      update_id: 900,
      message: {
        message_id: 40,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 321, type: 'private' },
        from: { id: 9988, is_bot: false, first_name: 'Tester' },
        text: '/ping',
      },
    }])
    return response({ ok: false, error_code: 409, description: 'Conflict: terminated by other getUpdates request' }, 409)
  }
  if (method === 'sendChatAction') return response(true)
  if (method === 'sendMessage') return response({ message_id: 41, chat: { id: Number(body.chat_id), type: 'private' }, text: body.text })
  if (method === 'editMessageText') return response(true)
  if (method === 'answerCallbackQuery') return response(true)
  throw new Error(`Unexpected Bot API method in smoke: ${method}`)
}

try {
  const { TelegramRuntime } = await import('../apps/bot/dist/platform/telegram/runtime.js')
  const runtime = new TelegramRuntime()
  assert.equal(await runtime.start(), true)
  const deadline = Date.now() + 3000
  while (Date.now() < deadline && runtime.status().state !== 'error') await new Promise((resolve) => setTimeout(resolve, 25))
  const status = runtime.status()
  assert.equal(status.updatesProcessed, 1)
  assert.equal(status.offset, 901)
  assert.equal(status.state, 'error', '409 must stop the competing long poller')
  assert.ok(apiCalls.some((call) => call.method === 'sendMessage' && call.body.text === 'Pong · comprobando…'))
  assert.ok(apiCalls.some((call) => call.method === 'editMessageText'))
  const persisted = JSON.parse(await readFile(runtimeStateFile, 'utf8'))
  assert.equal(persisted.offset, 901)
  await runtime.stop()
} finally {
  globalThis.fetch = realFetch
  await rm(runtimeDir, { recursive: true, force: true })
}

console.log('[V2 PHASE 4] OK — Telegram adapter, normalization and native long-poll runtime are validated end to end.')
