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
      if (target.searchParams.get('text') !== 'Red ball 4') {
        throw new Error('HappyMod must use the official text query parameter');
      }
      if (target.searchParams.has('q') || target.searchParams.has('query') || target.searchParams.has('search')) {
        throw new Error('HappyMod sent a legacy search parameter');
      }
      if (target.searchParams.get('apikey') !== 'happymod-v15-smoke-key') {
        throw new Error('HappyMod did not reuse the configured API key');
      }

      return new Response(JSON.stringify({
        status: true,
        creadores: 'xrljose y Ryze',
        publicado_por: 'xrljosedv',
        creador: 'xrljosedv',
        data: {
          busqueda: 'Red ball 4',
          total_resultados: 33,
          resultados_mostrados: 2,
          resultados: [
            {
              numero: 1,
              nombre: 'Red Ball 4',
              version: 'v1.17.03',
              imagen: 'https://api.lempi.lat/Avz.webp',
              url: 'https://download.happymod.to/red-ball-4-app-mod/com.FDGEntertainment.redball4.gp/'
            },
            {
              numero: 4,
              nombre: 'Geometry Dash Lite',
              version: 'v2.21',
              imagen: 'https://api.lempi.lat/sH8.webp',
              url: 'https://api.lempi.lat/dhC'
            }
          ],
          mas_resultados: 31
        }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    if (target.hostname === 'download.happymod.to') {
      return new Response('<html><body><a href="https://cdn.example.test/red-ball-4.apk">Download APK</a></body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    if (target.hostname === 'cdn.example.test') {
      return new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), {
        status: 200,
        headers: { 'content-type': 'application/vnd.android.package-archive' }
      });
    }

    return originalFetch(input, init);
  };

  const { commands } = await import('./apps/bot/dist/commands/index.js');
  const { searchHappyMod, resolveHappyModApkUrl } = await import('./apps/bot/dist/services/happymod.js');
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

  const happy = await searchHappyMod('Red ball 4', 5);
  if (happy.length !== 2) throw new Error('HappyMod official data.resultados payload was not parsed');
  if (happy[0]?.name !== 'Red Ball 4') throw new Error('HappyMod nombre was not normalized');
  if (happy[0]?.version !== 'v1.17.03') throw new Error('HappyMod version was not preserved');
  if (happy[0]?.icon !== 'https://api.lempi.lat/Avz.webp') throw new Error('HappyMod imagen was not preserved');
  if (!happy[0]?.token?.startsWith('hm_')) throw new Error('HappyMod result token was not generated');

  const resolved = await resolveHappyModApkUrl(happy[0]);
  if (resolved !== 'https://cdn.example.test/red-ball-4.apk') {
    throw new Error('HappyMod page URL was not resolved before download: ' + resolved);
  }

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
    happymodResolved: resolved,
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
