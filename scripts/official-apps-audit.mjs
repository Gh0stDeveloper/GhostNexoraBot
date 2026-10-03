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
  desktopPackage,
  phase7Workflow,
  androidClient,
  androidStore,
  androidManifest,
  androidBuild,
  androidUi,
  androidViewModel,
  androidLocalRuntime,
  termuxManager,
  termuxInstaller,
  termuxRuntime,
  termuxPair,
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
  read('apps/desktop/package.json'),
  read('.github/workflows/v2-phase7.yml'),
  read('apps/android/app/src/main/java/com/ghostnexora/manager/ControlApiClient.kt'),
  read('apps/android/app/src/main/java/com/ghostnexora/manager/SecureTokenStore.kt'),
  read('apps/android/app/src/main/AndroidManifest.xml'),
  read('apps/android/app/build.gradle.kts'),
  read('apps/android/app/src/main/java/com/ghostnexora/manager/ui/ManagerApp.kt'),
  read('apps/android/app/src/main/java/com/ghostnexora/manager/ManagerViewModel.kt'),
  read('apps/android/app/src/main/java/com/ghostnexora/manager/LocalRuntimeBridge.kt'),
  read('scripts/termux/ghostnexora'),
  read('scripts/install-termux.sh'),
  read('apps/bot/src/termux-lite.ts'),
  read('apps/bot/src/pair.ts'),
])

for (const endpoint of ['/v2/status', '/v2/metrics', '/v2/logs', '/v2/runtime/start', '/v2/runtime/stop', '/v2/runtime/restart', '/v2/runtime/update', '/v2/pair/start', '/v2/pair/status', '/v2/config', '/v2/platforms']) {
  assert.ok(contracts.includes(endpoint), `missing control contract ${endpoint}`)
}
assert.match(contracts, /RuntimeAction = 'start' \| 'stop' \| 'restart' \| 'update'/)

// Bot-side Control API never becomes a shell/process execution boundary.
assert.match(server, /authorization/i)
assert.match(server, /update-request/)
assert.doesNotMatch(server, /(?:node:)?child_process|Command::new|ProcessBuilder|Runtime\.getRuntime|shell\s*:\s*true/i, 'Control API server must not import or expose process execution APIs')
assert.match(server, /pairedState/)
assert.match(index, /handleControlApiV2/)
assert.match(index, /whatsappPaused/)
assert.match(index, /requestPairingCode/)
assert.match(index, /setControlPairQr/)

