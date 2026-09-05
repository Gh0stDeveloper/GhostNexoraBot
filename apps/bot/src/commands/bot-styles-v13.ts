import type { BotCommand, CommandContext } from '../types.js'
import { sendCarousel } from '../services/interactive.js'
import {
  getBotVisualStyle,
  getCurrentBotVisualStyle,
  listBotVisualStyles,
  resolveBotVisualStyleAsset,
  setCurrentBotVisualStyle,
} from '../services/bot-styles-v13.js'

const PAGE_SIZE = 6

async function currentAvatar(ctx: CommandContext) {
  const jid = ctx.socket.user?.id
  if (!jid) return undefined
  return ctx.socket.profilePictureUrl(jid, 'image').catch(() => undefined)
}

function requireStyleOwner(ctx: CommandContext) {
  if (ctx.isOwner || ctx.isSubbotOwner) return
  throw new Error('Solo el owner del MainBot o el owner de este subbot puede cambiar su estilo visual.')
}

async function stylesCarousel(ctx: CommandContext) {
  const styles = listBotVisualStyles()
  const requested = Number(ctx.args[0] ?? '1')
  const totalPages = Math.max(1, Math.ceil(styles.length / PAGE_SIZE))
  const page = Number.isFinite(requested) ? Math.max(1, Math.min(totalPages, Math.floor(requested))) : 1
  const visible = styles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const active = getCurrentBotVisualStyle()
  const fallback = await currentAvatar(ctx)

  const cards = await Promise.all(visible.map(async (style) => {
    let imageUrl = fallback
    let source = style.id === 'default' ? 'Foto actual del bot' : 'AniList'
    let character = ''
    if (style.id !== 'default') {
      try {
        const asset = await resolveBotVisualStyleAsset(style)
        imageUrl = asset.imageUrl || fallback
        character = asset.characterName ?? style.characterQuery ?? ''
      } catch {
        source = 'AniList temporalmente no disponible · usando fallback'
      }
    }
    const isActive = active.id === style.id
    return {
      title: `${style.icon} ${style.name}${isActive ? ' · ACTIVO' : ''}`,
      body: [
        style.description,
        character ? `\n🌸 Personaje: ${character}` : '',
        `🖼️ Imagen: ${source}`,
        `🆔 Estilo: ${style.id}`,
      ].filter(Boolean).join('\n'),
      imageUrl,
      footer: `Ghost Nexora Styles · ${page}/${totalPages}`,
      buttons: [
        {
          type: 'reply' as const,
          text: isActive ? '✅ Estilo activo' : '🎨 Aplicar',
          id: isActive ? `${ctx.prefix}style current` : `${ctx.prefix}style set ${style.id}`,
        },
        { type: 'reply' as const, text: '👁️ Vista previa', id: `${ctx.prefix}style preview ${style.id}` },
      ],
    }
  }))

  if (totalPages > 1) {
    const buttons = [] as Array<{ type: 'reply'; text: string; id: string }>
    if (page > 1) buttons.push({ type: 'reply', text: '⬅️ Anterior', id: `${ctx.prefix}styles ${page - 1}` })
    if (page < totalPages) buttons.push({ type: 'reply', text: '➡️ Siguiente chunk', id: `${ctx.prefix}styles ${page + 1}` })
    cards.push({
      title: '📚 Navegación de estilos',
      body: `Mostrando ${visible.length} estilos · chunk ${page}/${totalPages}.\nLos estilos se cargan dinámicamente desde AniList.`,
      imageUrl: fallback,
      footer: 'Ghost Nexora Styles',
      buttons,
    })
  }

  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: '🎨 GHOST NEXORA · ESTILOS',
    body: [
      `Estilo actual: ${active.icon} ${active.name}`,
      `Chunk ${page}/${totalPages} · ${PAGE_SIZE} estilos por página.`,
      'Desliza para ver las waifus disponibles.',
    ].join('\n'),
    footer: 'Imágenes dinámicas desde AniList · Ghost Nexora Bot',
    cards,
  })
}

