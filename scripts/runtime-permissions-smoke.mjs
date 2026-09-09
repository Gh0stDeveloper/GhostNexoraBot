#!/usr/bin/env node
import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

const root = mkdtempSync(path.join(os.tmpdir(), 'ghost-nexora-runtime-perms-'))
const user = execFileSync('id', ['-un'], { encoding: 'utf8' }).trim()
const group = execFileSync('id', ['-gn'], { encoding: 'utf8' }).trim()

function mode(file) {
  return statSync(file).mode & 0o777
}

try {
  const botDist = path.join(root, 'apps', 'bot', 'dist', 'commands')
  const botAssets = path.join(root, 'apps', 'bot', 'assets', 'waifus')
  const webCache = path.join(root, 'apps', 'web', '.next', 'cache')
  const modules = path.join(root, 'node_modules', 'demo')
  const whisper = path.join(root, 'venv-whisper', 'bin')

  for (const dir of [botDist, botAssets, webCache, modules, whisper]) mkdirSync(dir, { recursive: true })

  const files = [
    path.join(botDist, 'group-inactivity-v18.js'),
    path.join(botAssets, 'waifu.jpg'),
    path.join(webCache, 'cache.bin'),
    path.join(modules, 'index.js'),
    path.join(whisper, 'python'),
  ]

  for (const file of files) {
    writeFileSync(file, 'runtime')
    chmodSync(file, 0o600)
  }

  for (const dir of [root, path.join(root, 'apps'), path.join(root, 'apps', 'bot'), path.join(root, 'apps', 'web'), botDist, botAssets, webCache, modules, whisper]) {
    chmodSync(dir, 0o700)
  }

  const envFile = path.join(root, '.env')
  writeFileSync(envFile, 'SECRET=test\n')
  chmodSync(envFile, 0o600)

  execFileSync('bash', ['scripts/normalize-runtime-permissions.sh'], {
    cwd: process.cwd(),
    env: { ...process.env, INSTALL_DIR: root, SERVICE_USER: user, SERVICE_GROUP: group },
    stdio: 'inherit',
  })

  const botFile = files[0]
  assert.ok((mode(botFile) & 0o040) !== 0, 'compiled bot JS must be group-readable')
  assert.ok((mode(botDist) & 0o010) !== 0, 'compiled bot directories must be traversable by service group')
  assert.ok((mode(path.join(root, 'node_modules', 'demo', 'index.js')) & 0o040) !== 0, 'node_modules must be group-readable')
  assert.ok((mode(path.join(root, 'venv-whisper', 'bin', 'python')) & 0o040) !== 0, 'Whisper venv must be group-readable')
  assert.equal(mode(envFile), 0o640, '.env must remain 0640')
  assert.equal(readFileSync(envFile, 'utf8'), 'SECRET=test\n', '.env contents must remain untouched')

  console.log(JSON.stringify({
    ok: true,
    botMode: mode(botFile).toString(8),
    envMode: mode(envFile).toString(8),
    serviceUser: user,
    serviceGroup: group,
  }, null, 2))
} finally {
  rmSync(root, { recursive: true, force: true })
}
