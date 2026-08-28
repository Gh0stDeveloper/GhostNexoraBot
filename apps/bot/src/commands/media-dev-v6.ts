import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { BotCommand, CommandContext } from '../types.js'
import { sendCarousel } from '../services/interactive.js'
import { downloadMessageMedia } from '../utils/message.js'

const execFileAsync = promisify(execFile)

type LinkItem = { id: string; title: string; description: string; url: string }

const downloadSources: LinkItem[] = [
  { id: 'apktool', title: '🔧 Apktool', description: 'Herramienta para analizar y reconstruir APKs Android.', url: 'https://github.com/iBotPeaches/Apktool' },
  { id: 'happymod', title: '📦 HappyMod', description: 'Catálogo de aplicaciones Android de terceros. Comprueba siempre el origen y firma.', url: 'https://www.happymod.com/' },
  { id: 'liteapks', title: '📦 LiteAPKs', description: 'Catálogo alternativo de aplicaciones Android. Comprueba siempre el origen y firma.', url: 'https://liteapks.com/' },
  { id: 'uptodown', title: '📱 Uptodown', description: 'Distribución y consulta de aplicaciones Android.', url: 'https://uptodown.com/' },
  { id: 'mega', title: '☁️ MEGA', description: 'Servicio de almacenamiento y transferencia de archivos.', url: 'https://mega.io/' },
]

const streamingSources: LinkItem[] = [
  { id: 'anime', title: '🎌 Anime', description: 'Busca información de anime y enlaces de visualización disponibles.', url: 'https://www.google.com/search?q=anime' },
  { id: 'crunchyroll', title: '🧡 Crunchyroll', description: 'Streaming oficial de anime.', url: 'https://www.crunchyroll.com/' },
  { id: 'animex', title: '🎌 Animex', description: 'Abre el servicio indicado por el usuario.', url: 'https://www.google.com/search?q=Animex+anime' },
  { id: 'spotify', title: '🎵 Spotify', description: 'Servicio de música, podcasts y contenido de audio.', url: 'https://open.spotify.com/' },
  { id: 'xuperhydra', title: '🐉 XuperHydra', description: 'Abre una búsqueda del servicio indicado.', url: 'https://www.google.com/search?q=XuperHydra' },
]

function sourceCarousel(ctx: CommandContext, title: string, items: LinkItem[], query?: string) {
  return sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title,
    body: query ? `Consulta: ${query}` : 'Selecciona un servicio para abrirlo.',
    footer: 'Ghost Nexora Bot',
    cards: items.map((item) => ({
      title: item.title,
      body: item.description,
      buttons: [{ type: 'url' as const, text: '🌐 Abrir', url: item.url }],
    })),
  })
}

async function sourceCommand(ctx: CommandContext, items: LinkItem[], title: string) {
  const query = ctx.argText.trim()
  if (!query) {
    await sourceCarousel(ctx, title, items)
    return
  }
  const normalized = query.toLowerCase()
  const exact = items.find((item) => item.id === normalized || item.title.toLowerCase().includes(normalized))
  if (exact) {
    await ctx.socket.sendMessage(ctx.chatId, {
      text: `🌐 *${exact.title}*\n━━━━━━━━━━━━━━\n${exact.description}\n\n${exact.url}`,
    }, { quoted: ctx.message })
    return
  }
  const searchUrl = title.includes('STREAMING')
    ? `https://www.google.com/search?q=${encodeURIComponent(query + ' anime streaming')}`
    : `https://www.google.com/search?q=${encodeURIComponent(query + ' APK')}`
  await ctx.socket.sendMessage(ctx.chatId, {
    text: `🔎 *BÚSQUEDA*\n━━━━━━━━━━━━━━\n${query}\n\n${searchUrl}`,
  }, { quoted: ctx.message })
}

async function validateApkZip(ctx: CommandContext) {
  const media = await downloadMessageMedia(ctx.message)
  if (!media || media.kind !== 'document') throw new Error('Responde a un archivo ZIP de proyecto Android.')
  const max = 100 * 1024 * 1024
  if (media.buffer.length > max) throw new Error('El ZIP supera el límite seguro de 100 MB.')
  const temp = `/tmp/ghost-nexora-apk-${Date.now()}.zip`
  const { writeFile, unlink } = await import('node:fs/promises')
  await writeFile(temp, media.buffer)
  try {
    const { stdout } = await execFileAsync('unzip', ['-Z1', temp], { timeout: 10_000, maxBuffer: 2 * 1024 * 1024 })
    const entries = stdout.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)
    const suspicious = entries.filter((entry) => entry.startsWith('/') || entry.includes('..\\') || entry.includes('../'))
    if (suspicious.length) throw new Error('El ZIP contiene rutas inseguras y fue rechazado.')
    const hasGradle = entries.some((entry) => /(^|\/)build\.gradle(?:\.kts)?$/.test(entry))
    const hasSettings = entries.some((entry) => /(^|\/)settings\.gradle(?:\.kts)?$/.test(entry))
    const hasManifest = entries.some((entry) => /(^|\/)AndroidManifest\.xml$/.test(entry))
    if (!hasGradle || !hasSettings || !hasManifest) throw new Error('El ZIP no parece contener un proyecto Android/Gradle válido (faltan build.gradle, settings.gradle o AndroidManifest.xml).')
    await ctx.reply([
      '✅ *PROYECTO ANDROID VALIDADO*',
      '━━━━━━━━━━━━━━',
      `📦 Archivo: *${media.fileName ?? 'proyecto.zip'}*`,
      `📏 Tamaño: *${(media.buffer.length / 1024 / 1024).toFixed(1)} MB*`,
      '✅ Gradle detectado',
      '✅ settings.gradle detectado',
      '✅ AndroidManifest.xml detectado',
      '',
      'El archivo quedó validado, pero Ghost Nexora Bot no ejecuta código arbitrario del ZIP directamente sobre la VPS. La compilación debe realizarse en un runner aislado para proteger el servidor.',
    ].join('\n'))
  } finally {
    await unlink(temp).catch(() => undefined)
  }
}