// Persistent manager remains the remote host lifecycle boundary. It binds loopback,
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
for (const script of ['scripts/install-manager-api.sh', 'scripts/install-browser-proxy.sh', 'scripts/install-termux.sh', 'scripts/termux/ghostnexora']) {
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
await access('apps/desktop/app-icon.svg')

// Tauri packaging must be reproducible from the committed vector source icon.
const desktopPackageJson = JSON.parse(desktopPackage)
const tauriConfig = JSON.parse(desktopConfig)
assert.match(desktopPackageJson.scripts?.icons ?? '', /tauri icon app-icon\.svg/)
assert.match(desktopPackageJson.scripts?.['tauri:check'] ?? '', /npm run icons/)
assert.match(desktopPackageJson.scripts?.['tauri:build'] ?? '', /npm run icons/)
assert.ok(Array.isArray(tauriConfig.bundle?.icon), 'Tauri bundle.icon must declare generated desktop icons')
assert.ok(tauriConfig.bundle.icon.includes('icons/icon.ico'), 'Tauri Windows bundle must declare icon.ico')
assert.ok(tauriConfig.bundle.icon.includes('icons/128x128.png'), 'Tauri Linux bundle must declare a square PNG icon')
assert.match(phase7Workflow, /npm run tauri:build --workspace=@ghostnexora\/desktop -- --bundles nsis/)
assert.match(phase7Workflow, /npm run tauri:build --workspace=@ghostnexora\/desktop -- --bundles deb,appimage/)

// Android Phase 1 is now local-first. Termux is the execution engine; the
// Compose app only invokes the fixed Ghost Nexora CLI surface through the
// official RUN_COMMAND service. Remote Manager support remains optional and
// retains its Keystore/HTTPS restrictions.
assert.match(androidStore, /AndroidKeyStore/)
assert.match(androidStore, /AES\/GCM\/NoPadding/)
assert.match(androidClient, /https_required_for_remote_control/)
assert.match(androidClient, /host == "10\.0\.2\.2"/)
assert.match(androidManifest, /usesCleartextTraffic="false"/)
assert.match(androidManifest, /com\.termux\.permission\.RUN_COMMAND/)
assert.match(androidManifest, /<package android:name="com\.termux"/)
assert.match(androidManifest, /android:name="\.TermuxResultService"/)
assert.match(androidManifest, /android:exported="false"/)
assert.match(androidBuild, /compileSdk = 37/)
assert.match(androidBuild, /targetSdk = 36/)
assert.match(androidBuild, /minSdk = 33/)
assert.match(androidBuild, /GHOST_NEXORA_SOURCE_REF/)

assert.match(androidLocalRuntime, /com\.termux\.app\.RunCommandService/)
assert.match(androidLocalRuntime, /\/data\/data\/com\.termux\/files\/usr\/bin\/ghostnexora/)
assert.match(androidLocalRuntime, /app-status/)
assert.match(androidLocalRuntime, /app-pair-start/)
assert.match(androidLocalRuntime, /app-pair-status/)
assert.match(androidLocalRuntime, /app-config-set/)
assert.match(androidLocalRuntime, /https:\/\/github\.com\/Gh0stDeveloper\/GhostNexoraBot\.git/)
assert.match(androidLocalRuntime, /BuildConfig\.GHOST_NEXORA_SOURCE_REF/)
assert.doesNotMatch(androidLocalRuntime, /Runtime\.getRuntime|ProcessBuilder/, 'Android app must not expose Java process execution')

assert.match(androidViewModel, /localRuntime\.start\(\)/)
assert.match(androidViewModel, /localRuntime\.stop\(\)/)
assert.match(androidViewModel, /localRuntime\.restart\(\)/)
assert.match(androidViewModel, /localRuntime\.update\(\)/)
assert.match(androidViewModel, /localRuntime\.pairStart/)
assert.match(androidViewModel, /localRuntime\.setWebEnabled/)
assert.match(androidUi, /installLocalRuntime/)
assert.match(androidUi, /RUN_COMMAND_PERMISSION/)
assert.match(androidUi, /setWebEnabled/)
assert.match(androidUi, /remote_optional|R\.string\.remote_optional/)
assert.doesNotMatch(androidUi + androidViewModel, /Runtime\.getRuntime|ProcessBuilder/)

// The Termux CLI is the constrained Android runtime surface. Web is disabled
// on install and only a loopback Lite page can be enabled explicitly.
for (const subcommand of ['app-status', 'app-logs', 'app-pair-start', 'app-pair-status', 'app-pair-cancel', 'app-config-set']) {
  assert.ok(termuxManager.includes(subcommand), `missing Android local runtime command ${subcommand}`)
}
assert.match(termuxManager, /web on\|off/)
assert.match(termuxInstaller, /TERMUX_LOCAL_WEB_ENABLED "false"/)
assert.match(termuxInstaller, /NEXORA_RUNTIME_PROFILE 'termux-lite'/)
assert.match(termuxRuntime, /127\.0\.0\.1/)
assert.match(termuxRuntime, /localWebEnabled/)
assert.match(termuxPair, /PAIRING_OUTPUT_MODE/)
assert.match(termuxPair, /GHOST_NEXORA_PAIR_EVENT/)

console.log('[V2 PHASE 7 AUDIT] OK — remote Control API boundaries remain hardened; Android is local-first through a fixed Termux/Ghost Nexora command surface with optional remote management.')
