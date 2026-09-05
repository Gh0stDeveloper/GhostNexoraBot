import type { BotCommand, CommandContext } from '../types.js'
import { sendCarousel } from '../services/interactive.js'
import {
  getBotVisualStyle,
  getBotVisualStyleImageSelection,
  getCurrentBotVisualStyle,
  listBotVisualStyleImages,
  listBotVisualStyles,
  resolveBotVisualStyleAsset,
  setBotVisualStyleImage,
  setCurrentBotVisualStyle,
} from '../services/bot-styles-v13.js'

const PAGE_SIZE = 6
const IMAGE_PAGE_SIZE = 6

async function currentAvatar(ctx: CommandContext) {
  const jid = ctx.socket.user?.id
  if (!jid) return undefined
  return ctx.socket.profilePictureUrl(jid, 'image').catch(() => undefined)
}

function requireStyleManager(ctx: CommandContext) {
  if (ctx.isOwner || ctx.isSubbotOwner || ctx.isBotStaff) return
  throw new Error('Solo el owner, el owner de este subbot o el staff del bot puede cambiar su estilo visual.')
}

function styleIdFromArgs(ctx: CommandContext, startAt = 1) {
  return ctx.args.slice(startAt).join(' ').trim()
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
    let source = style.id === 'default' ? 'Foto actual del bot' : 'Assets locales'
    let character = ''
    let variant = ''
    if (style.id !== 'default') {
      try {
        const asset = await resolveBotVisualStyleAsset(style)
        imageUrl = asset.imageUrl || fallback
        character = asset.characterName ?? style.characterQuery ?? ''
        variant = asset.imageIndex && asset.imageCount ? `#${asset.imageIndex}/${asset.imageCount}` : ''
      } catch {
        source = 'Assets locales no preparados · usando fallback'
      }
    }
    const isActive = active.id === style.id
    return {
      title: `${style.icon} ${style.name}${isActive ? ' · ACTIVO' : ''}`,
      body: [
        style.description,
        character ? `\n🌸 Personaje: ${character}` : '',
        `🖼️ Imagen: ${source}${variant ? ` · ${variant}` : ''}`,
        `🆔 Estilo: ${style.id}`,
      ].filter(Boolean).join('\n'),
      imageUrl,
      footer: `Ghost Nexora Styles · ${page}/${totalPages}`,
      buttons: style.id === 'default'
        ? [
            {
              type: 'reply' as const,
              text: isActive ? '✅ Estilo activo' : '🎨 Aplicar',
              id: isActive ? `${ctx.prefix}style current` : `${ctx.prefix}style set default`,
            },
            { type: 'reply' as const, text: '👁️ Vista previa', id: `${ctx.prefix}style preview default` },
          ]
        : [
            {
              type: 'reply' as const,
              text: isActive ? '✅ Estilo activo' : '🎨 Aplicar',
              id: isActive ? `${ctx.prefix}style current` : `${ctx.prefix}style set ${style.id}`,
            },
            { type: 'reply' as const, text: '🖼️ Elegir imagen', id: `${ctx.prefix}styleimg list ${style.id} 1` },
          ],
    }
  }))

  if (totalPages > 1) {
    const buttons = [] as Array<{ type: 'reply'; text: string; id: string }>
    if (page > 1) buttons.push({ type: 'reply', text: '⬅️ Anterior', id: `${ctx.prefix}styles ${page - 1}` })
    if (page < totalPages) buttons.push({ type: 'reply', text: '➡️ Siguiente chunk', id: `${ctx.prefix}styles ${page + 1}` })
    cards.push({
      title: '📚 Navegación de estilos',
      body: `Mostrando ${visible.length} estilos · chunk ${page}/${totalPages}.\nLas imágenes están incluidas localmente en Ghost Nexora Bot.`,
      imageUrl: fallback,
      footer: 'Ghost Nexora Styles',
      buttons,
    })
  }

  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: '🎨 GHOST NEXORA · WAIFU STYLES',
    body: [
      `Estilo actual: ${active.icon} ${active.name}`,
      `Chunk ${page}/${totalPages} · ${PAGE_SIZE} estilos por página.`,
      'Desliza para ver personajes femeninos de anime disponibles.',
      'Owner, owner del subbot y staff pueden aplicar estilos y elegir la imagen.',
    ].join('\n'),
    footer: 'Assets locales · sin API externa · Ghost Nexora Bot',
    cards,
  })
}

