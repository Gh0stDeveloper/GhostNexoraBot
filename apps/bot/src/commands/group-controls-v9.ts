import type { BotCommand, CommandContext } from '../types.js'
import { groupControlsV9 } from '../services/group-controls-v9.js'

function requireGroupAdmin(ctx: CommandContext) {
  if (!ctx.isGroup) throw new Error('Este comando solo funciona en grupos.')
  if (!ctx.isOwner && !ctx.isBotStaff) {
    throw new Error('Necesitas ser administrador del grupo o staff del bot.')
  }
}

export const groupControlsV9Commands: BotCommand[] = [
  {
    name: 'antiviewonce',
    aliases: ['anti-viewonce', 'aviewonce', 'antiveruna', 'antiverunauna'],
    category: 'groups',
    groupOnly: true,
    adminOnly: true,
    description: 'Cuando está activo, el bot descarga fotos/videos “ver una vez” y los reenvía al grupo como media normal.',
    usage: 'antiviewonce on|off|status',
    async handler(ctx) {
      requireGroupAdmin(ctx)
      const action = (ctx.args[0] ?? 'status').toLowerCase()
      if (!['on', 'off', 'status', 'activar', 'desactivar'].includes(action)) {
        throw new Error(`Uso: ${ctx.prefix}antiviewonce on|off|status`)
      }

      if (action === 'status') {
        const on = groupControlsV9.get(ctx.chatId).antiViewOnce
        await ctx.reply([
          '👁️ *ANTI VER UNA VEZ*',
          '━━━━━━━━━━━━━━',
          `Estado: *${on ? 'ACTIVO' : 'INACTIVO'}*`,
          on
            ? 'Las fotos y videos “ver una vez” se reenvían al chat como media normal.'
            : 'El bot no procesa mensajes “ver una vez”.',
        ].join('\n'))
        return
      }

      const enabled = action === 'on' || action === 'activar'
      groupControlsV9.setAntiViewOnce(ctx.chatId, enabled)
      await ctx.reply(enabled
        ? [
            '👁️ *ANTI VER UNA VEZ ACTIVADO*',
            '━━━━━━━━━━━━━━',
            'Cuando alguien envíe una foto o video “ver una vez”, el bot lo descargará',
            'y lo publicará de nuevo en el grupo como imagen o video normal.',
          ].join('\n')
        : [
            '👁️ *ANTI VER UNA VEZ DESACTIVADO*',
            '━━━━━━━━━━━━━━',
            'El bot dejará de republicar mensajes “ver una vez”.',
          ].join('\n'))
    },
  },
  {
    name: 'botrestricted',
    aliases: ['botonly', 'restrictedbot', 'modosilencioso', 'botsilencio'],
    category: 'groups',
    groupOnly: true,
    adminOnly: true,
    description: 'Restringe el bot en este grupo: los comandos de usuarios normales se ignoran silenciosamente; admins/staff/owner pueden seguir usándolo. Bienvenidas y despedidas continúan funcionando.',
    usage: 'botrestricted on|off|status',
    async handler(ctx) {
      requireGroupAdmin(ctx)
      const action = (ctx.args[0] ?? 'status').toLowerCase()
      if (!['on', 'off', 'status', 'activar', 'desactivar'].includes(action)) {
        throw new Error(`Uso: ${ctx.prefix}botrestricted on|off|status`)
      }
      if (action === 'status') {
        await ctx.reply(`🔇 *MODO RESTRINGIDO*\n━━━━━━━━━━━━━━\nEstado: *${groupControlsV9.get(ctx.chatId).restrictedMode ? 'ACTIVO' : 'INACTIVO'}*\n\n${groupControlsV9.get(ctx.chatId).restrictedMode ? 'Los comandos de usuarios normales son ignorados sin respuesta.' : 'Todos los usuarios pueden usar los comandos permitidos.'}`)
        return
      }
      const enabled = action === 'on' || action === 'activar'
      groupControlsV9.setRestrictedMode(ctx.chatId, enabled)
      await ctx.reply(enabled
        ? '🔇 *MODO RESTRINGIDO ACTIVADO*\n━━━━━━━━━━━━━━\nLos comandos de usuarios normales serán ignorados silenciosamente.\nAdmins del grupo, staff y owner mantienen acceso.\nBienvenidas y despedidas siguen funcionando.'
        : '🔊 *MODO RESTRINGIDO DESACTIVADO*\n━━━━━━━━━━━━━━\nLos comandos vuelven a funcionar según los permisos habituales.')
    },
  },
]
