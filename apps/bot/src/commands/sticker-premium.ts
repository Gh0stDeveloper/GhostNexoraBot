import type { BotCommand } from '../types.js'
import { ejecutarStickerPremium } from '../services/message-inspect.js'

export const stickerPremiumCommands: BotCommand[] = [
  {
    name: 'stickerpremium',
    aliases: ['premium'],
    category: 'stickers',
    description:
      'Vuelve a enviar un sticker con premium en 1. Responde a un sticker o a su JSON.',
    usage: 'stickerpremium',
    async handler(ctx) {
      await ejecutarStickerPremium(ctx)
    },
  },
]