async function styleCommand(ctx: CommandContext) {
  const action = (ctx.args[0] ?? 'current').toLowerCase()

  if (['list', 'lista', 'styles', 'estilos'].includes(action)) {
    const page = ctx.args[1] ?? '1'
    const original = ctx.args
    ctx.args = [page]
    try { await stylesCarousel(ctx) } finally { ctx.args = original }
    return
  }

  if (['current', 'actual', 'status'].includes(action)) {
    const style = getCurrentBotVisualStyle()
    const fallback = await currentAvatar(ctx)
    let imageUrl = fallback
    let extra = style.id === 'default' ? 'Usando la foto actual de WhatsApp.' : 'Imagen obtenida dinámicamente desde AniList.'
    if (style.id !== 'default') {
      try {
        const asset = await resolveBotVisualStyleAsset(style)
        imageUrl = asset.imageUrl || fallback
        if (asset.characterName) extra += `\nPersonaje: ${asset.characterName}`
      } catch {
        extra += '\nAniList no respondió; las tiendas usarán la foto actual como fallback.'
      }
    }
    const caption = [
      '╭━━〔 🎨 *ESTILO ACTUAL* 〕━━╮',
      `┃ ${style.icon} *${style.name}*`,
      `┃ ID: *${style.id}*`,
      '╰━━━━━━━━━━━━━━━━━━━━╯',
      style.description,
      '',
      extra,
      '',
      `Cambiar: ${ctx.prefix}styles`,
    ].join('\n')
    if (imageUrl) {
      await ctx.socket.sendMessage(ctx.chatId, { image: { url: imageUrl }, caption }, { quoted: ctx.message })
    } else {
      await ctx.reply(caption)
    }
    return
  }

  if (action === 'preview' || action === 'ver') {
    const id = (ctx.args[1] ?? '').toLowerCase()
    const style = getBotVisualStyle(id)
    if (!style) throw new Error(`Estilo no encontrado. Usa ${ctx.prefix}styles.`)
    const fallback = await currentAvatar(ctx)
    let imageUrl = fallback
    let character = ''
    if (style.id !== 'default') {
      const asset = await resolveBotVisualStyleAsset(style)
      imageUrl = asset.imageUrl || fallback
      character = asset.characterName ?? ''
    }
    const caption = [
      `${style.icon} *${style.name}*`,
      style.description,
      character ? `Personaje: *${character}*` : 'Imagen: foto actual del bot.',
      `ID: *${style.id}*`,
      '',
      `Aplicar: ${ctx.prefix}style set ${style.id}`,
    ].join('\n')
    if (imageUrl) await ctx.socket.sendMessage(ctx.chatId, { image: { url: imageUrl }, caption }, { quoted: ctx.message })
    else await ctx.reply(caption)
    return
  }

  if (action === 'set' || action === 'usar' || action === 'apply') {
    requireStyleOwner(ctx)
    const id = (ctx.args[1] ?? '').toLowerCase()
    if (!id) throw new Error(`Uso: ${ctx.prefix}style set <id>`)
    const style = setCurrentBotVisualStyle(id, ctx.sender)
    const fallback = await currentAvatar(ctx)
    let imageUrl = fallback
    let character = ''
    if (style.id !== 'default') {
      try {
        const asset = await resolveBotVisualStyleAsset(style)
        imageUrl = asset.imageUrl || fallback
        character = asset.characterName ?? ''
      } catch {
        // El estilo queda guardado y usará fallback hasta que AniList vuelva.
      }
    }
    const caption = [
      '✅ *ESTILO APLICADO*',
      '━━━━━━━━━━━━━━',
      `${style.icon} ${style.name}`,
      character ? `🌸 Personaje: ${character}` : '',
      `🆔 ${style.id}`,
      '',
      'Se aplicará a las imágenes visuales de esta instancia, incluyendo .shop y .minershop.',
      style.id === 'default' ? 'El estilo Default vuelve a usar la foto actual del bot.' : 'Las imágenes se obtienen desde AniList y tienen fallback a la foto actual.',
    ].filter(Boolean).join('\n')
    if (imageUrl) await ctx.socket.sendMessage(ctx.chatId, { image: { url: imageUrl }, caption }, { quoted: ctx.message })
    else await ctx.reply(caption)
    return
  }

  if (action === 'reset' || action === 'default') {
    requireStyleOwner(ctx)
    const style = setCurrentBotVisualStyle('default', ctx.sender)
    await ctx.reply(`✅ Estilo restaurado a *${style.name}*. Las tiendas volverán a usar la foto actual de esta cuenta de WhatsApp.`)
    return
  }

  throw new Error(`Uso: ${ctx.prefix}style <current|set|preview|reset> [id]`)
}

export const botStylesV13Commands: BotCommand[] = [
  {
    name: 'styles',
    aliases: ['estilos', 'themes', 'botstyles', 'waifustyles'],
    category: 'general',
    description: 'Carrusel de estilos visuales del bot, 6 por chunk, con imágenes dinámicas de AniList.',
    usage: 'styles [pagina]',
    handler: stylesCarousel,
  },
  {
    name: 'style',
    aliases: ['estilo', 'theme', 'botstyle'],
    category: 'general',
    description: 'Consulta o cambia el estilo visual de esta instancia del bot.',
    usage: 'style <current|set|preview|reset> [id]',
    subbotOwnerAllowed: true,
    handler: styleCommand,
  },
]
