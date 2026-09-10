#!/usr/bin/env node
import assert from 'node:assert/strict'

const calls = []
let gatewayAttempts = 0

globalThis.fetch = async (input, init = {}) => {
  const url = String(input)
  const method = String(init.method || 'GET').toUpperCase()
  const headers = new Headers(init.headers || {})
  calls.push({ url, method, headers, body: init.body })

  if (url.endsWith('/gateway/bot')) {
    gatewayAttempts += 1
    if (gatewayAttempts === 1) {
      return new Response(JSON.stringify({ message: 'rate limited', retry_after: 0.001, global: true }), {
        status: 429,
        headers: { 'content-type': 'application/json', 'retry-after': '0.001' },
      })
    }
    return new Response(JSON.stringify({
      url: 'wss://gateway.discord.gg', shards: 1,
      session_start_limit: { total: 1000, remaining: 999, reset_after: 60000, max_concurrency: 1 },
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }

  if (url.includes('/reactions/') && method === 'PUT') return new Response(null, { status: 204 })
  if (url.includes('/applications/901/guilds/123/commands') && method === 'PUT') {
    return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  if (url.endsWith('/channels/10/messages') && method === 'POST') {
    if (!(init.body instanceof FormData)) throw new Error('expected multipart FormData')
    const payload = JSON.parse(String(init.body.get('payload_json')))
    const file = init.body.get('files[0]')
    assert.equal(payload.attachments[0].filename, 'sample.bin')
    assert.ok(file instanceof Blob)
    assert.equal(file.size, 4)
    return new Response(JSON.stringify({ id: '100', channel_id: '10', author: { id: '900', username: 'bot', bot: true }, content: '', attachments: [] }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  }
  if (url.includes('/interactions/700/token/callback') && method === 'POST') return new Response(null, { status: 204 })
  throw new Error(`unexpected request: ${method} ${url}`)
}

const { DiscordRestClient } = await import('../apps/bot/dist/platform/discord/rest.js')
const client = new DiscordRestClient('rest-test-token')

const gateway = await client.getGatewayBot()
assert.equal(gateway.url, 'wss://gateway.discord.gg')
assert.equal(gatewayAttempts, 2, 'HTTP 429 with retry_after must be retried')
assert.ok(calls.filter((call) => call.url.endsWith('/gateway/bot')).every((call) => call.headers.get('authorization') === 'Bot rest-test-token'))
assert.ok(calls.every((call) => call.headers.get('user-agent')?.includes('GhostNexoraBot')))

await client.createReaction('10', '20', '👍')
const reaction = calls.find((call) => call.url.includes('/reactions/'))
assert.ok(reaction)
assert.ok(reaction.url.includes('%F0%9F%91%8D'))

await client.overwriteApplicationCommands('901', [{ name: 'ping', description: 'Ping' }], '123')
assert.ok(calls.some((call) => call.method === 'PUT' && call.url.endsWith('/applications/901/guilds/123/commands')))

await client.createMessageWithFile('10', {
  attachments: [{ id: 0, filename: 'sample.bin' }],
}, new Uint8Array([1, 2, 3, 4]), 'sample.bin', 'application/octet-stream')
const multipart = calls.find((call) => call.url.endsWith('/channels/10/messages') && call.body instanceof FormData)
assert.ok(multipart)
assert.equal(multipart.headers.has('content-type'), false, 'fetch must generate multipart boundary')

await client.interactionCallback('700', 'token', 5)
const interaction = calls.find((call) => call.url.includes('/interactions/700/token/callback'))
assert.ok(interaction)
assert.equal(interaction.headers.get('authorization'), null)

console.log('[V2 PHASE 5] OK — Discord REST v10 handles Bot auth, 429 retry_after, encoded reactions, command scope, multipart and unauthenticated callbacks.')
