#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { randomBytes, createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

assert.ok(process.versions.node.startsWith('24.'), `mobile-lite CI requires Node 24, found ${process.versions.node}`)

// crypto
const bytes = randomBytes(32)
assert.equal(createHash('sha256').update(bytes).digest('hex').length, 64)

// filesystem
const dir = await mkdtemp(path.join(tmpdir(), 'ghost-nexora-mobile-'))
const file = path.join(dir, 'probe.txt')
await writeFile(file, 'nexora-mobile-lite')
assert.equal(await readFile(file, 'utf8'), 'nexora-mobile-lite')

// SQLite from the embedded Node line.
const db = new DatabaseSync(':memory:')
db.exec('CREATE TABLE smoke (id INTEGER PRIMARY KEY, value TEXT NOT NULL)')
db.prepare('INSERT INTO smoke(value) VALUES (?)').run('ok')
assert.equal(db.prepare('SELECT value FROM smoke WHERE id = 1').get()?.value, 'ok')
db.close()

// fetch + WebSocket surface used by Baileys/providers.
assert.equal(typeof fetch, 'function')
assert.equal(typeof WebSocket, 'function')
const server = createServer((_, res) => {
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end('{"ok":true}')
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
assert.ok(address && typeof address === 'object')
const response = await fetch(`http://127.0.0.1:${address.port}/health`)
assert.deepEqual(await response.json(), { ok: true })
await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))

// Baileys can be resolved without creating a network session.
const baileys = await import('baileys')
assert.equal(typeof baileys.makeWASocket, 'function')

await access('apps/bot/dist-mobile/mobile-lite.js')
await access('apps/bot/dist-mobile/commands/mobile-lite.js')

await rm(dir, { recursive: true, force: true })
console.log('[MOBILE LITE SMOKE] OK — crypto, fetch, WebSocket, filesystem, SQLite, Baileys import and dist-mobile are available.')
