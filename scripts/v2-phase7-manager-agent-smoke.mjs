#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

const token = 'phase7-manager-agent-test-token-123456'
const port = 39002 + Math.floor(Math.random() * 500)
const botPort = port + 1000
const dataDir = await mkdtemp(path.join(os.tmpdir(), 'ghost-nexora-manager-agent-'))
const base = `http://127.0.0.1:${port}`

const child = spawn(process.execPath, ['apps/manager-agent/dist/index.js'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    ADMIN_WEB_TOKEN: token,
    MANAGER_PORT: String(port),
    BOT_HEALTH_PORT: String(botPort),
    DATA_DIR: dataDir,
    NEXORA_RUNTIME_PROFILE: 'full',
  },
})

let stderr = ''
child.stderr.on('data', (chunk) => { stderr += String(chunk) })

async function waitForHealth() {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const response = await fetch(`${base}/health`).catch(() => null)
    if (response?.ok) return response.json()
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`manager agent did not become healthy: ${stderr}`)
}

async function api(pathname, init = {}) {
  return fetch(`${base}${pathname}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.headers || {}) },
  })
}

try {
  const health = await waitForHealth()
  assert.equal(health.service, 'ghost-nexora-manager-agent')
  assert.equal(health.apiVersion, 'v2')

  const denied = await fetch(`${base}/v2/status`)
  assert.equal(denied.status, 401)
  assert.equal((await denied.json()).error, 'unauthorized')

  const statusResponse = await api('/v2/status')
  assert.equal(statusResponse.status, 200)
  const status = await statusResponse.json()
  assert.equal(status.ok, true)
  assert.equal(status.runtime.state, 'offline')
  assert.equal(status.apiVersion, 'v2')
  assert.equal(status.platforms.some((item) => item.id === 'whatsapp'), true)

  const updateResponse = await api('/v2/runtime/update', { method: 'POST' })
  assert.equal(updateResponse.status, 202)
  const update = await updateResponse.json()
  assert.equal(update.ok, true)
  assert.equal(update.action, 'update')
  assert.equal(update.accepted, true)

  const request = JSON.parse(await readFile(path.join(dataDir, 'update-request'), 'utf8'))
  assert.equal(request.source, 'manager-agent-v2')
  assert.match(request.requestedAt, /^\d{4}-\d{2}-\d{2}T/)

  const unknown = await api('/v2/not-real')
  assert.equal(unknown.status, 503, 'unknown /v2 route is proxied only to the bot and must fail closed while bot is offline')

  console.log('[V2 PHASE 7 MANAGER] OK — authenticated loopback agent reports offline state and queues only the fixed updater signal.')
} finally {
  child.kill('SIGTERM')
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2_000)
    child.once('exit', () => { clearTimeout(timer); resolve() })
  })
  await rm(dataDir, { recursive: true, force: true })
}
