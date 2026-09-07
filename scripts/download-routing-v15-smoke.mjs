import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const temp = mkdtempSync(path.join(os.tmpdir(), 'ghostnexora-download-routing-v15-'))

const snippet = `
  const { commands } = await import('./apps/bot/dist/commands/index.js');
  const byRoute = new Map();
  for (const command of commands) {
    for (const key of [command.name, ...(command.aliases ?? [])]) byRoute.set(String(key).toLowerCase(), command);
  }

  const exact = (name) => commands.filter((command) => command.name.toLowerCase() === name);
  const expectOne = (name) => {
    const rows = exact(name);
    if (rows.length !== 1) throw new Error(name + ' expected exactly once, found ' + rows.length);
    return rows[0];
  };
  const expectRoute = (token, canonical) => {
    const command = byRoute.get(token);
    if (!command || command.name !== canonical) throw new Error(token + ' routes to ' + (command?.name ?? 'nothing') + ', expected ' + canonical);
  };

  for (const name of [
    'uptodown','uptodownselect','uptodowndl',
    'liteapks','liteapksselect','liteapksdl',
    'aptoide','aptoideselect','aptoidedl',
    'happymod','happymodselect','happymoddl',
    'tiktok','tiktokselect','tiktokdl',
    'xvideos','xnxx','pornhub','adultselect','adultdl'
  ]) expectOne(name);

  if (byRoute.has('apk')) throw new Error('global .apk route must be retired; use a provider-specific command');
  if (byRoute.has('apkdl')) throw new Error('global .apkdl route must be retired; use provider-specific download commands');

  expectRoute('tt', 'tiktok');
  expectRoute('ttselect', 'tiktokselect');
  expectRoute('ttdl', 'tiktokdl');
  expectRoute('upto', 'uptodown');
  expectRoute('uddl', 'uptodowndl');
  expectRoute('liteapk', 'liteapks');
  expectRoute('ladl', 'liteapksdl');
  expectRoute('apt', 'aptoide');
  expectRoute('aptdl', 'aptoidedl');
  expectRoute('hm', 'happymod');
  expectRoute('hmdl', 'happymoddl');
  expectRoute('xv', 'xvideos');
  expectRoute('xn', 'xnxx');
  expectRoute('ph', 'pornhub');

  const result = {
    commandCount: commands.length,
    tiktok: byRoute.get('tt')?.name,
    stores: ['uptodown','liteapks','aptoide','happymod'].map((key) => byRoute.get(key)?.name),
    adult: ['xvideos','xnxx','pornhub'].map((key) => byRoute.get(key)?.name),
    globalApk: byRoute.has('apk'),
    globalApkDl: byRoute.has('apkdl'),
  };
  console.log(JSON.stringify(result));
`

try {
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', snippet], {
    cwd: root,
    env: {
      ...process.env,
      NEXORA_RUNTIME_PROFILE: 'full',
      WEB_ENABLED: 'false',
      OLLAMA_ENABLED: 'false',
      DATA_DIR: path.join(temp, 'data'),
      SESSION_DIR: path.join(temp, 'session'),
      ADMIN_WEB_TOKEN: 'download-routing-v15-ci-token',
    },
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    console.error(result.stdout)
    console.error(result.stderr)
    throw new Error(`download routing V15 smoke failed (${result.status})`)
  }
  console.log(`[download-routing-v15] ${result.stdout.trim()}`)
} finally {
  rmSync(temp, { recursive: true, force: true })
}
