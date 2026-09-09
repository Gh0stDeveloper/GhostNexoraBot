import type { BotCommand, CommandContext } from '../types.js'
import { digitsFromJid, getContextInfo } from '../utils/message.js'

const MAX_EDIT_TEXT = 3500

function jidBase(value?: string | null) {
  return (value ?? '').replace(/:\d+@/, '@')
}

function sameIdentity(left?: string | null, right?: string | null) {
  const a = jidBase(left)
  const b = jidBase(right)
  if (a && b && a === b) return true
  const ad = digitsFromJid(a)
  const bd = digitsFromJid(b)
  return Boolean(ad && bd && ad === bd)
}

function botIdentityCandidates(ctx: CommandContext) {
  const me = ctx.socket.authState.creds.me
  return [ctx.socket.user?.id, me?.id, me?.lid]
    .filter((value): value is string => Boolean(value))
}

async function tryDeleteCommandMessage(ctx: CommandContext) {
  if (!ctx.message.key.id) return
  // En grupos WhatsApp solo permitirá borrar el mensaje del staff si esta
  // instancia tiene permisos suficientes. La edición ya realizada no debe
  // considerarse fallida si el borrado de la orden no está permitido.
  await ctx.socket.sendMessage(ctx.chatId, { delete: ctx.message.key }).catch(() => undefined)
}

async function editQuotedBotMessage(ctx: CommandContext) {
  // Defensa en profundidad: el router ya aplica staffOnly, pero este handler no
  // debe volverse utilizable por usuarios normales aunque en el futuro se invoque
  // desde otra superficie.
  if (!ctx.isOwner && !ctx.isBotStaff) {
    throw new Error('Solo el owner y el staff del bot pueden usar este comando.')
  }

  const context = getContextInfo(ctx.message)
  const stanzaId = context?.stanzaId
  const quotedMessage = context?.quotedMessage
  const newText = ctx.argText.trim()

  if (!stanzaId || !quotedMessage) {
    throw new Error('Responde a un mensaje enviado por esta instancia del bot para editarlo.')
  }
  if (!newText) {
    throw new Error(`Uso: ${ctx.prefix}edit <nuevo texto>, respondiendo al mensaje del bot.`)
  }
  if (newText.length > MAX_EDIT_TEXT) {
    throw new Error(`El texto editado está limitado a ${MAX_EDIT_TEXT} caracteres.`)
  }

  const quotedSender = context.participant
  const botIds = botIdentityCandidates(ctx)

  // En grupos el participant del mensaje citado debe ser esta misma instancia.
  // En privados WhatsApp puede omitir participant; si viene presente también se
  // valida. Esto evita intentar editar mensajes escritos por otra persona.
  if (quotedSender && !botIds.some((id) => sameIdentity(id, quotedSender))) {
    throw new Error('Solo puedo editar mensajes enviados por esta propia instancia del bot.')
  }
  if (ctx.isGroup && !quotedSender) {
    throw new Error('No pude verificar que el mensaje citado pertenezca a esta instancia.')
  }

  const editKey = {
    remoteJid: ctx.chatId,
    fromMe: true,
    id: stanzaId,
  }

  await ctx.socket.sendMessage(ctx.chatId, {
    text: newText,
    edit: editKey,
  })

  await tryDeleteCommandMessage(ctx)
}

const editCommand: BotCommand = {
  name: 'edit',
  aliases: ['editbot', 'editar'],
  category: 'owner',
  description: 'Edita un mensaje enviado previamente por esta instancia del bot.',
  usage: 'edit <nuevo texto>',
  staffOnly: true,
  handler: editQuotedBotMessage,
}

export const editCommands: BotCommand[] = [editCommand]
export default editCommand
