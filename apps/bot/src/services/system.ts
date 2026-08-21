import os from 'node:os'
import { statfs } from 'node:fs/promises'

const MIB = 1024 * 1024
const GIB = 1024 * MIB
const SPEED_ENDPOINT = 'https://speed.cloudflare.com'
const speedCooldown = new Map<string, number>()
let speedTestRunning = false

function bytes(value: number) {
  if (!Number.isFinite(value) || value < 0) return 'N/D'
  if (value >= GIB) return `${(value / GIB).toFixed(2)} GiB`
  return `${(value / MIB).toFixed(1)} MiB`
}

function duration(seconds: number) {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return [days ? `${days}d` : '', hours ? `${hours}h` : '', `${minutes}m`].filter(Boolean).join(' ')
}

export async function systemSnapshot() {
  const cpus = os.cpus()
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const disk = await statfs('/').catch(() => null)
  const diskTotal = disk ? disk.blocks * disk.bsize : 0
  const diskFree = disk ? disk.bavail * disk.bsize : 0
  const load = os.loadavg()

  return {
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    distro: process.platform,
    arch: os.arch(),
    cpu: cpus[0]?.model?.trim() || 'N/D',
    cores: cpus.length,
    load: load.map((value) => value.toFixed(2)).join(' / '),
    ramTotal: bytes(totalMem),
    ramUsed: bytes(totalMem - freeMem),
    ramPercent: totalMem ? ((totalMem - freeMem) / totalMem * 100).toFixed(1) : '0.0',
    diskTotal: bytes(diskTotal),
    diskUsed: bytes(Math.max(0, diskTotal - diskFree)),
    diskPercent: diskTotal ? ((diskTotal - diskFree) / diskTotal * 100).toFixed(1) : '0.0',
    uptime: duration(os.uptime()),
    node: process.version,
    processMemory: bytes(process.memoryUsage().rss),
  }
}

async function timedFetch(url: string, init?: RequestInit) {
  const start = performance.now()
  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(45_000),
    headers: {
      'cache-control': 'no-cache',
      'user-agent': 'GhostNexoraBot/1.1 speedtest',
      ...(init?.headers ?? {}),
    },
  })
  if (!response.ok) throw new Error(`Speed test HTTP ${response.status}.`)
  return { response, elapsedMs: performance.now() - start }
}

async function latencyMs() {
  const samples: number[] = []
  for (let index = 0; index < 4; index++) {
    const { response, elapsedMs } = await timedFetch(`${SPEED_ENDPOINT}/__down?bytes=0&r=${Date.now()}-${index}`)
    await response.arrayBuffer()
    samples.push(elapsedMs)
  }
  samples.sort((a, b) => a - b)
  return samples[Math.floor(samples.length / 2)] ?? 0
}

async function downloadMbps(bytesToRead = 25 * MIB) {
  const started = performance.now()
  const response = await fetch(`${SPEED_ENDPOINT}/__down?bytes=${bytesToRead}&r=${Date.now()}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(60_000),
    headers: { 'cache-control': 'no-cache', 'user-agent': 'GhostNexoraBot/1.1 speedtest' },
  })
  if (!response.ok || !response.body) throw new Error(`Prueba de descarga HTTP ${response.status}.`)
  const reader = response.body.getReader()
  let received = 0
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    received += chunk.value.byteLength
  }
  const seconds = Math.max(0.001, (performance.now() - started) / 1000)
  return { mbps: (received * 8) / seconds / 1_000_000, bytes: received, seconds }
}

async function uploadMbps(bytesToSend = 8 * MIB) {
  const body = Buffer.alloc(bytesToSend, 0x61)
  const started = performance.now()
  const response = await fetch(`${SPEED_ENDPOINT}/__up`, {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(60_000),
    headers: {
      'content-type': 'application/octet-stream',
      'cache-control': 'no-cache',
      'user-agent': 'GhostNexoraBot/1.1 speedtest',
    },
  })
  if (!response.ok) throw new Error(`Prueba de subida HTTP ${response.status}.`)
  await response.arrayBuffer()
  const seconds = Math.max(0.001, (performance.now() - started) / 1000)
  return { mbps: (bytesToSend * 8) / seconds / 1_000_000, bytes: bytesToSend, seconds }
}

export async function runSpeedTest(actor: string) {
  const now = Date.now()
  const remaining = Math.max(0, (speedCooldown.get(actor) ?? 0) - now)
  if (remaining > 0) throw new Error(`Espera ${Math.ceil(remaining / 1000)} s antes de ejecutar otra prueba.`)
  if (speedTestRunning) throw new Error('Ya hay una prueba de velocidad en curso. Intenta de nuevo en unos segundos.')

  speedTestRunning = true
  speedCooldown.set(actor, now + 2 * 60_000)
  try {
    const latency = await latencyMs()
    const download = await downloadMbps()
    const upload = await uploadMbps()
    return {
      provider: 'Cloudflare Speed Test',
      latencyMs: latency,
      downloadMbps: download.mbps,
      uploadMbps: upload.mbps,
      transferredBytes: download.bytes + upload.bytes,
    }
  } finally {
    speedTestRunning = false
  }
}
