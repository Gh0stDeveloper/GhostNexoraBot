#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  createPlatformCapabilities,
  normalizedUiToText,
} from '../packages/platform-contracts/dist/index.js'
import {
  createNeutralCommandContext,
  SharedCommandEngine,
} from '../apps/bot/dist/core/shared-command-engine.js'
import { createRequestContext } from '../apps/bot/dist/core/request-context.js'

const deliveries = []
let sequence = 0
const adapter = {
  id: 'discord',
  botInstanceId: 'b4-test',
  capabilities: createPlatformCapabilities(),
  async start() {},
  async stop() {},
  async sendText(chatId, text, options) {
    sequence += 1
    const sent = { platform: 'discord', chatId, messageId: `text-${sequence}` }
    deliveries.push({ kind: 'text', chatId, text, options, sent })
    return sent
  },
  async sendMedia() {
    throw new Error('sendMedia must be intercepted by the neutral B4 fallback')
  },
  async sendUi(chatId, ui, options) {
    sequence += 1
    const text = normalizedUiToText(ui)
    const sent = { platform: 'discord', chatId, messageId: `ui-${sequence}` }
    deliveries.push({ kind: 'ui-fallback', chatId, text, options, sent })
    return sent
  },
}

const normalizedMessage = {
  platform: 'discord',
  botInstanceId: adapter.botInstanceId,
  chatId: 'channel-1',
  senderId: 'discord:user-1',
  messageId: 'incoming-1',
  text: '/softcap',
  isGroup: true,
  pushName: 'Tester',
}

const t = (key, values = {}) => key === 'router.capabilityUnavailable'
  ? `${key}:${values.platform}:${values.capabilities}`
  : key

function context(commandName) {
  const message = { ...normalizedMessage, text: `/${commandName}` }
  const request = createRequestContext({
    platform: 'discord',
    botInstanceId: adapter.botInstanceId,
    chatId: message.chatId,
    userId: message.senderId,
    locale: 'es',
    messageId: message.messageId,
    correlationId: `b4-${commandName}`,
    permissions: {
      isOwner: true,
      isStaff: true,
      isGroup: true,
      isGroupAdmin: false,
      isBotGroupAdmin: false,
      isInstanceOwner: false,
    },
  })
  return createNeutralCommandContext({
    request,
    adapter,
    normalizedMessage: message,
    commandName,
    args: [],
    prefix: '/',
    settings: {},
    t,
  })
}

const softCommand = {
  name: 'softcap',
  category: 'tools',
  description: 'Uses presentation capabilities with safe fallbacks.',
  requiresCapabilities: ['carousel', 'typing', 'editMessage'],
  async handler(ctx) {
    await ctx.setTyping(true)
    await ctx.sendUi({
      kind: 'carousel',
      title: 'Fallback carousel',
      cards: [{ id: 'one', title: 'One', body: 'Body' }],
    })
    await ctx.editMessage('missing-message', 'edit fallback')
  },
}

const urlFileCommand = {
  name: 'urlfile',
  category: 'downloads',
  description: 'Falls back from media to a public URL.',
  requiresCapabilities: ['files'],
  async handler(ctx) {
    await ctx.sendMedia({
      kind: 'document',
      source: { kind: 'url', value: 'https://example.com/file.zip' },
      caption: 'Archivo',
    })
  },
}

const byteFileCommand = {
  name: 'bytefile',
  category: 'downloads',
  description: 'Cannot safely degrade local bytes.',
  requiresCapabilities: ['files'],
  async handler(ctx) {
    await ctx.sendMedia({
      kind: 'document',
      source: { kind: 'bytes', value: new Uint8Array([1, 2, 3]) },
      fileName: 'test.bin',
    })
  },
}

let pollHandlerRan = false
const pollCommand = {
  name: 'pollcap',
  category: 'tools',
  description: 'Requires a capability without a generic fallback.',
  requiresCapabilities: ['polls'],
  async handler() {
    pollHandlerRan = true
  },
}

const commands = [softCommand, urlFileCommand, byteFileCommand, pollCommand]
const engine = new SharedCommandEngine(commands, commands)

const softResult = await engine.execute(softCommand, context('softcap'))
assert.equal(softResult.executed, true)
assert.deepEqual(softResult.fallbackCapabilities, ['carousel', 'typing', 'editMessage'])
assert.ok(deliveries.some((row) => row.kind === 'ui-fallback' && row.text.includes('Fallback carousel')))
assert.ok(deliveries.some((row) => row.kind === 'text' && row.text === 'edit fallback'))

const beforeUrl = deliveries.length
const urlResult = await engine.execute(urlFileCommand, context('urlfile'))
assert.equal(urlResult.executed, true)
assert.deepEqual(urlResult.fallbackCapabilities, ['files'])
const urlDeliveries = deliveries.slice(beforeUrl)
assert.ok(urlDeliveries.some((row) =>
  row.kind === 'text'
  && row.text.includes('Archivo')
  && row.text.includes('https://example.com/file.zip')
))

await assert.rejects(
  () => engine.execute(byteFileCommand, context('bytefile')),
  /router\.capabilityUnavailable:discord:files/,
)

await assert.rejects(
  () => engine.execute(pollCommand, context('pollcap')),
  /router\.capabilityUnavailable:discord:polls/,
)
assert.equal(pollHandlerRan, false, 'hard-missing capabilities must block before the command handler')

const engineSource = readFileSync('apps/bot/src/core/shared-command-engine.ts', 'utf8')
const discordSource = readFileSync('apps/bot/src/platform/discord/router.ts', 'utf8')
const telegramSource = readFileSync('apps/bot/src/platform/telegram/router.ts', 'utf8')
const generalSource = readFileSync('apps/bot/src/commands/general.ts', 'utf8')
assert.match(engineSource, /resolveCapabilityRequirements/, 'SharedCommandEngine must preflight required capabilities')
assert.match(engineSource, /fallbackCapabilities/, 'Execution result must expose degraded capabilities')
assert.match(discordSource, /commandMetadataForPlatformToken\('discord'/, 'Discord native commands must use B4 metadata preflight')
assert.match(telegramSource, /commandMetadataForPlatformToken\('telegram'/, 'Telegram native commands must use B4 metadata preflight')
assert.match(generalSource, /requiresCapabilities: \['typing'\]/, 'Ping must declare its typing capability')
assert.match(generalSource, /requiresCapabilities: \['files'\]/, 'Info must declare its media capability')

console.log('Phase B4 capability-aware command execution smoke passed')
