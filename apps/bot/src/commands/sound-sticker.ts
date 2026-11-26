import type { BotCommand } from '../types.js'
import { iniciarSoundSticker } from '../services/sound-sticker.js'

export const soundStickerCommands: BotCommand[] = [
  {
    name: 'stickersonido',
    aliases: ['ssonido', 'stickersound'],
    category: 'stickers',
    description:
      'Crea un sticker con sonido: responde a un video con sonido, o a una foto/GIF/sticker y luego manda un audio (máx. 10 s).',
    usage: 'stickersonido',
    async handler(ctx) {
      await iniciarSoundSticker(ctx)
    },
  },
]
