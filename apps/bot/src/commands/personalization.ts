import type { BotCommand } from '../types.js'
import { downloadMessageMedia } from '../utils/message.js'
import { community } from '../services/community.js'
import { sendInteractiveCard } from '../services/interactive.js'

function inviteCode(input: string) {
  const text = input.trim()
  const match = /(?:https?:\/\/)?chat\.whatsapp\.com\/([A-Za-z0-9_-]{10,40})/i.exec(text)
  return match?.[1] ?? null
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
        body: 'La nueva foto ya pertenece a la cuenta WhatsApp del bot y será la misma que aparecerá en el menú.',
        imageUrl: current,
        buttons: [{ type: 'reply', text: '📋 Ver menú', id: `${ctx.prefix}menu` }],
      })
    },
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
