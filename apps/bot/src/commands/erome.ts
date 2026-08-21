import type { BotCommand, CommandContext } from '../types.js'
import { config } from '../config.js'
import { settings } from '../core/settings.js'
import { economy } from '../services/economy.js'
import {
  downloadEromeVideo,
  eromeSessionStatus,
  exploreErome,
  getEromeAlbum,
  getEromeProfile,
  searchErome,
  searchEromeProfiles,
} from '../services/erome.js'
import { sendCarousel, sendInteractiveCard, type InteractiveButton } from '../services/interactive.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'
import { withTimeout } from '../utils/timeout.js'

function assertAdultAccess(ctx: CommandContext) {
  if (!settings.adultEnabled) throw new Error(`El módulo 18+ está desactivado globalmente. El owner puede habilitarlo con ${ctx.prefix}adultmode on.`)
  if (ctx.isGroup && !economy.getGroupPolicy(ctx.chatId).adultAllowed) throw new Error('Este grupo no está autorizado para el módulo 18+.')
  if (!ctx.isGroup && !config.adultPrivateEnabled) throw new Error('El módulo 18+ está desactivado en chats privados.')
  if (!economy.hasEntitlement(ctx.sender, 'adult_consent')) throw new Error(`Antes debes confirmar que eres mayor de edad con ${ctx.prefix}adult18 accept.`)
}

function safePage(value?: string) {
  const page = Number(value ?? 1)
  return Number.isInteger(page) && page > 0 ? Math.min(500, page) : 1
}

function encodeQuery(value: string) { return Buffer.from(value, 'utf8').toString('base64url') }
function decodeQuery(value: string) {
  try { return Buffer.from(value, 'base64url').toString('utf8') } catch { throw new Error('La búsqueda paginada ya no es válida.') }
}

function albumId(input: string) {
  const raw = input.trim()
  if (/^[A-Za-z0-9_-]{5,30}$/.test(raw)) return raw
  try {
    const url = new URL(raw)
    const match = /^\/a\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname)
    if (match && (url.hostname === 'erome.com' || url.hostname === 'www.erome.com')) return match[1]!
  } catch { /* handled below */ }
  throw new Error('Indica un ID o enlace de álbum Erome válido.')
}

async function listingUi(ctx: CommandContext, mode: 'hot' | 'new' | 'search', page: number, query: string | undefined, albums: Awaited<ReturnType<typeof exploreErome>>['albums']) {
  try {
    await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
      title: `🔞 EROME · ${mode === 'search' ? 'BÚSQUEDA' : mode.toUpperCase()}`,
      body: mode === 'search' ? `Resultados para: ${query}\nPágina: ${page}` : `Explorar ${mode === 'hot' ? 'HOT' : 'NEW'} · página ${page}`,
      footer: 'Erome · Ghost Nexora Bot',
      cards: albums.map((album, index) => ({
        title: `#${index + 1} · ${album.title}`.slice(0, 120),
        body: album.author ? `Autor: ${album.author}` : `Álbum: ${album.id}`,
        imageUrl: album.thumbnail,
        buttons: [
          { type: 'reply', text: '🎬 Ver videos', id: `${ctx.prefix}erome album ${album.id} 1` },
          { type: 'url', text: '🌐 Abrir álbum', url: album.url },
        ],
      })),
    })

    const buttons: InteractiveButton[] = []
    if (page > 1) {
      buttons.push({
        type: 'reply', text: '◀️ Anterior',
        id: mode === 'search' ? `${ctx.prefix}erome search64 ${page - 1} ${encodeQuery(query ?? '')}` : `${ctx.prefix}erome ${mode} ${page - 1}`,
      })
    }
    buttons.push({
      type: 'reply', text: 'Siguiente ▶️',
      id: mode === 'search' ? `${ctx.prefix}erome search64 ${page + 1} ${encodeQuery(query ?? '')}` : `${ctx.prefix}erome ${mode} ${page + 1}`,
    })
    if (mode !== 'search') buttons.push({ type: 'reply', text: mode === 'hot' ? '🆕 NEW' : '🔥 HOT', id: `${ctx.prefix}erome ${mode === 'hot' ? 'new' : 'hot'} 1` })

    await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
      title: '🔞 EROME · NAVEGACIÓN',
      body: `Página actual: *${page}*`,
      footer: 'Erome',
      buttons,
    })
  } catch {
    // La navegación textual ya fue enviada.
  }
}

