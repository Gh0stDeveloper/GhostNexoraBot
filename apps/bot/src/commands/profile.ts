import type { BotCommand, CommandContext } from '../types.js'
import { community } from '../services/community.js'
import { economy } from '../services/economy.js'
import { getContextInfo } from '../utils/message.js'
import { sendInteractiveCard } from '../services/interactive.js'

function fmtNumber(value: number) {
  return Math.floor(value).toLocaleString('es-MX')
}

function fmtRemaining(ms: number) {
  if (ms <= 0) return 'Listo'
  const total = Math.ceil(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return [h ? `${h}h` : '', m ? `${m}m` : '', !h && s ? `${s}s` : ''].filter(Boolean).join(' ')
}

async function canonicalTarget(ctx: CommandContext) {
  const mentioned = getContextInfo(ctx.message)?.mentionedJid?.[0]
  if (!mentioned) return null
  if (!ctx.isGroup) return mentioned
  const metadata = await ctx.socket.groupMetadata(ctx.chatId).catch(() => null)
  const participant = metadata?.participants.find((item) => [item.id, item.lid, item.phoneNumber].filter(Boolean).includes(mentioned))
  return participant?.phoneNumber ?? participant?.id ?? mentioned
}

async function profilePicture(ctx: CommandContext, jid: string) {
  return ctx.socket.profilePictureUrl(jid, 'image').catch(() => undefined)
}

const truth = [
  '¿Cuál fue la última mentira que dijiste?',
  '¿Qué hábito extraño tienes y casi nadie conoce?',
  '¿A quién del grupo conociste primero?',
  '¿Qué canción te da vergüenza admitir que te gusta?',
  '¿Cuál es tu mayor miedo irracional?',
  '¿Qué cosa cambiarías de tu pasado si pudieras?',
]
const dare = [
  'Cambia tu foto de perfil durante 10 minutos.',
  'Envía un audio cantando 10 segundos de una canción.',
  'Escribe un cumplido sincero a alguien del grupo.',
  'Usa únicamente stickers durante tus próximos 3 mensajes.',
  'Cuenta una anécdota graciosa que te haya pasado.',
  'Deja que el grupo elija tu próximo estado de WhatsApp.',
]

export const profileCommands: BotCommand[] = [
  {
    name: 'profile', aliases: ['perfil', 'me'], category: 'profile', description: 'Muestra tu perfil social y progreso.',
    async handler(ctx) {
      const target = await canonicalTarget(ctx) ?? ctx.sender
      const profile = community.getProfile(target)
      const balance = economy.balance(target)
      const marriage = community.getRelationship(target, 'marriage')
      const lover = community.getRelationship(target, 'lover')
      const pfp = await profilePicture(ctx, target)
      const body = [
        `╭─〔 👤 *PERFIL NEXORA* 〕`,
        `│ Usuario » @${target.split('@')[0]}`,
        `│ Nivel » *${profile.level}*`,
        `│ XP » *${fmtNumber(profile.xp)}*`,
        `│ Comandos » ${fmtNumber(profile.commandsUsed)}`,
        `│ Género » ${profile.gender ?? 'Sin configurar'}`,
        `│ Cumpleaños » ${profile.birthday ?? 'Sin configurar'}`,
        `│ Monedas » ${fmtNumber(balance.total)} ${ctx.settings.currencyName}`,
        `│ Matrimonio » ${marriage ? `@${marriage.partnerJid.split('@')[0]}` : 'Libre'}`,
        `│ Amante » ${lover ? `@${lover.partnerJid.split('@')[0]}` : 'Ninguno'}`,
        `╰──────────────`,
        profile.description ? `\n📝 *Bio*\n${profile.description}` : '',
        profile.favoriteCharacter ? `\n💖 Favorito » ${profile.favoriteCharacter}` : '',
      ].filter(Boolean).join('\n')
      await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
        title: `✦ ${ctx.settings.botDisplayName} · PERFIL ✦`,
        body,
        imageUrl: pfp,
        footer: 'Ghost Nexora Bot · Perfil persistente',
        buttons: [
          { type: 'reply', text: '⭐ Ver nivel', id: `${ctx.prefix}level` },
          { type: 'reply', text: '🪙 Balance', id: `${ctx.prefix}bal` },
        ],
      })
    },
  },
  {
    name: 'setdesc', aliases: ['setbio'], category: 'profile', description: 'Configura la descripción de tu perfil.', usage: 'setdesc <texto>',
    async handler(ctx) {
      const result = community.setDescription(ctx.sender, ctx.argText)
      await ctx.reply(`╭─〔 📝 *PERFIL ACTUALIZADO* 〕\n│ Tu descripción fue guardada.\n╰──────────────\n\n${result.description}`)
    },
  },
  {
    name: 'setbirth', aliases: ['birthday', 'cumple'], category: 'profile', description: 'Registra tu cumpleaños.', usage: 'setbirth DD/MM',
    async handler(ctx) {
      const result = community.setBirthday(ctx.sender, ctx.args[0] ?? '')
      await ctx.reply(`🎂 *CUMPLEAÑOS REGISTRADO*\n━━━━━━━━━━━━━━\nFecha: *${result.birthday}*`)
    },
  },
  {
    name: 'setgender', aliases: ['gender', 'genero'], category: 'profile', description: 'Configura el género mostrado en tu perfil.', usage: 'setgender <texto>',
    async handler(ctx) {
      if (!ctx.argText.trim()) {
        await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
          title: '⚙️ GÉNERO DEL PERFIL',
          body: 'Selecciona una opción o escribe el valor manualmente con .setgender <texto>.',
          buttons: [
            { type: 'reply', text: 'Masculino', id: `${ctx.prefix}setgender Masculino` },
            { type: 'reply', text: 'Femenino', id: `${ctx.prefix}setgender Femenino` },
            { type: 'reply', text: 'Otro', id: `${ctx.prefix}setgender Otro` },
          ],
        })
        return
      }
      const result = community.setGender(ctx.sender, ctx.argText)
      await ctx.reply(`✅ Género del perfil: *${result.gender}*`)
    },
  },
  {
    name: 'level', aliases: ['nivel', 'xp'], category: 'profile', description: 'Muestra tu nivel y XP.',
    async handler(ctx) {
      const profile = community.getProfile(ctx.sender)
      const nextLevelXp = (profile.level ** 2) * 100
      const progress = Math.min(100, Math.floor(profile.xp / Math.max(1, nextLevelXp) * 100))
      const bars = Math.round(progress / 10)
      await ctx.reply(`⭐ *NIVEL ${profile.level}*\n━━━━━━━━━━━━━━\nXP: *${fmtNumber(profile.xp)}*\nProgreso: ${'▰'.repeat(bars)}${'▱'.repeat(10 - bars)} ${progress}%\nComandos usados: ${fmtNumber(profile.commandsUsed)}`)
    },
  },
  {
    name: 'tops', aliases: ['toplevel', 'leveltop'], category: 'profile', description: 'Ranking de niveles del grupo.', groupOnly: true,
    async handler(ctx) {
      const metadata = await ctx.socket.groupMetadata(ctx.chatId)
      const members = metadata.participants.map((item) => item.phoneNumber ?? item.id)
      const rows = community.profilesFor(members).slice(0, 10)
      const mentions = rows.map((row) => row.userJid)
      const lines = rows.map((row, index) => `${index + 1}. @${row.userJid.split('@')[0]} · Nv.${row.level} · ${fmtNumber(row.xp)} XP`)
      await ctx.socket.sendMessage(ctx.chatId, { text: `🏆 *TOP DE NIVELES · ${metadata.subject}*\n━━━━━━━━━━━━━━\n${lines.join('\n')}`, mentions }, { quoted: ctx.message })
    },
  },
  {
    name: 'vr', aliases: ['verdadoreto', 'truthordare'], category: 'social', description: 'Genera una verdad o reto aleatorio.',
    async handler(ctx) {
      const isTruth = Math.random() < 0.5
      const list = isTruth ? truth : dare
      const value = list[Math.floor(Math.random() * list.length)]!
      await ctx.reply(`${isTruth ? '💭 *VERDAD*' : '🔥 *RETO*'}\n━━━━━━━━━━━━━━\n${value}`)
    },
  },
  {
    name: 'marry', aliases: ['casar', 'matrimonio'], category: 'social', description: 'Propone matrimonio a otro usuario.', groupOnly: true,
    async handler(ctx) {
      const target = await canonicalTarget(ctx)
      if (!target) throw new Error('Menciona a la persona a quien quieres proponer matrimonio.')
      community.proposeRelationship(ctx.sender, target, 'marriage')
      await ctx.socket.sendMessage(ctx.chatId, {
        text: `💍 *PROPUESTA DE MATRIMONIO*\n━━━━━━━━━━━━━━\n@${ctx.sender.split('@')[0]} le propone matrimonio a @${target.split('@')[0]}.\n\n@${target.split('@')[0]}, responde sin prefijo: *aceptar* o *rechazar*.\n⏳ La propuesta expira en 10 minutos.`,
        mentions: [ctx.sender, target],
      }, { quoted: ctx.message })
    },
  },
  {
    name: 'divorce', aliases: ['divorcio'], category: 'social', description: 'Finaliza tu matrimonio actual.',
    async handler(ctx) {
      const relation = community.endRelationship(ctx.sender, 'marriage')
      if (!relation) throw new Error('No tienes un matrimonio activo.')
      await ctx.socket.sendMessage(ctx.chatId, { text: `💔 *DIVORCIO*\n━━━━━━━━━━━━━━\n@${ctx.sender.split('@')[0]} y @${relation.partnerJid.split('@')[0]} terminaron su matrimonio.`, mentions: [ctx.sender, relation.partnerJid] }, { quoted: ctx.message })
    },
  },
  {
    name: 'amante', aliases: ['lover'], category: 'social', description: 'Propone una relación de amantes (máximo una).', groupOnly: true,
    async handler(ctx) {
      const target = await canonicalTarget(ctx)
      if (!target) throw new Error('Menciona a la persona a quien quieres enviar la propuesta.')
      community.proposeRelationship(ctx.sender, target, 'lover')
      await ctx.socket.sendMessage(ctx.chatId, {
        text: `❤️‍🔥 *PROPUESTA DE AMANTES*\n━━━━━━━━━━━━━━\n@${ctx.sender.split('@')[0]} quiere iniciar una relación con @${target.split('@')[0]}.\n\nResponde sin prefijo: *aceptar* o *rechazar*.`,
        mentions: [ctx.sender, target],
      }, { quoted: ctx.message })
    },
  },
  {
    name: 'terminar', aliases: ['endlover'], category: 'social', description: 'Finaliza tu relación de amante actual.',
    async handler(ctx) {
      const relation = community.endRelationship(ctx.sender, 'lover')
      if (!relation) throw new Error('No tienes una relación de amante activa.')
      await ctx.socket.sendMessage(ctx.chatId, { text: `💔 *RELACIÓN TERMINADA*\n@${ctx.sender.split('@')[0]} terminó su relación con @${relation.partnerJid.split('@')[0]}.`, mentions: [ctx.sender, relation.partnerJid] }, { quoted: ctx.message })
    },
  },
  {
    name: 'suggest', aliases: ['sugerir', 'report', 'reporte'], category: 'general', description: 'Envía una sugerencia o reporte al staff.', usage: 'suggest <mensaje>',
    async handler(ctx) {
      const id = community.addSuggestion(ctx.sender, ctx.chatId, ctx.argText)
      await ctx.reply(`📨 *MENSAJE ENVIADO AL STAFF*\n━━━━━━━━━━━━━━\nTicket: *#${id}*\nGracias por ayudar a mejorar ${ctx.settings.botDisplayName}.`)
    },
  },
  {
    name: 'add', aliases: ['addgacha', 'solicitaranime'], category: 'collection', description: 'Solicita una serie/personaje para futuras expansiones del gacha.', usage: 'add <anime o personaje>',
    async handler(ctx) {
      const text = ctx.argText.trim()
      if (!text) throw new Error('Indica el anime o personaje que deseas solicitar.')
      const id = community.addSuggestion(ctx.sender, ctx.chatId, `[GACHA] ${text}`)
      await ctx.reply(`🌸 *SOLICITUD GACHA #${id}*\n━━━━━━━━━━━━━━\nSe registró: *${text}*`)
    },
  },
  {
    name: 'cd', aliases: ['cooldowns', 'cooldown'], category: 'economy', description: 'Muestra cooldowns activos de economía y gacha.',
    async handler(ctx) {
      economy.balance(ctx.sender)
      const row = economy.db.prepare('SELECT last_work AS lastWork, last_rob AS lastRob FROM economy_users WHERE user_jid = ?').get(ctx.sender) as { lastWork?: number; lastRob?: number }
      const roll = economy.db.prepare('SELECT last_roll AS lastRoll FROM waifu_roll_meta WHERE user_jid = ?').get(ctx.sender) as { lastRoll?: number } | undefined
      const current = Date.now()
      await ctx.reply([
        '⏳ *COOLDOWNS ACTIVOS*',
        '━━━━━━━━━━━━━━',
        `💼 Trabajo » *${fmtRemaining(Number(row.lastWork ?? 0) + 15 * 60_000 - current)}*`,
        `🥷 Robo » *${fmtRemaining(Number(row.lastRob ?? 0) + 60 * 60_000 - current)}*`,
        `🌸 Gacha » *${fmtRemaining(Number(roll?.lastRoll ?? 0) + 30_000 - current)}*`,
      ].join('\n'))
    },
  },
]
