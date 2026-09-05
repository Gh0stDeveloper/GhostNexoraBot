import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const temp = mkdtempSync(path.join(os.tmpdir(), 'ghostnexora-llm-optional-'))

function run(enabled) {
  const snippet = `
    const { commands } = await import('./apps/bot/dist/commands/index.js');
    const tokens = new Set(commands.flatMap((command) => [command.name, ...(command.aliases ?? [])].map((value) => String(value).toLowerCase())));
    const local = ['llm', 'minillm', 'localai', 'corpus', 'llmcorpus', 'autochat', 'liberar', 'chatlibre', 'conversacion'];
    const present = local.filter((token) => tokens.has(token));
    const aiPresent = tokens.has('ai') && tokens.has('investiga');
    console.log(JSON.stringify({ present, aiPresent, count: commands.length }));
    if (${enabled ? 'true' : 'false'}) {
      if (!tokens.has('llm') || !tokens.has('autochat')) process.exit(20);
    } else {
      if (present.length) process.exit(21);
    }
    if (!aiPresent) process.exit(22);
  `
  return spawnSync(process.execPath, ['--input-type=module', '--eval', snippet], {
    cwd: root,
    env: {
      ...process.env,
      NEXORA_RUNTIME_PROFILE: 'full',
      OLLAMA_ENABLED: enabled ? 'true' : 'false',
      DATA_DIR: path.join(temp, enabled ? 'data-on' : 'data-off'),
      SESSION_DIR: path.join(temp, enabled ? 'session-on' : 'session-off'),
      ADMIN_WEB_TOKEN: 'llm-optional-ci-token',
    },
    encoding: 'utf8',
  })
}

try {
  const off = run(false)
  if (off.status !== 0) {
    console.error(off.stdout)
    console.error(off.stderr)
    throw new Error(`OLLAMA_ENABLED=false smoke failed (${off.status})`)
  }
  const on = run(true)
  if (on.status !== 0) {
    console.error(on.stdout)
    console.error(on.stderr)
    throw new Error(`OLLAMA_ENABLED=true smoke failed (${on.status})`)
  }
  console.log('[llm-optional-smoke] OFF:', off.stdout.trim())
  console.log('[llm-optional-smoke] ON :', on.stdout.trim())
} finally {
  rmSync(temp, { recursive: true, force: true })
}
