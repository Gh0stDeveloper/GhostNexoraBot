import type { BotCommand, CommandContext } from '../types.js'
import {
  getAdultRoleplayMessage,
  listAdultRoleplayMessages,
  normalizeAdultRoleplayMessageKey,
  resetAdultRoleplayMessage,
  resetAllAdultRoleplayMessages,
  setAdultRoleplayMessage,
} from '../services/adult-roleplay-messages-v14.js'

function requireStaff(ctx: CommandContext) {
  if (ctx.isOwner || ctx.isBotStaff) return
  throw new Error('Solo el owner o el staff global del bot puede personalizar mensajes +18.')
}

function help(ctx: CommandContext) {
  return [
    '╭━━〔 🔞 *MENSAJES ROLEPLAY +18* 〕━━╮',
    `┃ ${ctx.prefix}adultmsg list`,
    `┃ ${ctx.prefix}adultmsg show <fuck|preñar|cum>`,
    `┃ ${ctx.prefix}adultmsg set <comando> <mensaje>`,
    `┃ ${ctx.prefix}adultmsg reset <comando>`,
    `┃ ${ctx.prefix}adultmsg reset all`,
    '╰━━━━━━━━━━━━━━━━━━━━╯',
    '',
    '*Marcadores disponibles*',
    '• {sender} → quien ejecuta el comando',
    '• {target} → usuario mencionado/respondido',
    '• {command} → nombre del comando',
    '',
    '*Ejemplo*',
    `${ctx.prefix}adultmsg set fuck {sender} inició una escena privada con {target} 💕`,
    '',
    'Para saltos de línea dentro del mensaje puedes escribir \\n.',
    'El mensaje debe conservar {sender} y {target}.',
  ].join('\n')
}

async function adultMsg(ctx: CommandContext) {
  requireStaff(ctx)
  const action = (ctx.args[0] ?? '').toLowerCase()

  if (!action || ['help', 'ayuda', 'menu'].includes(action)) {
    await ctx.reply(help(ctx))
    return
  }

  if (['list', 'lista'].includes(action)) {
    const rows = listAdultRoleplayMessages()
    await ctx.reply([
      '╭━━〔 🔞 *MENSAJES +18 CONFIGURADOS* 〕━━╮',
      ...rows.flatMap((row) => [
        `┃ *.${row.command}* · ${row.customized ? 'PERSONALIZADO' : 'DEFAULT'}`,
        `┃ ${row.template.replace(/\n/g, ' ↵ ')}`,
        '┣━━━━━━━━━━━━━━━━',
      ]),
      '╰━━━━━━━━━━━━━━━━━━━━╯',
      '',
      `Editar: ${ctx.prefix}adultmsg set <comando> <mensaje>`,
    ].join('\n'))
    return
  }

  if (['show', 'ver', 'get'].includes(action)) {
    const requested = ctx.args[1] ?? ''
    const entry = getAdultRoleplayMessage(requested)
    if (!entry) throw new Error('Comando no soportado. Usa fuck, preñar o cum.')
    await ctx.reply([
      `🔞 *MENSAJE DE .${entry.command}*`,
      '━━━━━━━━━━━━━━',
      `Estado: *${entry.customized ? 'PERSONALIZADO' : 'DEFAULT'}*`,
      '',
      entry.template,
      '',
      'Marcadores: {sender} · {target} · {command}',
    ].join('\n'))
    return
  }

  if (['set', 'add', 'poner', 'establecer'].includes(action)) {
    const requested = ctx.args[1] ?? ''
    const canonical = normalizeAdultRoleplayMessageKey(requested)
    if (!canonical) throw new Error('Comando no soportado. Usa fuck, preñar o cum.')
    const template = ctx.args.slice(2).join(' ').trim()
    if (!template) throw new Error(`Uso: ${ctx.prefix}adultmsg set ${canonical} {sender} mensaje {target}`)
    const result = setAdultRoleplayMessage(canonical, template)
    await ctx.reply([
      '✅ *MENSAJE +18 ACTUALIZADO*',
      '━━━━━━━━━━━━━━',
      `Comando: *${ctx.prefix}${result.command}*`,
      '',
      result.template,
      '',
      'Se aplicará desde el próximo uso del comando en esta instancia.',
    ].join('\n'))
    return
  }

  if (['reset', 'restaurar', 'delete', 'del'].includes(action)) {
    const requested = (ctx.args[1] ?? '').trim().toLowerCase()
    if (!requested) throw new Error(`Uso: ${ctx.prefix}adultmsg reset <fuck|preñar|cum|all>`)
    if (['all', 'todo', 'todos'].includes(requested)) {
      resetAllAdultRoleplayMessages()
      await ctx.reply('✅ Todos los mensajes +18 de esta instancia fueron restaurados a sus valores por defecto.')
      return
    }
    const result = resetAdultRoleplayMessage(requested)
    await ctx.reply([
      '✅ *MENSAJE RESTAURADO*',
      '━━━━━━━━━━━━━━',
      `Comando: *${ctx.prefix}${result.command}*`,
      '',
      result.template,
    ].join('\n'))
    return
  }

  throw new Error(help(ctx))
}

export const adultRoleplayMessagesV14Commands: BotCommand[] = [
  {
    name: 'adultmsg',
    aliases: ['18msg', 'nsfwmsg', 'rolemsg', 'adultmessage'],
    category: 'adult',
    description: 'Personaliza los mensajes de roleplay +18. Solo owner/staff.',
    usage: 'adultmsg <list|show|set|reset> ...',
    staffOnly: true,
    handler: adultMsg,
  },
]
