import type { BotCommand } from '../types.js'
import { ejecutarGet, ejecutarRelay } from '../services/message-inspect.js'

export const messageInspectCommands: BotCommand[] = [
  {
    name: 'get',
    aliases: ['json'],
    category: 'tools',
    description:
      'Devuelve el JSON del mensaje o sticker al que respondes. Ese JSON es el que usa .relay.',
    usage: 'get',
    async handler(ctx) {
      await ejecutarGet(ctx)
    },
  },
  {
    name: 'relay',
    aliases: ['reenviar'],
    category: 'tools',
    description:
      'Vuelve a enviar un mensaje o sticker desde su JSON. Responde al mensaje con el JSON, o pega el JSON junto al comando.',
    usage: 'relay',
    async handler(ctx) {
      await ejecutarRelay(ctx)
    },
  },
]
