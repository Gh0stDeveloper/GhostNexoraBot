import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const temp = mkdtempSync(path.join(os.tmpdir(), 'ghost-nexora-termux-lite-'))
process.env.NEXORA_RUNTIME_PROFILE = 'termux-lite'
process.env.OLLAMA_ENABLED = 'true'
process.env.DATA_DIR = path.join(temp, 'data')
process.env.SESSION_DIR = path.join(temp, 'session')
process.env.ADMIN_WEB_TOKEN = 'termux-lite-ci-token'

try {
  const [{ config }, { termuxLiteCommands }] = await Promise.all([
    import('../apps/bot/dist-termux/config.js'),
    import('../apps/bot/dist-termux/commands/termux-lite.js'),
  ])

  assert.equal(config.runtimeProfile, 'termux-lite')
  assert.equal(config.isTermuxLite, true)
  assert.equal(config.ollamaEnabled, false, 'Termux Lite must force Ollama off')

  const tokens = new Set()
  for (const command of termuxLiteCommands) {
    tokens.add(command.name.toLowerCase())
    for (const alias of command.aliases ?? []) tokens.add(alias.toLowerCase())
  }

  for (const forbidden of [
    'ai', 'aistatus', 'llm', 'minillm', 'localai',
    'autochat', 'chatbot', 'navegador', 'nav',
    'adminpanel', 'dashboard',
  ]) {
    assert.equal(tokens.has(forbidden), false, `forbidden Lite command leaked: ${forbidden}`)
  }

  assert.equal(tokens.has('menu'), true, 'Lite menu command missing')
  assert.equal(tokens.has('subbot'), true, 'Lite subbot management missing')
  assert.equal(tokens.has('subbots'), true, 'Lite owner subbot list missing')

  const subbot = termuxLiteCommands.find((command) => command.name === 'subbot')
  assert.ok(subbot, 'subbot command missing')
  assert.equal(subbot.usage?.includes('portal'), false, 'Termux Lite must not advertise the web portal')

  console.log(`[termux-lite-smoke] ok · commands=${termuxLiteCommands.length} · ollama=${config.ollamaEnabled}`)
} finally {
  rmSync(temp, { recursive: true, force: true })
}

process.exit(0)
