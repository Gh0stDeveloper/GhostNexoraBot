import type { BotCommand, CommandContext } from '../types.js'
import { parseHostPort, pingMinecraftServer } from '../services/minecraft.js'
import {
  resolveMinecraftCapes,
  resolveMinecraftIdentity,
  type MinecraftIdentity,
} from '../services/minecraft-profile-v12.js'

const FOOTER = 'Minecraft Tools · Ghost Nexora Bot'

function playerQuery(ctx: CommandContext) {
  const value = ctx.argText.trim().replace(/\s+/g, ' ')
  if (!value) throw new Error(`Uso: ${ctx.prefix}mcplayer <nickname o Gamertag>`)
  return value
}

function editionLabel(identity: MinecraftIdentity) {
  return identity.edition === 'java' ? 'Java Edition' : 'Bedrock Edition / Xbox'
}

function preferredImage(identity: MinecraftIdentity) {
  if (identity.edition === 'java') return identity.avatarUrl
  return identity.skinRenderUrl || identity.avatarUrl
}

async function sendIdentity(ctx: CommandContext, identity: MinecraftIdentity, lines: string[]) {
  const imageUrl = preferredImage(identity)
  const caption = lines.filter(Boolean).join('\n')
  if (imageUrl) {
    try {
      await ctx.socket.sendMessage(ctx.chatId, { image: { url: imageUrl }, caption }, { quoted: ctx.message })
      return
    } catch {
      // Si el proveedor de imagen falla, el perfil textual sigue siendo útil.
    }
  }
  await ctx.reply(caption)
}

async function minecraftHelp(ctx: CommandContext) {
  await ctx.reply([
    '╭━━〔 ⛏️ *MINECRAFT · GHOST NEXORA* 〕━━╮',
    '┃ Herramientas para Java y Bedrock',
    '┃ Perfiles, skins, servidores, seeds y utilidades',
    '╰━━━━━━━━━━━━━━━━━━━━╯',
    '',
    '*JUGADORES · JAVA / BEDROCK*',
    `• ${ctx.prefix}mcplayer <nickname|Gamertag>`,
    `• ${ctx.prefix}mcskin <nickname|Gamertag>`,
    `• ${ctx.prefix}mccape <nickname|Gamertag>`,
    `  Ejemplo Bedrock: ${ctx.prefix}mcplayer JULIAN AGZ`,
    '',
    '*SERVIDORES*',
    `• ${ctx.prefix}mcserver <ip[:puerto]>`,
    '',
    '*MUNDO Y SEEDS*',
    `• ${ctx.prefix}mcseed <seed>`,
    `• ${ctx.prefix}mcstronghold <seed>`,
    `• ${ctx.prefix}mcbioma <seed> <x> <z>`,
    `• ${ctx.prefix}mcstruct <seed> <estructura> [x] [z]`,
    `• ${ctx.prefix}mcanchor <x> <z> [ow|nether]`,
    '',
    '*CRAFTING Y ECONOMÍA DE SERVIDORES*',
    `• ${ctx.prefix}mccraft <item>`,
    `• ${ctx.prefix}mcalert <item> <precio>`,
    `• ${ctx.prefix}mcalert list`,
    `• ${ctx.prefix}mcalert del <id>`,
    `• ${ctx.prefix}mcprice <item> <precio>`,
    '',
    '*Compatibilidad de perfiles*',
    'Java: Mojang · Bedrock/Xbox: PlayerDB + GeyserMC.',
    'Los Gamertags con espacios se conservan completos.',
    '',
    FOOTER,
  ].join('\n'))
}

