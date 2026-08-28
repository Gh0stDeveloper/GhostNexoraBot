import type { BotCommand } from '../types.js'
export const BOT_VERSION = '0.0.7c'
export const BOT_STATUS = 'BETA · EN CONSTRUCCIÓN · MEJORANDO COMANDOS'
export const versionV8Commands: BotCommand[] = [{ name: 'version', aliases: ['ver', 'botversion'], category: 'general', description: 'Muestra la versión beta actual.', usage: 'version', handler: async (ctx) => ctx.reply(`👻 *GHOST NEXORA BOT*\n━━━━━━━━━━━━━━\n📦 Versión » *${BOT_VERSION}*\n🛠️ Estado » *${BOT_STATUS}*\n\nSeguimos agregando funciones y corrigiendo comandos.`) }]
