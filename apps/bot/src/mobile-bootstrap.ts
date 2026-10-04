const args = new Map(
  process.argv.slice(2)
    .filter((value) => value.startsWith('--') && value.includes('='))
    .map((value) => {
      const index = value.indexOf('=')
      return [value.slice(2, index), value.slice(index + 1)]
    }),
)

const required = (name) => {
  const value = args.get(name)?.trim()
  if (!value) throw new Error(`missing_mobile_runtime_argument:${name}`)
  return value
}

const stateDir = required('state-dir')
const sessionDir = required('session-dir')
const dataDir = required('data-dir')
const cacheDir = required('cache-dir')

process.env.NEXORA_RUNTIME_PROFILE = 'mobile-lite'
process.env.GHOSTNEXORA_STATE = stateDir
process.env.SESSION_DIR = sessionDir
process.env.DATA_DIR = dataDir
process.env.HOME = stateDir
process.env.TMPDIR = cacheDir
process.env.WEB_ENABLED = 'false'
process.env.OLLAMA_ENABLED = 'false'

await import('./mobile-lite.js')
