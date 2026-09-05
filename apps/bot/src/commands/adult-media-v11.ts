import { execa } from 'execa'
import type { BotCommand, CommandContext } from '../types.js'
import { downloadMessageMedia } from '../utils/message.js'
import {
  addAdultReactionMedia,
  adultMediaCommandAllowed,
  clearAdultReactionMedia,
  importAdultReactionMediaFromUrl,
  listAdultReactionMedia,
  listAllowedAdultMediaCommands,
  removeAdultReactionMedia,
} from '../services/adult-media-v8.js'

function requireStaff(ctx: CommandContext) {
  if (!ctx.isBotStaff && !ctx.isOwner && !ctx.isSubbotOwner) {
    throw new Error('Solo staff, owner o dueño del subbot puede administrar estos medios.')
  }
}

function mimeFromFileName(fileName?: string | null) {
  const name = (fileName ?? '').toLowerCase()
  if (name.endsWith('.gif')) return 'image/gif'
  if (name.endsWith('.webm')) return 'video/webm'
  if (name.endsWith('.mp4')) return 'video/mp4'
  if (name.endsWith('.webp')) return 'image/webp'
  if (name.endsWith('.png')) return 'image/png'
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg'
  return null
}

async function normalizeForWhatsappPlayback(buffer: Buffer, mimeType: string) {
  if (!/^(image\/gif|video\/(gif|webm))$/i.test(mimeType)) {
    return { buffer, mimeType }
  }

  try {
    const { stdout } = await execa('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-i', 'pipe:0',
      '-vf', "scale='min(480,iw)':-2:flags=lanczos,fps=15",
      '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      '-movflags', 'frag_keyframe+empty_moov',
      '-f', 'mp4', 'pipe:1',
    ], {
      input: buffer,
      encoding: 'buffer',
      timeout: 45_000,
      maxBuffer: 25 * 1024 * 1024,
    })
    return { buffer: Buffer.from(stdout), mimeType: 'video/mp4' }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`No pude convertir el GIF/WEBM a MP4 para WhatsApp: ${detail}`)
  }
}

async function add(ctx: CommandContext) {
  requireStaff(ctx)

  const requested = (ctx.args[0] ?? 'global').trim().toLowerCase()
  const command = requested || 'global'
  if (!adultMediaCommandAllowed(command)) {
    throw new Error(
      `Comando no permitido: ${command}. Usa uno de: ${listAllowedAdultMediaCommands().join(', ')}`,
    )
  }

  const media = await downloadMessageMedia(ctx.message)
  if (!media || !['video', 'image', 'document'].includes(media.kind)) {
    throw new Error(
      `Responde al GIF, video, imagen o documento que deseas guardar. Si no indicas un pool se guardará en *global*.\nEjemplo: ${ctx.prefix}adultgif add global`,
    )
  }

  const inferred = mimeFromFileName(media.fileName)
  const mimetype = (media.mimetype && media.mimetype !== 'application/octet-stream')
    ? media.mimetype
    : inferred ?? media.mimetype ?? 'video/mp4'

  const allowedMime = /^video\/(mp4|webm|gif)/i.test(mimetype)
    || /^image\/(gif|png|jpe?g|webp)/i.test(mimetype)
    || (mimetype === 'application/octet-stream' && Boolean(inferred))

  if (!allowedMime) {
    throw new Error(`Formato no reconocido (${mimetype}). Usa GIF, MP4, WEBM, PNG, JPG o WEBP.`)
  }

  const sourceMime = inferred ?? mimetype
  const normalized = await normalizeForWhatsappPlayback(media.buffer, sourceMime)
  const saved = await addAdultReactionMedia(
    command,
    normalized.buffer,
    normalized.mimeType,
    ctx.sender,
    media.fileName ?? undefined,
  )

  await ctx.reply([
    '✅ *MEDIO GUARDADO*',
    '━━━━━━━━━━━━━━',
    `Pool/comando: *${saved.command}*`,
    `ID: *${saved.id}*`,
    `Guardados: *${saved.count}/25*`,
    `Tipo original: *${sourceMime}*`,
    normalized.mimeType !== sourceMime ? 'Conversión: *MP4 compatible con WhatsApp*' : `Tipo guardado: *${normalized.mimeType}*`,
  ].join('\n'))
}

