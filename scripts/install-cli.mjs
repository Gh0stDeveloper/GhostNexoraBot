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

function envValue(key) {
  const envFile = path.join(repoRoot, '.env')
  if (!existsSync(envFile)) return ''
  const line = readFileSync(envFile, 'utf8')
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(`${key}=`))
  return line ? line.slice(key.length + 1).trim() : ''
}

function installUpdateTrigger() {
  if (typeof process.getuid !== 'function' || process.getuid() !== 0) return
  if (!existsSync('/run/systemd/system')) return

  const dataDirRaw = envValue('DATA_DIR') || '/var/lib/ghost-nexora-bot/data'
  const dataDir = path.isAbsolute(dataDirRaw) ? dataDirRaw : path.resolve(repoRoot, dataDirRaw)
  const stateDir = path.dirname(dataDir)
  const runner = path.join(repoRoot, 'scripts', 'update-request-runner.sh')
  if (!existsSync(runner)) return

  chmodSync(runner, 0o755)
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
  // Nunca hacemos fallar npm install por un acceso directo o trigger opcional.
  console.warn(`[Ghost Nexora] No se pudo instalar el CLI/trigger global: ${error instanceof Error ? error.message : String(error)}`)
}
