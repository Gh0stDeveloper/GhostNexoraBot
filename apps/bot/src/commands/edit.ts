import type { BotCommand, CommandContext } from '../types.js'
import { executeEditMessageIdPoc, isPocChatAllowed } from '../services/security-poc-scope.js'
import { getContextInfo } from '../utils/message.js'

const MAX_EDIT_TEXT = 3500

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function assertBugBountyScope(ctx: CommandContext) {
  if (!ctx.isOwner && !ctx.isBotStaff) {
    throw new Error('Solo el owner y el staff del bot pueden usar este comando.')
  }
  if (!ctx.isGroup) {
    throw new Error('La PoC de edición solo puede ejecutarse dentro de un grupo de pruebas autorizado.')
  }
  if (!isPocChatAllowed(ctx.chatId)) {
    throw new Error(`Este grupo no está autorizado para la PoC. Usa ${ctx.prefix}pocgroup add dentro del grupo primero.`)
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

  // PoC de bug bounty: deliberadamente NO comprueba quién envió el mensaje
  // citado. El alcance operativo lo impone security_poc_chats, administrado
  // mediante .pocgroup desde WhatsApp.
  await executeEditMessageIdPoc(
    ctx.socket as never,
    ctx.chatId,
    targetMessageId,
    newText,
  )

  // Limpia únicamente el comando y la confirmación. No elimina el mensaje
  // objetivo: conservarlo ayuda a documentar la evidencia de la prueba.
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
  aliases: ['editbot', 'editar', 'valleyedit'],
  category: 'owner',
  description: 'PoC de edición por stanzaId limitada a grupos de bug bounty autorizados.',
  usage: 'edit <nuevo texto>',
  staffOnly: true,
  groupOnly: true,
  handler: editQuotedMessagePoc,
}

export const editCommands: BotCommand[] = [editCommand]
export default editCommand
