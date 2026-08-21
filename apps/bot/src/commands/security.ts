import type { BotCommand } from '../types.js'
import { economy } from '../services/economy.js'
import { community } from '../services/community.js'

const policyMap = {
  welcome: 'welcome', bienvenida: 'welcome',
  antilink: 'antiLink', links: 'antiLink',
  antispam: 'antiSpam', spam: 'antiSpam',
} as const

function toggle(value?: string) {
  const normalized = (value ?? '').toLowerCase()
  if (['on', 'true', '1', 'enable', 'activar', 'allow', 'permitir'].includes(normalized)) return true
  if (['off', 'false', '0', 'disable', 'desactivar', 'deny', 'bloquear'].includes(normalized)) return false
  throw new Error('Usa on u off.')
}

export const securityCommands: BotCommand[] = [
  {
    name: 'enable', aliases: ['activar'], category: 'groups', groupOnly: true, adminOnly: true,
    description: 'Activa una protección o bienvenida.', usage: 'enable welcome|antilink|antispam',
    async handler(ctx) {
      const raw = (ctx.args[0] ?? '').toLowerCase() as keyof typeof policyMap
      const key = policyMap[raw]
      if (!key) throw new Error(`Uso: ${ctx.prefix}enable welcome|antilink|antispam`)
      const state = economy.setGroupPolicy(ctx.chatId, key, true)
      await ctx.reply(`╭─〔 ✅ *AJUSTE ACTIVADO* 〕\n│ Bienvenida » ${state.welcome ? 'ON' : 'OFF'}\n│ Anti-link » ${state.antiLink ? 'ON' : 'OFF'}\n│ Anti-spam » ${state.antiSpam ? 'ON' : 'OFF'}\n╰──────────────`)
    },
  },
  {
    name: 'disable', aliases: ['desactivar'], category: 'groups', groupOnly: true, adminOnly: true,
    description: 'Desactiva una protección o bienvenida.', usage: 'disable welcome|antilink|antispam',
    async handler(ctx) {
      const raw = (ctx.args[0] ?? '').toLowerCase() as keyof typeof policyMap
      const key = policyMap[raw]
      if (!key) throw new Error(`Uso: ${ctx.prefix}disable welcome|antilink|antispam`)
      economy.setGroupPolicy(ctx.chatId, key, false)
      await ctx.reply(`⛔ *${raw.toUpperCase()}* quedó desactivado en este grupo.`)
    },
  },
  {
    name: 'welcome', aliases: ['bienvenida'], category: 'groups', groupOnly: true, adminOnly: true,
    description: 'Activa o desactiva la bienvenida.', usage: 'welcome on|off',
    async handler(ctx) {
      const enabled = toggle(ctx.args[0])
      economy.setGroupPolicy(ctx.chatId, 'welcome', enabled)
      await ctx.reply(`🌿 *BIENVENIDAS*\n━━━━━━━━━━━━━━\nEstado: *${enabled ? 'ON' : 'OFF'}*`)
    },
  },
  {
    name: 'goodbye', aliases: ['despedida', 'bye'], category: 'groups', groupOnly: true, adminOnly: true,
    description: 'Activa o desactiva la despedida del grupo.', usage: 'goodbye on|off',
    async handler(ctx) {
      const enabled = toggle(ctx.args[0])
      community.setGoodbyeEnabled(ctx.chatId, enabled)
      await ctx.reply(`🍂 *DESPEDIDAS*\n━━━━━━━━━━━━━━\nEstado: *${enabled ? 'ON' : 'OFF'}*`)
    },
  },
  {
    name: 'setwelcome', aliases: ['setbienvenida'], category: 'groups', groupOnly: true, adminOnly: true,
    description: 'Personaliza el mensaje de bienvenida. Variables: $user, $namegroup.', usage: 'setwelcome <frase>|reset',
    async handler(ctx) {
      const text = ctx.argText.trim()
      if (!text) throw new Error(`Uso: ${ctx.prefix}setwelcome Bienvenido $user a $namegroup`)
      const reset = text.toLowerCase() === 'reset'
      community.setGroupMessage(ctx.chatId, 'welcome', reset ? null : text)
      await ctx.reply(reset ? '🌿 Mensaje de bienvenida restaurado al diseño predeterminado.' : '🌿 Mensaje de bienvenida personalizado y guardado.')
    },
  },
  {
    name: 'setgoodbye', aliases: ['setdespedida'], category: 'groups', groupOnly: true, adminOnly: true,
    description: 'Personaliza el mensaje de despedida. Variables: $user, $namegroup.', usage: 'setgoodbye <frase>|reset',
    async handler(ctx) {
      const text = ctx.argText.trim()
      if (!text) throw new Error(`Uso: ${ctx.prefix}setgoodbye Hasta pronto $user`)
      const reset = text.toLowerCase() === 'reset'
      community.setGroupMessage(ctx.chatId, 'goodbye', reset ? null : text)
      await ctx.reply(reset ? '🍂 Mensaje de despedida restaurado al diseño predeterminado.' : '🍂 Mensaje de despedida personalizado y guardado.')
    },
  },
  {
    name: 'antilink', aliases: ['antilinks'], category: 'groups', groupOnly: true, adminOnly: true,
    description: 'Activa o desactiva el anti-link.', usage: 'antilink on|off',
    async handler(ctx) {
      const enabled = toggle(ctx.args[0])
      economy.setGroupPolicy(ctx.chatId, 'antiLink', enabled)
      await ctx.reply(`🔗 *ANTI-LINK*\n━━━━━━━━━━━━━━\nEstado: *${enabled ? 'ON' : 'OFF'}*`)
    },
  },
  {
    name: 'nsfw', aliases: ['adult', 'adultgroup'], category: 'adult', groupOnly: true, adminOnly: true,
    description: 'Permite o bloquea los comandos NSFW en el grupo.', usage: 'nsfw on|off',
    async handler(ctx) {
      const action = (ctx.args[0] ?? '').toLowerCase()
      if (action === 'status') {
        const state = economy.getGroupPolicy(ctx.chatId)
        await ctx.reply(`🔞 *NSFW DEL GRUPO*\n━━━━━━━━━━━━━━\nEstado: *${state.adultAllowed ? 'ON' : 'OFF'}*`)
        return
      }
      const enabled = toggle(action)
      economy.setGroupPolicy(ctx.chatId, 'adultAllowed', enabled)
      await ctx.reply(`🔞 *NSFW DEL GRUPO*\n━━━━━━━━━━━━━━\nEstado: *${enabled ? 'ON' : 'OFF'}*\nEl módulo global también debe estar habilitado por el staff.`)
    },
  },
]