async function showListing(ctx: CommandContext, mode: 'hot' | 'new' | 'search', page: number, query?: string) {
  const result = mode === 'search'
    ? await searchErome(query ?? '', page, 10)
    : await exploreErome(mode, page, 10)
  const albums = result.albums
  if (!albums.length) throw new Error('Erome no devolvió álbumes en esta página.')

  const lines = albums.map((album, index) => [
    `*${index + 1}. ${album.title}*`,
    album.author ? `Autor: ${album.author}` : '',
    `ID: \`${album.id}\``,
    `Ver videos: *${ctx.prefix}erome album ${album.id}*`,
  ].filter(Boolean).join('\n'))

  const previous = page > 1
    ? mode === 'search'
      ? `${ctx.prefix}erome search64 ${page - 1} ${encodeQuery(query ?? '')}`
      : `${ctx.prefix}erome ${mode} ${page - 1}`
    : null
  const next = mode === 'search'
    ? `${ctx.prefix}erome search64 ${page + 1} ${encodeQuery(query ?? '')}`
    : `${ctx.prefix}erome ${mode} ${page + 1}`

  await ctx.reply([
    `╭━━〔 🔞 *EROME · ${mode === 'search' ? 'BÚSQUEDA' : mode.toUpperCase()}* 〕━━╮`,
    mode === 'search' ? `┃ Consulta » *${query}*` : `┃ Sección » *${mode.toUpperCase()}*`,
    `┃ Página » *${page}*`,
    `┃ Álbumes » *${albums.length}*`,
    '╰━━━━━━━━━━━━━━━━━━╯',
    '',
    ...lines.flatMap((line) => [line, '']),
    '━━━━━━━━━━━━━━━━━━',
    previous ? `Anterior: *${previous}*` : '',
    `Siguiente: *${next}*`,
    `Buscar: *${ctx.prefix}erome search <texto>*`,
  ].filter(Boolean).join('\n'))

  await listingUi(ctx, mode, page, query, albums)
}

async function profileSearchUi(ctx: CommandContext, page: number, query: string, profiles: Awaited<ReturnType<typeof searchEromeProfiles>>['profiles']) {
  if (!profiles.length) return
  try {
    await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
      title: '🔞 EROME · PERFILES',
      body: `Perfiles para: ${query} · página ${page}`,
      footer: 'Erome · Ghost Nexora Bot',
      cards: profiles.map((profile, index) => ({
        title: `#${index + 1} · ${profile.username}`,
        body: profile.url,
        imageUrl: profile.avatar,
        buttons: [
          { type: 'reply', text: '👤 Ver perfil', id: `${ctx.prefix}erome profile ${profile.url} 1` },
          { type: 'url', text: '🌐 Abrir', url: profile.url },
        ],
      })),
    })

    const buttons: InteractiveButton[] = []
    if (page > 1) buttons.push({ type: 'reply', text: '◀️ Anterior', id: `${ctx.prefix}erome profiles64 ${page - 1} ${encodeQuery(query)}` })
    buttons.push({ type: 'reply', text: 'Siguiente ▶️', id: `${ctx.prefix}erome profiles64 ${page + 1} ${encodeQuery(query)}` })
    await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
      title: '🔞 EROME · PERFILES',
      body: `Página ${page}`,
      footer: 'Erome',
      buttons,
    })
  } catch {
    // La lista textual permanece disponible.
  }
}

