import type { BotCommand, CommandContext } from '../types.js'
import { downloadMessageMedia } from '../utils/message.js'
import { globalStickers } from '../services/human-stickers.js'
import { premiumStickersV18 } from '../services/premium-stickers-v18.js'

function descriptor(raw: string) {
  const parts = raw.split('|')
  const label = (parts.shift() ?? '').trim() || undefined
  const triggers = parts.join('|').split(',').map((item) => item.trim()).filter(Boolean)
  return { label, triggers }
}

function regularRows() {
  return globalStickers.list() as Array<{ id: number; label?: string | null; triggers?: string | null }>
}

async function addSticker(ctx: CommandContext, packName?: string) {
  const premium = premiumStickersV18.extract(ctx.message)
  const rawStart = packName ? 2 : 1
  const meta = descriptor(ctx.args.slice(rawStart).join(' '))

  if (premium) {
    const row = premiumStickersV18.addFromMessage(ctx.message, ctx.sender, {
      packName,
      label: meta.label,
      triggers: meta.triggers,
    })
    await ctx.reply([
      `✅ *STICKER LOTTIE #L${row.id} AÑADIDO*`,
      packName ? `📦 Pack: *${packName}*` : '',
      meta.label ? `🏷️ Etiqueta: *${meta.label}*` : '',
      meta.triggers.length ? `💬 Triggers: ${meta.triggers.join(', ')}` : '🎲 Sin triggers: puede aparecer ocasionalmente.',
      '',
      'Se conserva como `lottieStickerMessage`; no se convierte a WebP.',
    ].filter(Boolean).join('\n'))
    return { kind: 'lottie' as const, id: row.id }
  }

  const media = await downloadMessageMedia(ctx.message)
  if (!media || media.kind !== 'sticker') throw new Error('Responde al sticker que quieres guardar. Soporta WebP y Lottie/premium.')
  const row = await globalStickers.add(media.buffer, ctx.sender, globalStickers.hashFromMessage(ctx.message), meta.label, meta.triggers)
  if (packName) premiumStickersV18.addRegularPackMember(packName, row.id)
  await ctx.reply([
    `✅ *STICKER WEBP #W${row.id} AÑADIDO*`,
    packName ? `📦 Pack: *${packName}*` : '',
    meta.label ? `🏷️ Etiqueta: *${meta.label}*` : '',
    meta.triggers.length ? `💬 Triggers: ${meta.triggers.map((x) => `“${globalStickers.normalizeTrigger(x)}”`).join(', ')}` : '🎲 Sin triggers: puede aparecer ocasionalmente.',
  ].filter(Boolean).join('\n'))
  return { kind: 'webp' as const, id: row.id }
}

async function listLibrary(ctx: CommandContext) {
  const webp = regularRows()
  const lottie = premiumStickersV18.list()
  const packs = premiumStickersV18.packs()
  const webpLines = webp.slice(0, 40).map((row) => {
    const triggers = String(row.triggers ?? '').split('|').filter(Boolean)
    return `W${row.id} · *${row.label ?? 'sin etiqueta'}*${triggers.length ? ` · ${triggers.join(', ')}` : ''}`
  })
  const lottieLines = lottie.slice(0, 40).map((row) => {
    const triggers = String(row.triggers ?? '').split('|').filter(Boolean)
    return `L${row.id} · *${row.label ?? 'Lottie/premium'}*${row.packName ? ` · pack ${row.packName}` : ''}${triggers.length ? ` · ${triggers.join(', ')}` : ''}`
  })
  const packLines = packs.map((pack) => `• *${pack.packName}* · ${Number(pack.count)} sticker(s) · ${Number(pack.lottieCount)} Lottie · ${Number(pack.webpCount)} WebP`)

  await ctx.reply([
    '🎭 *BIBLIOTECA DE STICKERS DE ESTA INSTANCIA*',
    '━━━━━━━━━━━━━━',
    `WebP: *${webp.length}* · Lottie/premium: *${lottie.length}* · Packs: *${packs.length}*`,
    '',
    webpLines.length ? '*WEBP*\n' + webpLines.join('\n') : '',
    lottieLines.length ? '\n*LOTTIE / PREMIUM*\n' + lottieLines.join('\n') : '',
    packLines.length ? '\n*PACKS*\n' + packLines.join('\n') : '',
    '',
    `Añadir suelto: *${ctx.prefix}botsticker add etiqueta | palabra,frase*`,
    `Añadir a pack: *${ctx.prefix}botsticker packadd <pack> | etiqueta | palabra,frase*`,
    `Enviar pack: *${ctx.prefix}botsticker packsend <pack>*`,
    `Probar Lottie: *${ctx.prefix}lottiesticker* respondiendo al sticker.`,
    `Eliminar: *${ctx.prefix}botsticker remove W12* o *L12*`,
  ].filter(Boolean).join('\n'))
}

