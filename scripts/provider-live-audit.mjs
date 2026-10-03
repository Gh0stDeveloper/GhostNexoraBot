#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { execa } from 'execa'

const outputArg = process.argv.find((arg) => arg.startsWith('--output='))
const outputPath = path.resolve(outputArg ? outputArg.slice('--output='.length) : 'artifacts/v2-phase3-live-provider-audit.json')
const apk = await import('../apps/bot/dist/services/download-providers/apk-stores.js')

const report = {
  schemaVersion: 4,
  checkedAt: new Date().toISOString(),
  required: {},
  advisory: {},
}
const requiredFailures = []

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

function allowedHost(host, patterns) {
  const normalized = host.toLowerCase()
  return patterns.some((pattern) => pattern.test(normalized))
}

async function probeZip(url, referer, requestHeaders = {}, allowedHosts = []) {
  let current = new URL(url)
  if (!allowedHost(current.hostname, allowedHosts)) throw new Error(`binary probe blocked host ${current.hostname}`)
  let previous = referer
  const initialHost = current.hostname.toLowerCase()

  for (let redirectCount = 0; redirectCount <= 8; redirectCount += 1) {
    const headers = { ...requestHeaders }
    if (current.hostname.toLowerCase() !== initialHost) delete headers.cookie
    const response = await fetch(current, {
      redirect: 'manual',
      headers: {
        ...headers,
        'user-agent': headers['user-agent'] || 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
        accept: 'application/vnd.android.package-archive,application/zip,application/octet-stream,*/*',
        range: 'bytes=0-7',
        ...(previous ? { referer: previous } : {}),
      },
      signal: AbortSignal.timeout(45_000),
    })

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location) throw new Error(`binary probe HTTP ${response.status} without Location`)
      if (redirectCount >= 8) throw new Error('binary probe exceeded 8 redirects')
      const next = new URL(location, current)
      if (!['http:', 'https:'].includes(next.protocol)) throw new Error(`binary probe blocked protocol ${next.protocol}`)
      if (!allowedHost(next.hostname, allowedHosts)) throw new Error(`binary probe blocked redirect host ${next.hostname}`)
      try { await response.body?.cancel() } catch {}
      previous = current.toString()
      current = next
      continue
    }

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
        finalHost: current.hostname,
        redirects: redirectCount,
        contentType: response.headers.get('content-type'),
        contentRange: response.headers.get('content-range'),
        firstBytesHex: bytes.subarray(0, Math.min(8, bytes.length)).toString('hex'),
      }
    } finally {
      try { await reader.cancel() } catch {}
    }
  }

  throw new Error('binary probe exceeded redirect limit')
}

async function required(name, work) {
  try {
    const value = await retry(name, work)
    report.required[name] = { ok: true, ...value }
    console.log(`[phase3-live] ${name}: OK`)
    return value
  } catch (error) {
    const message = compactError(error)
    const externalBlock = /HTTP 403.*(?:anti-bot|cloudflare)|protecci[oó]n anti-bot/i.test(message)
    report.required[name] = { ok: false, externalBlock, error: message }
    requiredFailures.push(`${name}: ${message}`)
    console.error(`[phase3-live] ${name}: FAIL · ${message}`)
    return undefined
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

let liveMirrorRows = []

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
  liveMirrorRows = await apk.searchApkMirror('Google Chrome')
  if (!liveMirrorRows.length) throw new Error('APKMirror live search parsed zero current releases')
  return {
    endpoint: apk.apkMirrorSearchUrl('Google Chrome'),
    results: liveMirrorRows.length,
    firstUrl: liveMirrorRows[0].pageUrl,
    fixtureMode: 'live-search-result',
  }
})

await required('apkmirror-signed-download', async () => {
  if (!liveMirrorRows.length) liveMirrorRows = await apk.searchApkMirror('Google Chrome')
  let lastError
  for (const candidate of liveMirrorRows.slice(0, 2)) {
    try {
      const direct = await apk.resolvePhase3ApkDirect({
        ...candidate,
        token: 'live-apkmirror',
        store: 'apkmirror',
      })
      const parsed = new URL(direct.url)
      if (!parsed.pathname.includes('/wp-content/themes/APKMirror/download.php')) throw new Error('APKMirror did not resolve through download.php')
      if (!parsed.searchParams.get('id') || !parsed.searchParams.get('key')) throw new Error('APKMirror signed URL missing id/key')
      const binary = await probeZip(direct.url, direct.referer, direct.headers, [/(^|\.)apkmirror\.com$/i])
      return {
        releaseUrl: candidate.pageUrl,
        signedPath: parsed.pathname,
        hasDynamicId: true,
        hasDynamicKey: true,
        observedWaitMs: direct.waitMs ?? 0,
        sessionHeadersForwarded: Boolean(direct.headers?.cookie),
        binary,
      }
    } catch (error) {
      lastError = error
    }
  }
  throw lastError ?? new Error('APKMirror live search did not expose a resolvable APK release')
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
  if (!/^d\.apkpure\.(?:net|com)$/i.test(parsed.hostname)) throw new Error(`unexpected APKPure download host ${parsed.hostname}`)
  if (!/\.(?:apk|xapk|apks)$/i.test(parsed.pathname)) throw new Error('APKPure direct URL is not an Android package path')
  const binary = await probeZip(direct.url, direct.referer, direct.headers, [
    /^d\.apkpure\.(?:net|com)$/i,
    /(^|\.)apkpure\.(?:net|com)$/i,
    /^(?:data|dl|d-\d{1,3})\.winudf\.com$/i,
  ])
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

report.summary = {
  requiredTotal: Object.keys(report.required).length,
  requiredPassed: Object.values(report.required).filter((item) => item.ok).length,
  requiredFailed: requiredFailures.length,
  externalBlocks: Object.values(report.required).filter((item) => item.externalBlock).length,
}

await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(`[phase3-live] report=${path.relative(process.cwd(), outputPath)}`)

if (requiredFailures.length) {
  throw new Error(`[V2 PHASE 3 LIVE] ${requiredFailures.length} required check(s) failed: ${requiredFailures.join(' | ')}`)
}
console.log('[V2 PHASE 3 LIVE] PASS — all current provider endpoints and signed download chains are reachable and structurally valid.')
