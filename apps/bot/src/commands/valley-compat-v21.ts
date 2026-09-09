import vm from 'node:vm'
import type { BotCommand, CommandContext } from '../types.js'
import { canSendToChatJid } from '../services/private-chat-policy.js'
import { digitsFromJid, getContextInfo, unwrapMessage } from '../utils/message.js'
import { resolveTarget } from '../utils/target.js'

// Funciones inspiradas por los proyectos MIT de VALLEY-STUDIOS. Se reimplementan
// sobre la arquitectura de Ghost Nexora Bot y deliberadamente no reutilizan las
// técnicas de colisión/spoof de messageId usadas para aparentar que otro miembro
// escribió o editó contenido.

const MAX_TEXT_CHUNK = 3200

function requirePrivate(ctx: CommandContext) {
  if (ctx.isGroup) throw new Error('Este comando solo está disponible en el chat privado autorizado con esta instancia.')
}

async function sendChunks(ctx: CommandContext, text: string) {
  const value = text || '(vacío)'
  for (let offset = 0; offset < value.length; offset += MAX_TEXT_CHUNK) {
    const chunk = value.slice(offset, offset + MAX_TEXT_CHUNK)
    await ctx.socket.sendMessage(ctx.chatId, { text: chunk }, offset === 0 ? { quoted: ctx.message } : undefined)
  }
}

function safeClone(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'bigint') return `${value}n`
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return `<binary ${value.byteLength} bytes>`
  if (typeof value === 'function') return `<function ${value.name || 'anonymous'}>`
  if (typeof value !== 'object') return String(value)
  if (depth >= 8) return '<max-depth>'
  if (seen.has(value as object)) return '<circular>'
  seen.add(value as object)
  if (Array.isArray(value)) return value.slice(0, 200).map((entry) => safeClone(entry, depth + 1, seen))

  const output: Record<string, unknown> = {}
  let count = 0
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (count >= 200) {
      output.__truncated__ = true
      break
    }
    output[key] = safeClone(child, depth + 1, seen)
    count += 1
  }
  return output
}

function safeJson(value: unknown) {
  return JSON.stringify(safeClone(value), null, 2)
}

function quotedContent(ctx: CommandContext) {
  return unwrapMessage(getContextInfo(ctx.message)?.quotedMessage)
}

function messageType(content: ReturnType<typeof quotedContent>) {
  if (!content) return ''
  const key = Object.keys(content).find((name) => (content as Record<string, unknown>)[name] != null)
  return key ?? ''
}

function quotedText(ctx: CommandContext) {
  const content = quotedContent(ctx)
  if (!content) return ''
  return (content.conversation
    ?? content.extendedTextMessage?.text
    ?? content.imageMessage?.caption
    ?? content.videoMessage?.caption
    ?? content.documentMessage?.caption
    ?? '').trim()
}

async function participatingGroups(ctx: CommandContext) {
  return ctx.socket.groupFetchAllParticipating()
}

async function ownedGroup(ctx: CommandContext, groupJid: string) {
  if (!/^\d+@g\.us$/i.test(groupJid)) throw new Error('JID de grupo inválido. Debe terminar en @g.us.')
  const groups = await participatingGroups(ctx)
  if (!Object.prototype.hasOwnProperty.call(groups, groupJid)) throw new Error('Esta instancia no pertenece a ese grupo.')
  return ctx.socket.groupMetadata(groupJid)
}

function participantJid(participant: { id?: string | null; phoneNumber?: string | null; lid?: string | null }) {
  return participant.phoneNumber || participant.id || participant.lid || ''
}

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

function textAfterTarget(ctx: CommandContext, target: string) {
  const context = getContextInfo(ctx.message)
  if (context?.mentionedJid?.length) return ctx.argText.replace(/^@\S+\s*/u, '').trim()
  if (context?.participant) return ctx.argText.trim()
  const first = ctx.args[0] ?? ''
  if (first && digitsFromJid(target) && first.replace(/\D/g, '') === digitsFromJid(target)) return ctx.args.slice(1).join(' ').trim()
  return ctx.argText.trim()
}

