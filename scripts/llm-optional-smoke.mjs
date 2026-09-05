import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const temp = mkdtempSync(path.join(os.tmpdir(), 'ghostnexora-llm-optional-'))
const emptyBin = path.join(temp, 'empty-bin')
const fakeBin = path.join(temp, 'fake-bin')
mkdirSync(emptyBin, { recursive: true })
mkdirSync(fakeBin, { recursive: true })
const fakeOllama = path.join(fakeBin, 'ollama')
writeFileSync(fakeOllama, '#!/bin/sh\nexit 0\n')
chmodSync(fakeOllama, 0o755)

function run({ requested, binary, expectEnabled }) {
  const snippet = `
    const { config } = await import('./apps/bot/dist/config.js');
    const { commands } = await import('./apps/bot/dist/commands/index.js');
    const tokens = new Set(commands.flatMap((command) => [command.name, ...(command.aliases ?? [])].map((value) => String(value).toLowerCase())));
    const local = ['llm', 'minillm', 'localai', 'corpus', 'llmcorpus', 'autochat', 'liberar', 'chatlibre', 'conversacion'];
    const present = local.filter((token) => tokens.has(token));
    const aiPresent = tokens.has('ai') && tokens.has('investiga');
    console.log(JSON.stringify({ requested: config.ollamaRequested, installed: config.ollamaInstalled, enabled: config.ollamaEnabled, present, aiPresent, count: commands.length }));
    if (${expectEnabled ? 'true' : 'false'}) {
      if (!config.ollamaEnabled || !tokens.has('llm') || !tokens.has('autochat')) process.exit(20);
    } else {
      if (config.ollamaEnabled || present.length) process.exit(21);
    }
    if (!aiPresent) process.exit(22);
  `
  return spawnSync(process.execPath, ['--input-type=module', '--eval', snippet], {
    cwd: root,
    env: {
      ...process.env,
      PATH: binary ? fakeBin : emptyBin,
      NEXORA_RUNTIME_PROFILE: 'full',
      OLLAMA_ENABLED: requested ? 'true' : 'false',
      DATA_DIR: path.join(temp, `data-${requested}-${binary}`),
      SESSION_DIR: path.join(temp, `session-${requested}-${binary}`),
      ADMIN_WEB_TOKEN: 'llm-optional-ci-token',
    },
    encoding: 'utf8',
  })
}

function assertRun(label, result) {
  if (result.status !== 0) {
    console.error(result.stdout)
    console.error(result.stderr)
    throw new Error(`${label} failed (${result.status})`)
  }
  console.log(`[llm-optional-smoke] ${label}:`, result.stdout.trim())
}

try {
  assertRun('flag OFF', run({ requested: false, binary: false, expectEnabled: false }))
  assertRun('flag ON + binary missing', run({ requested: true, binary: false, expectEnabled: false }))
  assertRun('flag ON + Ollama present', run({ requested: true, binary: true, expectEnabled: true }))
} finally {
  rmSync(temp, { recursive: true, force: true })
}
