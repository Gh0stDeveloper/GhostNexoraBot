#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(path, 'utf8')
const [contracts, server, index, desktopRust, desktopApp, desktopConfig, androidClient, androidStore, androidManifest, androidBuild, androidUi] = await Promise.all([
  read('packages/control-api-contracts/src/index.ts'),
  read('apps/bot/src/services/control-api-v2.ts'),
  read('apps/bot/src/index.ts'),
  read('apps/desktop/src-tauri/src/lib.rs'),
  read('apps/desktop/src/App.tsx'),
  read('apps/desktop/src-tauri/tauri.conf.json'),
  read('apps/android/app/src/main/java/com/ghostnexora/manager/ControlApiClient.kt'),
  read('apps/android/app/src/main/java/com/ghostnexora/manager/SecureTokenStore.kt'),
  read('apps/android/app/src/main/AndroidManifest.xml'),
  read('apps/android/app/build.gradle.kts'),
  read('apps/android/app/src/main/java/com/ghostnexora/manager/MainActivity.kt'),
])

for (const endpoint of ['/v2/status', '/v2/metrics', '/v2/logs', '/v2/runtime/start', '/v2/runtime/stop', '/v2/runtime/restart', '/v2/runtime/update', '/v2/pair/start', '/v2/pair/status', '/v2/config', '/v2/platforms']) {
  assert.ok(contracts.includes(endpoint), `missing control contract ${endpoint}`)
}
assert.match(server, /authorization/i)
assert.match(server, /update-request/)
assert.doesNotMatch(server, /exec\(|execSync\(|spawn\(/, 'Control API server must not execute shell/process commands')
assert.match(index, /handleControlApiV2/)
assert.match(index, /whatsappPaused/)
assert.match(index, /requestPairingCode/)
assert.match(index, /setControlPairQr/)

assert.match(desktopRust, /https_required_for_remote_control/)
assert.match(desktopRust, /matches!\(action, "start" \| "stop" \| "restart" \| "status"\)/)
assert.doesNotMatch(desktopRust, /Command::new\([^"\n]/, 'Desktop process executable must always be a fixed literal')
assert.doesNotMatch(desktopRust, /cmd\.exe|powershell|\/bin\/sh|bash -c|sh -c/i, 'Desktop manager must not open a general shell')
assert.match(desktopApp, /Ghost Nexora Manager|NEXORA \/ V2/)
assert.match(desktopConfig, /com\.ghostnexora\.manager/)
assert.match(desktopConfig, /currentUser/)

assert.match(androidStore, /AndroidKeyStore/)
assert.match(androidStore, /AES\/GCM\/NoPadding/)
assert.match(androidClient, /https_required_for_remote_control/)
assert.match(androidClient, /host == "10\.0\.2\.2"/)
assert.match(androidManifest, /usesCleartextTraffic="false"/)
assert.match(androidBuild, /compileSdk = 37/)
assert.match(androidBuild, /targetSdk = 36/)
assert.match(androidBuild, /minSdk = 33/)
assert.match(androidUi, /Remote Manager|remote_only|R\.string\.remote_only/)
assert.doesNotMatch(androidUi, /Termux|Runtime\.getRuntime|ProcessBuilder/)

console.log('[V2 PHASE 7 AUDIT] OK — Control API, Desktop/Tauri and Android Remote Manager boundaries are explicit and shell-safe.')
