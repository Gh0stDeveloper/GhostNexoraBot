import type { BotCommand } from '../types.js'

const OWNER_URL = 'https://github.com/Gh0stDeveloper'
const TESTER_URL = 'https://github.com/Lord-oscar'

export const creditsCommands: BotCommand[] = [
  {
    name: 'credits',
    aliases: ['creditos', 'colaboradores', 'team'],
    category: 'general',
    description: 'Muestra los créditos oficiales y el equipo de Ghost Nexora Bot.',
    async handler(ctx) {
      const body = [
        '╭━━〔 👻 *GHOST NEXORA BOT · CRÉDITOS* 〕━━╮',
        '┃',
        '┃ 👑 *Ghost Developer / Nexora*',
        '┃ Rol » Owner · Lead Developer · Maintainer',
        `┃ GitHub » ${OWNER_URL}`,
        '┃',
        '┃ 🧪 *Lord-oscar*',
        '┃ Rol » Official Tester · Support',
        `┃ GitHub » ${TESTER_URL}`,
        '┃',
        '┃ Gracias por probar, reportar y ayudar a mantener',
        '┃ estable la experiencia de Ghost Nexora Bot.',
        '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
      ].join('\n')

      await ctx.reply(body)
    },
  },
]
