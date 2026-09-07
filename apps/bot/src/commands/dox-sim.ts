import { createHash } from 'node:crypto'
import type { BotCommand, CommandContext } from '../types.js'
import { resolveTarget } from '../utils/target.js'

const COUNTRIES = [
  { country: 'México', regions: ['Zona Centro', 'Zona Pacífico', 'Zona Norte', 'Zona Golfo', 'Zona Sureste'] },
  { country: 'Estados Unidos', regions: ['Costa Oeste', 'Medio Oeste', 'Noreste', 'Sur', 'Suroeste'] },
  { country: 'Colombia', regions: ['Región Andina', 'Región Caribe', 'Región Pacífica', 'Orinoquía'] },
  { country: 'Argentina', regions: ['Región Pampeana', 'Cuyo', 'Patagonia', 'Noroeste'] },
  { country: 'España', regions: ['Zona Centro', 'Zona Norte', 'Zona Mediterránea', 'Zona Sur'] },
  { country: 'Chile', regions: ['Zona Norte', 'Zona Central', 'Zona Sur', 'Zona Austral'] },
  { country: 'Perú', regions: ['Costa', 'Sierra', 'Selva', 'Zona Centro'] },
] as const

const FAKE_PROVIDERS = ['GhostTel', 'Nexora Mobile', 'SpectraNet', 'Phantom Wireless', 'OrbitLink', 'NovaCell'] as const
const FAKE_DEVICES = ['Android', 'iPhone', 'PC', 'Tablet', 'Dispositivo desconocido'] as const
const FAKE_NETWORKS = ['4G', '5G', 'Wi-Fi', 'LTE', 'Red privada'] as const

function deterministicBytes(ctx: CommandContext, target: string) {
  return createHash('sha256')
    .update(`ghost-nexora-doxsim-v1|${ctx.chatId}|${target}`)
    .digest()
}

function pick<T>(items: readonly T[], byte: number) {
  return items[byte % items.length]!
}

function documentationIp(bytes: Buffer) {
  const ranges = [
    [192, 0, 2],
    [198, 51, 100],
    [203, 0, 113],
  ] as const
  const base = ranges[bytes[9]! % ranges.length]!
  const host = 1 + (bytes[10]! % 253)
  return `${base[0]}.${base[1]}.${base[2]}.${host}`
}

function operationId(bytes: Buffer) {
  return `GN-${bytes.subarray(0, 4).toString('hex').toUpperCase()}`
}

async function handleDoxSimulation(ctx: CommandContext) {
  const target = await resolveTarget(ctx, {
    allowNumber: false,
    requiredMessage: `Responde al mensaje de alguien o menciona a un usuario.\nEjemplo: *${ctx.prefix}doxear @usuario*`,
  })
  if (!target) return

  const bytes = deterministicBytes(ctx, target)
  const place = pick(COUNTRIES, bytes[4]!)
  const region = pick(place.regions, bytes[5]!)
  const provider = pick(FAKE_PROVIDERS, bytes[6]!)
  const device = pick(FAKE_DEVICES, bytes[7]!)
  const network = pick(FAKE_NETWORKS, bytes[8]!)
  const ip = documentationIp(bytes)
  const confidence = 35 + (bytes[11]! % 64)
  const alias = `Ghost-${bytes.subarray(12, 15).toString('hex').toUpperCase()}`

  await ctx.reply([
    '╭━━〔 🎭 *DOXEO SIMULADO* 〕━━╮',
    '┃ ⚠️ *DATOS FICTICIOS · SOLO JUEGO*',
    '┃',
    `┃ 🆔 Operación: *${operationId(bytes)}*`,
    `┃ 👤 Alias ficticio: *${alias}*`,
    `┃ 🌎 País simulado: *${place.country}*`,
    `┃ 📍 Región simulada: *${region}*`,
    `┃ 📡 Proveedor ficticio: *${provider}*`,
    `┃ 📶 Red simulada: *${network}*`,
    `┃ 📱 Dispositivo simulado: *${device}*`,
    `┃ 🌐 IP de laboratorio: *${ip}*`,
    `┃ 🎯 Precisión ficticia: *${confidence}%*`,
    '┃',
    '┃ 🔒 El bot NO leyó ni analizó el número real,',
    '┃ ubicación, IP, operadora ni datos privados.',
    '╰━━━━━━━━━━━━━━━━━━━━╯',
  ].join('\n'))
}

export const doxSimulationCommands: BotCommand[] = [
  {
    name: 'doxear',
    aliases: ['doxer', 'doxeo', 'doxsim'],
    category: 'games',
    description: 'Simulación ficticia de doxeo para jugar en grupos; no usa datos personales reales.',
    usage: 'doxear @usuario | responde a un mensaje',
    groupOnly: true,
    handler: handleDoxSimulation,
  },
]
