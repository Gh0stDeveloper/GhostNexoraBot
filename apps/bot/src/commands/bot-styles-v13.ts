import type { BotCommand, CommandContext } from '../types.js'
import { sendCarousel, sendInteractiveCard } from '../services/interactive.js'
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
const IMAGE_PAGE_SIZE = 8

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

async function sendStylesNavigation(ctx: CommandContext, page: number, totalPages: number) {
  if (totalPages <= 1) return
  const buttons = [] as Array<{ type: 'reply'; text: string; id: string }>
  if (page > 1) buttons.push({ type: 'reply', text: '⬅️ Anterior', id: `${ctx.prefix}styles ${page - 1}` })
  if (page < totalPages) buttons.push({ type: 'reply', text: '➡️ Siguiente', id: `${ctx.prefix}styles ${page + 1}` })
  if (!buttons.length) return

  await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
    title: '📚 NAVEGACIÓN · WAIFUS',
    body: `Página ${page}/${totalPages}. Los controles de navegación van separados del carrusel para mantener las tarjetas limpias y compatibles.`,
    footer: 'Ghost Nexora Styles',
    buttons,
  })
}

async function sendVariantNavigation(
  ctx: CommandContext,
  styleId: string,
  page: number,
  totalPages: number,
) {
  const buttons = [] as Array<{ type: 'reply'; text: string; id: string }>
  if (page > 1) buttons.push({ type: 'reply', text: '⬅️ Anterior', id: `${ctx.prefix}styleimg list ${styleId} ${page - 1}` })
  if (page < totalPages) buttons.push({ type: 'reply', text: '➡️ Siguiente', id: `${ctx.prefix}styleimg list ${styleId} ${page + 1}` })
  buttons.push({ type: 'reply', text: '🌸 Volver a waifus', id: `${ctx.prefix}styles 1` })

  await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
    title: '📚 NAVEGACIÓN · VARIANTES',
    body: `Página ${page}/${totalPages}. Elige una variante en el carrusel o vuelve al catálogo de waifus.`,
    footer: 'Ghost Nexora Styles',
    buttons: buttons.slice(0, 3),
  })
}

async function stylesCarousel(ctx: CommandContext) {
  // El catálogo principal es exclusivamente de waifus. Default sigue disponible
  // mediante `.style reset`, pero no ocupa una tarjeta dentro del catálogo visual.
  const styles = listBotVisualStyles().filter((style) => style.id !== 'default')
  const requested = Number(ctx.args[0] ?? '1')
  const totalPages = Math.max(1, Math.ceil(styles.length / PAGE_SIZE))
  const page = Number.isFinite(requested) ? Math.max(1, Math.min(totalPages, Math.floor(requested))) : 1
  const visible = styles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const active = getCurrentBotVisualStyle()
  const fallback = await currentAvatar(ctx)

  const cards = visible.map((style) => {
    const images = listBotVisualStyleImages(style)
    const selection = getBotVisualStyleImageSelection(style.id)
    const imageUrl = selection?.image.filePath || images[0]?.filePath || fallback
    const isActive = active.id === style.id

    return {
      title: `${style.icon} ${style.name}${isActive ? ' · ACTIVO' : ''}`,
      body: [
        style.description,
        style.characterQuery ? `🌸 Personaje: ${style.characterQuery}` : '',
        `🖼️ Variantes disponibles: ${images.length}`,
        isActive && selection ? `✅ Variante activa: #${selection.image.index}/${selection.imageCount}` : '',
      ].filter(Boolean).join('\n'),
      imageUrl,
      footer: `Ghost Nexora Styles · ${page}/${totalPages}`,
      // Seleccionar una waifu NO la aplica. Primero abre sus variantes.
      buttons: [{
        type: 'reply' as const,
        text: '🖼️ Ver variantes',
        id: `${ctx.prefix}styleimg list ${style.id} 1`,
      }],
    }
  })

  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: '🎨 GHOST NEXORA · WAIFU STYLES',
    body: [
      `Estilo actual: ${active.icon} ${active.name}`,
      `Página ${page}/${totalPages} · ${PAGE_SIZE} waifus por página.`,
      'Selecciona una waifu para abrir su carrusel de variantes. La portada no se aplica automáticamente.',
    ].join('\n'),
    footer: 'Assets locales · sin API externa · Ghost Nexora Bot',
    cards,
  })

  // La navegación vive fuera del carrusel, tal como el flujo select-first de otras superficies.
  await sendStylesNavigation(ctx, page, totalPages)
}

