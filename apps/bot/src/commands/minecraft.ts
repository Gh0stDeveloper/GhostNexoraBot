import type { BotCommand, CommandContext } from '../types.js'
import {
  estimateStrongholds,
  estimateBiome,
  findStructureCandidates,
  netherPortalLink,
  resolveProfile,
  getSessionProfile,
  skinUrls,
  getCapes,
  pingMinecraftServer,
  parseHostPort,
  getCraft,
  addPriceAlert,
  listPriceAlerts,
  removePriceAlert,
  reportPrice,
  parseSeed,
} from '../services/minecraft.js'

function need(args: string[], n: number, usage: string) {
  if (args.length < n) throw new Error(`Uso: ${usage}`)
}

function parseCoord(s: string) {
  const n = Number(s)
  if (!Number.isFinite(n)) throw new Error(`Coordenada inválida: ${s}`)
  return Math.trunc(n)
}

export const minecraftCommands: BotCommand[] = [
  {
    name: 'mc',
    aliases: ['minecraft', 'mchelp'],
    category: 'tools',
    description: 'Ayuda de comandos Minecraft.',
    async handler(ctx) {
      await ctx.reply(
        [
          '⛏️ *Minecraft · Ghost Nexora*',
          '━━━━━━━━━━━━━━',
          '• `.mcseed <seed>` — strongholds anillo 1 + resumen',
          '• `.mcstronghold <seed>` — 3 strongholds cercanas',
          '• `.mcbioma <seed> <x> <z>` — bioma estimado',
          '• `.mcanchor <x> <z> [ow|nether]` — portal linked',
          '• `.mcstruct <seed> <estructura> [x] [z]` — candidatos',
          '• `.mcskin <nick>` · `.mccape <nick>` · `.mcplayer <nick>`',
          '• `.mcserver <ip[:puerto]>` — ping real',
          '• `.mccraft <item>` — receta / wiki',
          '• `.mcalert <item> <precio>` — alerta local',
          '• `.mcalert list` · `.mcalert del <id|item>`',
          '• `.mcprice <item> <precio>` — avisa si hay alertas',
          '',
          '_Seeds/estructuras: estimación determinista (no cubiomes 1:1)._',
          '_Skins/UUID/servidor: datos reales Mojang + SLP._',
          '✧ Ghost Nexora Bot · Ghost Developer ✧',
        ].join('\n'),
      )
    },
  },
  {
    name: 'mcseed',
    category: 'tools',
    description: 'Analiza una seed (strongholds cercanas).',
    usage: 'mcseed <seed>',
    async handler(ctx) {
      need(ctx.args, 1, '.mcseed <seed>')
      const seed = ctx.args[0]!
      const sh = estimateStrongholds(seed, 1)
      const lines = [
        `🌱 *Seed* \\`${sh.seed}\\``,
        `Entrada: \\`${seed}\\``,
        '',
        '*Strongholds · anillo 1 (las 3 cercanas)*',
        ...sh.positions.map(
          (p) => `• #${p.index} → X: *${p.x}* Z: *${p.z}* (≈${p.dist} bloques)`,
        ),
        '',
        '_Estimación por anillos oficiales + PRNG. Para mapa exacto: /locate o Chunkbase._',
        '✧ Ghost Nexora · Ghost Developer ✧',
      ]
      await ctx.reply(lines.join('\n'))
    },
  },
  {
    name: 'mcstronghold',
    aliases: ['mcsh', 'mcstrong'],
    category: 'tools',
    description: 'Coordenadas de las 3 strongholds del primer anillo.',
    usage: 'mcstronghold <seed>',
    async handler(ctx) {
      need(ctx.args, 1, '.mcstronghold <seed>')
      const sh = estimateStrongholds(ctx.args[0]!, 1)
      await ctx.reply(
        [
          `🏰 *Strongholds (anillo 1)* · seed \\`${sh.seed}\\``,
          ...sh.positions.map(
            (p, i) =>
              `${i + 1}. X: *${p.x}*  Z: *${p.z}*  · distancia ≈ *${p.dist}*`,
          ),
          '',
          'Lleva Ojos de Ender y cava cerca de esas coords (portal room suele estar bajo Y=35).',
          '✧ Ghost Nexora · Ghost Developer ✧',
        ].join('\n'),
      )
    },
  },
  {
    name: 'mcbioma',
    aliases: ['mcbiome'],
    category: 'tools',
    description: 'Bioma estimado en una coordenada.',
    usage: 'mcbioma <seed> <x> <z>',
    async handler(ctx) {
      need(ctx.args, 3, '.mcbioma <seed> <x> <z>')
      const b = estimateBiome(ctx.args[0]!, parseCoord(ctx.args[1]!), parseCoord(ctx.args[2]!))
      await ctx.reply(
        [
          `🌍 *Bioma estimado*',
          `Seed: \\`${b.seed}\\` · X:*${b.x}* Z:*${b.z}*`,
          `Bioma: *${b.biome}*`,
          '',
          b.note,
          '✧ Ghost Nexora · Ghost Developer ✧',
        ].join('\n'),
      )
    },
  },
  {
    name: 'mcanchor',
    aliases: ['mcportal', 'mcnether'],
    category: 'tools',
    description: 'Calcula el portal del Nether perfecto.',
    usage: 'mcanchor <x> <z> [ow|nether]',
    async handler(ctx) {
      need(ctx.args, 2, '.mcanchor <x> <z> [ow|nether]')
      const x = parseCoord(ctx.args[0]!)
      const z = parseCoord(ctx.args[1]!)
      const dim = (ctx.args[2] || 'ow').toLowerCase()
      const from = dim.startsWith('n') ? 'nether' : 'overworld'
      const r = netherPortalLink(x, z, from)
      await ctx.reply(
        [
          '🌀 *Portal link (×8)*',
          `Desde *${r.from}*: X *${r.source.x}* Z *${r.source.z}*`,
          `En *${r.to}*: X *${r.linked.x}* Z *${r.linked.z}*`,
          r.tip,
          '',
          '_Matemática exacta del juego (Overworld ÷ 8 = Nether)._',
          '✧ Ghost Nexora · Ghost Developer ✧',
        ].join('\n'),
      )
    },
  },
  {
    name: 'mcstruct',
    aliases: ['mcstructure', 'mclocate'],
    category: 'tools',
    description: 'Candidatos de estructura cerca de coords.',
    usage: 'mcstruct <seed> <estructura> [x] [z]',
    async handler(ctx) {
      need(ctx.args, 2, '.mcstruct <seed> <estructura> [x] [z]')
      const seed = ctx.args[0]!
      const struct = ctx.args[1]!
      const x = ctx.args[2] !== undefined ? parseCoord(ctx.args[2]) : 0
      const z = ctx.args[3] !== undefined ? parseCoord(ctx.args[3]) : 0
      const res = findStructureCandidates(seed, struct, x, z)
      if ('error' in res) throw new Error(res.error)
      await ctx.reply(
        [
          `📍 *${res.label}* · seed \\`${res.seed}\\``,
          `Cerca de X:${x} Z:${z}`,
          ...res.near.slice(0, 8).map(
            (p, i) => `${i + 1}. X:*${p.x}* Z:*${p.z}* (≈${p.dist} bloques)`,
          ),
          '',
          '_Candidatos por grid+salt (estilo Java). Confirma con /locate._',
          '✧ Ghost Nexora · Ghost Developer ✧',
        ].join('\n'),
      )
    },
  },
  {
    name: 'mcskin',
    category: 'tools',
    description: 'Skin de un jugador (Mojang).',
    usage: 'mcskin <nick>',
    async handler(ctx) {
      need(ctx.args, 1, '.mcskin <nick>')
      const profile = await resolveProfile(ctx.args[0]!)
      const urls = skinUrls(profile.uuidNodash)
      await ctx.socket.sendMessage(ctx.chatId, {
        image: { url: urls.body },
        caption: [
          `🧍 *${profile.name}*`,
          `UUID: \\`${profile.uuid}\\``,
          `Skin: ${urls.skin}`,
          '✧ Ghost Nexora · Ghost Developer ✧',
        ].join('\n'),
      })
    },
  },
  {
    name: 'mccape',
    category: 'tools',
    description: 'Capas (Minecon, OptiFine, etc.).',
    usage: 'mccape <nick>',
    async handler(ctx) {
      need(ctx.args, 1, '.mccape <nick>')
      const profile = await resolveProfile(ctx.args[0]!)
      const capes = await getCapes(profile.uuidNodash)
      if (!capes.length) {
        await ctx.reply(
          `🧥 *${profile.name}* no tiene capas detectadas en Capes.dev.\n✧ Ghost Nexora · Ghost Developer ✧`,
        )
        return
      }
      const lines = [
        `🧥 *Capas de ${profile.name}*`,
        ...capes.map((c) => `• *${c.provider}*${c.url ? ` → ${c.url}` : ''}`),
        '✧ Ghost Nexora · Ghost Developer ✧',
      ]
      const firstImg = capes.find((c) => c.url)?.url
      if (firstImg) {
        await ctx.socket.sendMessage(ctx.chatId, {
          image: { url: firstImg },
          caption: lines.join('\n'),
        })
      } else {
        await ctx.reply(lines.join('\n'))
      }
    },
  },
  {
    name: 'mcplayer',
    aliases: ['mcuser', 'mcuuid'],
    category: 'tools',
    description: 'UUID, skin 3D e info de perfil.',
    usage: 'mcplayer <nick>',
    async handler(ctx) {
      need(ctx.args, 1, '.mcplayer <nick>')
      const profile = await resolveProfile(ctx.args[0]!)
      const session = await getSessionProfile(profile.uuidNodash)
      const urls = skinUrls(profile.uuidNodash)
      let skinInfo = ''
      try {
        const tex = session.properties?.find((p) => p.name === 'textures')
        if (tex?.value) {
          const decoded = JSON.parse(Buffer.from(tex.value, 'base64').toString('utf8')) as {
            textures?: { SKIN?: { url?: string }; CAPE?: { url?: string } }
          }
          if (decoded.textures?.SKIN?.url) skinInfo += `\nSkin oficial: ${decoded.textures.SKIN.url}`
          if (decoded.textures?.CAPE?.url) skinInfo += `\nCapa Mojang: ${decoded.textures.CAPE.url}`
        }
      } catch {
        /* ignore */
      }
      await ctx.socket.sendMessage(ctx.chatId, {
        image: { url: urls.cube },
        caption: [
          `👤 *${profile.name}*`,
          `UUID: \\`${profile.uuid}\\``,
          `Sin guiones: \\`${profile.uuidNodash}\\``,
          skinInfo,
          '',
          '_Historial de nombres: Mojang ya no lo publica en API pública._',
          '✧ Ghost Nexora · Ghost Developer ✧',
        ].join('\n'),
      })
    },
  },
  {
    name: 'mcserver',
    aliases: ['mcsrv', 'mcping'],
    category: 'tools',
    description: 'Info real de un server (SLP).',
    usage: 'mcserver <ip[:puerto]>',
    async handler(ctx) {
      need(ctx.args, 1, '.mcserver <ip[:puerto]>')
      const { host, port } = parseHostPort(ctx.args.join('').includes(':') ? ctx.args[0]! : ctx.argText.trim())
      await ctx.react('⏳').catch(() => undefined)
      const info = await pingMinecraftServer(host, port)
      await ctx.reply(
        [
          `🖥️ *${host}:${port}*`,
          `Versión: *${info.version}* (protocol ${info.protocol})`,
          `Jugadores: *${info.playersOnline}/${info.playersMax}*`,
          `Ping: *${info.latencyMs} ms*`,
          info.description ? `MOTD: ${info.description}` : '',
          info.sample.length ? `Online: ${info.sample.join(', ')}` : '',
          '✧ Ghost Nexora · Ghost Developer ✧',
        ]
          .filter(Boolean)
          .join('\n'),
      )
    },
  },
  {
    name: 'mccraft',
    aliases: ['mcrecipe', 'mccrafting'],
    category: 'tools',
    description: 'Cómo craftear un ítem.',
    usage: 'mccraft <item>',
    async handler(ctx) {
      need(ctx.args, 1, '.mccraft <item>')
      const item = ctx.argText.trim()
      const r = getCraft(item)
      if (!r.found) {
        await ctx.reply(
          [
            `🛠️ *${item}*`,
            r.tip,
            `Wiki: ${r.wiki}`,
            '✧ Ghost Nexora · Ghost Developer ✧',
          ].join('\n'),
        )
        return
      }
      await ctx.reply(
        [
          `🛠️ *Crafteo*`,
          r.result,
          '',
          'Patrón:',
          '```',
          ...r.shape,
          '```',
          `Wiki: ${r.wiki}`,
          '✧ Ghost Nexora · Ghost Developer ✧',
        ].join('\n'),
      )
    },
  },
  {
    name: 'mcalert',
    category: 'tools',
    description: 'Alertas locales de precio (servidores no premium).',
    usage: 'mcalert <item> <precio> | list | del <id>',
    async handler(ctx) {
      const sub = (ctx.args[0] || '').toLowerCase()
      if (sub === 'list' || sub === 'lista') {
        const list = listPriceAlerts(ctx.sender)
        if (!list.length) {
          await ctx.reply('Sin alertas. Usa `.mcalert diamante 50`')
          return
        }
        await ctx.reply(
          [
            '🔔 *Tus alertas*',
            ...list.map(
              (a) => `• \\`${a.id}\\` *${a.item}* ≤ ${a.maxPrice} ${a.currency}`,
            ),
            '✧ Ghost Nexora · Ghost Developer ✧',
          ].join('\n'),
        )
        return
      }
      if (sub === 'del' || sub === 'rm' || sub === 'delete') {
        need(ctx.args, 2, '.mcalert del <id|item>')
        const n = removePriceAlert(ctx.sender, ctx.args[1]!)
        await ctx.reply(n ? `🗑️ Eliminada(s): ${n}` : 'No encontré esa alerta.')
        return
      }
      need(ctx.args, 2, '.mcalert <item> <precio_max>')
      const price = Number(ctx.args[ctx.args.length - 1])
      if (!Number.isFinite(price) || price < 0) throw new Error('Precio inválido')
      const item = ctx.args.slice(0, -1).join(' ')
      const row = addPriceAlert({
        chatId: ctx.chatId,
        sender: ctx.sender,
        item,
        maxPrice: price,
      })
      await ctx.reply(
        [
          '🔔 *Alerta creada*',
          `Item: *${row.item}*`,
          `Avisa si precio ≤ *${row.maxPrice}*`,
          `ID: \\`${row.id}\\``,
          '',
          'No hay API global de economía de servers no premium.',
          'Cuando veas un precio, usa `.mcprice <item> <precio>` y avisamos a quien tenga alerta.',
          '✧ Ghost Nexora · Ghost Developer ✧',
        ].join('\n'),
      )
    },
  },
  {
    name: 'mcprice',
    category: 'tools',
    description: 'Reporta un precio y dispara alertas locales.',
    usage: 'mcprice <item> <precio>',
    async handler(ctx) {
      need(ctx.args, 2, '.mcprice <item> <precio>')
      const price = Number(ctx.args[ctx.args.length - 1])
      if (!Number.isFinite(price)) throw new Error('Precio inválido')
      const item = ctx.args.slice(0, -1).join(' ')
      const hits = reportPrice(item, price)
      await ctx.reply(
        [
          `💰 Reportado *${item}* a *${price}*`,
          hits.length
            ? `🔔 ${hits.length} alerta(s) coinciden (≤ su máximo).`
            : 'Nadie tenía alerta para ese precio.',
          '✧ Ghost Nexora · Ghost Developer ✧',
        ].join('\n'),
      )
      for (const h of hits.slice(0, 5)) {
        if (h.chatId === ctx.chatId) continue
        try {
          await ctx.socket.sendMessage(h.chatId, {
            text: `🔔 *Alerta MC* · *${h.item}* reportado a *${price}* (tu máx ${h.maxPrice})\n✧ Ghost Nexora · Ghost Developer ✧`,
          })
        } catch {
          /* ignore */
        }
      }
    },
  },
]