async function sendPrivateTarget(ctx: CommandContext, target: string, text: string, groupLabel: string) {
  if (!canSendToChatJid(target, ctx.instanceOwnerJid)) {
    throw new Error(`El destino no está autorizado para privados en esta instancia. El owner debe autorizarlo primero con ${ctx.prefix}private allow @usuario.`)
  }
  const delivered = await ctx.socket.sendMessage(target, {
    text: [
      '🤫 *MENSAJE PRIVADO DE GRUPO*',
      `Grupo: *${groupLabel}*`,
      `De: *${ctx.pushName}*`,
      '',
      text,
    ].join('\n'),
  })
  if (!delivered) throw new Error('El firewall privado de la instancia rechazó el destino.')
}

async function groupsCommand(ctx: CommandContext) {
  requirePrivate(ctx)
  const groups = await participatingGroups(ctx)
  const rows = Object.entries(groups).sort((a, b) => (a[1].subject ?? '').localeCompare(b[1].subject ?? '', 'es'))
  if (!rows.length) {
    await ctx.reply('La instancia no participa actualmente en ningún grupo.')
    return
  }
  const lines = ['*GRUPOS DE ESTA INSTANCIA*', `Total: *${rows.length}*`, '']
  for (const [jid, group] of rows) {
    lines.push(`*${group.subject || 'Sin nombre'}*`, `JID: \`${jid}\``, `Miembros: ${group.participants?.length ?? 0}`, '')
  }
  lines.push(`Usa *${ctx.prefix}partcjid <jid>@g.us* para inspeccionar miembros.`)
  await sendChunks(ctx, lines.join('\n'))
}

async function participantsCommand(ctx: CommandContext) {
  requirePrivate(ctx)
  const groupJid = ctx.argText.trim()
  if (!groupJid) throw new Error(`Uso: ${ctx.prefix}partcjid <jid-del-grupo>@g.us`)
  const metadata = await ownedGroup(ctx, groupJid)
  const lines = [`*MIEMBROS · ${metadata.subject || groupJid}*`, `Total: *${metadata.participants.length}*`, '']
  for (const participant of metadata.participants) {
    const jid = participantJid(participant)
    if (!jid) continue
    const admin = participant.admin ? ' · ADMIN' : ''
    lines.push(`• ${jid.split('@')[0]}${admin}`, `  \`${jid}\``)
  }
  await sendChunks(ctx, lines.join('\n'))
}

async function getQuotedCommand(ctx: CommandContext) {
  const quoted = quotedContent(ctx)
  if (!quoted) throw new Error('Responde al mensaje que deseas inspeccionar.')
  await sendChunks(ctx, `*JSON DEL MENSAJE CITADO*\n\n\`\`\`json\n${safeJson(quoted)}\n\`\`\``)
}

async function myMessageCommand(ctx: CommandContext) {
  await sendChunks(ctx, `*MENSAJE ACTUAL COMPLETO*\n\n\`\`\`json\n${safeJson(ctx.message)}\n\`\`\``)
}

async function getTypeCommand(ctx: CommandContext) {
  const type = messageType(quotedContent(ctx))
  if (!type) throw new Error('Responde al mensaje cuyo tipo deseas consultar.')
  await ctx.reply(`Tipo de mensaje: *${type}*`)
}

