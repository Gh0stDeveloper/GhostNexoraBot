import type { BotCommand } from '../types.js'
import { economy } from '../services/economy.js'

const policyMap = {
  welcome: 'welcome', bienvenida: 'welcome',
  antilink: 'antiLink', links: 'antiLink',
  antispam: 'antiSpam', spam: 'antiSpam',
} as const

export const securityCommands: BotCommand[] = [
  {
    name: 'enable', aliases: ['activar'], category: 'groups', groupOnly: true, adminOnly: true,
    description: 'Activa una protección o bienvenida.', usage: 'enable welcome|antilink|antispam',
    async handler(ctx) {
      const raw = (ctx.args[0] ?? '').toLowerCase() as keyof typeof policyMap
      const key = policyMap[raw]
      if (!key) throw new Error(`Uso: ${ctx.prefix}enable welcome|antilink|antispam`)
      const state = economy.setGroupPolicy(ctx.chatId, key, true)
      await ctx.reply(`✅ *${raw}* activado.\n\nBienvenida: ${state.welcome ? 'ON' : 'OFF'}\nAntilink: ${state.antiLink ? 'ON' : 'OFF'}\nAntispam: ${state.antiSpam ? 'ON' : 'OFF'}`)
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
      await ctx.reply(`⛔ *${raw}* desactivado en este grupo.`)
    },
  },
  {
    name: 'adult', aliases: ['adultgroup'], category: 'owner', groupOnly: true, adminOnly: true,
    description: 'Permite o bloquea el módulo 18+ en un grupo específico.', usage: 'adult allow|deny|status',
    async handler(ctx) {
      const action = (ctx.args[0] ?? 'status').toLowerCase()
      if (action === 'status') {
        const state = economy.getGroupPolicy(ctx.chatId)
        await ctx.reply(`🔞 Módulo 18+ en este grupo: *${state.adultAllowed ? 'PERMITIDO' : 'BLOQUEADO'}*.\nEl ajuste requiere además que el owner haya habilitado globalmente el módulo.`)
        return
      }
      if (!['allow', 'permitir', 'deny', 'bloquear'].includes(action)) throw new Error(`Uso: ${ctx.prefix}adult allow|deny|status`)
      const enabled = action === 'allow' || action === 'permitir'
      economy.setGroupPolicy(ctx.chatId, 'adultAllowed', enabled)
      await ctx.reply(enabled
        ? '🔞 Este grupo quedó en la allowlist 18+. Los administradores siguen siendo responsables de las reglas del grupo.'
        : '🛡️ Módulo 18+ bloqueado en este grupo.')
    },
  },
]