async function styleImagesCarousel(ctx: CommandContext, rawStyleId: string, requestedPage = 1) {
  const style = getBotVisualStyle(rawStyleId)
  if (!style || style.id === 'default') throw new Error(`Waifu no encontrada. Usa ${ctx.prefix}styles.`)
  const images = listBotVisualStyleImages(style)
  if (!images.length) throw new Error(`No hay imágenes locales para ${style.name}. Ejecuta npm run assets:waifus en el servidor.`)

  const totalPages = Math.max(1, Math.ceil(images.length / IMAGE_PAGE_SIZE))
  const page = Number.isFinite(requestedPage) ? Math.max(1, Math.min(totalPages, Math.floor(requestedPage))) : 1
  const visible = images.slice((page - 1) * IMAGE_PAGE_SIZE, page * IMAGE_PAGE_SIZE)
  const selected = getBotVisualStyleImageSelection(style.id)?.image.index ?? 1
  const active = getCurrentBotVisualStyle()

  const cards = visible.map((image) => {
    const isSelectedForWaifu = image.index === selected
    const isActiveVariant = active.id === style.id && isSelectedForWaifu

    return {
      title: `${style.icon} ${style.name.split('·')[0]!.trim()} · Variante ${image.index}`,
      body: [
        `Variante *${image.index} de ${images.length}*`,
        isActiveVariant
          ? '✅ Esta es la variante activa de la instancia.'
          : isSelectedForWaifu
            ? '🖼️ Esta variante estaba guardada para esta waifu. Puedes aplicarla de nuevo.'
            : 'Toca Usar variante para aplicar esta imagen y activar la waifu.',
        'Se usará en menú, bienvenida, tienda y demás superficies del estilo.',
      ].join('\n'),
      imageUrl: image.filePath,
      footer: `Ghost Nexora · variantes locales · ${page}/${totalPages}`,
      buttons: [{
        type: 'reply' as const,
        text: isActiveVariant ? '✅ Estilo activo' : `🎨 Usar variante #${image.index}`,
        id: isActiveVariant
          ? `${ctx.prefix}style current`
          : `${ctx.prefix}styleimg set ${style.id} ${image.index}`,
      }],
    }
  })

  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: `🖼️ ${style.name} · VARIANTES`,
    body: [
      `${images.length} variantes locales disponibles.`,
      active.id === style.id
        ? `Variante activa actualmente: #${selected}/${images.length}.`
        : 'Seleccionar una variante activará esta waifu y aplicará esa imagen.',
    ].join('\n'),
    footer: 'Owner / subbot owner / staff pueden aplicar · todos pueden explorar',
    cards,
  })

  // Anterior/Siguiente no se agregan como una tarjeta extra del carrusel.
  await sendVariantNavigation(ctx, style.id, page, totalPages)
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
      caption: `🖼️ *${style.name}*\nVariante seleccionada: *#${selection.image.index}/${selection.imageCount}*\n\nCambiar: ${ctx.prefix}styleimg list ${style.id}`,
    }, { quoted: ctx.message })
    return
  }

  if (['list', 'lista', 'images', 'imagenes', 'imágenes', 'variants', 'variantes'].includes(action)) {
    const styleId = ctx.args[1] || getCurrentBotVisualStyle().id
    const page = Number(ctx.args[2] ?? '1')
    await styleImagesCarousel(ctx, styleId, page)
    return
  }

  if (['set', 'usar', 'apply', 'aplicar'].includes(action)) {
    requireStyleManager(ctx)
    const styleId = ctx.args[1] ?? ''
    const imageIndex = Number(ctx.args[2] ?? '')
    if (!styleId || !Number.isFinite(imageIndex)) throw new Error(`Uso: ${ctx.prefix}styleimg set <waifu> <numero>`)
    const selected = setBotVisualStyleImage(styleId, imageIndex, ctx.sender, true)
    const caption = [
      '✅ *ESTILO Y VARIANTE APLICADOS*',
      '━━━━━━━━━━━━━━',
      `${selected.style.icon} ${selected.style.name}`,
      `🖼️ Variante: *#${selected.image.index}/${selected.imageCount}*`,
      '',
      'La waifu y esta variante quedan activas para esta instancia.',
      'Se usará en menú, bienvenida, .shop, .minershop y demás superficies que consumen el estilo visual activo.',
    ].join('\n')
    await ctx.socket.sendMessage(ctx.chatId, { image: { url: selected.image.filePath }, caption }, { quoted: ctx.message })
    return
  }

  // Atajo: .styleimg rem 2 -> variantes de Rem, página 2.
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
        if (asset.imageIndex && asset.imageCount) extra += `\nVariante seleccionada: #${asset.imageIndex}/${asset.imageCount}`
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
      style.id !== 'default' ? `Cambiar variante: ${ctx.prefix}styleimg list ${style.id}` : '',
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
      if (asset.imageIndex && asset.imageCount) variant = `Variante local: #${asset.imageIndex}/${asset.imageCount}`
    }
    const caption = [
      `${style.icon} *${style.name}*`,
      style.description,
      character ? `Personaje: *${character}*` : 'Imagen: foto actual del bot.',
      variant,
      `ID: *${style.id}*`,
      '',
      style.id === 'default'
        ? `Restaurar: ${ctx.prefix}style reset`
        : `Ver variantes: ${ctx.prefix}styleimg list ${style.id}`,
    ].filter(Boolean).join('\n')
    if (imageUrl) await ctx.socket.sendMessage(ctx.chatId, { image: { url: imageUrl }, caption }, { quoted: ctx.message })
    else await ctx.reply(caption)
    return
  }

  // Se conserva por compatibilidad/administración directa, pero el catálogo `.styles`
  // nunca usa este camino: la UI obliga a elegir primero una variante.
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
        if (asset.imageIndex && asset.imageCount) variant = `🖼️ Variante local #${asset.imageIndex}/${asset.imageCount}`
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
        : `Para elegir una variante concreta: ${ctx.prefix}styleimg list ${style.id}`,
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
    description: 'Catálogo visual de waifus con imágenes locales; seleccionar una waifu abre primero sus variantes.',
    usage: 'styles [pagina]',
    handler: stylesCarousel,
  },
  {
    name: 'style',
    aliases: ['estilo', 'theme', 'botstyle'],
    category: 'general',
    description: 'Consulta o administra la waifu visual local de esta instancia; owner, subbot owner y staff pueden aplicarla.',
    usage: 'style <current|set|preview|reset> [id|nombre]',
    subbotOwnerAllowed: true,
    handler: styleCommand,
  },
  {
    name: 'styleimg',
    aliases: ['waifuimg', 'styleimage', 'imagenwaifu'],
    category: 'general',
    description: 'Explora las variantes locales de cada waifu y permite a owner, subbot owner y staff aplicar una variante concreta.',
    usage: 'styleimg <list|set|current> [waifu] [pagina|numero]',
    subbotOwnerAllowed: true,
    handler: styleImageCommand,
  },
]