async function codeBlockCommand(ctx: CommandContext) {
  const code = quotedText(ctx)
  if (!code) throw new Error('Responde a un mensaje de texto/caption para convertirlo en bloque de código.')
  const parts = ctx.argText.split('|').map((value) => value.trim())
  if (parts.length > 2) throw new Error('Usa como máximo un separador |: idioma | pie opcional.')
  const language = (parts[0] ?? '').slice(0, 40)
  const footer = (parts[1] ?? '').slice(0, 200)
  const escaped = code.replace(/```/g, '`\u200b``')
  const text = [language ? `*Código · ${language}*` : '*Código*', `\`\`\`\n${escaped}\n\`\`\``, footer].filter(Boolean).join('\n')
  await sendChunks(ctx, text)
}

async function relayCommand(ctx: CommandContext) {
  const text = ctx.argText.trim() || quotedText(ctx)
  if (!text) throw new Error(`Uso: ${ctx.prefix}relay <texto> o responde a un texto.`)
  if (text.length > 3500) throw new Error('El relay está limitado a 3500 caracteres.')
  // Relay controlado: solo texto y únicamente al chat actual. No acepta JSON,
  // JID arbitrario ni messageId personalizado.
  await ctx.socket.relayMessage(ctx.chatId, { conversation: text }, {})
}

async function safeEvalCommand(ctx: CommandContext) {
  const expression = ctx.argText.trim()
  if (!expression) throw new Error(`Uso: ${ctx.prefix}eval <expresión JavaScript>`)
  if (expression.length > 1000) throw new Error('La expresión supera el límite de 1000 caracteres.')
  const sandbox = Object.create(null) as Record<string, unknown>
  const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } })
  const source = `(() => { const value = (${expression}); try { return JSON.stringify(value) ?? String(value) } catch { return String(value) } })()`
  const result = vm.runInContext(source, context, { timeout: 100 })
  await sendChunks(ctx, `*EVAL SEGURO*\n\n\`\`\`\n${String(result).slice(0, 6000)}\n\`\`\``)
}

async function invisibleGroupMessage(ctx: CommandContext) {
  const target = await resolveTarget(ctx, { requiredMessage: `Menciona o responde al usuario: ${ctx.prefix}msg @usuario mensaje` })
  if (!target) throw new Error('No pude resolver el usuario objetivo.')
  const text = textAfterTarget(ctx, target)
  if (!text) throw new Error(`Uso: ${ctx.prefix}msg @usuario <mensaje>`)
  if (text.length > 3000) throw new Error('El mensaje privado está limitado a 3000 caracteres.')
  const metadata = await ctx.socket.groupMetadata(ctx.chatId)
  await sendPrivateTarget(ctx, target, text, metadata.subject || 'Grupo de WhatsApp')
  // El bot es admin por contrato del comando: borra la orden visible una vez que
  // el DM fue entregado, sin falsificar el autor de ningún mensaje.
  await ctx.socket.sendMessage(ctx.chatId, { delete: ctx.message.key }).catch(() => undefined)
}

async function privateFromControlChat(ctx: CommandContext) {
  requirePrivate(ctx)
  const [groupPart = '', targetPart = '', ...messageParts] = ctx.argText.split('|').map((value) => value.trim())
  if (!groupPart || !targetPart) throw new Error(`Uso: ${ctx.prefix}pv <grupo@g.us> | <número/JID> | <mensaje>`)
  const metadata = await ownedGroup(ctx, groupPart)
  const targetDigits = targetPart.replace(/\D/g, '')
  const target = metadata.participants
    .map((participant) => participantJid(participant))
    .find((jid) => jid && (jid === targetPart || (targetDigits && digitsFromJid(jid) === targetDigits)))
  if (!target) throw new Error('El objetivo no pertenece a ese grupo o no pude resolver su identidad PN/LID.')
  const text = messageParts.join(' | ').trim()
  if (!text) throw new Error('Debes indicar el mensaje privado.')
  if (text.length > 3000) throw new Error('El mensaje privado está limitado a 3000 caracteres.')
  await sendPrivateTarget(ctx, target, text, metadata.subject || groupPart)
  await ctx.reply(`Mensaje privado entregado al miembro seleccionado de *${metadata.subject || groupPart}*.`)
}

