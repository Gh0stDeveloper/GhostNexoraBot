#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const envFile = path.join(repoRoot, '.env')
const pairEntry = path.join(repoRoot, 'apps', 'bot', 'dist', 'pair.js')
const isWindows = process.platform === 'win32'

function header(title) {
  console.log('\n============================================================')
  console.log(` Ghost Nexora Bot · ${title}`)
  console.log('============================================================')
}
function info(message) { console.log(`[INFO] ${message}`) }
function ok(message) { console.log(`[ OK ] ${message}`) }
function warn(message) { console.warn(`[WARN] ${message}`) }
function fail(message) { console.error(`[FAIL] ${message}`) }

function parseArgs(argv) {
  const out = { method: 'code', phone: '', noStart: false, check: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--no-start') out.noStart = true
    else if (arg === '--check') out.check = true
    else if (arg === '--method' && argv[i + 1]) out.method = String(argv[++i]).toLowerCase()
    else if (arg.startsWith('--method=')) out.method = arg.slice('--method='.length).toLowerCase()
    else if (arg === '--phone' && argv[i + 1]) out.phone = String(argv[++i]).replace(/\D/g, '')
    else if (arg.startsWith('--phone=')) out.phone = arg.slice('--phone='.length).replace(/\D/g, '')
    else if (/^\+?[\d\s-]{8,24}$/.test(arg)) out.phone = arg.replace(/\D/g, '')
    else throw new Error(`Argumento no reconocido: ${arg}`)
  }
  if (!['code', 'qr'].includes(out.method)) throw new Error('Método inválido. Usa --method code o --method qr.')
  if (out.phone && (out.phone.length < 8 || out.phone.length > 15)) throw new Error('Número inválido. Usa formato internacional completo.')
  if (out.method === 'qr') out.phone = ''
  return out
}

function parseEnv(file) {
  const result = {}
  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const index = line.indexOf('=')
    if (index <= 0) continue
    const key = line.slice(0, index).trim()
    let value = line.slice(index + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    result[key] = value
  }
  return result
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: options.capture ? 'utf8' : undefined,
    env: options.env ?? process.env,
    windowsHide: true,
  })
  if (options.capture) return result
  return result.status ?? (result.error ? 1 : 0)
}

function capture(command, args) {
  const result = run(command, args, { capture: true })
  if (result.status !== 0) return ''
  return String(result.stdout ?? '').trim()
}

function commandExists(command) {
  const checker = isWindows ? 'where.exe' : 'sh'
  const args = isWindows ? [command] : ['-lc', `command -v ${command} >/dev/null 2>&1`]
  const result = spawnSync(checker, args, { stdio: 'ignore', windowsHide: true })
  return result.status === 0
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try { process.kill(pid, 0); return true } catch { return false }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function windowsStateDir() {
  return process.env.GHOST_NEXORA_STATE || path.join(process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || repoRoot, 'AppData', 'Local'), 'GhostNexoraBot')
}

function stopWindowsBot() {
  const pidFile = path.join(windowsStateDir(), 'run', 'bot.pid')
  if (!existsSync(pidFile)) return { managed: false, wasRunning: false, pidFile }
  const pid = Number(readFileSync(pidFile, 'utf8').trim())
  const wasRunning = isProcessAlive(pid)
  if (!wasRunning) return { managed: true, wasRunning: false, pidFile }
  info(`Deteniendo MainBot de Windows (PID ${pid})...`)
  try { process.kill(pid, 'SIGTERM') } catch {}
  for (let i = 0; i < 20 && isProcessAlive(pid); i += 1) sleep(250)
  if (isProcessAlive(pid)) run('taskkill.exe', ['/PID', String(pid), '/F'])
  ok('MainBot detenido.')
  return { managed: true, wasRunning: true, pidFile }
}

function startWindowsBot() {
  const manager = path.join(repoRoot, 'scripts', 'windows', 'ghostnexora.ps1')
  if (!existsSync(manager)) return
  info('Iniciando MainBot...')
  const status = run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', manager, 'start'])
  if (status !== 0) warn('El pairing terminó bien, pero el manager de Windows no pudo iniciar el MainBot automáticamente.')
}