async function styleImagesCarousel(ctx: CommandContext, rawStyleId: string, requestedPage = 1) {
  requireStyleManager(ctx)
  const style = getBotVisualStyle(rawStyleId)
  if (!style || style.id === 'default') throw new Error(`Waifu no encontrada. Usa ${ctx.prefix}styles.`)
  const images = listBotVisualStyleImages(style)
  if (!images.length) throw new Error(`No hay imágenes locales para ${style.name}. Ejecuta npm run assets:waifus en el servidor.`)

  const totalPages = Math.max(1, Math.ceil(images.length / IMAGE_PAGE_SIZE))
  const page = Number.isFinite(requestedPage) ? Math.max(1, Math.min(totalPages, Math.floor(requestedPage))) : 1
  const visible = images.slice((page - 1) * IMAGE_PAGE_SIZE, page * IMAGE_PAGE_SIZE)
  const selected = getBotVisualStyleImageSelection(style.id)?.image.index ?? 1
  const cards = visible.map((image) => ({
    title: `${style.icon} ${style.name.split('·')[0]!.trim()} · Imagen ${image.index}`,
    body: [
      `Variante *${image.index} de ${images.length}*`,
      image.index === selected ? '✅ Imagen seleccionada actualmente.' : 'Toca Usar esta imagen para aplicarla.',
      'Se usará en menú, bienvenida, tienda y demás superficies del estilo.',
    ].join('\n'),
    imageUrl: image.filePath,
    footer: `Ghost Nexora · imágenes locales · ${page}/${totalPages}`,
    buttons: [{
      type: 'reply' as const,
      text: image.index === selected ? '✅ Seleccionada' : `🖼️ Usar #${image.index}`,
      id: image.index === selected
        ? `${ctx.prefix}style current`
        : `${ctx.prefix}styleimg set ${style.id} ${image.index}`,
    }],
  }))

  if (totalPages > 1) {
    const buttons = [] as Array<{ type: 'reply'; text: string; id: string }>
    if (page > 1) buttons.push({ type: 'reply', text: '⬅️ Anterior', id: `${ctx.prefix}styleimg list ${style.id} ${page - 1}` })
    if (page < totalPages) buttons.push({ type: 'reply', text: '➡️ Siguiente', id: `${ctx.prefix}styleimg list ${style.id} ${page + 1}` })
    cards.push({
      title: '📚 Más imágenes',
      body: `${style.name} tiene ${images.length} imágenes locales.\nPágina ${page}/${totalPages}.`,
      footer: 'Ghost Nexora Styles',
      buttons,
    })
  }

  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: `🖼️ ${style.name} · IMÁGENES`,
    body: `Elige la imagen que usará esta instancia.\nSeleccionada actualmente: #${selected}/${images.length}.`,
    footer: 'Owner / subbot owner / staff · assets locales',
    cards,
  })
}

