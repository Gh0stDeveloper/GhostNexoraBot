#!/usr/bin/env node
import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

const read = (path) => readFile(path, 'utf8')
const [
  contracts,
  server,
  index,
  agent,
  managerUnit,
  managerInstaller,
  browserInstaller,
  installScript,
  updateScript,
  desktopRust,
  desktopApp,
  desktopControl,
  desktopConfig,
  androidClient,
  androidStore,
  androidManifest,
  androidBuild,
  androidUi,
  androidViewModel,
] = await Promise.all([
  read('packages/control-api-contracts/src/index.ts'),
  read('apps/bot/src/services/control-api-v2.ts'),
  read('apps/bot/src/index.ts'),
  read('apps/manager-agent/src/index.ts'),
  read('systemd/ghost-nexora-manager.service'),
  read('scripts/install-manager-api.sh'),
  read('scripts/install-browser-proxy.sh'),
  read('scripts/install.sh'),
  read('scripts/update.sh'),
  read('apps/desktop/src-tauri/src/lib.rs'),
  read('apps/desktop/src/App.tsx'),
  read('apps/desktop/src/control.ts'),
  read('apps/desktop/src-tauri/tauri.conf.json'),
  read('apps/android/app/src/main/java/com/ghostnexora/manager/ControlApiClient.kt'),
  read('apps/android/app/src/main/java/com/ghostnexora/manager/SecureTokenStore.kt'),
  read('apps/android/app/src/main/AndroidManifest.xml'),
  read('apps/android/app/build.gradle.kts'),
  read('apps/android/app/src/main/java/com/ghostnexora/manager/MainActivity.kt'),
  read('apps/android/app/src/main/java/com/ghostnexora/manager/ManagerViewModel.kt'),
])

for (const endpoint of ['/v2/status', '/v2/metrics', '/v2/logs', '/v2/runtime/start', '/v2/runtime/stop', '/v2/runtime/restart', '/v2/runtime/update', '/v2/pair/start', '/v2/pair/status', '/v2/config', '/v2/platforms']) {
  assert.ok(contracts.includes(endpoint), `missing control contract ${endpoint}`)
}
assert.match(contracts, /RuntimeAction = 'start' \| 'stop' \| 'restart' \| 'update'/)

// Bot-side Control API never becomes a shell/process execution boundary.
assert.match(server, /authorization/i)
assert.match(server, /update-request/)
assert.doesNotMatch(server, /exec\(|execSync\(|spawn\(/, 'Control API server must not execute shell/process commands')
assert.match(server, /pairedState/)
assert.match(index, /handleControlApiV2/)
assert.match(index, /whatsappPaused/)
assert.match(index, /requestPairingCode/)
assert.match(index, /setControlPairQr/)

// Persistent manager is the only host lifecycle boundary. It binds loopback,
// authenticates before /v2, and can address one fixed systemd unit only.
assert.match(agent, /const BOT_SERVICE = 'ghost-nexora-bot\.service'/)
assert.match(agent, /timingSafeEqual/)
assert.match(agent, /server\.listen\(PORT, '127\.0\.0\.1'/)
assert.match(agent, /execFileAsync\('\/usr\/bin\/systemctl', \[action, BOT_SERVICE\]/)
assert.match(agent, /\^\\\/v2\\\/runtime\\\/\(start\|stop\|restart\|update\)\$/)
assert.doesNotMatch(agent, /execSync\(|spawn\(|shell\s*:\s*true|cmd\.exe|powershell|\/bin\/sh|bash -c|sh -c/i, 'Manager Agent must not expose a general shell')
assert.match(agent, /path\.join\(DATA_DIR, 'update-request'\)/)
assert.match(agent, /bot_control_unavailable/)
assert.match(agent, /offlineStatus/)

assert.match(managerUnit, /^User=root$/m)
assert.match(managerUnit, /^NoNewPrivileges=true$/m)
assert.match(managerUnit, /^ProtectSystem=strict$/m)
assert.match(managerUnit, /^ReadWritePaths=__STATE_DIR__$/m)
assert.match(managerUnit, /apps\/manager-agent\/dist\/index\.js/)
assert.match(managerInstaller, /ghost-nexora-manager\.service/)
assert.match(managerInstaller, /npm run build --workspace=@ghostnexora\/manager-agent/)
assert.match(managerInstaller, /location \^~ \/manager\//)
assert.match(managerInstaller, /proxy_pass http:\/\/127\.0\.0\.1:/)
assert.match(browserInstaller, /install-manager-api\.sh/)
assert.match(browserInstaller, /MANAGER_DOMAIN="\$\{DOMAIN\}"/)
assert.match(installScript, /install-browser-proxy\.sh/)
assert.match(updateScript, /install-browser-proxy\.sh/)
for (const script of ['scripts/install-manager-api.sh', 'scripts/install-browser-proxy.sh']) {
  const syntax = spawnSync('bash', ['-n', script], { encoding: 'utf8' })
  assert.equal(syntax.status, 0, `${script} must pass bash -n: ${syntax.stderr}`)
}

// Desktop native bridge is constrained to Control API routes and never opens a
// command shell. Runtime lifecycle is carried through the persistent Agent API.
assert.match(desktopRust, /https_required_for_remote_control/)
assert.match(desktopRust, /matches!\(action, "start" \| "stop" \| "restart" \| "status"\)/)
assert.doesNotMatch(desktopRust, /Command::new\([^"\n]/, 'Desktop process executable must always be a fixed literal')
assert.doesNotMatch(desktopRust, /cmd\.exe|powershell|\/bin\/sh|bash -c|sh -c/i, 'Desktop manager must not open a general shell')
assert.match(desktopApp, /127\.0\.0\.1:3002/)
assert.match(desktopApp, /runtime\('start'\)/)
assert.match(desktopApp, /runtime\('stop'\)/)
assert.match(desktopApp, /runtime\('restart'\)/)
assert.match(desktopControl, /runtimeStart/)
assert.match(desktopControl, /RuntimeActionResponse/)
assert.match(desktopConfig, /com\.ghostnexora\.manager/)
assert.match(desktopConfig, /currentUser/)
await access('apps/desktop/src-tauri/icons/icon.png')

// Android remains a Remote Manager: secrets are Keystore-backed, remote HTTP
// is rejected, and start/stop/restart are HTTP Control API operations only.
assert.match(androidStore, /AndroidKeyStore/)
assert.match(androidStore, /AES\/GCM\/NoPadding/)
assert.match(androidStore, /10\.0\.2\.2:3002/)
assert.match(androidClient, /https_required_for_remote_control/)
assert.match(androidClient, /host == "10\.0\.2\.2"/)
assert.match(androidManifest, /usesCleartextTraffic="false"/)
assert.match(androidBuild, /compileSdk = 37/)
assert.match(androidBuild, /targetSdk = 36/)
assert.match(androidBuild, /minSdk = 33/)
assert.match(androidUi, /Remote Manager|remote_only|R\.string\.remote_only/)
assert.match(androidUi, /vm\.runtime\("start"\)/)
assert.match(androidUi, /vm\.runtime\("stop"\)/)
assert.match(androidUi, /vm\.runtime\("restart"\)/)
assert.match(androidViewModel, /\/v2\/runtime\/\$safeAction/)
assert.doesNotMatch(androidUi + androidViewModel, /Termux|Runtime\.getRuntime|ProcessBuilder/)

console.log('[V2 PHASE 7 AUDIT] OK — Control API, persistent Manager Agent, Desktop/Tauri and Android Remote Manager are explicit, authenticated and shell-safe.')
