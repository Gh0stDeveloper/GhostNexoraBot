#!/usr/bin/env node
import assert from 'node:assert/strict'

const { DiscordAdapter } = await import('../apps/bot/dist/platform/discord/adapter.js')
const { normalizeDiscordMessage } = await import('../apps/bot/dist/platform/discord/normalize.js')
const { DiscordCommandRouter } = await import('../apps/bot/dist/platform/discord/router.js')

class FakeDiscordRest {
  calls = []
  nextId = 1000n

  async getGatewayBot() {
    this.calls.push(['getGatewayBot'])
    return { url: 'wss://gateway.discord.gg', shards: 1, session_start_limit: { total: 1000, remaining: 999, reset_after: 60000, max_concurrency: 1 } }
  }

  async createMessage(channelId, body) {
    this.calls.push(['createMessage', channelId, body])
    return {
      id: String(this.nextId++),
      channel_id: channelId,
      author: { id: '999', username: 'GhostNexoraBot', bot: true },
      content: body.content || '',
      attachments: [],
    }
  }

  async createMessageWithFile(channelId, body, bytes, fileName, mimeType) {
    this.calls.push(['createMessageWithFile', channelId, body, bytes, fileName, mimeType])
    return {
      id: String(this.nextId++),
      channel_id: channelId,
      author: { id: '999', username: 'GhostNexoraBot', bot: true },
      content: body.content || '',
      attachments: [{ id: '1', filename: fileName, content_type: mimeType, size: bytes.byteLength, url: 'https://cdn.discord.test/file' }],
    }
  }

  async editMessage(channelId, messageId, body) {
    this.calls.push(['editMessage', channelId, messageId, body])
    return { id: messageId, channel_id: channelId, author: { id: '999', username: 'GhostNexoraBot', bot: true }, content: body.content || '', attachments: [] }
  }

  async triggerTyping(channelId) { this.calls.push(['triggerTyping', channelId]) }
  async createReaction(channelId, messageId, emoji) { this.calls.push(['createReaction', channelId, messageId, emoji]) }
}

const rest = new FakeDiscordRest()
const adapter = new DiscordAdapter(rest, 'discord-smoke')
await adapter.start()
assert.equal(adapter.id, 'discord')
assert.equal(adapter.botInstanceId, 'discord-smoke')
assert.equal(adapter.capabilities.buttons, true)
assert.equal(adapter.capabilities.embeds, true)
assert.equal(adapter.capabilities.carousel, false)
assert.equal(adapter.capabilities.maxUploadBytes, 24 * 1024 * 1024)

const incoming = {
  id: '555555555555555555',
  channel_id: '444444444444444444',
  guild_id: '333333333333333333',
  author: { id: '222222222222222222', username: 'ghost', global_name: 'Ghost Dev', bot: false },
  member: { nick: 'Ghost', roles: [] },
  content: '<@999999999999999999> ping',
  attachments: [{
    id: '1', filename: 'sample.png', content_type: 'image/png', size: 3210,
    url: 'https://cdn.discordapp.com/attachments/1/2/sample.png',
  }],
  message_reference: { message_id: '111111111111111111' },
}
const normalized = normalizeDiscordMessage(incoming, 'discord-smoke')
assert.equal(normalized.platform, 'discord')
assert.equal(normalized.senderId, 'discord:222222222222222222')
assert.equal(normalized.chatId, '444444444444444444')
assert.equal(normalized.isGroup, true)
assert.equal(normalized.replyTo, '111111111111111111')
assert.equal(normalized.media?.kind, 'image')
assert.equal(normalized.media?.url, incoming.attachments[0].url)
assert.equal(normalized.pushName, 'Ghost')

const longText = `${'a'.repeat(1950)}\n${'b'.repeat(1950)}\n${'c'.repeat(1950)}`
await adapter.sendText('44', longText, { replyTo: '12' })
const textCalls = rest.calls.filter((call) => call[0] === 'createMessage' && call[1] === '44')
assert.ok(textCalls.length >= 3, 'Discord text must split at 2000 chars')
assert.equal(textCalls[0][2].message_reference.message_id, '12')
assert.deepEqual(textCalls[0][2].allowed_mentions.parse, [])
assert.ok(textCalls.every((call) => !call[2].content || call[2].content.length <= 2000))

const hugeCommand = `apkmirrordl ${'x'.repeat(160)}`
await adapter.sendUi('44', {
  kind: 'card',
  title: 'APKMirror',
  body: 'Selecciona una acción',
  footer: 'Ghost Nexora Bot',
  buttons: [
    { kind: 'command', label: 'Descargar', value: hugeCommand },
    { kind: 'url', label: 'Proyecto', value: 'https://github.com/Gh0stDeveloper/GhostNexoraBot' },
  ],
})
const uiCall = [...rest.calls].reverse().find((call) => call[0] === 'createMessage' && call[2]?.components)
assert.ok(uiCall)
assert.equal(uiCall[2].embeds[0].title, 'APKMirror')
const customId = uiCall[2].components[0].components[0].custom_id
assert.ok(Buffer.byteLength(customId, 'utf8') <= 100)
assert.equal(adapter.resolveComponentCustomId(customId), hugeCommand)
assert.equal(uiCall[2].components[0].components[1].url, 'https://github.com/Gh0stDeveloper/GhostNexoraBot')

await adapter.sendMedia('44', {
  kind: 'document',
  source: { kind: 'bytes', value: new Uint8Array([1, 2, 3, 4]) },
  fileName: 'test.bin',
  mimeType: 'application/octet-stream',
  caption: 'Archivo de prueba',
})
const mediaCall = rest.calls.find((call) => call[0] === 'createMessageWithFile')
assert.ok(mediaCall)
assert.equal(mediaCall[3].byteLength, 4)
assert.equal(mediaCall[4], 'test.bin')

const editable = await adapter.sendText('44', 'editable')
await adapter.editMessage('44', editable.messageId, 'edited')
assert.ok(rest.calls.some((call) => call[0] === 'editMessage' && call[2] === editable.messageId && call[3].content === 'edited'))
await adapter.setTyping('44', true)
await adapter.setTyping('44', false)
assert.equal(rest.calls.filter((call) => call[0] === 'triggerTyping').length, 1)
await adapter.react('44', '55', '👍')
assert.ok(rest.calls.some((call) => call[0] === 'createReaction' && call[3] === '👍'))

const router = new DiscordCommandRouter(adapter, '999999999999999999', () => ({ state: 'running' }))
const beforePing = rest.calls.length
assert.equal(await router.handleMessage(incoming), true)
const pingCalls = rest.calls.slice(beforePing)
assert.ok(pingCalls.some((call) => call[0] === 'triggerTyping'))
assert.ok(pingCalls.some((call) => call[0] === 'createMessage' && call[2].content === 'Pong · comprobando…'))
assert.ok(pingCalls.some((call) => call[0] === 'editMessage' && String(call[3].content).startsWith('Pong · Discord ')))

const ignored = { ...incoming, id: '666', content: 'ping' }
assert.equal(await router.handleMessage(ignored), false, 'plain guild text without prefix/mention must be ignored')

console.log('[V2 PHASE 5] OK — Discord adapter/router normalize messages and support text, files, embeds, components, edits, typing and reactions.')