async function botStickerV18(ctx: CommandContext) {
  const action = (ctx.args[0] ?? 'list').toLowerCase()
  if (['list', 'lista', 'library', 'biblioteca'].includes(action)) return listLibrary(ctx)
  if (['packs', 'packlist'].includes(action)) {
    const packs = premiumStickersV18.packs()
    await ctx.reply(packs.length
      ? `📦 *PACKS DE STICKERS*\n━━━━━━━━━━━━━━\n${packs.map((pack) => `• *${pack.packName}* · ${Number(pack.count)} (${Number(pack.lottieCount)} Lottie / ${Number(pack.webpCount)} WebP)`).join('\n')}`
      : 'No hay packs de stickers configurados.')
    return
  }
  if (action === 'packadd') {
    const packName = String(ctx.args[1] ?? '').trim()
    if (!packName) throw new Error(`Uso: ${ctx.prefix}botsticker packadd <pack> | etiqueta | triggers`)
    await addSticker(ctx, packName)
    return
  }
  if (action === 'packsend') {
    const packName = ctx.args.slice(1).join(' ').trim()
    if (!packName) throw new Error(`Uso: ${ctx.prefix}botsticker packsend <pack>`)
    const result = await premiumStickersV18.sendPack(ctx.socket, ctx.chatId, packName, ctx.message)
    await ctx.reply(`✅ Pack *${result.packName}* enviado: *${result.sent}/${result.total}* sticker(s).`)
    return
  }
  if (action === 'add' || action === 'lottie') {
    await addSticker(ctx)
    return
  }
  if (action === 'remove' || action === 'delete') {
    const rawId = String(ctx.args[1] ?? '').trim().toUpperCase()
    const match = /^([WL]?)(\d+)$/.exec(rawId)
    if (!match?.[2]) throw new Error('Indica el ID: W12 para WebP o L12 para Lottie.')
    const id = Number(match[2])
    if (match[1] === 'L') premiumStickersV18.remove(id)
    else await globalStickers.remove(id)
    await ctx.reply(`✅ Sticker *${match[1] || 'W'}${id}* eliminado.`)
    return
  }
  throw new Error(`Usa ${ctx.prefix}botsticker add, packadd, packsend, packs, list o remove.`)
}

async function lottieStickerCommand(ctx: CommandContext) {
  const packName = ctx.args.join(' ').trim() || undefined
  const row = premiumStickersV18.addFromMessage(ctx.message, ctx.sender, { packName })
  await premiumStickersV18.sendById(ctx.socket, ctx.chatId, row.id, ctx.message)
  await ctx.reply(`✅ Sticker Lottie *L${row.id}* guardado${packName ? ` en el pack *${packName}*` : ''} y reenviado con relay nativo.`)
}

export const stickerPremiumV18Commands: BotCommand[] = [
  {
    name: 'botsticker',
    aliases: ['globalsticker'],
    category: 'owner',
    staffOnly: true,
    subbotOwnerAllowed: true,
    description: 'Administra stickers WebP, Lottie/premium y packs de la instancia.',
    usage: 'botsticker add|packadd|packsend|packs|list|remove',
    handler: botStickerV18,
  },
  {
    name: 'lottiesticker',
    aliases: ['premiumsticker', 'wassticker'],
    category: 'owner',
    staffOnly: true,
    subbotOwnerAllowed: true,
    description: 'Guarda y prueba el relay nativo de un sticker Lottie/premium citado.',
    usage: 'lottiesticker [nombre del pack]',
    handler: lottieStickerCommand,
  },
]