async function showProfileSearch(ctx: CommandContext, query: string, page: number) {
  const result = await searchEromeProfiles(query, page, 5)
  if (!result.profiles.length) throw new Error('No encontré perfiles de Erome para esa búsqueda.')
  const lines = result.profiles.map((profile, index) => [
    `*${index + 1}. ${profile.username}*`,
    profile.url,
    `Ver perfil: *${ctx.prefix}erome profile ${profile.url}*`,
  ].join('\n'))
  await ctx.reply([
    '╭━━〔 🔞 *EROME · PERFILES* 〕━━╮',
    `┃ Consulta » *${result.query}*`,
    `┃ Página » *${page}*`,
    `┃ Resultados » *${result.profiles.length}*`,
    '╰━━━━━━━━━━━━━━━━━━╯',
    '',
    ...lines.flatMap((line) => [line, '']),
    page > 1 ? `Anterior: *${ctx.prefix}erome profiles64 ${page - 1} ${encodeQuery(result.query)}*` : '',
    `Siguiente: *${ctx.prefix}erome profiles64 ${page + 1} ${encodeQuery(result.query)}*`,
  ].filter(Boolean).join('\n'))
  await profileSearchUi(ctx, page, result.query, result.profiles)
}

async function profileUi(ctx: CommandContext, profile: Awaited<ReturnType<typeof getEromeProfile>>) {
  try {
    if (profile.albums.length) {
      await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
        title: `🔞 ${profile.username}`,
        body: `Álbumes · lote ${profile.batch}`,
        footer: 'Erome · Ghost Nexora Bot',
        cards: profile.albums.map((album, index) => ({
          title: `#${index + 1} · ${album.title}`.slice(0, 120),
          body: `Álbum: ${album.id}`,
          imageUrl: album.thumbnail,
          buttons: [
            { type: 'reply', text: '🎬 Ver videos', id: `${ctx.prefix}erome album ${album.id} 1` },
            { type: 'url', text: '🌐 Abrir álbum', url: album.url },
          ],
        })),
      })
    }

    const buttons: InteractiveButton[] = []
    if (profile.batch > 1) buttons.push({ type: 'reply', text: '◀️ Anterior', id: `${ctx.prefix}erome profile64 ${profile.batch - 1} ${encodeQuery(profile.url)}` })
    if (profile.hasNext) buttons.push({ type: 'reply', text: 'Siguiente ▶️', id: `${ctx.prefix}erome profile64 ${profile.batch + 1} ${encodeQuery(profile.url)}` })
    buttons.push({ type: 'url', text: '🌐 Abrir perfil', url: profile.url })
    await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
      title: `👤 ${profile.username}`,
      body: `Álbumes visibles: ${profile.albums.length} · lote ${profile.batch}`,
      footer: 'Erome',
      imageUrl: profile.avatar,
      buttons,
    })
  } catch {
    // La navegación textual ya fue enviada.
  }
}

async function showProfile(ctx: CommandContext, input: string, batch: number) {
  const profile = await getEromeProfile(input, batch, 10)
  const albumLines = profile.albums.map((album, index) => [
    `*${index + 1}. ${album.title}*`,
    `ID: \`${album.id}\``,
    `Abrir: ${album.url}`,
    `Ver videos: *${ctx.prefix}erome album ${album.id}*`,
  ].join('\n'))

  await ctx.reply([
    '╭━━〔 🔞 *EROME · PERFIL* 〕━━╮',
    `┃ Usuario » *${profile.username}*`,
    `┃ Lote » *${profile.batch}*`,
    `┃ Álbumes » *${profile.albums.length}*`,
    '╰━━━━━━━━━━━━━━━━━━╯',
    profile.url,
    '',
    ...albumLines.flatMap((line) => [line, '']),
    profile.batch > 1 ? `Anterior: *${ctx.prefix}erome profile64 ${profile.batch - 1} ${encodeQuery(profile.url)}*` : '',
    profile.hasNext ? `Siguiente: *${ctx.prefix}erome profile64 ${profile.batch + 1} ${encodeQuery(profile.url)}*` : '',
  ].filter(Boolean).join('\n'))

  await profileUi(ctx, profile)
}

