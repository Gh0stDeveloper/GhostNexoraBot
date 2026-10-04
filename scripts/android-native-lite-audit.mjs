#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const repoRoot = process.cwd()
const androidRoot = path.join(repoRoot, 'apps/android')
const mobileFiles = [
  'apps/bot/src/mobile-bootstrap.ts',
  'apps/bot/src/mobile-lite.ts',
  'apps/bot/src/commands/mobile-lite.ts',
  'apps/bot/tsconfig.mobile.json',
  'apps/bot/package.json',
]

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const output = []
  for (const entry of entries) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) output.push(...await filesUnder(full))
    else if (entry.isFile()) output.push(full)
  }
  return output
}

const androidFiles = (await filesUnder(androidRoot)).filter((file) =>
  /\.(?:kt|kts|xml|properties|pro|txt|json|cpp|h|cmake)$/i.test(file) || path.basename(file) === 'CMakeLists.txt'
)
const files = [...androidFiles, ...mobileFiles.map((file) => path.join(repoRoot, file))]
const forbidden = [
  ['legacy package id', /com\.termux/i],
  ['legacy private path', /\/data\/data\/com\.termux/i],
  ['external command permission', /RUN_COMMAND/],
  ['legacy bootstrap', /install-termux\.sh/i],
  ['package manager command', /\bpkg\s+(?:install|update|upgrade)\b/i],
  ['apt command', /\bapt(?:-get)?\s+(?:install|update|upgrade)\b/i],
  ['on-device npm install', /\bnpm\s+(?:i|install|ci)\b/i],
  ['on-device git clone/pull', /\bgit\s+(?:clone|pull)\b/i],
]

for (const file of files) {
  const content = await readFile(file, 'utf8')
  for (const [label, pattern] of forbidden) {
    assert.doesNotMatch(content, pattern, `${label} reappeared in ${path.relative(repoRoot, file)}`)
  }
}

const manifest = await readFile(path.join(androidRoot, 'app/src/main/AndroidManifest.xml'), 'utf8')
const controller = await readFile(path.join(androidRoot, 'app/src/main/java/com/ghostnexora/manager/NativeRuntimeController.kt'), 'utf8')
const service = await readFile(path.join(androidRoot, 'app/src/main/java/com/ghostnexora/manager/BotRuntimeService.kt'), 'utf8')
const storage = await readFile(path.join(androidRoot, 'app/src/main/java/com/ghostnexora/manager/RuntimeStorage.kt'), 'utf8')
const host = await readFile(path.join(androidRoot, 'app/src/main/java/com/ghostnexora/manager/EmbeddedNodeHost.kt'), 'utf8')
const mobileBootstrap = await readFile(path.join(repoRoot, 'apps/bot/src/mobile-bootstrap.ts'), 'utf8')
const mobile = await readFile(path.join(repoRoot, 'apps/bot/src/mobile-lite.ts'), 'utf8')
const mobileCommands = await readFile(path.join(repoRoot, 'apps/bot/src/commands/mobile-lite.ts'), 'utf8')
const mobilePackage = JSON.parse(await readFile(path.join(repoRoot, 'apps/bot/package.json'), 'utf8'))

assert.match(manifest, /android:name="\.BotRuntimeService"/)
assert.match(manifest, /android:process=":bot"/)
assert.match(manifest, /android:foregroundServiceType="specialUse"/)
assert.match(manifest, /FOREGROUND_SERVICE_SPECIAL_USE/)
assert.match(controller, /class NativeRuntimeController/)
assert.match(controller, /startForegroundService/)
assert.match(service, /startForeground\(/)
assert.match(service, /ACTION_START/)
assert.match(service, /ACTION_STOP/)
assert.match(service, /ACTION_RESTART/)
assert.match(storage, /runtime\/slot-a/)
assert.match(storage, /runtime\/slot-b/)
assert.match(storage, /state\/session/)
assert.match(storage, /state\/data/)
assert.match(storage, /state\/subbots/)
assert.match(storage, /state\/logs/)
assert.match(storage, /cacheDir/)
assert.match(storage, /noBackupFilesDir/)
assert.match(host, /System\.loadLibrary\("nexora_node_bridge"\)/)
assert.match(host, /v24\.21\.0/)
assert.match(mobileBootstrap, /NEXORA_RUNTIME_PROFILE = 'mobile-lite'/)
assert.match(mobileBootstrap, /SESSION_DIR/)
assert.match(mobileBootstrap, /DATA_DIR/)
assert.match(mobileBootstrap, /TMPDIR/)
assert.match(mobile, /mobileLiteCommands/)
assert.doesNotMatch(mobile + mobileCommands, /qrcode-terminal|readline|process\.stdin/)
assert.match(mobilePackage.scripts?.['build:mobile'] ?? '', /tsconfig\.mobile\.json/)
assert.match(mobilePackage.scripts?.['mobile:start'] ?? '', /dist-mobile\/mobile-bootstrap\.js/)

console.log('[ANDROID NATIVE LITE AUDIT] OK — Android/mobile-lite contain no external runtime bootstrap and the native service/storage contracts are present.')
