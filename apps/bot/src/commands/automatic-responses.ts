import type { BotCommand } from '../types.js'

export const automaticResponseCommands: BotCommand[] = [
  {
    name: 'autorespuestas',
    aliases: ['autorespuesta', 'respuestasauto', 'automaticresponses'],
    category: 'general',
    ownerOnly: true,
    description: 'Activa o desactiva las respuestas automáticas del bot sin cambiar Ollama.',
    usage: 'autorespuestas <on|off|status>',
    async handler(ctx) {
      const action = (ctx.args[0] ?? 'status').toLowerCase()

      if (['on', 'activar', 'enable', 'encender'].includes(action)) {
        await ctx.settings.setAutomaticResponsesEnabled(true)
        await ctx.reply([
          '🟢 *RESPUESTAS AUTOMÁTICAS ACTIVADAS*',
          '━━━━━━━━━━━━━━',
          'El bot podrá volver a responder espontáneamente a mensajes compatibles.',
          '',
          'Este ajuste es independiente de Ollama y no modifica la IA local.',
        ].join('\n'))
        return
      }

      if (['off', 'desactivar', 'disable', 'apagar'].includes(action)) {
        await ctx.settings.setAutomaticResponsesEnabled(false)
        await ctx.reply([
          '🔴 *RESPUESTAS AUTOMÁTICAS DESACTIVADAS*',
          '━━━━━━━━━━━━━━',
          'El bot dejará de enviar respuestas espontáneas automáticas.',
          '',
          'Ollama, los comandos de IA, las reacciones y los stickers conservan su estado actual.',
        ].join('\n'))
        return
      }

      if (['status', 'estado'].includes(action)) {
        await ctx.reply([
          '⚙️ *RESPUESTAS AUTOMÁTICAS*',
          '━━━━━━━━━━━━━━',
          `Estado: *${ctx.settings.automaticResponsesEnabled ? 'ACTIVADAS' : 'DESACTIVADAS'}*`,
          'Control: independiente de Ollama.',
          '',
          `Uso: ${ctx.prefix}autorespuestas on|off|status`,
        ].join('\n'))
        return
      }

      throw new Error(`Uso: ${ctx.prefix}autorespuestas on|off|status`)
    },
  },
  {
    name: 'reaccioneshumanas',
    aliases: ['humanreact', 'autoreact', 'reaccionesauto'],
    category: 'general',
    ownerOnly: true,
    description: 'Activa o desactiva las reacciones humanas/contextuales. Por defecto están desactivadas.',
    usage: 'reaccioneshumanas <on|off|status>',
    async handler(ctx) {
      const action = (ctx.args[0] ?? 'status').toLowerCase()

      if (['on', 'activar', 'enable', 'encender'].includes(action)) {
        await ctx.settings.setHumanReactionsEnabled(true)
        await ctx.reply([
          '🟢 *REACCIONES HUMANAS ACTIVADAS*',
          '━━━━━━━━━━━━━━',
          'El bot podrá reaccionar de forma contextual a mensajes normales.',
          '',
          'Las reacciones de estado de comandos (⚡/✅/❌/🚫) son independientes.',
          'Los stickers también son independientes.',
        ].join('\n'))
        return
      }

      if (['off', 'desactivar', 'disable', 'apagar'].includes(action)) {
        await ctx.settings.setHumanReactionsEnabled(false)
        await ctx.reply([
          '🔴 *REACCIONES HUMANAS DESACTIVADAS*',
          '━━━━━━━━━━━━━━',
          'El bot no reaccionará automáticamente a mensajes normales.',
          '',
          'Las reacciones de estado de comandos y los stickers siguen funcionando.',
        ].join('\n'))
        return
      }

      if (['status', 'estado'].includes(action)) {
        await ctx.reply([
          '⚙️ *REACCIONES HUMANAS*',
          '━━━━━━━━━━━━━━',
          `Estado: *${ctx.settings.humanReactionsEnabled ? 'ACTIVADAS' : 'DESACTIVADAS'}*`,
          'Predeterminado: *DESACTIVADAS*',
          'Comandos: ⚡/✅/❌/🚫 independientes.',
          'Stickers: independientes.',
          '',
          `Uso: ${ctx.prefix}reaccioneshumanas on|off|status`,
        ].join('\n'))
        return
      }

      throw new Error(`Uso: ${ctx.prefix}reaccioneshumanas on|off|status`)
    },
  },
]
