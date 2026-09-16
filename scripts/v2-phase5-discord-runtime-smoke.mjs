#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const temp = await mkdtemp(path.join(os.tmpdir(), 'ghost-nexora-discord-runtime-'))
process.env.DATA_DIR = temp
process.env.SESSION_DIR = path.join(temp, 'wa-session')
process.env.DISCORD_BOT_TOKEN = 'discord-runtime-test-token'
process.env.DISCORD_GUILD_ID = '123456789012345678'
process.env.DISCORD_REGISTER_COMMANDS = 'true'
process.env.DISCORD_MESSAGE_CONTENT_ENABLED = 'false'
process.env.DISCORD_OWNER_IDS = '42'
process.env.WEB_ENABLED = 'false'
process.env.OLLAMA_ENABLED = 'false'

const requests = []
let nextMessageId = 1000n

function jsonResponse(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

globalThis.fetch = async (input, init = {}) => {
  const url = String(input)
  const method = String(init.method || 'GET').toUpperCase()
  const headers = new Headers(init.headers || {})
  let body
  if (typeof init.body === 'string') {
    try { body = JSON.parse(init.body) } catch { body = init.body }
  } else body = init.body
  requests.push({ url, method, headers, body })

  if (url.endsWith('/gateway/bot') && method === 'GET') {
    return jsonResponse({
      url: 'wss://gateway.discord.gg',
      shards: 1,
      session_start_limit: { total: 1000, remaining: 999, reset_after: 60000, max_concurrency: 1 },
    })
  }
  if (url.includes('/applications/901/guilds/123456789012345678/commands') && method === 'PUT') return jsonResponse([])
  if (url.includes('/interactions/') && url.endsWith('/callback') && method === 'POST') return new Response(null, { status: 204 })
  if (url.includes('/webhooks/901/') && url.endsWith('/messages/@original') && method === 'DELETE') return new Response(null, { status: 204 })
  if (url.endsWith('/typing') && method === 'POST') return new Response(null, { status: 204 })
  if (url.includes('/channels/10/messages/') && method === 'PATCH') {
    const messageId = url.split('/').at(-1)
    return jsonResponse({ id: messageId, channel_id: '10', author: { id: '900', username: 'GhostNexoraBot', bot: true }, content: body?.content || '', attachments: [] })
  }
  if (url.endsWith('/channels/10/messages') && method === 'POST') {
    return jsonResponse({ id: String(nextMessageId++), channel_id: '10', author: { id: '900', username: 'GhostNexoraBot', bot: true }, content: body?.content || '', attachments: [], components: body?.components || [] })
  }
  throw new Error(`Unexpected fake Discord HTTP call: ${method} ${url}`)
}

class FakeWebSocket {
  static sockets = []
  readyState = 1
  listeners = new Map()
  sent = []
  constructor(url) {
    this.url = url
    FakeWebSocket.sockets.push(this)
  }
  addEventListener(type, listener) {
    const list = this.listeners.get(type) || []
    list.push(listener)
    this.listeners.set(type, list)
  }
  send(data) { this.sent.push(JSON.parse(data)) }
  close(code, reason) { this.readyState = 3; this.closeCode = code; this.closeReason = reason }
  emit(type, event = {}) { for (const listener of this.listeners.get(type) || []) listener(event) }
}
globalThis.WebSocket = FakeWebSocket

const settle = (ms = 25) => new Promise((resolve) => setTimeout(resolve, ms))
const { DiscordRuntime } = await import('../apps/bot/dist/platform/discord/runtime.js')

try {
  const runtime = new DiscordRuntime()
  assert.equal(await runtime.start(), true)
  assert.equal(runtime.status().state, 'starting')
  assert.equal(FakeWebSocket.sockets.length, 1)
  const socket = FakeWebSocket.sockets[0]
  assert.match(socket.url, /^wss:\/\/gateway\.discord\.gg\/\?v=10&encoding=json$/)

  socket.emit('message', { data: JSON.stringify({ op: 10, d: { heartbeat_interval: 60000 } }) })
  await settle()
  const identify = socket.sent.find((payload) => payload.op === 2)
  assert.ok(identify)
  assert.equal((identify.d.intents & (1 << 15)) !== 0, false, 'MESSAGE_CONTENT must be opt-in')

  socket.emit('message', { data: JSON.stringify({
    op: 0,
    t: 'READY',
    s: 5,
    d: {
      v: 10,
      user: { id: '900', username: 'GhostNexoraBot', global_name: 'Ghost Nexora Bot', bot: true },
      guilds: [{ id: '123456789012345678' }],
      session_id: 'runtime-session',
      resume_gateway_url: 'wss://resume.discord.gg',
      application: { id: '901' },
    },
  }) })
  await settle(50)
  const ready = runtime.status()
  assert.equal(ready.state, 'running')
  assert.equal(ready.botId, '900')
  assert.equal(ready.applicationId, '901')
  assert.equal(ready.sessionResumable, true)
  assert.equal(ready.sequence, 5)
  assert.equal(ready.commandScope, 'guild:123456789012345678')
  const registration = requests.find((request) => request.method === 'PUT' && request.url.includes('/applications/901/guilds/123456789012345678/commands'))
  assert.ok(registration, 'READY must synchronize application commands')
  assert.ok(Array.isArray(registration.body) && registration.body.some((command) => command.name === 'ping'))

  const interaction = {
    id: '700', application_id: '901', type: 2, data: { name: 'ping' },
    guild_id: '123456789012345678', channel_id: '10',
    member: { user: { id: '42', username: 'owner', bot: false }, roles: [] },
    token: 'slash-token', version: 1,
  }
  socket.emit('message', { data: JSON.stringify({ op: 0, t: 'INTERACTION_CREATE', s: 6, d: interaction }) })
  await settle(80)

  const ackIndex = requests.findIndex((request) => request.url.includes('/interactions/700/slash-token/callback'))
  const sendIndex = requests.findIndex((request) => request.url.endsWith('/channels/10/messages') && request.method === 'POST')
  const editIndex = requests.findIndex((request) => request.url.includes('/channels/10/messages/') && request.method === 'PATCH')
  const deleteIndex = requests.findIndex((request) => request.url.includes('/webhooks/901/slash-token/messages/@original') && request.method === 'DELETE')
  assert.ok(ackIndex >= 0 && sendIndex > ackIndex, 'slash interaction must be acknowledged before normal response')
  assert.ok(editIndex > sendIndex, 'ping response must be edited after send')
  assert.ok(deleteIndex > editIndex, 'deferred placeholder must be removed after adapter response')
  assert.equal(requests[ackIndex].body.type, 5)
  assert.equal(runtime.status().eventsProcessed, 1)
  assert.equal(runtime.status().sequence, 6)

  const message = {
    id: '800', channel_id: '10', guild_id: '123456789012345678',
    author: { id: '43', username: 'member', bot: false },
    content: '<@900> ping', attachments: [], mentions: [{ id: '900', username: 'GhostNexoraBot', bot: true }],
  }
  socket.emit('message', { data: JSON.stringify({ op: 0, t: 'MESSAGE_CREATE', s: 7, d: message }) })
  await settle(80)
  assert.equal(runtime.status().eventsProcessed, 2)
  assert.equal(runtime.status().sequence, 7)
  assert.ok(requests.some((request) => request.url.endsWith('/channels/10/typing') && request.method === 'POST'))

  const gatewayAuth = requests.find((request) => request.url.endsWith('/gateway/bot'))?.headers.get('authorization')
  const interactionAuth = requests[ackIndex].headers.get('authorization')
  assert.equal(gatewayAuth, 'Bot discord-runtime-test-token')
  assert.equal(interactionAuth, null, 'interaction callback must not send Bot Authorization')

  await runtime.stop()
  assert.equal(runtime.status().state, 'stopped')

  console.log('[V2 PHASE 5] OK — native Discord runtime covers Gateway READY, command sync, slash ACK, router output and persisted sequence.')
} finally {
  await rm(temp, { recursive: true, force: true })
}
