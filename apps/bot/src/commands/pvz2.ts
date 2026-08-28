import { mkdir, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { downloadContentFromMessage } from 'baileys'
import type { BotCommand, CommandContext } from '../types.js'
import { config } from '../config.js'
import { getContextInfo, unwrapMessage } from '../utils/message.js'

const PVZ_DIR = path.join(config.dataDir, 'pvz2')
const PVZ_FILE = path.join(PVZ_DIR, 'pp.dat')
const MAX_BYTES = 25 * 1024 * 1024

function documentNode(ctx: CommandContext) {
  const own = unwrapMessage(ctx.message.message)
  if (own?.documentMessage) return { node: own.documentMessage, fileName: own.documentMessage.fileName ?? '' }
  const quoted = unwrapMessage(getContextInfo(ctx.message)?.quotedMessage)
  if (quoted?.documentMessage) return { node: quoted.documentMessage, fileName: quoted.documentMessage.fileName ?? '' }
  return null
}

async function readDocument(ctx: CommandContext) {
  const target = documentNode(ctx)
  if (!target) throw new Error('Responde directamente al archivo pp.dat para guardarlo.')
  const name = target.fileName.toLowerCase()
  if (name && !name.endsWith('.dat')) throw new Error('El archivo debe ser pp.dat o tener extensión .dat.')
  const stream = await downloadContentFromMessage(target.node as never, 'document')
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of stream) {
    const buffer = Buffer.from(chunk)
    total += buffer.length
    if (total > MAX_BYTES) throw new Error('El archivo supera el límite seguro de 25 MB.')
    chunks.push(buffer)
  }
  return { buffer: Buffer.concat(chunks), fileName: target.fileName || 'pp.dat' }
}

async function pvz2Info(ctx: CommandContext) {
  try {
    const info = await stat(PVZ_FILE)
    await ctx.reply([
      '🌻 *PLANTAS VS ZOMBIES 2*',
      '━━━━━━━━━━━━━━',
      '✅ Archivo disponible.',
      `📦 Tamaño: *${(info.size / 1024).toFixed(1)} KB*`,
      `🕒 Actualizado: *${new Date(info.mtimeMs).toLocaleString('es-MX')}*`,
      '',
      `Usa *${ctx.prefix}pvz2* para recibirlo.`,
    ].join('\n'))
  } catch {
    await ctx.reply('🌻 *PLANTAS VS ZOMBIES 2*\n━━━━━━━━━━━━━━\n❌ Todavía no hay un pp.dat configurado.')
  }
}

async function sendPvz2(ctx: CommandContext) {
  try {
    await stat(PVZ_FILE)
  } catch {
    throw new Error(`Todavía no hay un archivo configurado. Un administrador debe responder al pp.dat con *${ctx.prefix}pvz2set*.`)
  }
  await ctx.socket.sendMessage(ctx.chatId, {
    document: { url: PVZ_FILE },
    mimetype: 'application/octet-stream',
    fileName: 'pp.dat',
    caption: [
      '🌻 *PLANTAS VS ZOMBIES 2 · PP.DAT*',
      '━━━━━━━━━━━━━━',
      'Archivo de datos para uso local.',
      '',
      '📱 *MT Manager*',
      '1. Haz una copia de seguridad de tu archivo actual.',
      '2. Abre la carpeta de datos de Plants vs Zombies 2 con MT Manager.',
      '3. Copia este *pp.dat* en la ubicación correspondiente.',
      '4. Reemplaza el archivo solo después de conservar tu respaldo.',
      '5. Abre el juego y comprueba que el contenido cargue correctamente.',
      '',
      '⚠️ Usa únicamente archivos de origen confiable y respeta las reglas del juego y de tu dispositivo.',
      '',
      '👻 Ghost Nexora Bot',
    ].join('\n'),
  }, { quoted: ctx.message })
}

async function setPvz2(ctx: CommandContext) {
  const media = await readDocument(ctx)
  await mkdir(PVZ_DIR, { recursive: true })
  const temp = path.join(PVZ_DIR, `.pp.dat.${process.pid}.${Date.now()}.tmp`)
  await writeFile(temp, media.buffer, { mode: 0o640 })
  try {
    await rename(temp, PVZ_FILE)
    await ctx.reply([
      '✅ *PP.DAT ACTUALIZADO*',
      '━━━━━━━━━━━━━━',
      `📦 Archivo: *${media.fileName}*`,
      `📏 Tamaño: *${(media.buffer.length / 1024).toFixed(1)} KB*`,
      '',
      `Los usuarios ya pueden usar *${ctx.prefix}pvz2* para recibirlo.`,
    ].join('\n'))
  } catch (error) {
    await unlink(temp).catch(() => undefined)
    throw error
  }
}

async function deletePvz2(ctx: CommandContext) {
  await rm(PVZ_FILE, { force: true })
  await ctx.reply('🗑️ *PP.DAT ELIMINADO*\n━━━━━━━━━━━━━━\nEl archivo de Plants vs Zombies 2 ya no está disponible mediante el bot.')
}

export const pvz2Commands: BotCommand[] = [
  {
    name: 'pvz2',
    aliases: ['pvz', 'pvz2data'],
    category: 'tools',
    description: 'Envía el pp.dat de Plants vs Zombies 2 configurado por el staff.',
    usage: 'pvz2',
    handler: sendPvz2,
  },
  {
    name: 'pvz2set',
    aliases: ['setpvz2', 'pvz2upload'],
    category: 'owner',
    staffOnly: true,
    description: 'Guarda globalmente un pp.dat respondido por el staff.',
    usage: 'pvz2set <respondiendo al .dat>',
    handler: setPvz2,
  },
  {
    name: 'pvz2del',
    aliases: ['delpvz2', 'pvz2remove'],
    category: 'owner',
    staffOnly: true,
    description: 'Elimina el pp.dat global almacenado.',
    usage: 'pvz2del',
    handler: deletePvz2,
  },
  {
    name: 'pvz2info',
    aliases: ['pvzinfo'],
    category: 'tools',
    description: 'Comprueba si existe un pp.dat disponible y muestra sus datos básicos.',
    usage: 'pvz2info',
    handler: pvz2Info,
  },
]