async function importUrls(ctx: CommandContext) {
  requireStaff(ctx)
  const command = ctx.args[0]
  const urls = ctx.args.slice(1).filter((u) => /^https?:\/\//i.test(u))
  if (!command || !adultMediaCommandAllowed(command) || !urls.length) {
    throw new Error(
      `Uso: ${ctx.prefix}adultgif import <comando> <url> [url2] ...\nMáximo recomendado: 5 URLs por mensaje. Comandos: ${listAllowedAdultMediaCommands().join(', ')}`,
    )
  }

  const limited = urls.slice(0, 5)
  await ctx.reply(`⬇️ Importando *${limited.length}* medio(s) para *${command}*...`)
  const ok: number[] = []
  const fail: string[] = []

  for (const url of limited) {
    try {
      const saved = await importAdultReactionMediaFromUrl(command, url, ctx.sender)
      ok.push(saved.id)
    } catch (error) {
      fail.push(`${url.slice(0, 60)}… → ${error instanceof Error ? error.message : 'error'}`)
    }
  }

  await ctx.reply([
    '🎞️ *IMPORTACIÓN DE MEDIOS*',
    '━━━━━━━━━━━━━━',
    `Comando: *${command}*`,
    `✅ Importados: ${ok.length}${ok.length ? ` (IDs ${ok.join(', ')})` : ''}`,
    fail.length ? `❌ Fallidos: ${fail.length}\n${fail.slice(0, 5).join('\n')}` : '',
  ].filter(Boolean).join('\n'))
}

async function list(ctx: CommandContext) {
  requireStaff(ctx)
  const rows = listAdultReactionMedia(ctx.args[0]) as Array<{
    id: number
    command: string
    label?: string
    mimeType: string
  }>
  if (!rows.length) throw new Error('No hay medios guardados para esa reacción.')
  await ctx.reply(
    `🎞️ *MEDIOS DE REACCIÓN*\n━━━━━━━━━━━━━━\n${rows.map((r) => `#${r.id} · ${r.command} · ${r.label || r.mimeType}`).join('\n')}`,
  )
}

async function remove(ctx: CommandContext) {
  requireStaff(ctx)
  const id = Number(ctx.args[0])
  if (!Number.isInteger(id) || id <= 0) throw new Error(`Uso: ${ctx.prefix}adultgif remove <id>`)
  await removeAdultReactionMedia(id)
  await ctx.reply(`🗑️ Medio *#${id}* eliminado.`)
}

async function clear(ctx: CommandContext) {
  requireStaff(ctx)
  const command = ctx.args[0]
  if (!command || !adultMediaCommandAllowed(command)) {
    throw new Error(`Uso: ${ctx.prefix}adultgif clear <comando>`)
  }
  await clearAdultReactionMedia(command)
  await ctx.reply(`🧹 Medios de *${command}* eliminados.`)
}

async function help(ctx: CommandContext) {
  requireStaff(ctx)
  await ctx.reply([
    '🎞️ *ADULT REACTION MEDIA*',
    '━━━━━━━━━━━━━━',
    `${ctx.prefix}adultgif add → responde a un GIF/video; se guarda en global`,
    `${ctx.prefix}adultgif add <comando> → responde al archivo y lo guarda en ese pool`,
    `${ctx.prefix}adultgif import <comando> <url> [url2…]`,
    `${ctx.prefix}adultgif list [comando]`,
    `${ctx.prefix}adultgif remove <id>`,
    `${ctx.prefix}adultgif clear <comando>`,
    '',
    `Comandos: ${listAllowedAdultMediaCommands().join(', ')}`,
    'Acepta GIF/MP4/WEBM/PNG/JPG/WEBP, incluso si WhatsApp lo envía como documento.',
    'Los GIF/WEBM se convierten automáticamente a MP4 reproducible antes de guardarse.',
    'Máximo: *25* medios por comando.',
  ].join('\n'))
}

export const adultMediaV11Commands: BotCommand[] = [
  {
    name: 'adultgif',
    aliases: ['reactiongif', 'adultmedia'],
    category: 'adult',
    staffOnly: true,
    description: 'Administra medios de reacción 18+ y corrige la carga/reproducción de GIF, video y documentos.',
    usage: 'adultgif add [comando]|import|list|remove|clear|help',
    handler: async (ctx) => {
      const action = (ctx.args[0] || 'help').toLowerCase()
      const rest = ctx.args.slice(1)

      if (action === 'add') {
        ctx.args = rest
        await add(ctx)
        return
      }
      if (action === 'import') {
        ctx.args = rest
        await importUrls(ctx)
        return
      }
      if (action === 'list') {
        ctx.args = rest
        await list(ctx)
        return
      }
      if (action === 'remove') {
        ctx.args = rest
        await remove(ctx)
        return
      }
      if (action === 'clear') {
        ctx.args = rest
        await clear(ctx)
        return
      }
      await help(ctx)
    },
  },
]
