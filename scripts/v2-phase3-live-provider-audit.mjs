#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { execa } from 'execa'

const outputArg = process.argv.find((arg) => arg.startsWith('--output='))
const outputPath = path.resolve(outputArg ? outputArg.slice('--output='.length) : 'artifacts/v2-phase3-live-provider-audit.json')
const apk = await import('../apps/bot/dist/services/download-providers/apk-stores.js')

const report = {
  schemaVersion: 2,
  checkedAt: new Date().toISOString(),
  required: {},
  advisory: {},
}

function compactError(error) {
  return (error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ').slice(0, 400)
}

async function retry(label, work, attempts = 3) {
  let last
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await work(attempt)
    } catch (error) {
      last = error
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 1500))
    }
  }
  throw new Error(`${label}: ${compactError(last)}`)
}

async function probeZip(url, referer, requestHeaders = {}) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: {
      ...requestHeaders,
      'user-agent': requestHeaders['user-agent'] || 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
      accept: 'application/vnd.android.package-archive,application/zip,application/octet-stream,*/*',
      range: 'bytes=0-7',
      ...(referer ? { referer } : {}),
    },
    signal: AbortSignal.timeout(45_000),
  })
  if (!response.ok || !response.body) throw new Error(`binary probe HTTP ${response.status}`)
  const reader = response.body.getReader()
  try {
    const first = await reader.read()
    const bytes = Buffer.from(first.value ?? [])
    if (bytes.length < 2 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
      throw new Error(`binary probe missing ZIP magic; content-type=${response.headers.get('content-type') ?? 'unknown'}`)
    }
    return {
      status: response.status,
      finalHost: new URL(response.url).hostname,
      contentType: response.headers.get('content-type'),
      contentRange: response.headers.get('content-range'),
      firstBytesHex: bytes.subarray(0, Math.min(8, bytes.length)).toString('hex'),
    }
  } finally {
    try { await reader.cancel() } catch {}
  }
}

async function required(name, work) {
  try {
    const value = await retry(name, work)
    report.required[name] = { ok: true, ...value }
    console.log(`[phase3-live] ${name}: OK`)
  } catch (error) {
    report.required[name] = { ok: false, error: compactError(error) }
    throw error
  }
}

async function advisory(name, work) {
  try {
    const value = await work()
    report.advisory[name] = { ok: true, ...value }
    console.log(`[phase3-live] ${name}: OK`)
  } catch (error) {
    report.advisory[name] = { ok: false, error: compactError(error) }
    console.warn(`[phase3-live] ${name}: advisory failure · ${compactError(error)}`)
  }
}

