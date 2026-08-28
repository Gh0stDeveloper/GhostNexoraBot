import type { BotCommand } from '../types.js'
import { shareTelegramMessage, telegramBridgeConfigured } from '../services/telegram-bridge-v7.js'

export const telegramBridgeV7Commands: BotCommand[] = [
  {
    name: 'tgshare',
    aliases: ['telegramshare', 'tgforward', 'telepost'],
    category: 'tools',
    description: 'Reenvía a WhatsApp un mensaje capturado de tu canal de Telegram y añade el canal oficial de WhatsApp.',
    usage: 'tgshare <message_id>',
    handler: async (ctx) => {
      if (!telegramBridgeConfigured()) throw new Error('El puente Telegram todavía no está configurado en el .env.')
      const id = Number(ctx.args[0])
      if (!Number.isInteger(id) || id <= 0) throw new Error(`Uso: ${ctx.prefix}tgshare <message_id>`)
      await shareTelegramMessage(ctx.socket, ctx.chatId, id, ctx.message)
    },
  },
  {
    name: 'tgstatus',
    aliases: ['telegramstatus'],
    category: 'tools',
    description: 'Comprueba si el puente Telegram está configurado.',
    usage: 'tgstatus',
    handler: async (ctx) => ctx.reply(`📡 *TELEGRAM BRIDGE*\n━━━━━━━━━━━━━━\nEstado: *${telegramBridgeConfigured() ? 'CONFIGURADO' : 'NO CONFIGURADO'}*`),
  },
]
