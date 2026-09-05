import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const temp = mkdtempSync(path.join(os.tmpdir(), 'ghostnexora-web-optional-'))

function run(enabled) {
  const snippet = `
    const { config } = await import('./apps/bot/dist/config.js');
    const { commands } = await import('./apps/bot/dist/commands/index.js');
    const tokens = new Set(commands.flatMap((command) => [command.name, ...(command.aliases ?? [])].map((value) => String(value).toLowerCase())));
    const subbot = commands.find((command) => command.name === 'subbot');
    if (!subbot) process.exit(30);
    const hasDashboard = tokens.has('adminpanel') || tokens.has('dashboard');
    const usage = String(subbot.usage ?? '');
    console.log(JSON.stringify({ webEnabled: config.webEnabled, hasDashboard, usage, count: commands.length }));
    if (${enabled ? 'true' : 'false'}) {
      if (!config.webEnabled || !hasDashboard || !usage.includes('portal')) process.exit(31);
    } else {
      if (config.webEnabled || hasDashboard || usage.includes('portal')) process.exit(32);
    }
  `
  return spawnSync(process.execPath, ['--input-type=module', '--eval', snippet], {
    cwd: root,
    env: {
      ...process.env,
      NEXORA_RUNTIME_PROFILE: 'full',
      WEB_ENABLED: enabled ? 'true' : 'false',
      OLLAMA_ENABLED: 'false',
      DATA_DIR: path.join(temp, enabled ? 'data-on' : 'data-off'),
      SESSION_DIR: path.join(temp, enabled ? 'session-on' : 'session-off'),
      ADMIN_WEB_TOKEN: 'web-optional-ci-token',
    },
    encoding: 'utf8',
  })
}

try {
  for (const enabled of [false, true]) {
    const result = run(enabled)
    if (result.status !== 0) {
      console.error(result.stdout)
      console.error(result.stderr)
      throw new Error(`WEB_ENABLED=${enabled} smoke failed (${result.status})`)
    }
    console.log(`[web-optional-smoke] ${enabled ? 'ON' : 'OFF'}: ${result.stdout.trim()}`)
  }
} finally {
  rmSync(temp, { recursive: true, force: true })
}
