#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const temp = mkdtempSync(path.join(os.tmpdir(), 'ghostnexora-adult-gif-'))
const dataDir = path.join(temp, 'data')
mkdirSync(path.join(dataDir, 'adult-reaction-media'), { recursive: true })

Object.assign(process.env, {
  ENV_FILE: path.join(temp, 'missing.env'),
  DATA_DIR: dataDir,
  SESSION_DIR: path.join(dataDir, 'session'),
  NEXORA_GLOBAL_CONTROL_DB: path.join(temp, 'control.sqlite'),
  NEXORA_GLOBAL_ECONOMY_DB: path.join(temp, 'economy.sqlite'),
  NEXORA_INSTANCE_ROLE: 'main',
  OWNER_NUMBERS: '',
  ADMIN_WEB_TOKEN: 'adult-gif-smoke',
  OLLAMA_ENABLED: 'false',
  WEB_ENABLED: 'false',
})

try {
  const media = await import('../apps/bot/dist/services/adult-media-v8.js')
  const { economy } = await import('../apps/bot/dist/services/economy.js')

  assert.equal(media.canonicalAdultMediaCommand('pene'), 'dick')
  assert.equal(media.canonicalAdultMediaCommand('cock'), 'dick')
  assert.equal(media.canonicalAdultMediaCommand('room'), 'fuck')
  assert.equal(media.canonicalAdultMediaCommand('prenar'), 'preñar')
  assert.equal(media.canonicalAdultMediaCommand('finishrp'), 'cum')
  assert.deepEqual(media.equivalentAdultMediaCommands('dick'), ['dick', 'pene', 'cock'])
  assert.deepEqual(media.equivalentAdultMediaCommands('fuck'), ['fuck', 'room'])

  // Simula un GIF antiguo que fue guardado antes de canonicalizar aliases.
  const legacyPath = path.join(dataDir, 'adult-reaction-media', 'pene-legacy.gif')
  writeFileSync(legacyPath, Buffer.from('GIF89a legacy reaction fixture'))
  economy.db.prepare(`INSERT INTO adult_reaction_media(
    command_name, file_path, mime_type, label, created_by, created_at
  ) VALUES('pene', ?, 'image/gif', 'legacy.gif', 'smoke', ?)`).run(legacyPath, Date.now())

  const legacy = await media.pickAdultReactionMedia('dick')
  assert.ok(legacy, 'dick must find legacy GIF saved under pene alias')
  assert.equal(legacy.pool, 'pene')
  assert.equal(legacy.mimeType, 'image/gif')

  const viaAlias = await media.pickAdultReactionMedia('cock')
  assert.ok(viaAlias, 'cock alias must resolve the same dick media family')

  await media.clearAdultReactionMedia('dick')
  const cleared = await media.pickAdultReactionMedia('dick')
  assert.equal(cleared, null, 'clearing dick must also clear old pene/cock alias pools')

  // New media saved through an alias must land in the canonical command pool.
  const saved = await media.addAdultReactionMedia(
    'room',
    Buffer.from('fake-mp4-fixture-that-is-long-enough'),
    'video/mp4',
    'smoke',
    'room.mp4',
  )
  assert.equal(saved.command, 'fuck', 'new room media must be stored in canonical fuck pool')

  const listed = media.listAdultReactionMedia('room')
  assert.equal(listed.length, 1, 'listing an alias must include canonical media')
  assert.equal(listed[0]?.command, 'fuck')

  const picked = await media.pickAdultReactionMedia('fuck')
  assert.ok(picked, 'fuck must pick media saved through room alias')
  assert.equal(picked.pool, 'fuck')

  console.log('Adult saved GIF compatibility smoke passed')
} finally {
  rmSync(temp, { recursive: true, force: true })
}
