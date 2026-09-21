import type { BotCommand } from '../types.js'

export const humanReactionCommands: BotCommand[] = [
  {
    name: 'reaccioneshumanas',
    aliases: ['reaccionhumana', 'humanreact', 'autoreact'],
    category: 'owner',
    ownerOnly: true,
    description: 'Activa o desactiva las reacciones humanas automáticas. Por seguridad inician apagadas.',
    usage: 'reaccioneshumanas <on|off|status>',
    async handler(ctx) {
      const action = (ctx.args[0] ?? 'status').toLowerCase()

      if (['on', 'activar', 'enable', 'encender'].includes(action)) {
        await ctx.settings.setHumanReactionsEnabled(true)
        await ctx.reply([
          '🟢 *REACCIONES HUMANAS ACTIVADAS*',
          '━━━━━━━━━━━━━━',
          'El bot podrá reaccionar ocasionalmente a mensajes normales.',
          'Las reacciones de estado de comandos ⚡/✅/🚫/❌ son independientes.',
          '',
          'Para apagar: ' + ctx.prefix + 'reaccioneshumanas off',
        ].join('\n'))
        return
      }

      if (['off', 'desactivar', 'disable', 'apagar'].includes(action)) {
        await ctx.settings.setHumanReactionsEnabled(false)
        await ctx.reply([
          '🔴 *REACCIONES HUMANAS DESACTIVADAS*',
          '━━━━━━━━━━━━━━',
          'El bot ya no reaccionará automáticamente a mensajes normales.',
          'Los stickers automáticos y las reacciones de estado de comandos conservan su funcionamiento.',
        ].join('\n'))
        return
      }

      if (['status', 'estado'].includes(action)) {
        await ctx.reply([
          '⚙️ *REACCIONES HUMANAS*',
          '━━━━━━━━━━━━━━',
          'Estado: *' + (ctx.settings.humanReactionsEnabled ? 'ACTIVADAS' : 'DESACTIVADAS') + '*',
          'Predeterminado seguro: *DESACTIVADAS*',
          '',
          'Uso: ' + ctx.prefix + 'reaccioneshumanas on|off|status',
        ].join('\n'))
        return
      }

      throw new Error('Uso: ' + ctx.prefix + 'reaccioneshumanas on|off|status')
    },
  },
]