async function devMenu(ctx: CommandContext) {
  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: '🛠️ GHOST NEXORA · DEVELOPER',
    body: 'Herramientas de desarrollo disponibles para el owner/staff.',
    footer: 'Compilación segura · análisis · herramientas',
    cards: [
      {
        title: '📦 Compilación APK',
        body: 'Valida un ZIP Android antes de enviarlo al compilador aislado.',
        buttons: [{ type: 'reply', text: '📦 Validar ZIP', id: `${ctx.prefix}apkbuild` }],
      },
      {
        title: '🔍 APK Info',
        body: 'Inspecciona el ZIP y detecta si parece un proyecto Android/Gradle.',
        buttons: [{ type: 'reply', text: '🔍 Revisar ZIP', id: `${ctx.prefix}apkbuild` }],
      },
      {
        title: '🧰 Herramientas APK',
        body: 'Consulta utilidades de análisis y desarrollo Android.',
        buttons: [{ type: 'url', text: '🔧 Apktool', url: 'https://github.com/iBotPeaches/Apktool' }],
      },
    ],
  })
}

export const mediaDevV6Commands: BotCommand[] = [
  { name: 'downloads', aliases: ['downloadsites', 'fuentesapk'], category: 'downloads', description: 'Muestra fuentes y servicios de descarga disponibles.', handler: (ctx) => sourceCommand(ctx, downloadSources, '📥 DOWNLOAD SOURCES') },
  { name: 'apktool', aliases: ['apktoolinfo'], category: 'downloads', description: 'Abre la página oficial de Apktool.', handler: (ctx) => sourceCommand(ctx, downloadSources.filter((x) => x.id === 'apktool'), '🔧 APKTOOL') },
  { name: 'happymod', aliases: ['happymods'], category: 'downloads', description: 'Abre HappyMod como fuente externa.', handler: (ctx) => sourceCommand(ctx, downloadSources.filter((x) => x.id === 'happymod'), '📦 HAPPYMOD') },
  { name: 'liteapks', aliases: ['liteapk'], category: 'downloads', description: 'Abre LiteAPKs como fuente externa.', handler: (ctx) => sourceCommand(ctx, downloadSources.filter((x) => x.id === 'liteapks'), '📦 LITEAPKS') },
  { name: 'uptodown', aliases: ['uptodownapk'], category: 'downloads', description: 'Abre Uptodown.', handler: (ctx) => sourceCommand(ctx, downloadSources.filter((x) => x.id === 'uptodown'), '📱 UPTODOWN') },
  { name: 'mega', aliases: ['megadl'], category: 'downloads', description: 'Abre MEGA o busca un enlace compartido.', async handler(ctx) { const url = ctx.args[0]; if (url && /^https?:\/\/[^\s]+$/i.test(url)) { await ctx.socket.sendMessage(ctx.chatId, { text: `☁️ *MEGA*\n${url}` }, { quoted: ctx.message }); return } await sourceCommand(ctx, downloadSources.filter((x) => x.id === 'mega'), '☁️ MEGA') } },
  { name: 'streaming', aliases: ['stream', 'veranime'], category: 'tools', description: 'Muestra servicios de streaming y accesos.', handler: (ctx) => sourceCommand(ctx, streamingSources, '▶️ STREAMING') },
  { name: 'crunchyroll', aliases: ['crunchy'], category: 'tools', description: 'Abre Crunchyroll.', handler: (ctx) => sourceCommand(ctx, streamingSources.filter((x) => x.id === 'crunchyroll'), '🧡 CRUNCHYROLL') },
  { name: 'animex', aliases: ['animexhd'], category: 'tools', description: 'Busca el servicio Animex.', handler: (ctx) => sourceCommand(ctx, streamingSources.filter((x) => x.id === 'animex'), '🎌 ANIMEX') },
  { name: 'spotify', aliases: ['sp'], category: 'tools', description: 'Abre Spotify y sus contenidos.', handler: (ctx) => sourceCommand(ctx, streamingSources.filter((x) => x.id === 'spotify'), '🎵 SPOTIFY') },
  { name: 'xuperhydra', aliases: ['xhydra'], category: 'tools', description: 'Busca XuperHydra.', handler: (ctx) => sourceCommand(ctx, streamingSources.filter((x) => x.id === 'xuperhydra'), '🐉 XUPERHYDRA') },
  { name: 'apkbuild', aliases: ['buildapk', 'compilarapk'], category: 'owner', ownerOnly: true, description: 'Valida un ZIP de proyecto Android sin ejecutar código arbitrario en la VPS.', usage: 'apkbuild <responde al ZIP>', handler: validateApkZip },
  { name: 'devmenu', aliases: ['developer', 'developermenu'], category: 'owner', ownerOnly: true, description: 'Abre las herramientas de desarrollador.', handler: devMenu },
]