function linuxServiceExists() {
  if (!commandExists('systemctl')) return false
  return spawnSync('systemctl', ['cat', 'ghost-nexora-bot.service'], { stdio: 'ignore' }).status === 0
}

function resolveRuntime(env) {
  const sessionRaw = env.SESSION_DIR || './data/session'
  const dataRaw = env.DATA_DIR || './data'
  const sessionDir = path.isAbsolute(sessionRaw) ? path.normalize(sessionRaw) : path.resolve(repoRoot, sessionRaw)
  const dataDir = path.isAbsolute(dataRaw) ? path.normalize(dataRaw) : path.resolve(repoRoot, dataRaw)
  const subbotsDir = path.join(dataDir, 'subbots')

  const rootPath = path.parse(sessionDir).root
  if (sessionDir === rootPath || sessionDir === repoRoot || sessionDir === dataDir || sessionDir === subbotsDir || sessionDir.startsWith(`${subbotsDir}${path.sep}`)) {
    throw new Error(`SESSION_DIR inseguro para reparación: ${sessionDir}`)
  }
  return { sessionDir, dataDir }
}

function ensureBuild() {
  if (existsSync(pairEntry)) return
  warn('No existe apps/bot/dist/pair.js. Preparando el runtime antes de tocar la sesión...')
  if (run(isWindows ? 'npm.cmd' : 'npm', ['install', '--workspace=@ghostnexora/bot', '--include=dev']) !== 0) throw new Error('npm install del bot falló. La sesión no fue modificada.')
  if (run(isWindows ? 'npm.cmd' : 'npm', ['run', 'build', '--workspace=@ghostnexora/bot']) !== 0) throw new Error('El build del bot falló. La sesión no fue modificada.')
  if (!existsSync(pairEntry)) throw new Error('El build terminó pero dist/pair.js no existe. La sesión no fue modificada.')
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
}

function backupSession(sessionDir) {
  if (!existsSync(sessionDir)) {
    mkdirSync(sessionDir, { recursive: true, mode: 0o700 })
    return null
  }
  const backup = `${sessionDir}.old-${timestamp()}`
  renameSync(sessionDir, backup)
  mkdirSync(sessionDir, { recursive: true, mode: 0o700 })
  return backup
}

function applyLinuxOwnership(sessionDir, user) {
  if (!user || user === 'root') return
  const group = capture('id', ['-gn', user]) || user
  if (run('chown', ['-R', `${user}:${group}`, sessionDir]) !== 0) throw new Error(`No se pudieron aplicar permisos ${user}:${group} a ${sessionDir}.`)
  run('chmod', ['700', sessionDir])
}

function pairEnvironment(args) {
  return {
    ...process.env,
    ENV_FILE: envFile,
    PAIRING_METHOD: args.method,
    ...(args.phone ? { PAIRING_NUMBER: args.phone } : {}),
  }
}

function runPairLinux(args, serviceUser) {
  const env = pairEnvironment(args)
  const npmArgs = ['run', 'pair']
  const currentUser = capture('id', ['-un']) || 'root'
  if (!serviceUser || serviceUser === currentUser) return run('npm', npmArgs, { env })

  const envArgs = ['ENV_FILE=' + envFile, 'PAIRING_METHOD=' + args.method]
  if (args.phone) envArgs.push('PAIRING_NUMBER=' + args.phone)

  if (commandExists('runuser')) return run('runuser', ['-u', serviceUser, '--', 'env', ...envArgs, 'npm', ...npmArgs])
  if (commandExists('sudo')) return run('sudo', ['-u', serviceUser, 'env', ...envArgs, 'npm', ...npmArgs])
  throw new Error(`No puedo ejecutar pairing como ${serviceUser}: faltan runuser/sudo.`)
}

