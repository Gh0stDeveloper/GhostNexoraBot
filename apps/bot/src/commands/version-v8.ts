import { readFileSync } from 'node:fs'
import type { BotCommand } from '../types.js'
import { config } from '../config.js'

export const BOT_VERSION = (() => {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version?: string }
    return pkg.version?.trim() || 'unknown'
  } catch {
    return 'unknown'
  }
})()

export const BOT_STATUS = 'BETA · EN DESARROLLO'

export const versionV8Commands: BotCommand[] = [{
  name: 'version',
  aliases: ['ver', 'botversion'],
  category: 'general',
  description: 'Muestra la versión actual y la información principal del bot.',
  usage: 'version',
  handler: async (ctx) => ctx.reply([
    '👻 *GHOST NEXORA BOT*',
    '━━━━━━━━━━━━━━',
    `📦 Versión » *v${BOT_VERSION}*`,
    `🛠️ Estado » *${BOT_STATUS}*`,
    `🤖 Nombre » *${ctx.settings.botDisplayName || config.botName}*`,
    `💬 Plataforma » *WhatsApp / Baileys*`,
    `⚙️ Runtime » *Node.js ${process.version}*`,
    `⌨️ Prefijo » *${ctx.prefix}*`,
    `🧩 Instancia » *${ctx.instanceId === undefined ? 'Principal' : `Subbot #${ctx.instanceId}`}*`,
    `🧠 Ollama » *${config.ollamaEnabled ? `ACTIVO · ${config.ollamaModel}` : 'DESACTIVADO'}*`,
    `💬 Respuestas automáticas » *${ctx.settings.automaticResponsesEnabled ? 'ACTIVADAS' : 'DESACTIVADAS'}*`,
    '',
    '🐙 Repositorio » *Gh0stDeveloper/GhostNexoraBot*',
    '👤 Owner » *Gh0stDeveloper*',
  ].join('\n')),
}]
