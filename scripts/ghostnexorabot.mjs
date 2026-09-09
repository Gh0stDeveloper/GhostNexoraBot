#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const isWindows = process.platform === 'win32'

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, ...(options.env ?? {}) },
    windowsHide: true,
  })
  if (result.error) {
    console.error(`[FAIL] ${result.error.message}`)
    return 1
  }
  return result.status ?? 1
}

function help() {
  console.log(`
Ghost Nexora Bot · CLI

Uso:
  ghostnexorabot <comando> [opciones]

Comandos:
  sessionrepair                 Repara y vuelve a vincular la sesión principal
  session-repair               Alias de sessionrepair
  repair-session               Alias de sessionrepair
  pair                          Ejecuta el pairing normal sin borrar la sesión
  update                        Actualiza Ghost Nexora Bot
  status                        Muestra el estado del MainBot
  start                         Inicia el MainBot
  stop                          Detiene el MainBot
  restart                       Reinicia el MainBot
  logs                          Muestra/sigue los logs del MainBot
  help                          Muestra esta ayuda

Ejemplos:
  ghostnexorabot sessionrepair
  ghostnexorabot sessionrepair --phone 521XXXXXXXXXX
  ghostnexorabot sessionrepair --method qr
  ghostnexorabot sessionrepair --check
`)
}

function requireFile(file, label) {
  if (!existsSync(file)) {
    console.error(`[FAIL] No existe ${label}: ${file}`)
    console.error('Ejecuta primero el instalador/actualizador de Ghost Nexora Bot.')
    process.exit(1)
  }
}

function linuxSystemctl(action) {
  const args = action === 'logs'
    ? ['journalctl', '-u', 'ghost-nexora-bot', '-f', '-n', '100', '--no-pager']
    : ['systemctl', action, 'ghost-nexora-bot.service']
  return run(args[0], args.slice(1))
}

function windowsManager(action, extra = []) {
  const manager = path.join(repoRoot, 'scripts', 'windows', 'ghostnexora.ps1')
  requireFile(manager, 'manager de Windows')
  return run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', manager, action, ...extra])
}

const [rawAction = 'help', ...args] = process.argv.slice(2)
const action = rawAction.toLowerCase().replace(/_/g, '-')
let status = 0

switch (action) {
  case 'sessionrepair':
  case 'session-repair':
  case 'repair-session': {
    const repair = path.join(repoRoot, 'scripts', 'repair-main-session.mjs')
    requireFile(repair, 'reparador de sesión')
    status = run(process.execPath, [repair, ...args])
    break
  }
  case 'pair': {
    status = run(isWindows ? 'npm.cmd' : 'npm', ['run', 'pair', '--', ...args])
    break
  }
  case 'update': {
    if (isWindows) status = windowsManager('update')
    else {
      const updater = path.join(repoRoot, 'scripts', 'update.sh')
      const preflight = path.join(repoRoot, 'scripts', 'safe-git-preflight.mjs')
      requireFile(updater, 'actualizador VPS')
      requireFile(preflight, 'preflight seguro de Git')

      const needsSudo = typeof process.getuid === 'function' && process.getuid() !== 0
      const preflightStatus = needsSudo
        ? run('sudo', [process.execPath, preflight])
        : run(process.execPath, [preflight])
      if (preflightStatus !== 0) {
        status = preflightStatus
        break
      }

      // Ejecutamos siempre mediante bash para no depender del bit ejecutable del
      // archivo después de un checkout, copia o actualización del repositorio.
      status = needsSudo
        ? run('sudo', ['bash', updater])
        : run('bash', [updater])
    }
    break
  }
  case 'start':
  case 'stop':
  case 'restart':
  case 'status':
  case 'logs': {
    if (isWindows) status = windowsManager(action)
    else if (action === 'status') status = run('systemctl', ['status', 'ghost-nexora-bot.service', '--no-pager', '-l'])
    else status = linuxSystemctl(action)
    break
  }
  case 'help':
  case '--help':
  case '-h': {
    help()
    status = 0
    break
  }
  default: {
    console.error(`[FAIL] Comando desconocido: ${rawAction}`)
    help()
    status = 2
  }
}

process.exit(status)
