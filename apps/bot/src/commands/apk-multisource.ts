import type { BotCommand, CommandContext } from '../types.js'
import { sendCarousel } from '../services/interactive.js'
import { downloadAndroidApk, getAndroidApk, searchAndroidApks, type UnifiedApkItem } from '../services/apk-sources.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'

function requireQuery(ctx: CommandContext) {
  const query = ctx.argText.trim()
  if (query.length < 2) throw new Error(`Uso: ${ctx.prefix}apk <nombre de aplicación>`)
  return query
}

function compact(value?: number) {
  return value === undefined ? undefined : new Intl.NumberFormat('es-MX', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function bytes(value?: number) {
  if (!value || value <= 0) return undefined
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`
  return `${(value / 1024 ** 2).toFixed(1)} MB`
}

function trustLabel(item: UnifiedApkItem) {
  if (item.source === 'Aptoide') {
    if (item.trusted) return '✅ Aptoide: TRUSTED'
    return `⚠️ Aptoide: ${item.malwareRank || 'sin verificación TRUSTED'}`
  }
  return '⚠️ Fuente externa · APK no verificada por Nexora'
}

function sourceEmoji(source: UnifiedApkItem['source']) {
  if (source === 'Aptoide') return '🟠'
  if (source === 'APK.Tools') return '🧰'
  return '♾️'
}

function itemBody(item: UnifiedApkItem) {
  return [
    `${sourceEmoji(item.source)} Fuente » ${item.source}`,
    item.packageName ? `📦 Package » ${item.packageName}` : '',
    item.version ? `🔄 Versión » ${item.version}` : '',
    bytes(item.size) || item.sizeLabel ? `📏 Peso » ${bytes(item.size) || item.sizeLabel}` : '',
    item.developer ? `👨‍💻 Developer » ${item.developer}` : '',
    item.rating !== undefined ? `⭐ Rating » ${item.rating.toFixed(1)}` : '',
    item.downloads !== undefined ? `⬇️ Descargas » ${compact(item.downloads)}` : '',
    trustLabel(item),
    item.summary ? `\n${item.summary.slice(0, 220)}${item.summary.length > 220 ? '…' : ''}` : '',
  ].filter(Boolean).join('\n')
}

async function showApkResults(ctx: CommandContext, query: string) {
  await ctx.reply(`🔎 *APK · BUSCANDO*\n━━━━━━━━━━━━━━\nConsultando Aptoide, APK.Tools y AndroForever para *${query}*...`)
  const results = await searchAndroidApks(query, 12)
  if (!results.length) throw new Error('No encontré APKs para esa búsqueda en las fuentes disponibles.')
  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: '🤖 ANDROID · APKs',
    body: `Resultados para: ${query}\nAptoide · APK.Tools · AndroForever`,
    footer: 'Verifica siempre el origen antes de instalar APKs externas.',
    cards: results.map((item, index) => ({
      title: `#${index + 1} · ${item.name}`.slice(0, 120),
      body: itemBody(item),
      imageUrl: item.graphic || item.icon,
      footer: `Ghost Nexora Bot · ${item.source}`,
      buttons: [
        { type: 'reply', text: '⬇️ Descargar APK', id: `${ctx.prefix}apkdl ${item.token}` },
        { type: 'reply', text: 'ℹ️ Detalles', id: `${ctx.prefix}apkinfo ${item.token}` },
        ...(item.pageUrl ? [{ type: 'url' as const, text: '🌐 Fuente', url: item.pageUrl }] : []),
      ].slice(0, 3),
    })),
  })
}

export const apkMultisourceCommands: BotCommand[] = [
  {
    name: 'apk', aliases: ['apks', 'androidapp', 'androidapk', 'aptoide', 'apktool', 'apktools', 'androforever', 'androidforever'], category: 'downloads',
    description: 'Busca APKs en Aptoide, APK.Tools y AndroForever mediante carrusel.', usage: 'apk <aplicación>',
    async handler(ctx) { await showApkResults(ctx, requireQuery(ctx)) },
  },
  {
    name: 'apkinfo', aliases: ['appinfo'], category: 'downloads', description: 'Muestra detalles de un resultado APK.', usage: 'apkinfo <token>',
    async handler(ctx) {
      const token = ctx.args[0]
      if (!token) throw new Error(`Usa primero ${ctx.prefix}apk <aplicación>.`)
      const item = getAndroidApk(token)
      await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
        title: '🤖 APK · DETALLES',
        body: item.name,
        footer: 'Ghost Nexora Bot',
        cards: [{
          title: item.name,
          body: itemBody(item),
          imageUrl: item.graphic || item.icon,
          buttons: [
            { type: 'reply', text: '⬇️ Descargar APK', id: `${ctx.prefix}apkdl ${item.token}` },
            ...(item.pageUrl ? [{ type: 'url' as const, text: '🌐 Abrir fuente', url: item.pageUrl }] : []),
          ],
        }],
      })
    },
  },
  {
    name: 'apkdl', aliases: ['appdl'], category: 'downloads', description: 'Descarga un resultado APK seleccionado.', usage: 'apkdl <token>',
    async handler(ctx) {
      const token = ctx.args[0]
      if (!token) throw new Error(`Usa primero ${ctx.prefix}apk <aplicación>.`)
      const selected = getAndroidApk(token)
      await ctx.reply([
        '🤖 *DESCARGA INICIADA*',
        '━━━━━━━━━━━━━━',
        `📱 ${selected.name}`,
        `🌐 Fuente » ${selected.source}`,
        '⏳ Resolviendo enlace y validando el archivo APK...',
        selected.source === 'Aptoide' ? '' : '⚠️ Fuente externa: revisa permisos y procedencia antes de instalar.',
      ].filter(Boolean).join('\n'))

      const result = await downloadAndroidApk(token)
      try {
        const critical = /(?:critical|malware|virus|infected)/i.test(result.malwareRank ?? '')
        if (critical) throw new Error(`Aptoide marcó esta APK como ${result.malwareRank}; no se enviará.`)
        await ctx.socket.sendMessage(ctx.chatId, {
          document: { url: result.filePath },
          mimetype: 'application/vnd.android.package-archive',
          fileName: result.fileName,
          caption: [
            `🤖 *${result.name}*`,
            `🌐 Fuente » ${result.source}`,
            result.version ? `🔄 Versión » ${result.version}` : '',
            `📏 Peso » ${bytes(result.size)}`,
            trustLabel(result),
            '',
            '👻 Ghost Nexora Bot',
          ].filter(Boolean).join('\n'),
        }, { quoted: ctx.message })
        recordSubbotDownload(ctx.instanceId, result.size)
      } finally {
        await result.cleanup()
      }
    },
  },
]
