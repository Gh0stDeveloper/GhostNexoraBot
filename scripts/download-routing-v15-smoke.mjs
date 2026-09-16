import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const temp = mkdtempSync(path.join(os.tmpdir(), 'ghostnexora-download-routing-v15-'))

const snippet = `
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const raw = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const target = new URL(raw);
    if (target.pathname.endsWith('/search/happymod')) {
      return new Response(JSON.stringify({
        status: true,
        result: [{
          name: 'Minecraft',
          version: '1.21.90',
          url: 'https://downloads.example.test/minecraft.apk'
        }]
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    return originalFetch(input, init);
  };

  const { commands } = await import('./apps/bot/dist/commands/index.js');
  const { searchHappyMod } = await import('./apps/bot/dist/services/happymod.js');
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
    'fdroid','fdroidselect','fdroiddl',
    'apktools','apktoolsselect','apktoolsdl',
    'androforever','androforeverselect','androforeverdl',
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
  expectRoute('f-droid', 'fdroid');
  expectRoute('apktoolsearch', 'apktools');
  expectRoute('andro', 'androforever');
  expectRoute('xv', 'xvideos');
  expectRoute('xn', 'xnxx');
  expectRoute('ph', 'pornhub');

  const happy = await searchHappyMod('minecraft', 5);
  if (happy.length !== 1) throw new Error('HappyMod result[] url payload was discarded');
  if (happy[0]?.name !== 'Minecraft') throw new Error('HappyMod result name was not normalized');
  if (!happy[0]?.token?.startsWith('hm_')) throw new Error('HappyMod result token was not generated');

  const { readFileSync } = await import('node:fs');
  for (const file of [
    'apps/bot/src/commands/app-stores-v15.ts',
    'apps/bot/src/commands/tiktok-v15.ts',
    'apps/bot/src/commands/media-download-fixes-v2.ts',
    'apps/bot/src/commands/likee.ts',
    'apps/bot/src/commands/terabox.ts'
  ]) {
    const source = readFileSync(file, 'utf8');
    const forbidden = [
      /Fuente:\\s*LemPi/i,
      /Fuente:\\s*HappyMod/i,
      /Fuente:\\s*Aptoide/i,
      /Fuente:\\s*\\$\\{store/i,
      /API:\\s*\\/dl\\//i,
      /Consultando LemPi/i,
      /mediante la API de LemPi/i,
      /Ghost Nexora Bot[^\\n]*· LemPi/i
    ];
    if (forbidden.some((pattern) => pattern.test(source))) {
      throw new Error('download UI exposes provider/API details in ' + file);
    }
  }

  const result = {
    commandCount: commands.length,
    tiktok: byRoute.get('tt')?.name,
    happymodPayload: happy[0]?.name,
    stores: ['uptodown','liteapks','aptoide','happymod','fdroid','apktools','androforever'].map((key) => byRoute.get(key)?.name),
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
      LEMPI_API_KEY: 'happymod-v15-smoke-key',
      LEMPI_API_KEYS: '',
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