async function albumUi(ctx: CommandContext, album: Awaited<ReturnType<typeof getEromeAlbum>>, page: number, totalPages: number, items: Awaited<ReturnType<typeof getEromeAlbum>>['videos']) {
  try {
    await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
      title: `🔞 ${album.title}`,
      body: `Videos: ${album.videos.length} · página ${page}/${totalPages}`,
      footer: album.author ? `Erome · ${album.author}` : 'Erome · Ghost Nexora Bot',
      cards: items.map((video) => ({
        title: `Video #${video.index}`,
        body: video.title,
        imageUrl: video.poster,
        buttons: [
          { type: 'reply', text: '⬇️ Descargar', id: `${ctx.prefix}erome dl ${album.id} ${video.index}` },
          { type: 'url', text: '🌐 Abrir álbum', url: album.url },
        ],
      })),
    })

    if (totalPages > 1) {
      const buttons: InteractiveButton[] = []
      if (page > 1) buttons.push({ type: 'reply', text: '◀️ Anterior', id: `${ctx.prefix}erome album ${album.id} ${page - 1}` })
      if (page < totalPages) buttons.push({ type: 'reply', text: 'Siguiente ▶️', id: `${ctx.prefix}erome album ${album.id} ${page + 1}` })
      await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
        title: '🎬 EROME · VIDEOS',
        body: `Página ${page}/${totalPages}`,
        footer: 'Erome',
        buttons,
      })
    }
  } catch {
    // La navegación textual ya fue enviada.
  }
}

async function showAlbum(ctx: CommandContext, input: string, page: number) {
  const id = albumId(input)
  const album = await getEromeAlbum(input)
  if (!album.videos.length) throw new Error('Ese álbum no contiene videos descargables.')
  const pageSize = 10
  const totalPages = Math.max(1, Math.ceil(album.videos.length / pageSize))
  const safe = Math.max(1, Math.min(totalPages, page))
  const items = album.videos.slice((safe - 1) * pageSize, safe * pageSize)

  const videoLines = items.map((video) => [
    `*Video #${video.index}*${video.title ? ` · ${video.title}` : ''}`,
    `Descargar: *${ctx.prefix}erome dl ${id} ${video.index}*`,
  ].join('\n'))

  await ctx.reply([
    '╭━━〔 🔞 *EROME · ÁLBUM* 〕━━╮',
    `┃ ${album.title}`,
    album.author ? `┃ Autor » ${album.author}` : '',
    `┃ Videos » *${album.videos.length}*`,
    `┃ Página » *${safe}/${totalPages}*`,
    '╰━━━━━━━━━━━━━━━━━━╯',
    album.authorUrl ? `Perfil: ${album.authorUrl}` : '',
    `Álbum: ${album.url}`,
    '',
    ...videoLines.flatMap((line) => [line, '']),
    totalPages > 1 && safe > 1 ? `Anterior: *${ctx.prefix}erome album ${id} ${safe - 1}*` : '',
    totalPages > 1 && safe < totalPages ? `Siguiente: *${ctx.prefix}erome album ${id} ${safe + 1}*` : '',
  ].filter(Boolean).join('\n'))

  await albumUi(ctx, album, safe, totalPages, items)
}

