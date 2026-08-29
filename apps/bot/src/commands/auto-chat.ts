import type { BotCommand } from '../types.js'
import { autoChat } from '../services/auto-chat.js'

export const autoChatCommands: BotCommand[] = [
  {
    name: 'autochat',
    aliases: ['liberar', 'chatlibre', 'conversacion'],
    category: 'general',
    ownerOnly: true,
    description: 'Activa o desactiva la conversación libre del bot en el chat actual.',
    usage: 'autochat <on|off|status>',
    async handler(ctx) {
      const action = (ctx.args[0] ?? 'status').toLowerCase()
      if (action === 'on' || action === 'activar') {
        autoChat.setEnabled(ctx.chatId, true)
        await ctx.reply('🟢 *CONVERSACIÓN LIBRE ACTIVADA*\n━━━━━━━━━━━━━━\nResponderé mensajes normales en este chat como parte de la conversación.\n\nUsa *' + ctx.prefix + 'autochat off* para detenerlo.')
        return
      }
      if (action === 'off' || action === 'desactivar') {
        autoChat.setEnabled(ctx.chatId, false)
        await ctx.reply('🔴 *CONVERSACIÓN LIBRE DESACTIVADA*\n━━━━━━━━━━━━━━\nVolveré a responder mediante comandos y funciones normales.')
        return
      }
      if (action === 'status' || action === 'estado') {
        await ctx.reply(`🧠 *CONVERSACIÓN LIBRE*\n━━━━━━━━━━━━━━\nEstado en este chat: *${autoChat.isEnabled(ctx.chatId) ? 'ACTIVADA' : 'DESACTIVADA'}*\n\nUso: ${ctx.prefix}autochat on|off|status`)
        return
      }
      throw new Error(`Uso: ${ctx.prefix}autochat on|off|status`)
    },
  },
]
