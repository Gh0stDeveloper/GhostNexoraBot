import { config } from '../config.js'
import { settings } from '../core/settings.js'
import type { BotCommand, CommandContext } from '../types.js'
import { economy } from '../services/economy.js'
import { getReactionGif, reactionGifToMp4, type ReactionCategory } from '../services/reactions.js'
import { getContextInfo } from '../utils/message.js'
import { pickAdultReactionMedia } from '../services/adult-media-v8.js'

const prohibited = /\b(child|children|underage|minor|preteen|pre-teen|niñ[oa]s?|menor(?:es)?)\b/i

async function target(ctx: CommandContext) {
  const mention = getContextInfo(ctx.message)?.mentionedJid?.[0]
  if (!mention) throw new Error('Menciona o responde a otro usuario.')
  return mention
}

function gate(ctx: CommandContext) {
  if (!economy.hasEntitlement(ctx.sender, 'adult_consent')) {
    throw new Error(`Confirma mayoría de edad con ${ctx.prefix}adult18 accept.`)
  }
  if (ctx.isGroup && !economy.getGroupPolicy(ctx.chatId).adultAllowed) {
    throw new Error(`Este grupo debe habilitar NSFW con ${ctx.prefix}adultmode on.`)
  }
  if (!ctx.isGroup && (!settings.adultEnabled || !config.adultPrivateEnabled)) {
    throw new Error('El módulo 18+ está desactivado en este chat privado.')
  }
}

type Def = {
  name: string
  aliases: string[]
  category: ReactionCategory
  title: string
  text: string
  nsfwTags: string[]
}

const defs: Def[] = [
  {
    name: 'fuck',
    aliases: ['room'],
    category: 'kiss',
    title: 'ESCENA PRIVADA',
    text: 'inició una escena privada de roleplay consensuado con',
    nsfwTags: ['waifu', 'neko', 'blowjob'],
  },
  {
    name: 'preñar',
    aliases: ['prenar'],
    category: 'cuddle',
    title: 'ROLEPLAY DE PAREJA',
    text: 'inició un roleplay consensuado de pareja/familia con',
    nsfwTags: ['waifu', 'neko'],
  },
  {
    name: 'cum',
    aliases: ['finishrp'],
    category: 'happy',
    title: 'FIN DE ESCENA',
    text: 'dio por terminada su escena de roleplay consensuado con',
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
  gate(ctx)
  const other = await target(ctx)
  if (other === ctx.sender) throw new Error('Este roleplay requiere otro participante.')
  if (!economy.hasEntitlement(other, 'adult_consent')) {
    throw new Error(`El destinatario también debe usar ${ctx.prefix}adult18 accept.`)
  }

  const caption = [
    `🔞 *${def.title}*`,
    '━━━━━━━━━━━━━━',
    `@${ctx.sender.split('@')[0]} ${def.text} @${other.split('@')[0]}`,
    '',
    '✓ Consentimiento 18+ confirmado.',
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
  description: `Roleplay 18+ con consentimiento mutuo: ${def.name}. Prioriza medios locales (adultgif).`,
  usage: `${def.name} @usuario`,
  handler: (ctx) => run(def, ctx),
}))
