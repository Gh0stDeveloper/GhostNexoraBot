import type { NeutralBotCommand } from '../types.js'

const OWNER_URL = 'https://github.com/Gh0stDeveloper'
const PROJECT_URL = 'https://github.com/Gh0stDeveloper/GhostNexoraBot'
const OWNER_EMAIL = 'ghostnexora@gmail.com'
const OWNER_TELEGRAM = 'https://t.me/Gh0stDeveloper'
const LORD_OSCAR_URL = 'https://github.com/Lord-oscar'
const WAKASAURIO_URL = 'https://github.com/Wakasaurio'

export const creditsCommands: NeutralBotCommand[] = [
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
        `┃ Email » ${OWNER_EMAIL}`,
        `┃ Telegram » ${OWNER_TELEGRAM}`,
        '┃',
        '┃ 🧪 *Lord-oscar*',
        '┃ Rol » Tester oficial · Soporte oficial',
        `┃ GitHub » ${LORD_OSCAR_URL}`,
        '┃',
        '┃ 🧪 *Wakasaurio*',
        '┃ Rol » Tester oficial · Soporte oficial',
        `┃ GitHub » ${WAKASAURIO_URL}`,
        '┃',
        '┃ 📦 *Proyecto oficial*',
        '┃ Nombre » Ghost Nexora Bot',
        '┃ Desarrollo » Ghost Developer / Nexora',
        `┃ Repositorio » ${PROJECT_URL}`,
        '┃',
        '┃ Gracias al equipo de testing y soporte por probar,',
        '┃ reportar incidencias y ayudar a mantener estable el bot.',
        '╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯',
      ].join('\n')

      await ctx.reply(body)
    },
  },
]
