#!/usr/bin/env node
import assert from 'node:assert/strict'

const { DiscordGateway } = await import('../apps/bot/dist/platform/discord/gateway.js')

const settle = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms))

class FakeSocket {
  readyState = 1
  sent = []
  closeCalls = []
  listeners = new Map()
  constructor(url) { this.url = url }
  addEventListener(type, listener) {
    const list = this.listeners.get(type) || []
    list.push(listener)
    this.listeners.set(type, list)
  }
  send(data) { this.sent.push(JSON.parse(data)) }
  close(code, reason) {
    this.closeCalls.push([code, reason])
    this.readyState = 3
  }
  emit(type, event = {}) {
    for (const listener of this.listeners.get(type) || []) listener(event)
  }
}

class FakeRest {
  constructor(remaining = 999) { this.remaining = remaining }
  async getGatewayBot() {
    return {
      url: 'wss://gateway.discord.gg',
      shards: 1,
      session_start_limit: { total: 1000, remaining: this.remaining, reset_after: 60000, max_concurrency: 1 },
    }
  }
}

function makeFactory(target) {
  return (url) => {
    const socket = new FakeSocket(url)
    target.push(socket)
    return socket
  }
}

const sockets = []
const states = []
const sessions = []
const messages = []
const interactions = []
const gateway = new DiscordGateway(new FakeRest(), 'token-test', (1 << 0) | (1 << 9) | (1 << 12), {
  onState: (state, error) => states.push([state, error]),
  onSession: (session) => sessions.push(session),
  onMessage: (message) => messages.push(message),
  onInteraction: (interaction) => interactions.push(interaction),
}, {
  random: () => 0,
  reconnectDelayMs: 20,
  maxReconnectDelayMs: 50,
  socketFactory: makeFactory(sockets),
})

await gateway.start()
assert.equal(sockets.length, 1)
assert.match(sockets[0].url, /^wss:\/\/gateway\.discord\.gg\/\?v=10&encoding=json$/)
sockets[0].emit('message', { data: JSON.stringify({ op: 10, d: { heartbeat_interval: 1000 } }) })
await settle()
const identify = sockets[0].sent.find((payload) => payload.op === 2)
assert.ok(identify, 'Hello without session must produce IDENTIFY')
assert.equal(identify.d.token, 'token-test')
assert.equal(identify.d.intents, (1 << 0) | (1 << 9) | (1 << 12))
assert.ok(sockets[0].sent.some((payload) => payload.op === 1), 'heartbeat must start after Hello')

sockets[0].emit('message', { data: JSON.stringify({
  op: 0,
  t: 'READY',
  s: 7,
  d: {
    v: 10,
    user: { id: '900', username: 'GhostNexoraBot', bot: true },
    guilds: [{ id: '1', unavailable: true }],
    session_id: 'session-abc',
    resume_gateway_url: 'wss://resume.discord.gg',
    application: { id: '901' },
  },
}) })
await settle()
assert.equal(gateway.getState(), 'ready')
assert.deepEqual(gateway.getSession(), { sessionId: 'session-abc', resumeGatewayUrl: 'wss://resume.discord.gg', sequence: 7 })
assert.ok(sessions.some((value) => value?.sessionId === 'session-abc'))

const message = {
  id: '20', channel_id: '10', guild_id: '1',
  author: { id: '2', username: 'ghost', bot: false }, content: '<@900> ping', attachments: [],
}
sockets[0].emit('message', { data: JSON.stringify({ op: 0, t: 'MESSAGE_CREATE', s: 8, d: message }) })
const interaction = {
  id: '30', application_id: '901', type: 2, data: { name: 'ping' }, channel_id: '10',
  user: { id: '2', username: 'ghost', bot: false }, token: 'interaction-token', version: 1,
}
sockets[0].emit('message', { data: JSON.stringify({ op: 0, t: 'INTERACTION_CREATE', s: 9, d: interaction }) })
await settle()
assert.equal(messages.length, 1)
assert.equal(messages[0].id, '20')
assert.equal(interactions.length, 1)
assert.equal(interactions[0].id, '30')
assert.equal(gateway.getSession().sequence, 9)

sockets[0].emit('message', { data: JSON.stringify({ op: 11, d: null }) })
await settle(1)
await gateway.stop()
assert.equal(gateway.getState(), 'stopped')
assert.deepEqual(sessions.at(-1), null)

// A persisted resumable session must use OP 6 RESUME instead of another IDENTIFY.
const resumeSockets = []
const resumeGateway = new DiscordGateway(new FakeRest(0), 'token-test', 513, {}, {
  random: () => 0.5,
  socketFactory: makeFactory(resumeSockets),
})
await resumeGateway.start({ sessionId: 'old-session', resumeGatewayUrl: 'wss://resume.discord.gg', sequence: 77 })
assert.equal(resumeSockets.length, 1)
assert.match(resumeSockets[0].url, /^wss:\/\/resume\.discord\.gg\/\?v=10&encoding=json$/)
resumeSockets[0].emit('message', { data: JSON.stringify({ op: 10, d: { heartbeat_interval: 1000 } }) })
await settle()
const resume = resumeSockets[0].sent.find((payload) => payload.op === 6)
assert.ok(resume, 'Hello with persisted session must RESUME')
assert.equal(resume.d.session_id, 'old-session')
assert.equal(resume.d.seq, 77)
assert.equal(resumeSockets[0].sent.some((payload) => payload.op === 2), false)
await resumeGateway.stop()

// 4014 is fatal: the runtime must not reconnect forever with an invalid privileged intent.
const fatalSockets = []
const fatalStates = []
const fatalGateway = new DiscordGateway(new FakeRest(), 'token-test', 32769, {
  onState: (state, error) => fatalStates.push([state, error]),
}, {
  reconnectDelayMs: 5,
  maxReconnectDelayMs: 10,
  socketFactory: makeFactory(fatalSockets),
})
await fatalGateway.start()
fatalSockets[0].emit('close', { code: 4014 })
await settle(25)
assert.equal(fatalGateway.getState(), 'error')
assert.equal(fatalSockets.length, 1, 'fatal 4014 must not create a reconnect loop')
assert.ok(fatalStates.some(([state, error]) => state === 'error' && String(error).includes('MESSAGE_CONTENT')))
await fatalGateway.stop()

// If no resumable session exists and Discord reports zero IDENTIFY quota, no socket is opened.
const exhaustedSockets = []
const exhaustedStates = []
const exhausted = new DiscordGateway(new FakeRest(0), 'token-test', 513, {
  onState: (state, error) => exhaustedStates.push([state, error]),
}, { socketFactory: makeFactory(exhaustedSockets) })
await exhausted.start()
assert.equal(exhausted.getState(), 'error')
assert.equal(exhaustedSockets.length, 0)
assert.ok(exhaustedStates.some(([state, error]) => state === 'error' && String(error).includes('IDENTIFY')))

console.log('[V2 PHASE 5] OK — Discord Gateway covers Hello, heartbeat, IDENTIFY, READY, dispatch, RESUME, fatal intents and identify quota.')
