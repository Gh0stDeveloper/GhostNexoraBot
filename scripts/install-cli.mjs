#!/usr/bin/env node
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
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
  // Nunca hacemos fallar npm install por un acceso directo opcional. Los scripts
  // internos siguen disponibles como fallback: npm run session:repair.
  console.warn(`[Ghost Nexora] No se pudo instalar el CLI global: ${error instanceof Error ? error.message : String(error)}`)
}