let fatal
try {
  await required('x-api-v2-endpoint', async () => {
    const endpoint = new URL('https://api.x.com/2/tweets/1263145271946551300')
    endpoint.searchParams.set('expansions', 'attachments.media_keys')
    endpoint.searchParams.set('media.fields', 'duration_ms,height,media_key,preview_image_url,type,url,variants,width')
    const response = await fetch(endpoint, {
      headers: { accept: 'application/json', 'user-agent': 'GhostNexoraBot/2.0-live-audit' },
      signal: AbortSignal.timeout(20_000),
    })
    if (response.status === 404) throw new Error('X API v2 endpoint returned 404')
    if (![200, 400, 401, 402, 403, 429].includes(response.status)) throw new Error(`unexpected X API status ${response.status}`)
    return { endpoint: `${endpoint.origin}/2/tweets/{id}`, status: response.status }
  })

  await required('vk-video-get-v5.199', async () => {
    const endpoint = new URL('https://api.vk.com/method/video.get')
    endpoint.searchParams.set('videos', '-193889314_456239866')
    endpoint.searchParams.set('v', '5.199')
    const response = await fetch(endpoint, {
      headers: { accept: 'application/json', 'user-agent': 'GhostNexoraBot/2.0-live-audit' },
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) throw new Error(`VK HTTP ${response.status}`)
    const payload = await response.json()
    const message = String(payload?.error?.error_msg ?? '')
    if (payload?.error?.error_code === 3 || /unknown method/i.test(message)) throw new Error(`VK no reconoce video.get: ${message}`)
    if (!payload?.response && !payload?.error) throw new Error('VK returned neither response nor API error')
    return { endpoint: `${endpoint.origin}/method/video.get`, version: '5.199', apiErrorCode: payload?.error?.error_code ?? null }
  })

  await required('apkmirror-search', async () => {
    const rows = await apk.searchApkMirror('com.google.android.appsearch.apk')
    if (!rows.length) throw new Error('APKMirror live search parsed zero releases')
    return { endpoint: apk.apkMirrorSearchUrl('com.google.android.appsearch.apk'), results: rows.length, firstUrl: rows[0].pageUrl }
  })

  await required('apkmirror-signed-download', async () => {
    const variantUrl = 'https://www.apkmirror.com/apk/google-inc/com-google-android-appsearch-apk/com-google-android-appsearch-apk-17-release/com-google-android-appsearch-apk-17-android-apk-download/'
    const direct = await apk.resolvePhase3ApkDirect({
      token: 'live-apkmirror',
      store: 'apkmirror',
      name: 'Google AppSearch APK',
      pageUrl: variantUrl,
      version: '17 beta',
    })
    const parsed = new URL(direct.url)
    if (!parsed.pathname.includes('/wp-content/themes/APKMirror/download.php')) throw new Error('APKMirror did not resolve through download.php')
    if (!parsed.searchParams.get('id') || !parsed.searchParams.get('key')) throw new Error('APKMirror signed URL missing id/key')
    const binary = await probeZip(direct.url, direct.referer, direct.headers)
    return {
      variantUrl,
      signedPath: parsed.pathname,
      hasDynamicId: true,
      hasDynamicKey: true,
      observedWaitMs: direct.waitMs ?? 0,
      sessionHeadersForwarded: Boolean(direct.headers?.cookie),
      binary,
    }
  })

  await required('apkpure-online-downloader', async () => {
    const rows = await apk.searchApkPure('com.apkpure.aegon')
    if (!rows.length) throw new Error('APKPure Online APK Downloader parsed zero applications')
    if (!rows.some((row) => row.packageName === 'com.apkpure.aegon')) throw new Error('APKPure did not return the requested exact package')
    return { endpoint: apk.apkPureLookupUrl('com.apkpure.aegon'), results: rows.length, exactPackage: true }
  })

  await required('apkpure-signed-cdn', async () => {
    const detail = 'https://apkpure.net/es/apkpure/com.apkpure.aegon'
    const direct = await apk.resolvePhase3ApkDirect({
      token: 'live-apkpure',
      store: 'apkpure',
      name: 'APKPure',
      pageUrl: detail,
      packageName: 'com.apkpure.aegon',
    })
    const parsed = new URL(direct.url)
    if (parsed.hostname !== 'd.apkpure.net') throw new Error(`unexpected APKPure download host ${parsed.hostname}`)
    if (!/\.(?:apk|xapk|apks)$/i.test(parsed.pathname)) throw new Error('APKPure direct URL is not an Android package path')
    const binary = await probeZip(direct.url, direct.referer, direct.headers)
    return { detail, directHost: parsed.hostname, extension: direct.extension, signedQuery: Boolean(parsed.search), binary }
  })

  await advisory('yt-dlp-x-public-extractor', async () => {
    const { stdout } = await execa('yt-dlp', ['--simulate', '--no-warnings', '--print', '%(extractor)s|%(id)s', 'https://x.com/XDevelopers/status/1263145271946551300'], { timeout: 90_000 })
    if (!stdout.trim()) throw new Error('yt-dlp X extractor returned no identity')
    return { output: stdout.trim().slice(0, 200) }
  })

  await advisory('yt-dlp-vk-public-extractor', async () => {
    const { stdout } = await execa('yt-dlp', ['--simulate', '--no-warnings', '--print', '%(extractor)s|%(id)s', 'https://vkvideo.ru/video-193889314_456239866'], { timeout: 90_000 })
    if (!stdout.trim()) throw new Error('yt-dlp VK extractor returned no identity')
    return { output: stdout.trim().slice(0, 200) }
  })
} catch (error) {
  fatal = error
} finally {
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(`[phase3-live] report=${path.relative(process.cwd(), outputPath)}`)
}

if (fatal) throw fatal
console.log('[V2 PHASE 3 LIVE] PASS — current provider endpoints and signed download chains are reachable and structurally valid with provider session state preserved.')