async function styleImageCommand(ctx: CommandContext) {
  const action = (ctx.args[0] ?? 'current').toLowerCase()

  if (['current', 'actual', 'status'].includes(action)) {
    const style = getCurrentBotVisualStyle()
    if (style.id === 'default') {
      await ctx.reply('👻 El estilo actual es *Default* y usa la foto de perfil de esta cuenta del bot.')
      return
    }
    const selection = getBotVisualStyleImageSelection(style.id)
    if (!selection) throw new Error(`No hay imágenes locales instaladas para ${style.name}.`)
    await ctx.socket.sendMessage(ctx.chatId, {
      image: { url: selection.image.filePath },
      caption: `🖼️ *${style.name}*\nImagen seleccionada: *#${selection.image.index}/${selection.imageCount}*\n\nCambiar: ${ctx.prefix}styleimg list ${style.id}`,
    }, { quoted: ctx.message })
    return
  }

  if (['list', 'lista', 'images', 'imagenes', 'imágenes'].includes(action)) {
    const styleId = ctx.args[1] || getCurrentBotVisualStyle().id
    const page = Number(ctx.args[2] ?? '1')
    await styleImagesCarousel(ctx, styleId, page)
    return
  }

  if (['set', 'usar', 'apply'].includes(action)) {
    requireStyleManager(ctx)
    const styleId = ctx.args[1] ?? ''
    const imageIndex = Number(ctx.args[2] ?? '')
    if (!styleId || !Number.isFinite(imageIndex)) throw new Error(`Uso: ${ctx.prefix}styleimg set <waifu> <numero>`)
    const selected = setBotVisualStyleImage(styleId, imageIndex, ctx.sender, true)
    const caption = [
      '✅ *IMAGEN DE WAIFU APLICADA*',
      '━━━━━━━━━━━━━━',
      `${selected.style.icon} ${selected.style.name}`,
      `🖼️ Imagen: *#${selected.image.index}/${selected.imageCount}*`,
      '',
      'Esta imagen queda guardada para esta waifu en esta instancia.',
      'Se usará en menú, bienvenida, .shop, .minershop y demás superficies que consumen el estilo visual activo.',
    ].join('\n')
    await ctx.socket.sendMessage(ctx.chatId, { image: { url: selected.image.filePath }, caption }, { quoted: ctx.message })
    return
  }

  // Atajo: .styleimg rem 2 -> lista de Rem, página 2.
  const page = Number(ctx.args[1] ?? '1')
  await styleImagesCarousel(ctx, action, page)
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
    let extra = style.id === 'default' ? 'Usando la foto actual de WhatsApp.' : 'Usando un asset local incluido en Ghost Nexora Bot.'
    if (style.id !== 'default') {
      try {
        const asset = await resolveBotVisualStyleAsset(style)
        imageUrl = asset.imageUrl || fallback
        if (asset.characterName) extra += `\nPersonaje: ${asset.characterName}`
        if (asset.imageIndex && asset.imageCount) extra += `\nImagen seleccionada: #${asset.imageIndex}/${asset.imageCount}`
      } catch {
        extra += '\nLos assets locales no están preparados; se usa la foto actual como fallback.'
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
      `Cambiar waifu: ${ctx.prefix}styles`,
      style.id !== 'default' ? `Cambiar imagen: ${ctx.prefix}styleimg list ${style.id}` : '',
    ].filter(Boolean).join('\n')
    if (imageUrl) {
      await ctx.socket.sendMessage(ctx.chatId, { image: { url: imageUrl }, caption }, { quoted: ctx.message })
    } else {
      await ctx.reply(caption)
    }
    return
  }

  if (action === 'preview' || action === 'ver') {
    const id = styleIdFromArgs(ctx)
    const style = getBotVisualStyle(id)
    if (!style) throw new Error(`Estilo no encontrado. Usa ${ctx.prefix}styles.`)
    const fallback = await currentAvatar(ctx)
    let imageUrl = fallback
    let character = ''
    let variant = ''
    if (style.id !== 'default') {
      const asset = await resolveBotVisualStyleAsset(style)
      imageUrl = asset.imageUrl || fallback
      character = asset.characterName ?? ''
      if (asset.imageIndex && asset.imageCount) variant = `Imagen local: #${asset.imageIndex}/${asset.imageCount}`
    }
    const caption = [
      `${style.icon} *${style.name}*`,
      style.description,
      character ? `Personaje: *${character}*` : 'Imagen: foto actual del bot.',
      variant,
      `ID: *${style.id}*`,
      '',
      `Aplicar: ${ctx.prefix}style set ${style.id}`,
      style.id !== 'default' ? `Elegir imagen: ${ctx.prefix}styleimg list ${style.id}` : '',
    ].filter(Boolean).join('\n')
    if (imageUrl) await ctx.socket.sendMessage(ctx.chatId, { image: { url: imageUrl }, caption }, { quoted: ctx.message })
    else await ctx.reply(caption)
    return
  }

  if (action === 'set' || action === 'usar' || action === 'apply') {
    requireStyleManager(ctx)
    const id = styleIdFromArgs(ctx)
    if (!id) throw new Error(`Uso: ${ctx.prefix}style set <id|nombre>`)
    const style = setCurrentBotVisualStyle(id, ctx.sender)
    const fallback = await currentAvatar(ctx)
    let imageUrl = fallback
    let character = ''
    let variant = ''
    if (style.id !== 'default') {
      try {
        const asset = await resolveBotVisualStyleAsset(style)
        imageUrl = asset.imageUrl || fallback
        character = asset.characterName ?? ''
        if (asset.imageIndex && asset.imageCount) variant = `🖼️ Imagen local #${asset.imageIndex}/${asset.imageCount}`
      } catch {
        // El estilo queda guardado y usará fallback si los assets aún no fueron extraídos.
      }
    }
    const caption = [
      '✅ *ESTILO APLICADO*',
      '━━━━━━━━━━━━━━',
      `${style.icon} ${style.name}`,
      character ? `🌸 Personaje: ${character}` : '',
      variant,
      `🆔 ${style.id}`,
      '',
      'Se aplicará a las imágenes visuales de esta instancia, incluyendo menú, bienvenida, .shop y .minershop.',
      style.id === 'default'
        ? 'El estilo Default vuelve a usar la foto actual del bot.'
        : `Las imágenes son locales. Para elegir otra: ${ctx.prefix}styleimg list ${style.id}`,
    ].filter(Boolean).join('\n')
    if (imageUrl) await ctx.socket.sendMessage(ctx.chatId, { image: { url: imageUrl }, caption }, { quoted: ctx.message })
    else await ctx.reply(caption)
    return
  }

  if (action === 'reset' || action === 'default') {
    requireStyleManager(ctx)
    const style = setCurrentBotVisualStyle('default', ctx.sender)
    await ctx.reply(`✅ Estilo restaurado a *${style.name}*. El bot volverá a usar la foto actual de esta cuenta de WhatsApp.`)
    return
  }

  throw new Error(`Uso: ${ctx.prefix}style <current|set|preview|reset> [id|nombre]`)
}

export const botStylesV13Commands: BotCommand[] = [
  {
    name: 'styles',
    aliases: ['estilos', 'themes', 'botstyles', 'waifustyles'],
    category: 'general',
    description: 'Carrusel de waifus populares, 6 por chunk, usando imágenes locales incluidas en el bot.',
    usage: 'styles [pagina]',
    handler: stylesCarousel,
  },
  {
    name: 'style',
    aliases: ['estilo', 'theme', 'botstyle'],
    category: 'general',
    description: 'Consulta o cambia la waifu visual local de esta instancia; owner, subbot owner y staff pueden aplicarla.',
    usage: 'style <current|set|preview|reset> [id|nombre]',
    subbotOwnerAllowed: true,
    handler: styleCommand,
  },
  {
    name: 'styleimg',
    aliases: ['waifuimg', 'styleimage', 'imagenwaifu'],
    category: 'general',
    description: 'Permite a owner, subbot owner y staff elegir la imagen local concreta de una waifu.',
    usage: 'styleimg <list|set|current> [waifu] [pagina|numero]',
    subbotOwnerAllowed: true,
    handler: styleImageCommand,
  },
]