async function editBotMessage(ctx: CommandContext) {
  const context = getContextInfo(ctx.message)
  const stanzaId = context?.stanzaId
  const text = ctx.argText.trim()
  if (!stanzaId || !context?.quotedMessage) throw new Error('Responde a un mensaje enviado por el bot.')
  if (!text) throw new Error(`Uso: ${ctx.prefix}edit <nuevo texto>, respondiendo al mensaje del bot.`)
  if (text.length > 3500) throw new Error('El texto editado está limitado a 3500 caracteres.')

  if (ctx.isGroup) {
    const quotedSender = context.participant
    if (!quotedSender) throw new Error('No pude verificar que el mensaje citado pertenezca al bot.')
    const me = ctx.socket.authState.creds.me
    const botIds = [ctx.socket.user?.id, me?.id, me?.lid].filter((value): value is string => Boolean(value))
    if (!botIds.some((id) => sameIdentity(id, quotedSender))) throw new Error('Solo puedo editar mensajes enviados por esta propia instancia.')
  }

  await ctx.socket.sendMessage(ctx.chatId, {
    text,
    edit: { remoteJid: ctx.chatId, fromMe: true, id: stanzaId },
  })
}

export const valleyCompatV21Commands: BotCommand[] = [
  {
    name: 'grupos', aliases: ['groupsjid', 'botgroups'], category: 'groups', staffOnly: true, subbotOwnerAllowed: true,
    description: 'Lista por privado los grupos donde participa esta instancia.', handler: groupsCommand,
  },
  {
    name: 'partcjid', aliases: ['groupmembersjid', 'miembrosjid'], category: 'groups', staffOnly: true, subbotOwnerAllowed: true,
    description: 'Lista JIDs de miembros de un grupo perteneciente a esta instancia.', usage: 'partcjid <grupo@g.us>', handler: participantsCommand,
  },
  {
    name: 'getmsg', aliases: ['get', 'quotedjson'], category: 'owner', staffOnly: true, subbotOwnerAllowed: true,
    description: 'Inspecciona el JSON sanitizado de un mensaje citado.', handler: getQuotedCommand,
  },
  {
    name: 'mymsg', aliases: ['rawmsg'], category: 'owner', staffOnly: true, subbotOwnerAllowed: true,
    description: 'Muestra el JSON sanitizado del mensaje/comando actual.', handler: myMessageCommand,
  },
  {
    name: 'gettype', aliases: ['msgtype'], category: 'owner', staffOnly: true, subbotOwnerAllowed: true,
    description: 'Indica el tipo Baileys del mensaje citado.', handler: getTypeCommand,
  },
  {
    name: 'codeblock', aliases: ['codequote'], category: 'owner', staffOnly: true, subbotOwnerAllowed: true,
    description: 'Convierte el texto citado en un bloque monoespaciado.', usage: 'codeblock [lenguaje] | [pie]', handler: codeBlockCommand,
  },
  {
    name: 'relay', aliases: ['relaytext'], category: 'owner', staffOnly: true, subbotOwnerAllowed: true,
    description: 'Relay controlado de texto al chat actual; no acepta JSON ni IDs personalizados.', usage: 'relay <texto>', handler: relayCommand,
  },
  {
    name: 'evalsafe', aliases: ['eval'], category: 'owner', ownerOnly: true,
    description: 'Evalúa una expresión JavaScript aislada, sin process/require ni generación dinámica de código.', usage: 'eval <expresión>', handler: safeEvalCommand,
  },
  {
    name: 'msg', aliases: ['invisible', 'whisper', 'privmsg'], category: 'groups', groupOnly: true, adminOnly: true, botAdminOnly: true,
    description: 'Entrega un mensaje por privado a un miembro autorizado y elimina la orden visible; no suplanta autores.', usage: 'msg @usuario <mensaje>', handler: invisibleGroupMessage,
  },
  {
    name: 'pv', aliases: ['privategroupmsg'], category: 'owner', staffOnly: true, subbotOwnerAllowed: true,
    description: 'Desde el privado autorizado, entrega un mensaje a un miembro de uno de los grupos de la instancia.', usage: 'pv <grupo@g.us> | <número> | <mensaje>', handler: privateFromControlChat,
  },
  {
    name: 'editbot', aliases: ['edit'], category: 'owner', staffOnly: true, subbotOwnerAllowed: true,
    description: 'Edita únicamente un mensaje previamente enviado por esta propia instancia.', usage: 'edit <nuevo texto>', handler: editBotMessage,
  },
]
