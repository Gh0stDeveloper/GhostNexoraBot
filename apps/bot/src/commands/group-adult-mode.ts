import type { BotCommand } from '../types.js'
import { economy } from '../services/economy.js'

function toggle(value?: string) {
  const normalized = (value ?? '').toLowerCase()
  if (['on', 'true', '1', 'enable', 'activar', 'allow', 'permitir'].includes(normalized)) return true
  if (['off', 'false', '0', 'disable', 'desactivar', 'deny', 'bloquear'].includes(normalized)) return false
  throw new Error('Usa on, off o status.')
}

export const groupAdultModeCommands: BotCommand[] = [
  {
    name: 'adultmode',
    aliases: ['adultgroupmode'],
    category: 'adult',
    groupOnly: true,
    adminOnly: true,
    description: 'Activa o desactiva el módulo adulto únicamente en el grupo actual.',
    usage: 'adultmode on|off|status',
    async handler(ctx) {
      const action = (ctx.args[0] ?? 'status').toLowerCase()
      if (action === 'status') {
        const policy = economy.getGroupPolicy(ctx.chatId)
        await ctx.reply([
          '🔞 *MODO ADULTO · ESTE GRUPO*',
          '━━━━━━━━━━━━━━',
          `Estado: *${policy.adultAllowed ? 'ON' : 'OFF'}*`,
          'Este ajuste no modifica ningún otro grupo.',
        ].join('\n'))
        return
      }
      const enabled = toggle(action)
      economy.setGroupPolicy(ctx.chatId, 'adultAllowed', enabled)
      await ctx.reply([
        '🔞 *MODO ADULTO · ESTE GRUPO*',
        '━━━━━━━━━━━━━━',
        `Estado: *${enabled ? 'ON' : 'OFF'}*`,
        '✅ El cambio se guardó solo para este grupo.',
        `Los demás grupos conservan su propia configuración con ${ctx.prefix}adultmode status.`,
      ].join('\n'))
    },
  },
]