async function minecraftPlayer(ctx: CommandContext) {
  const query = playerQuery(ctx)
  await ctx.react('🔎').catch(() => undefined)
  const identity = await resolveMinecraftIdentity(query)

  if (identity.edition === 'java') {
    await sendIdentity(ctx, identity, [
      '╭━━〔 🎮 *PERFIL MINECRAFT* 〕━━╮',
      `┃ Jugador: *${identity.name}*`,
      '┃ Edición: *Java Edition*',
      `┃ UUID: *${identity.uuid}*`,
      `┃ UUID raw: \`${identity.uuidNodash}\``,
      '┣━━━━━━━━━━━━━━━━',
      `┃ Skin oficial: *${identity.officialSkinUrl ? 'Sí' : 'No detectada'}*`,
      `┃ Capa Mojang: *${identity.officialCapeUrl ? 'Sí' : 'No detectada'}*`,
      `┃ Fuente: *${identity.source}*`,
      '╰━━━━━━━━━━━━━━━━━━━━╯',
      identity.officialSkinUrl ? `Skin: ${identity.officialSkinUrl}` : '',
      identity.officialCapeUrl ? `Capa: ${identity.officialCapeUrl}` : '',
      '',
      FOOTER,
    ])
    return
  }

  await sendIdentity(ctx, identity, [
    '╭━━〔 🎮 *PERFIL MINECRAFT* 〕━━╮',
    `┃ Gamertag: *${identity.name}*`,
    '┃ Edición: *Bedrock Edition / Xbox*',
    `┃ XUID: *${identity.xuid}*`,
    `┃ Skin Geyser: *${identity.skinRenderUrl ? 'Disponible' : 'No almacenada'}*`,
    `┃ Fuente: *${identity.source}*`,
    '┣━━━━━━━━━━━━━━━━',
    identity.linkedJava ? `┃ Java vinculada: *${identity.linkedJava.name}*` : '┃ Java vinculada: *No detectada*',
    identity.linkedJava ? `┃ UUID Java: *${identity.linkedJava.uuid}*` : '',
    '╰━━━━━━━━━━━━━━━━━━━━╯',
    '',
    `Consulta realizada con el Gamertag completo: *${query}*`,
    FOOTER,
  ])
}

async function minecraftSkin(ctx: CommandContext) {
  const query = playerQuery(ctx)
  await ctx.react('🔎').catch(() => undefined)
  const identity = await resolveMinecraftIdentity(query)

  if (identity.edition === 'java') {
    await sendIdentity(ctx, identity, [
      '╭━━〔 🧍 *SKIN MINECRAFT* 〕━━╮',
      `┃ Jugador: *${identity.name}*`,
      '┃ Edición: *Java Edition*',
      `┃ UUID: *${identity.uuid}*`,
      '╰━━━━━━━━━━━━━━━━━━━━╯',
      `Skin: ${identity.skinUrl}`,
      '',
      FOOTER,
    ])
    return
  }

  await sendIdentity(ctx, identity, [
    '╭━━〔 🧍 *SKIN MINECRAFT* 〕━━╮',
    `┃ Gamertag: *${identity.name}*`,
    '┃ Edición: *Bedrock Edition / Xbox*',
    `┃ XUID: *${identity.xuid}*`,
    `┃ Skin convertida: *${identity.skinRenderUrl ? 'Disponible' : 'No disponible en caché'}*`,
    '╰━━━━━━━━━━━━━━━━━━━━╯',
    identity.skinRawUrl ? `Textura: ${identity.skinRawUrl}` : 'La skin Bedrock solo está disponible si Geyser la ha convertido previamente.',
    '',
    FOOTER,
  ])
}

