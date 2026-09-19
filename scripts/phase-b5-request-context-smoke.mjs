#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createPlatformCapabilities } from '../packages/platform-contracts/dist/index.js'
import {
  createNeutralCommandContext,
  SharedCommandEngine,
} from '../apps/bot/dist/core/shared-command-engine.js'
import {
  assertRequestContextBinding,
  createRequestContext,
} from '../apps/bot/dist/core/request-context.js'

const adapter = {
  id: 'telegram',
  botInstanceId: 'telegram-main',
  capabilities: createPlatformCapabilities({
    typing: true,
    editMessage: true,
    reactions: true,
    files: true,
  }),
  async start() {},
  async stop() {},
  async sendText(chatId, text) {
    return { platform: 'telegram', chatId, messageId: `out-${chatId}-${text.length}` }
  },
  async sendMedia(chatId) {
    return { platform: 'telegram', chatId, messageId: `media-${chatId}` }
  },
  async sendUi(chatId) {
    return { platform: 'telegram', chatId, messageId: `ui-${chatId}` }
  },
  async editMessage() {},
  async setTyping() {},
  async react() {},
}

function makeRequest({
  chatId,
  userId,
  messageId,
  locale,
  correlationId,
  isOwner,
}) {
  return createRequestContext({
    platform: 'telegram',
    botInstanceId: adapter.botInstanceId,
    chatId,
    userId,
    locale,
    messageId,
    correlationId,
    permissions: {
      isOwner,
      isStaff: isOwner,
      isGroup: true,
      isGroupAdmin: isOwner,
      isBotGroupAdmin: false,
      isInstanceOwner: false,
    },
  })
}

const firstRequest = makeRequest({
  chatId: 'chat-a',
  userId: 'user-a',
  messageId: 'message-a',
  locale: 'es',
  correlationId: 'corr-a',
  isOwner: true,
})
assert.equal(Object.isFrozen(firstRequest), true)
assert.equal(Object.isFrozen(firstRequest.permissions), true)
assert.throws(() => { firstRequest.chatId = 'mutated' }, TypeError)
assert.throws(() => { firstRequest.permissions.isOwner = false }, TypeError)
assert.equal(firstRequest.chatId, 'chat-a')
assert.equal(firstRequest.permissions.isOwner, true)

assert.doesNotThrow(() => assertRequestContextBinding(firstRequest, {
  platform: 'telegram',
  botInstanceId: adapter.botInstanceId,
  chatId: 'chat-a',
  userId: 'user-a',
  messageId: 'message-a',
}))
assert.throws(() => assertRequestContextBinding(firstRequest, {
  platform: 'telegram',
  botInstanceId: adapter.botInstanceId,
  chatId: 'chat-b',
  userId: 'user-a',
  messageId: 'message-a',
}), /chatId/)

const observations = []
const command = {
  name: 'requestprobe',
  category: 'tools',
  description: 'B5 concurrency probe.',
  async handler(ctx) {
    const before = {
      correlationId: ctx.request.correlationId,
      chatId: ctx.chatId,
      userId: ctx.sender,
      locale: ctx.locale,
      isOwner: ctx.isOwner,
    }
    await new Promise((resolve) => setTimeout(resolve, ctx.sender === 'user-a' ? 30 : 5))
    observations.push({
      before,
      after: {
        correlationId: ctx.request.correlationId,
        chatId: ctx.chatId,
        userId: ctx.sender,
        locale: ctx.locale,
        isOwner: ctx.isOwner,
      },
    })
  },
}
const engine = new SharedCommandEngine([command], [command])

function commandContext(request) {
  const normalizedMessage = {
    platform: request.platform,
    botInstanceId: request.botInstanceId,
    chatId: request.chatId,
    senderId: request.userId,
    messageId: request.messageId,
    text: '/requestprobe',
    isGroup: request.permissions.isGroup,
  }
  return createNeutralCommandContext({
    request,
    adapter,
    normalizedMessage,
    commandName: 'requestprobe',
    args: [],
    prefix: '/',
    settings: {},
    t: (key) => key,
  })
}

const secondRequest = makeRequest({
  chatId: 'chat-b',
  userId: 'user-b',
  messageId: 'message-b',
  locale: 'en',
  correlationId: 'corr-b',
  isOwner: false,
})

await Promise.all([
  engine.execute(command, commandContext(firstRequest)),
  engine.execute(command, commandContext(secondRequest)),
])

assert.equal(observations.length, 2)
const byCorrelation = new Map(observations.map((row) => [row.before.correlationId, row]))
assert.deepEqual(byCorrelation.get('corr-a'), {
  before: { correlationId: 'corr-a', chatId: 'chat-a', userId: 'user-a', locale: 'es', isOwner: true },
  after: { correlationId: 'corr-a', chatId: 'chat-a', userId: 'user-a', locale: 'es', isOwner: true },
})
assert.deepEqual(byCorrelation.get('corr-b'), {
  before: { correlationId: 'corr-b', chatId: 'chat-b', userId: 'user-b', locale: 'en', isOwner: false },
  after: { correlationId: 'corr-b', chatId: 'chat-b', userId: 'user-b', locale: 'en', isOwner: false },
})

const mismatchedMessage = {
  platform: 'telegram',
  botInstanceId: adapter.botInstanceId,
  chatId: 'other-chat',
  senderId: 'user-a',
  messageId: 'message-a',
  text: '/requestprobe',
  isGroup: true,
}
assert.throws(() => createNeutralCommandContext({
  request: firstRequest,
  adapter,
  normalizedMessage: mismatchedMessage,
  commandName: 'requestprobe',
  args: [],
  prefix: '/',
  settings: {},
  t: (key) => key,
}), /RequestContext binding mismatch: chatId/)

const types = readFileSync('apps/bot/src/types.ts', 'utf8')
const requestSource = readFileSync('apps/bot/src/core/request-context.ts', 'utf8')
const engineSource = readFileSync('apps/bot/src/core/shared-command-engine.ts', 'utf8')
const whatsapp = readFileSync('apps/bot/src/core/router.ts', 'utf8')
const discord = readFileSync('apps/bot/src/platform/discord/router.ts', 'utf8')
const telegram = readFileSync('apps/bot/src/platform/telegram/router.ts', 'utf8')

assert.match(types, /export type RequestContext = Readonly</)
assert.match(types, /request: RequestContext/)
assert.match(requestSource, /Object\.freeze\(/)
assert.match(requestSource, /randomUUID\(\)/)
assert.match(engineSource, /assertRequestContextBinding\(context\.request/)
assert.match(whatsapp, /createRequestContext\(\{/)
assert.match(discord, /requestMessageId: interaction\.id/)
assert.match(discord, /createRequestContext\(\{/)
assert.match(telegram, /createRequestContext\(\{/)
assert.match(whatsapp, /correlationId: requestContext\?\.correlationId/)
assert.match(discord, /correlationId: request\.correlationId/)
assert.match(telegram, /correlationId: request\.correlationId/)

console.log('Phase B5 immutable RequestContext smoke passed')
