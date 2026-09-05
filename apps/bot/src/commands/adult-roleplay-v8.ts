import { jidNormalizedUser } from 'baileys'
import { config } from '../config.js'
import { settings } from '../core/settings.js'
import type { BotCommand, CommandContext } from '../types.js'
import { economy } from '../services/economy.js'
import { getReactionGif, reactionGifToMp4, type ReactionCategory } from '../services/reactions.js'
import { digitsFromJid, getContextInfo } from '../utils/message.js'
import { pickAdultReactionMedia } from '../services/adult-media-v8.js'
import { renderAdultRoleplayMessage } from '../services/adult-roleplay-messages-v14.js'

const prohibited = /\b(child|children|underage|minor|preteen|pre-teen|niñ[oa]s?|menor(?:es)?)\b/i

function normalizeJid(value?: string | null) {
  if (!value) return ''
  try {
    return jidNormalizedUser(value)
  } catch {
    return value
  }
}

/** Same gate as erome / xvideos / pornhub (adult.ts). */
function assertAdultAccess(ctx: CommandContext) {
  if (ctx.isGroup) {
    if (!economy.getGroupPolicy(ctx.chatId).adultAllowed) {
      throw new Error(
        `Este grupo no está autorizado para el módulo 18+. Un administrador puede usar ${ctx.prefix}adultmode on.`,
      )
    }
  } else if (!settings.adultEnabled || !config.adultPrivateEnabled) {
    throw new Error('El módulo 18+ está desactivado en este chat privado.')
  }

  if (!economy.hasEntitlement(ctx.sender, 'adult_consent')) {
    throw new Error(
      `Antes debes confirmar que eres mayor de edad con ${ctx.prefix}adult18 accept.`,
    )
  }
}

async function resolveTargetJid(ctx: CommandContext): Promise<string> {
  const info = getContextInfo(ctx.message)
  const mention = info?.mentionedJid?.[0]
  const quotedParticipant = info?.participant
  const raw = mention || quotedParticipant
  if (!raw) throw new Error(`Menciona o responde a otro usuario. Ejemplo: ${ctx.prefix}fuck @usuario`)

  let candidates = [normalizeJid(raw), raw].filter(Boolean)

  // In groups, map LID → phone JID when WhatsApp only exposes @lid in mentions.
  if (ctx.isGroup) {
    try {
      const metadata = await ctx.socket.groupMetadata(ctx.chatId)
      const match = metadata.participants.find((p) => {
        const ids = [p.id, p.phoneNumber, p.lid].map(normalizeJid).filter(Boolean)
        return ids.some((id) => candidates.includes(id) || candidates.includes(normalizeJid(id)))
      })
      if (match) {
        const preferred =
          normalizeJid(match.phoneNumber)
          || normalizeJid(match.id)
          || normalizeJid(match.lid)
        if (preferred) candidates = [preferred, ...candidates, normalizeJid(match.id), normalizeJid(match.lid), normalizeJid(match.phoneNumber)].filter(Boolean)
      }
    } catch {
      // best-effort
    }
  }

  const pn = candidates.find((j) => /@s\.whatsapp\.net$/i.test(j))
  return pn || candidates[0]!
}

function hasAdultConsent(jid: string, extra: string[] = []) {
  return Boolean(economy.hasEntitlement(jid, 'adult_consent', extra))
}

type Def = {
  name: string
  aliases: string[]
  category: ReactionCategory
  title: string
  nsfwTags: string[]
}

const defs: Def[] = [
  {
    name: 'fuck',
    aliases: ['room'],
    category: 'kiss',
    title: 'ESCENA PRIVADA',
    nsfwTags: ['waifu', 'neko', 'blowjob'],
  },
  {
    name: 'preñar',
    aliases: ['prenar'],
    category: 'cuddle',
    title: 'ROLEPLAY DE PAREJA',
    nsfwTags: ['waifu', 'neko'],
  },
  {
    name: 'cum',
    aliases: ['finishrp'],
    category: 'happy',
    title: 'FIN DE ESCENA',
    nsfwTags: ['waifu', 'neko'],
  },
]

async function fetchNsfwAnimeGif(tags: string[]): Promise<string | null> {
  const endpoints = [
    ...tags.map((tag) => `https://api.waifu.pics/nsfw/${encodeURIComponent(tag)}`),
    'https://api.waifu.pics/nsfw/waifu',
  ]

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        headers: { accept: 'application/json', 'user-agent': 'GhostNexoraBot/1.3' },
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) continue
      const data = (await response.json()) as { url?: string }
      if (!data.url || prohibited.test(data.url)) continue
      if (!/^https?:\/\//i.test(data.url)) continue
      return data.url
    } catch {
      continue
    }
  }
  return null
}

async function sendGifPlayback(
  ctx: CommandContext,
  video: Buffer,
  caption: string,
  mentions: string[],
  mimetype = 'video/mp4',
) {
  await ctx.socket.sendMessage(
    ctx.chatId,
    {
      video,
      gifPlayback: true,
      mimetype,
      caption,
      mentions,
    },
    { quoted: ctx.message },
  )
}

async function run(def: Def, ctx: CommandContext) {
  assertAdultAccess(ctx)
  const other = await resolveTargetJid(ctx)

  const senderDigits = digitsFromJid(ctx.sender)
  const otherDigits = digitsFromJid(other)
  if (other === ctx.sender || (senderDigits && otherDigits && senderDigits === otherDigits)) {
    throw new Error('Este roleplay requiere otro participante.')
  }

  // Target may appear as LID while consent was stored under phone JID.
  if (!hasAdultConsent(other, [other])) {
    throw new Error(
      `El destinatario también debe confirmar mayoría de edad con ${ctx.prefix}adult18 accept.`,
    )
  }

  const roleplayText = renderAdultRoleplayMessage(def.name, ctx.sender, other)
  const caption = [
    `🔞 *${def.title}*`,
    '━━━━━━━━━━━━━━',
    roleplayText,
  ].join('\n')
  const mentions = [ctx.sender, other]

  // 1) Local / global staff media
  const local = await pickAdultReactionMedia(def.name)
  if (local) {
    const isVideo = /video|gif|webm/i.test(local.mimeType)
    if (isVideo) {
      await sendGifPlayback(
        ctx,
        local.data,
        caption,
        mentions,
        local.mimeType.startsWith('video/') ? local.mimeType : 'video/mp4',
      )
      return
    }
    await ctx.socket.sendMessage(
      ctx.chatId,
      { image: local.data, caption, mentions },
      { quoted: ctx.message },
    )
    return
  }

  // 2) External NSFW anime GIF
  try {
    const nsfwUrl = await fetchNsfwAnimeGif(def.nsfwTags)
    if (nsfwUrl) {
      const video = await reactionGifToMp4(nsfwUrl)
      await sendGifPlayback(ctx, video, caption, mentions)
      return
    }
  } catch {
    // continue
  }

  // 3) SFW fallback
  try {
    const reaction = await getReactionGif(def.category)
    const video = await reactionGifToMp4(reaction.url)
    await sendGifPlayback(ctx, video, caption, mentions)
  } catch {
    await ctx.socket.sendMessage(ctx.chatId, { text: caption, mentions }, { quoted: ctx.message })
  }
}

export const adultRoleplayV8Commands: BotCommand[] = defs.map((def) => ({
  name: def.name,
  aliases: def.aliases,
  category: 'adult',
  description: `Roleplay 18+ con consentimiento mutuo: ${def.name}. Mensaje personalizable por staff y medios locales adultgif.`,
  usage: `${def.name} @usuario`,
  handler: (ctx) => run(def, ctx),
}))