async function minecraftCape(ctx: CommandContext) {
  const query = playerQuery(ctx)
  await ctx.react('🔎').catch(() => undefined)
  const identity = await resolveMinecraftIdentity(query)
  const capes = await resolveMinecraftCapes(identity)
  const javaName = identity.edition === 'java' ? identity.name : identity.linkedJava?.name

  if (!capes.length) {
    await ctx.reply([
      '╭━━〔 🧥 *CAPAS MINECRAFT* 〕━━╮',
      `┃ Jugador: *${identity.name}*`,
      `┃ Edición: *${editionLabel(identity)}*`,
      identity.edition === 'bedrock' ? `┃ XUID: *${identity.xuid}*` : `┃ UUID: *${identity.uuid}*`,
      '╰━━━━━━━━━━━━━━━━━━━━╯',
      '',
      identity.edition === 'bedrock' && !identity.linkedJava
        ? 'No existe una cuenta Java vinculada detectable; las capas Java no pueden consultarse para este Gamertag.'
        : 'No se detectaron capas públicas para este jugador.',
      '',
      FOOTER,
    ].join('\n'))
    return
  }

  const lines = [
    '╭━━〔 🧥 *CAPAS MINECRAFT* 〕━━╮',
    `┃ Jugador: *${identity.name}*`,
    `┃ Perfil consultado: *${javaName ?? identity.name}*`,
    `┃ Encontradas: *${capes.length}*`,
    '╰━━━━━━━━━━━━━━━━━━━━╯',
    '',
    ...capes.map((cape, index) => `${index + 1}. *${cape.provider}*${cape.url ? `\n${cape.url}` : ''}`),
    '',
    FOOTER,
  ]
  const firstImage = capes.find((cape) => cape.url)?.url
  if (firstImage) {
    try {
      await ctx.socket.sendMessage(ctx.chatId, { image: { url: firstImage }, caption: lines.join('\n') }, { quoted: ctx.message })
      return
    } catch {
      // fallback textual
    }
  }
  await ctx.reply(lines.join('\n'))
}

async function minecraftServer(ctx: CommandContext) {
  const raw = ctx.argText.trim()
  if (!raw) throw new Error(`Uso: ${ctx.prefix}mcserver <ip[:puerto]>`)
  const { host, port } = parseHostPort(raw)
  await ctx.react('📡').catch(() => undefined)
  const info = await pingMinecraftServer(host, port)
  const fill = info.playersMax > 0 ? Math.round((info.playersOnline / info.playersMax) * 100) : 0
  await ctx.reply([
    '╭━━〔 🌐 *SERVIDOR MINECRAFT* 〕━━╮',
    `┃ Dirección: *${host}:${port}*`,
    `┃ Estado: *ONLINE*`,
    `┃ Versión: *${info.version}*`,
    `┃ Protocolo: *${info.protocol}*`,
    '┣━━━━━━━━━━━━━━━━',
    `┃ Jugadores: *${info.playersOnline}/${info.playersMax}* (${fill}%)`,
    `┃ Latencia: *${info.latencyMs} ms*`,
    info.description ? `┃ MOTD: ${info.description}` : '',
    '╰━━━━━━━━━━━━━━━━━━━━╯',
    info.sample.length ? `\n*Jugadores visibles*\n${info.sample.slice(0, 12).map((name) => `• ${name}`).join('\n')}` : '',
    '',
    FOOTER,
  ].filter(Boolean).join('\n'))
}

export const minecraftV12Commands: BotCommand[] = [
  {
    name: 'mc',
    aliases: ['minecraft', 'mchelp'],
    category: 'tools',
    description: 'Centro Minecraft completo: Java, Bedrock, perfiles, servidores, seeds y utilidades.',
    handler: minecraftHelp,
  },
  {
    name: 'mcplayer',
    aliases: ['mcuser', 'mcuuid', 'mcperfil', 'mcjugador', 'mcgamertag'],
    category: 'tools',
    description: 'Busca perfiles Minecraft Java o Bedrock/Xbox; admite Gamertags con espacios.',
    usage: 'mcplayer <nickname o Gamertag completo>',
    handler: minecraftPlayer,
  },
  {
    name: 'mcskin',
    aliases: ['skinmc'],
    category: 'tools',
    description: 'Consulta la skin de perfiles Java o Bedrock; admite Gamertags con espacios.',
    usage: 'mcskin <nickname o Gamertag completo>',
    handler: minecraftSkin,
  },
  {
    name: 'mccape',
    aliases: ['mccapes', 'capemc'],
    category: 'tools',
    description: 'Consulta capas públicas Java y cuentas Java vinculadas desde Bedrock.',
    usage: 'mccape <nickname o Gamertag completo>',
    handler: minecraftCape,
  },
  {
    name: 'mcserver',
    aliases: ['mcsrv', 'mcping'],
    category: 'tools',
    description: 'Estado, versión, jugadores, MOTD y latencia de un servidor Minecraft Java.',
    usage: 'mcserver <ip[:puerto]>',
    handler: minecraftServer,
  },
]
