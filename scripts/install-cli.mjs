#!/usr/bin/env node
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

if (['0', 'false', 'no', 'off'].includes(String(process.env.GHOST_NEXORA_INSTALL_CLI ?? '').toLowerCase())) {
  process.exit(0)
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const dispatcher = path.join(repoRoot, 'scripts', 'ghostnexorabot.mjs')
const envFile = path.join(repoRoot, '.env')

function envValue(key) {
  if (!existsSync(envFile)) return ''
  const line = readFileSync(envFile, 'utf8')
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(`${key}=`))
  return line ? line.slice(key.length + 1).trim() : ''
}

function truthy(value) {
  return ['1', 'true', 'yes', 'on', 'si', 'sí'].includes(String(value ?? '').trim().toLowerCase())
}

function setEnvValue(key, value) {
  if (!existsSync(envFile)) return
  const lines = readFileSync(envFile, 'utf8').split(/\r?\n/)
  const prefix = `${key}=`
  let found = false
  const next = lines.map((line) => {
    if (!line.startsWith(prefix)) return line
    found = true
    return `${prefix}${value}`
  })
  if (!found) next.push(`${prefix}${value}`)
  writeFileSync(envFile, `${next.filter((line, index) => line || index < next.length - 1).join('\n')}\n`, { mode: 0o640 })
}

function runtimePaths() {
  const dataDirRaw = envValue('DATA_DIR') || '/var/lib/ghost-nexora-bot/data'
  const dataDir = path.isAbsolute(dataDirRaw) ? dataDirRaw : path.resolve(repoRoot, dataDirRaw)
  const stateDir = path.dirname(dataDir)
  return { dataDir, stateDir }
}

function installUpdateTrigger() {
  if (typeof process.getuid !== 'function' || process.getuid() !== 0) return
  if (!existsSync('/run/systemd/system')) return

  const { dataDir, stateDir } = runtimePaths()
  const runner = path.join(repoRoot, 'scripts', 'update-request-runner.sh')
  if (!existsSync(runner)) return

  mkdirSync(dataDir, { recursive: true, mode: 0o750 })

  const service = `[Unit]\nDescription=Ghost Nexora Bot privileged updater\nAfter=network-online.target\n\n[Service]\nType=oneshot\nEnvironment=INSTALL_DIR=${repoRoot}\nEnvironment=STATE_DIR=${stateDir}\nEnvironment=DATA_DIR=${dataDir}\nExecStart=/usr/bin/env bash ${runner}\nNice=10\nUMask=0077\n`
  const pathUnit = `[Unit]\nDescription=Watch Ghost Nexora Bot update requests\n\n[Path]\nPathExists=${path.join(dataDir, 'update-request')}\nUnit=ghost-nexora-update.service\n\n[Install]\nWantedBy=multi-user.target\n`

  writeFileSync('/etc/systemd/system/ghost-nexora-update.service', service, { mode: 0o644 })
  writeFileSync('/etc/systemd/system/ghost-nexora-update.path', pathUnit, { mode: 0o644 })

  const reload = spawnSync('systemctl', ['daemon-reload'], { stdio: 'ignore' })
  if (reload.status !== 0) return
  const enable = spawnSync('systemctl', ['enable', '--now', 'ghost-nexora-update.path'], { stdio: 'ignore' })
  if (enable.status === 0) console.log('[Ghost Nexora] Trigger seguro .actualizar habilitado mediante systemd.')
}