export const eromeCommands: BotCommand[] = [
  {
    name: 'erome', aliases: ['er'], category: 'adult',
    description: 'Explora, busca perfiles/álbumes y descarga únicamente videos públicos de Erome.',
    usage: 'erome [hot|new|search|profiles|profile|album|dl|status] ...',
    async handler(ctx) {
      assertAdultAccess(ctx)
      const action = (ctx.args[0] ?? 'hot').toLowerCase()

      if (action === 'status' || action === 'session') {
        const status = await eromeSessionStatus()
        await ctx.reply([
          '╭━━〔 🔞 *EROME · SESIÓN* 〕━━╮',
          `┃ Modo » *${status.mode === 'cookie-session' ? 'COOKIE PERSISTENTE' : 'ANÓNIMO'}*`,
          `┃ Cookie en .env » *${status.envCookieConfigured ? 'CONFIGURADA' : 'NO'}*`,
          `┃ Cookies persistidas » *${status.storedCookies}*`,
          '╰━━━━━━━━━━━━━━━━╯',
        ].join('\n'))
        return
      }

      if (action === 'hot' || action === 'explore') {
        await showListing(ctx, 'hot', safePage(ctx.args[1]))
        return
      }
      if (action === 'new') {
        await showListing(ctx, 'new', safePage(ctx.args[1]))
        return
      }
      if (action === 'search') {
        const query = ctx.args.slice(1).join(' ').trim()
        if (!query) throw new Error(`Uso: ${ctx.prefix}erome search <texto>`)
        await showListing(ctx, 'search', 1, query)
        return
      }
      if (action === 'search64') {
        const page = safePage(ctx.args[1])
        const query = decodeQuery(ctx.args[2] ?? '')
        await showListing(ctx, 'search', page, query)
        return
      }
      if (['profiles', 'users', 'usersearch', 'profilesearch'].includes(action)) {
        const query = ctx.args.slice(1).join(' ').trim()
        if (!query) throw new Error(`Uso: ${ctx.prefix}erome profiles <usuario>`)
        await showProfileSearch(ctx, query, 1)
        return
      }
      if (action === 'profiles64') {
        const page = safePage(ctx.args[1])
        const query = decodeQuery(ctx.args[2] ?? '')
        await showProfileSearch(ctx, query, page)
        return
      }
      if (action === 'profile' || action === 'user') {
        const input = ctx.args[1]
        if (!input) throw new Error(`Uso: ${ctx.prefix}erome profile <usuario|url> [lote]`)
        await showProfile(ctx, input, safePage(ctx.args[2]))
        return
      }
      if (action === 'profile64') {
        const batch = safePage(ctx.args[1])
        const input = decodeQuery(ctx.args[2] ?? '')
        await showProfile(ctx, input, batch)
        return
      }
      if (action === 'album') {
        const input = ctx.args[1]
        if (!input) throw new Error(`Uso: ${ctx.prefix}erome album <id|url> [página]`)
        await showAlbum(ctx, input, safePage(ctx.args[2]))
        return
      }
      if (action === 'dl' || action === 'download') {
        const albumInput = ctx.args[1]
        const index = Number(ctx.args[2])
        if (!albumInput || !Number.isInteger(index)) throw new Error(`Uso: ${ctx.prefix}erome dl <album-id|url> <video>`)
        const id = albumId(albumInput)

        const previewAlbum = await getEromeAlbum(albumInput)
        const previewVideo = previewAlbum.videos[index - 1]
        if (!previewVideo) throw new Error(`Elige un video entre 1 y ${previewAlbum.videos.length}.`)
        const preparing = `⬇️ *EROME · PREPARANDO*\n${previewAlbum.title}\nVideo #${index}`
        if (previewVideo.poster) {
          const sent = await withTimeout(
            ctx.socket.sendMessage(ctx.chatId, {
              image: { url: previewVideo.poster },
              caption: preparing,
            }, { quoted: ctx.message }),
            10_000,
            'erome preview send',
          ).catch(() => null)
          if (!sent) await ctx.reply(preparing)
        } else {
          await ctx.reply(preparing)
        }

        const result = await downloadEromeVideo(albumInput, index)
        try {
          const caption = `🔞 *EROME · VIDEO ${result.video.index}*\n${result.album.title}\n📦 ${(result.size / 1024 / 1024).toFixed(1)} MB`
          const sent = await ctx.socket.sendMessage(ctx.chatId, {
            video: { url: result.filePath },
            mimetype: 'video/mp4',
            caption,
          }, { quoted: ctx.message }).catch(() => null)
          if (!sent) {
            await ctx.socket.sendMessage(ctx.chatId, {
              document: { url: result.filePath },
              fileName: `erome-${id}-${index}.mp4`,
              mimetype: 'video/mp4',
              caption,
            }, { quoted: ctx.message })
          }
          recordSubbotDownload(ctx.instanceId, result.size)
        } finally {
          await result.cleanup()
        }
        return
      }

      const rawInput = ctx.argText.trim()
      if (/^https?:\/\//i.test(rawInput)) {
        try {
          albumId(rawInput)
          await showAlbum(ctx, rawInput, 1)
        } catch {
          await showProfile(ctx, rawInput, 1)
        }
        return
      }

      if (!rawInput) {
        await showListing(ctx, 'hot', 1)
        return
      }
      await showListing(ctx, 'search', 1, rawInput)
    },
  },
]
