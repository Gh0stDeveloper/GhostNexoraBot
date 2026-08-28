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
    description: 'Detecta mensajes de ver una vez y avisa que el modo está activo; no copia ni republica el contenido efímero.',
    usage: 'antiviewonce on|off|status',
    async handler(ctx) {
      requireGroupAdmin(ctx)
      const action = (ctx.args[0] ?? 'status').toLowerCase()
      if (!['on', 'off', 'status', 'activar', 'desactivar'].includes(action)) throw new Error(`Uso: ${ctx.prefix}antiviewonce on|off|status`)
      if (action === 'status') {
        await ctx.reply(`👁️ *ANTI VER UNA VEZ*\n━━━━━━━━━━━━━━\nEstado: *${groupControlsV9.get(ctx.chatId).antiViewOnce ? 'ACTIVO' : 'INACTIVO'}*`)
        return
      }
      const enabled = action === 'on' || action === 'activar'
      groupControlsV9.setAntiViewOnce(ctx.chatId, enabled)
      await ctx.reply(enabled
        ? '👁️ *ANTI VER UNA VEZ ACTIVADO*\n━━━━━━━━━━━━━━\nEl bot detectará mensajes de “ver una vez” en este grupo y mostrará un aviso.\n\nPor privacidad, el contenido efímero no se copia ni se republica automáticamente.'
        : '👁️ *ANTI VER UNA VEZ DESACTIVADO*\n━━━━━━━━━━━━━━\nEl bot dejará de procesar avisos relacionados con “ver una vez”.')
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
      if (!['on', 'off', 'status', 'activar', 'desactivar'].includes(action)) throw new Error(`Uso: ${ctx.prefix}botrestricted on|off|status`)
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