function installOfficialDistributionBuilder() {
  if (process.env.GHOST_NEXORA_RELEASE_BUILD_ACTIVE === '1') return
  if (typeof process.getuid !== 'function' || process.getuid() !== 0) return
  if (!existsSync('/run/systemd/system')) return
  if ((envValue('NEXORA_RUNTIME_PROFILE') || 'full') !== 'full') return
  if (!truthy(envValue('WEB_ENABLED'))) return

  const configured = envValue('OFFICIAL_DISTRIBUTION_ENABLED')
  if (configured && !truthy(configured)) return
  const builder = path.join(repoRoot, 'scripts', 'release', 'build-official-apps.sh')
  if (!existsSync(builder)) return

  const { stateDir } = runtimePaths()
  const serviceUser = spawnSync('systemctl', ['show', '-p', 'User', '--value', 'ghost-nexora-bot.service'], { encoding: 'utf8' }).stdout?.trim() || 'ghostbot'
  const releaseDir = envValue('OFFICIAL_RELEASE_DIR') || path.join(stateDir, 'releases')
  const releaseDb = envValue('OFFICIAL_RELEASE_DB') || path.join(stateDir, 'release-db', 'releases.sqlite')
  const signingDir = envValue('OFFICIAL_SIGNING_DIR') || path.join(stateDir, 'release-secrets')
  const signingEnv = envValue('OFFICIAL_SIGNING_ENV') || path.join(signingDir, 'signing.env')
  setEnvValue('OFFICIAL_DISTRIBUTION_ENABLED', 'true')
  setEnvValue('OFFICIAL_RELEASE_DIR', releaseDir)
  setEnvValue('OFFICIAL_RELEASE_DB', releaseDb)
  setEnvValue('OFFICIAL_SIGNING_DIR', signingDir)
  setEnvValue('OFFICIAL_SIGNING_ENV', signingEnv)
  if (!envValue('OFFICIAL_RELEASE_CHANNEL')) setEnvValue('OFFICIAL_RELEASE_CHANNEL', 'rc')

  const service = `[Unit]\nDescription=Ghost Nexora official application builder\nAfter=network-online.target\nWants=network-online.target\nConditionPathExists=${builder}\n\n[Service]\nType=oneshot\nEnvironment=INSTALL_DIR=${repoRoot}\nEnvironment=STATE_DIR=${stateDir}\nEnvironment=SERVICE_USER=${serviceUser}\nEnvironment=GHOST_NEXORA_RELEASE_BUILD_ACTIVE=1\nExecStartPre=/bin/bash -lc 'for i in $(seq 1 120); do if ! pgrep -f "scripts/(install|update)[.]sh" >/dev/null; then exit 0; fi; sleep 5; done; exit 1'\nExecStart=/usr/bin/env bash ${builder}\nNice=15\nIOSchedulingClass=best-effort\nIOSchedulingPriority=7\nUMask=0077\nTimeoutStartSec=0\n`
  const timer = `[Unit]\nDescription=Schedule Ghost Nexora official application build\n\n[Timer]\nOnActiveSec=45s\nAccuracySec=5s\nUnit=ghost-nexora-release-build.service\n\n[Install]\nWantedBy=timers.target\n`
  writeFileSync('/etc/systemd/system/ghost-nexora-release-build.service', service, { mode: 0o644 })
  writeFileSync('/etc/systemd/system/ghost-nexora-release-build.timer', timer, { mode: 0o644 })
  spawnSync('systemctl', ['daemon-reload'], { stdio: 'ignore' })
  spawnSync('systemctl', ['enable', 'ghost-nexora-release-build.timer'], { stdio: 'ignore' })
  const scheduled = spawnSync('systemctl', ['restart', 'ghost-nexora-release-build.timer'], { stdio: 'ignore' })
  if (scheduled.status === 0) console.log('[Ghost Nexora] Compilación oficial Android/Windows/Linux programada después de la actualización.')
}

function installLinux() {
  if (typeof process.getuid !== 'function' || process.getuid() !== 0) {
    console.log('[Ghost Nexora] CLI global omitido: npm no se ejecuta como root. En VPS el instalador/actualizador lo instala automáticamente.')
    return
  }

  const target = '/usr/local/bin/ghostnexorabot'
  const moduleUrl = pathToFileURL(dispatcher).href
  const launcher = `#!/usr/bin/env node\nimport(${JSON.stringify(moduleUrl)}).catch((error) => { console.error(error); process.exit(1) })\n`
  writeFileSync(target, launcher, { mode: 0o755 })
  chmodSync(target, 0o755)
  console.log(`[Ghost Nexora] CLI instalado: ${target}`)
  installUpdateTrigger()
  installOfficialDistributionBuilder()
}

function installWindows() {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
  const binDir = path.join(localAppData, 'GhostNexora', 'bin')
  const target = path.join(binDir, 'ghostnexorabot.cmd')
  mkdirSync(binDir, { recursive: true })
  const safeDispatcher = dispatcher.replace(/"/g, '""')
  writeFileSync(target, `@echo off\r\nnode "${safeDispatcher}" %*\r\n`, 'utf8')
  console.log(`[Ghost Nexora] CLI preparado: ${target}`)
}

try {
  if (process.platform === 'win32') installWindows()
  else if (process.platform === 'linux') installLinux()
} catch (error) {
  // Nunca hacemos fallar npm install por un acceso directo, trigger o compilación opcional.
  console.warn(`[Ghost Nexora] No se pudo instalar el CLI/trigger global: ${error instanceof Error ? error.message : String(error)}`)
}