function runPairWindows(args) {
  return run('npm.cmd', ['run', 'pair'], { env: pairEnvironment(args) })
}

function showFailure(backup, sessionDir) {
  fail('La vinculación no pudo completarse.')
  if (backup) console.error(`La sesión anterior quedó respaldada en:\n  ${backup}`)
  console.error(`La nueva carpeta de sesión quedó en:\n  ${sessionDir}`)
  console.error('\nSi WhatsApp muestra una restricción temporal para “Dispositivos vinculados”, este reparador no puede ni debe eludirla. Espera a que WhatsApp vuelva a permitir la vinculación y ejecuta el mismo comando otra vez.')
  console.error('El MainBot queda detenido para evitar que una sesión incompleta se ejecute en bucle.')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  header('REPARACIÓN DE SESIÓN PRINCIPAL')

  if (!existsSync(envFile)) throw new Error(`No existe ${envFile}. Ejecuta primero el instalador o crea .env.`)
  const env = parseEnv(envFile)
  const { sessionDir, dataDir } = resolveRuntime(env)

  info(`Repositorio: ${repoRoot}`)
  info(`SESSION_DIR: ${sessionDir}`)
  info(`DATA_DIR: ${dataDir}`)
  info(`Método de pairing: ${args.method === 'code' ? 'código por número' : 'QR'}`)
  info('Solo se reparará la sesión del MainBot. Subbots, SQLite, Web y Ollama no se modificarán.')

  let serviceExists = false
  let serviceUser = ''
  if (!isWindows) {
    serviceExists = linuxServiceExists()
    if (serviceExists) {
      if (typeof process.getuid === 'function' && process.getuid() !== 0) throw new Error('La instalación usa systemd. Ejecuta este comando con sudo: sudo npm run session:repair')
      serviceUser = capture('systemctl', ['show', '-p', 'User', '--value', 'ghost-nexora-bot.service']) || 'root'
      info(`Servicio systemd detectado · usuario ${serviceUser}`)
    }
  } else {
    info(`Estado Windows: ${windowsStateDir()}`)
  }

  if (args.check) {
    ok('Comprobación completada. No se modificó ninguna sesión.')
    return
  }

  ensureBuild()

  if (serviceExists) {
    info('Deteniendo ghost-nexora-bot.service...')
    if (run('systemctl', ['stop', 'ghost-nexora-bot.service']) !== 0) throw new Error('No se pudo detener ghost-nexora-bot.service. La sesión no fue modificada.')
    ok('MainBot detenido.')
  }

  const windowsState = isWindows ? stopWindowsBot() : null
  const backup = backupSession(sessionDir)
  if (backup) ok(`Sesión anterior respaldada: ${backup}`)
  else info('No existía una sesión anterior; se creó una carpeta limpia.')

  if (!isWindows && serviceExists) applyLinuxOwnership(sessionDir, serviceUser)

  console.log('\nLa sesión principal está limpia. Iniciando pairing...\n')
  const pairStatus = isWindows ? runPairWindows(args) : runPairLinux(args, serviceUser)

  if (pairStatus !== 0) {
    showFailure(backup, sessionDir)
    process.exitCode = pairStatus || 1
    return
  }

  if (!isWindows && serviceExists) applyLinuxOwnership(sessionDir, serviceUser)
  ok('Credenciales nuevas guardadas correctamente.')

  if (!args.noStart) {
    if (serviceExists) {
      info('Iniciando ghost-nexora-bot.service...')
      if (run('systemctl', ['start', 'ghost-nexora-bot.service']) !== 0) {
        warn('La sesión quedó vinculada, pero systemd no pudo iniciar el MainBot automáticamente.')
        process.exitCode = 2
        return
      }
      ok('MainBot iniciado.')
    } else if (isWindows && windowsState?.managed) {
      startWindowsBot()
    }
  }

  console.log('\nReparación completada.')
  if (backup) console.log(`Backup de la sesión anterior: ${backup}`)
  console.log('Prueba el bot con .ping y revisa el health/log si necesitas validar la conexión.')
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
