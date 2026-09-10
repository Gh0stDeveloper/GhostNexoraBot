import type { BotCommand, CommandContext } from '../types.js'
import { sendCarousel } from '../services/interactive.js'
import { createDownloadProgress } from '../services/progress.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'
import { downloadVkVideo } from '../services/download-providers/vk.js'
import {
  downloadPhase3Apk,
  searchApkMirror,
  searchApkPure,
  type Phase3ApkItem,
  type Phase3ApkStore,
} from '../services/download-providers/apk-stores.js'
import { withProviderLease } from '../services/download-providers/lease.js'
import { providerHealthSnapshot } from '../services/download-providers/runtime.js'

function isUrl(value: string) {
  try { return ['http:', 'https:'].includes(new URL(value).protocol) } catch { return false }
}

function humanBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

function storeLabel(store: Phase3ApkStore) {
  return store === 'apkmirror' ? 'APKMirror' : 'APKPure'
}

async function showStore(ctx: CommandContext, store: Phase3ApkStore) {
  const query = ctx.argText.trim()
  if (!query) throw new Error(`Uso: ${ctx.prefix}${store} <aplicación|package>`)
  const results = store === 'apkmirror' ? await searchApkMirror(query) : await searchApkPure(query)
  const command = store === 'apkmirror' ? 'apkmirrordl' : 'apkpuredl'

  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: `${storeLabel(store)} · resultados`,
    body: `Búsqueda: ${query.slice(0, 90)}\nFuente consultada directamente: ${storeLabel(store)}`,
    footer: 'Ghost Nexora Bot · V2 provider engine',
    cards: results.map((item: Phase3ApkItem) => ({
      title: item.name,
      body: [
        item.packageName ? `Package: ${item.packageName}` : undefined,
        item.version ? `Versión: ${item.version}` : undefined,
        item.sizeLabel ? `Tamaño: ${item.sizeLabel}` : undefined,
      ].filter(Boolean).join('\n') || 'Release disponible',
      footer: storeLabel(store),
      imageUrl: item.icon,
      buttons: [{ type: 'reply' as const, text: 'Descargar', id: `${ctx.prefix}${command} ${item.token}` }],
    })),
  })
}

async function downloadStore(ctx: CommandContext, store: Phase3ApkStore) {
  const token = ctx.args[0]?.trim()
  if (!token) throw new Error(`Selecciona primero una aplicación con ${ctx.prefix}${store} <búsqueda>.`)
  const progress = await createDownloadProgress(ctx, `${storeLabel(store)} · paquete Android`)
  await progress.update('downloading', store === 'apkmirror'
    ? 'Esperando turno y resolviendo la cadena firmada de APKMirror'
    : 'Resolviendo la cadena de descarga actual del proveedor')

  // APKMirror documenta bloqueos temporales ante descargas simultáneas desde la
  // misma IP. MainBot y subbots usan procesos separados, por lo que el lease se
  // coordina mediante almacenamiento global y cubre resolución + descarga.
  const result = store === 'apkmirror'
    ? await withProviderLease('apkmirror', () => downloadPhase3Apk(token))
    : await downloadPhase3Apk(token)

  if (result.store !== store) {
    await result.cleanup()
    throw new Error('El token pertenece a otra tienda.')
  }

  try {
    await progress.update('sending', `${result.packageKind} · ${humanBytes(result.size)} · enviando a WhatsApp`)
    await ctx.socket.sendMessage(ctx.chatId, {
      document: { url: result.filePath },
      mimetype: result.packageKind === 'APK' ? 'application/vnd.android.package-archive' : 'application/zip',
      fileName: result.fileName,
      caption: [
        `${storeLabel(store)} · ${result.item.name}`,
        result.item.packageName ? `Package: ${result.item.packageName}` : undefined,
        result.item.version ? `Versión: ${result.item.version}` : undefined,
        `Formato: ${result.packageKind}`,
        `Tamaño: ${humanBytes(result.size)}`,
      ].filter(Boolean).join('\n'),
    }, { quoted: ctx.message })
    recordSubbotDownload(ctx.instanceId, result.size)
    await progress.update('done', `${result.packageKind} enviado correctamente.`)
  } finally {
    await result.cleanup()
  }
}

