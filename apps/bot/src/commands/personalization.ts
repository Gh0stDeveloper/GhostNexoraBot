import type { BotCommand, CommandContext } from '../types.js'
import { downloadMessageMedia } from '../utils/message.js'
import { community } from '../services/community.js'
import { sendInteractiveCard } from '../services/interactive.js'
import { deleteBrandingAsset, saveBrandingAsset, type BrandingAsset, type BrandingSlot } from '../services/branding.js'

function inviteCode(input: string) {
  const text = input.trim()
  const match = /(?:https?:\/\/)?chat\.whatsapp\.com\/([A-Za-z0-9_-]{10,40})/i.exec(text)
  return match?.[1] ?? null
}

async function previewBranding(ctx: CommandContext, slot: BrandingSlot, asset: BrandingAsset) {
  const labels: Record<BrandingSlot, string> = { menu: 'MENÚ', welcome: 'BIENVENIDA', goodbye: 'DESPEDIDA' }
  const title = `✅ BANNER DE ${labels[slot]} ACTUALIZADO`
  if (asset.kind === 'image') {
    await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
      title,
      body: `Archivo persistente guardado correctamente.\n📦 ${(asset.size / 1024 / 1024).toFixed(2)} MB\n♻️ Sobrevive actualizaciones y reinicios de la VPS.`,
      imageUrl: asset.path,
      buttons: slot === 'menu' ? [{ type: 'reply', text: '📋 Ver menú', id: `${ctx.prefix}menu` }] : [],
    })
    return
  }
  await ctx.socket.sendMessage(ctx.chatId, {
    video: { url: asset.path },
    gifPlayback: true,
    caption: `${title}\n━━━━━━━━━━━━━━\nEl GIF/video quedó guardado de forma persistente y se usará en las ${slot === 'welcome' ? 'bienvenidas' : 'despedidas'}.`,
  }, { quoted: ctx.message })
}

async function setBanner(ctx: CommandContext, slot: BrandingSlot) {
  const media = await downloadMessageMedia(ctx.message)
  if (!media) throw new Error('Envía o cita una imagen. Para bienvenida/despedida también puedes citar un GIF/video corto.')
  const asset = await saveBrandingAsset(slot, media)
  await previewBranding(ctx, slot, asset)
}

export const personalizationCommands: BotCommand[] = [
  {
    name: 'setpfp', aliases: ['setbotpfp', 'botpfp'], category: 'owner', staffOnly: true,
    description: 'Cambia la foto de perfil de WhatsApp del bot usando una imagen citada.', usage: 'setpfp <responde/cita una imagen>',
    async handler(ctx) {
      const media = await downloadMessageMedia(ctx.message)
      if (!media || media.kind !== 'image') throw new Error('Envía o cita una imagen y usa .setpfp.')
      if (media.buffer.length > 8 * 1024 * 1024) throw new Error('La imagen supera el límite de 8 MB para la foto de perfil.')
      const jid = ctx.socket.user?.id
      if (!jid) throw new Error('La sesión del bot todavía no tiene un JID autenticado.')
      await ctx.socket.updateProfilePicture(jid, media.buffer)
      const current = await ctx.socket.profilePictureUrl(jid, 'image').catch(() => undefined)
      await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
        title: '✅ FOTO DEL BOT ACTUALIZADA',
        body: 'La nueva foto ya pertenece a la cuenta WhatsApp del bot. Si no existe un banner personalizado, esta misma imagen aparece en el menú.',
        imageUrl: current,
        buttons: [{ type: 'reply', text: '📋 Ver menú', id: `${ctx.prefix}menu` }],
      })
    },
  },
  {
    name: 'setbanner', aliases: ['sb', 'setbotbanner'], category: 'owner', staffOnly: true,
    description: 'Cambia el banner del menú; por defecto se usa la foto de perfil del bot.', usage: 'setbanner <cita una imagen>',
    async handler(ctx) { await setBanner(ctx, 'menu') },
  },
  {
    name: 'delbanner', aliases: ['delbotbanner'], category: 'owner', staffOnly: true,
    description: 'Elimina el banner del menú y vuelve a usar la foto de perfil.',
    async handler(ctx) {
      const existed = await deleteBrandingAsset('menu')
      await ctx.reply(existed ? `🗑️ Banner del menú eliminado. *${ctx.prefix}menu* volverá a usar la foto de perfil real del bot.` : 'ℹ️ No había un banner de menú personalizado.')
    },
  },
  {
    name: 'welbanner', aliases: ['setwelbanner', 'welcomebanner'], category: 'owner', staffOnly: true,
    description: 'Configura imagen o GIF/video para las bienvenidas.', usage: 'welbanner <cita imagen/GIF>',
    async handler(ctx) { await setBanner(ctx, 'welcome') },
  },
  {
    name: 'byebanner', aliases: ['setbyebanner', 'goodbyebanner'], category: 'owner', staffOnly: true,
    description: 'Configura imagen o GIF/video para las despedidas.', usage: 'byebanner <cita imagen/GIF>',
    async handler(ctx) { await setBanner(ctx, 'goodbye') },
  },
  {
    name: 'delwelbanner', aliases: ['delwelcomebanner'], category: 'owner', staffOnly: true,
    description: 'Restablece la imagen predeterminada de bienvenida.',
    async handler(ctx) { await deleteBrandingAsset('welcome'); await ctx.reply('✅ Banner de bienvenida restablecido al comportamiento predeterminado.') },
  },
  {
    name: 'delbyebanner', aliases: ['delgoodbyebanner'], category: 'owner', staffOnly: true,
    description: 'Restablece la imagen predeterminada de despedida.',
    async handler(ctx) { await deleteBrandingAsset('goodbye'); await ctx.reply('✅ Banner de despedida restablecido al comportamiento predeterminado.') },
  },
  {
    name: 'join', aliases: ['joingroup', 'solicitarjoin'], category: 'general',
    description: 'Solicita al staff que el bot sea añadido a un grupo mediante un enlace de invitación.', usage: 'join <enlace de grupo>',
    async handler(ctx) {
      const code = inviteCode(ctx.argText)
      if (!code) throw new Error('Indica un enlace válido del tipo https://chat.whatsapp.com/...')
      const safeLink = `https://chat.whatsapp.com/${code}`
      const ticket = community.addSuggestion(ctx.sender, ctx.chatId, `[JOIN] ${safeLink}`)
      await ctx.reply([
        '╭━━〔 👥 *SOLICITUD DE GRUPO* 〕━━╮',
        `┃ Ticket » *#${ticket}*`,
        '┃ Estado » *PENDIENTE DE STAFF*',
        '╰━━━━━━━━━━━━━━━━╯',
        '',
        'Por seguridad, Ghost Nexora Bot no entra automáticamente a enlaces enviados por usuarios. Un administrador global puede revisar la solicitud.',
      ].join('\n'))
    },
  },
]
