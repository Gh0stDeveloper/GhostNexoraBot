#!/usr/bin/env node
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const temp = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-phase7-'))
process.env.DATA_DIR = temp
process.env.SESSION_DIR = path.join(temp, 'session')
process.env.ADMIN_WEB_TOKEN = 'phase7-control-token-123456789'
process.env.OLLAMA_ENABLED = 'false'
process.env.WEB_ENABLED = 'false'
process.env.TELEGRAM_BOT_TOKEN = ''
process.env.DISCORD_BOT_TOKEN = ''

try {
  const { settings } = await import('../apps/bot/dist/core/settings.js')
  await settings.init()
  const {
    handleControlApiV2,
    recordControlLog,
  } = await import('../apps/bot/dist/services/control-api-v2.js')

  let whatsappConnected = true
  let connects = 0
  let disconnects = 0
  const deps = {
    whatsappConnected: () => whatsappConnected,
    whatsappAccountLabel: () => '5215550000000@s.whatsapp.net',
    connectWhatsApp: async () => { connects += 1; whatsappConnected = true },
    disconnectWhatsApp: async () => { disconnects += 1; whatsappConnected = false },
    startWhatsAppPairing: async (request) => ({ pairingCode: request.mode === 'code' ? '1234-5678' : null, detail: 'smoke' }),
  }

  const server = http.createServer(async (req, res) => {
    if (await handleControlApiV2(req, res, deps)) return
    res.writeHead(404).end()
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}`
  const request = async (method, endpoint, body, token = process.env.ADMIN_WEB_TOKEN) => {
    const response = await fetch(`${base}${endpoint}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: response.status, body: await response.json() }
  }

  const unauthorized = await request('GET', '/v2/status', undefined, 'wrong-token')
  assert.equal(unauthorized.status, 401)
  assert.equal(unauthorized.body.error, 'unauthorized')

  const status = await request('GET', '/v2/status')
  assert.equal(status.status, 200)
  assert.equal(status.body.apiVersion, 'v2')
  assert.equal(status.body.runtime.state, 'online')
  assert.equal(status.body.platforms.find((row) => row.id === 'whatsapp').connected, true)
  assert.equal(status.body.platforms.length, 3)

  const metrics = await request('GET', '/v2/metrics')
  assert.ok(metrics.body.memory.rssBytes > 0)
  assert.ok(metrics.body.process.pid > 0)

  const config = await request('PATCH', '/v2/config', { botName: 'Ghost Nexora CI', prefix: '!', language: 'en' })
  assert.equal(config.body.config.botName, 'Ghost Nexora CI')
  assert.equal(config.body.config.prefix, '!')
  assert.equal(config.body.config.language, 'en')

  await request('POST', '/v2/platforms/whatsapp/disconnect', {})
  assert.equal(disconnects, 1)
  assert.equal(whatsappConnected, false)
  await request('POST', '/v2/platforms/whatsapp/connect', {})
  assert.equal(connects, 1)
  assert.equal(whatsappConnected, true)

  const pair = await request('POST', '/v2/pair/start', { platform: 'whatsapp', mode: 'code', phoneNumber: '525512345678' })
  assert.equal(pair.status, 202)
  assert.equal(pair.body.pairingCode, null, 'already connected runtime must report paired rather than leak a new code')
  assert.equal(pair.body.state, 'paired')

  recordControlLog('info', `secret ${process.env.ADMIN_WEB_TOKEN}`)
  const logs = await request('GET', '/v2/logs')
  assert.equal(logs.body.redacted, true)
  assert.ok(logs.body.entries.some((entry) => entry.message.includes('[REDACTED]')))
  assert.ok(logs.body.entries.every((entry) => !entry.message.includes(process.env.ADMIN_WEB_TOKEN)))

  const update = await request('POST', '/v2/runtime/update', {})
  assert.equal(update.status, 202)
  assert.equal(update.body.accepted, true)
  const requestFile = await readFile(path.join(temp, 'update-request'), 'utf8')
  assert.match(requestFile, /control-api-v2/)

  const lifecycle = await request('POST', '/v2/runtime/restart', {})
  assert.equal(lifecycle.status, 409)
  assert.equal(lifecycle.body.managerRequired, true)

  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  console.log('[V2 PHASE 7] OK — authenticated Control API V2, redaction, config, platform controls and safe updater validated.')
} finally {
  await rm(temp, { recursive: true, force: true })
}