async function vk(ctx: CommandContext) {
  const url = ctx.argText.trim()
  if (!isUrl(url)) throw new Error(`Uso: ${ctx.prefix}vk <url de vk.com|vkvideo.ru|live.vkvideo.ru>`)
  const progress = await createDownloadProgress(ctx, 'VK Video · video')
  await progress.update('downloading', 'Probando VK API 5.199 cuando hay token; fallback público con yt-dlp')
  const result = await downloadVkVideo(url)
  try {
    await progress.update('sending', `${humanBytes(result.size)} · ${result.provider}${result.quality ? ` · ${result.quality}p` : ''}`)
    await ctx.socket.sendMessage(ctx.chatId, {
      video: { url: result.filePath },
      mimetype: 'video/mp4',
      caption: `VK Video · ${result.quality ? `${result.quality}p · ` : ''}${humanBytes(result.size)}`,
    }, { quoted: ctx.message })
    recordSubbotDownload(ctx.instanceId, result.size)
    await progress.update('done', 'Video enviado correctamente.')
  } finally {
    await result.cleanup()
  }
}

async function providerHealth(ctx: CommandContext) {
  const rows = providerHealthSnapshot()
  if (!rows.length) {
    await ctx.reply('Aún no hay intentos de providers registrados desde el último inicio del proceso.')
    return
  }
  await ctx.reply([
    '*PROVIDER HEALTH · V2 PHASE 3*',
    ...rows.map((item) => [
      `${item.provider}: ${item.successes}/${item.attempts} OK · fallos ${item.failures}`,
      item.lastLatencyMs !== undefined ? `última latencia ${item.lastLatencyMs} ms` : undefined,
      item.lastError ? `último error: ${item.lastError}` : undefined,
    ].filter(Boolean).join(' · ')),
  ].join('\n'))
}

export const downloadProvidersV3Commands: BotCommand[] = [
  {
    name: 'vk',
    aliases: ['vkvideo', 'vkd'],
    category: 'downloads',
    description: 'Descarga videos públicos de VK/VK Video con API oficial opcional y fallback yt-dlp.',
    usage: 'vk <url>',
    handler: vk,
  },
  {
    name: 'apkmirror',
    aliases: ['apkm', 'amirror'],
    category: 'downloads',
    description: 'Busca releases directamente en APKMirror y resuelve su enlace firmado actual.',
    usage: 'apkmirror <aplicación>',
    handler: (ctx) => showStore(ctx, 'apkmirror'),
  },
  {
    name: 'apkmirrordl',
    aliases: ['amdl'],
    category: 'downloads',
    description: 'Descarga un resultado seleccionado de APKMirror siguiendo su cadena firmada.',
    handler: (ctx) => downloadStore(ctx, 'apkmirror'),
  },
  {
    name: 'apkpure',
    aliases: ['apkp', 'pureapk'],
    category: 'downloads',
    description: 'Busca aplicaciones mediante APKPure Online APK Downloader y usa el enlace firmado de la ficha.',
    usage: 'apkpure <aplicación|package>',
    handler: (ctx) => showStore(ctx, 'apkpure'),
  },
  {
    name: 'apkpuredl',
    aliases: ['apdl'],
    category: 'downloads',
    description: 'Descarga un resultado seleccionado de APKPure desde su CDN firmado actual.',
    handler: (ctx) => downloadStore(ctx, 'apkpure'),
  },
  {
    name: 'providerhealth',
    aliases: ['dlhealth'],
    category: 'owner',
    description: 'Muestra telemetría de intentos, fallos y latencia de los providers V2.',
    staffOnly: true,
    handler: providerHealth,
  },
]
