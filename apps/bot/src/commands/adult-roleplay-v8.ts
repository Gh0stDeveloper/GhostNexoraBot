import { jidNormalizedUser } from 'baileys'
import { config } from '../config.js'
import { settings } from '../core/settings.js'
import type { BotCommand, CommandContext } from '../types.js'
import { economy } from '../services/economy.js'
import { getReactionGif, reactionGifToMp4, type ReactionCategory } from '../services/reactions.js'
import { digitsFromJid, getContextInfo } from '../utils/message.js'
import { pickAdultReactionMedia } from '../services/adult-media-v8.js'
import {
  listAdultRoleplayMessages,
  renderAdultRoleplayMessage,
  resetAdultRoleplayMessage,
  setAdultRoleplayMessage,
} from '../services/adult-roleplay-messages-v14.js'

const prohibited = /\b(child|children|underage|minor|preteen|pre-teen|niñ[oa]s?|menor(?:es)?)\b/i

const roleplaySendQueue = new Map<string, Promise<void>>()

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function errorText(error: unknown) {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause
    return [error.name, error.message, cause ? String(cause) : ''].join(' ').toLowerCase()
  }
  try { return JSON.stringify(error).toLowerCase() } catch { return String(error).toLowerCase() }
}

function isRateOverlimit(error: unknown) {
  const text = errorText(error)
  return text.includes('rate-overlimit')
    || text.includes('rate overlimit')
    || text.includes('rate limit')
    || text.includes('too many requests')
    || text.includes('statuscode":429')
    || text.includes('status":429')
}

async function queuedRoleplaySend(chatId: string, task: () => Promise<void>) {
  const previous = roleplaySendQueue.get(chatId) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => { release = resolve })
  const chain = previous.catch(() => undefined).then(() => current)
  roleplaySendQueue.set(chatId, chain)

  await previous.catch(() => undefined)
  try {
    await task()
  } finally {
    release()
    if (roleplaySendQueue.get(chatId) === chain) roleplaySendQueue.delete(chatId)
  }
}

async function sendRoleplayText(ctx: CommandContext, caption: string, mentions: string[]) {
  let lastError: unknown
  for (const delay of [0, 2500, 5000]) {
    if (delay) await wait(delay)
    try {
      await queuedRoleplaySend(ctx.chatId, async () => {
        await ctx.socket.sendMessage(ctx.chatId, { text: caption, mentions }, { quoted: ctx.message })
      })
      return
    } catch (error) {
      lastError = error
      if (!isRateOverlimit(error)) throw error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('rate-overlimit')
}

async function sendMediaOrTextFallback(
  ctx: CommandContext,
  sendMedia: () => Promise<void>,
  caption: string,
  mentions: string[],
) {
  try {
    await queuedRoleplaySend(ctx.chatId, sendMedia)
  } catch (error) {
    if (!isRateOverlimit(error)) throw error
    await wait(2500)
    await sendRoleplayText(ctx, caption, mentions)
  }
}

function normalizeJid(value?: string | null) {
  if (!value) return ''
  try {
    return jidNormalizedUser(value)
  } catch {
    return value
  }
}

function assertAdultAccess(ctx: CommandContext) {
  if (ctx.isGroup) {
    if (!economy.getGroupPolicy(ctx.chatId).adultAllowed) {
      throw new Error(
        'Este grupo no está autorizado para el módulo 18+. Un administrador puede usar ' +
          ctx.prefix +
          'adultmode on.',
      )
    }
  } else if (!settings.adultEnabled || !config.adultPrivateEnabled) {
    throw new Error('El módulo 18+ está desactivado en este chat privado.')
  }

  if (!economy.hasEntitlement(ctx.sender, 'adult_consent')) {
    throw new Error(
      'Antes debes confirmar que eres mayor de edad con ' + ctx.prefix + 'adult18 accept.',
    )
  }
}

async function resolveTargetJid(ctx: CommandContext): Promise<string> {
  const info = getContextInfo(ctx.message)
  const mention = info?.mentionedJid?.[0]
  const quotedParticipant = info?.participant
  const raw = mention || quotedParticipant
  if (!raw) throw new Error('Menciona o responde a otro usuario. Ejemplo: ' + ctx.prefix + 'dick @usuario')

  let candidates = [normalizeJid(raw), raw].filter(Boolean)

  if (ctx.isGroup) {
    try {
      const metadata = await ctx.socket.groupMetadata(ctx.chatId)
      const match = metadata.participants.find((p) => {
        const ids = [p.id, p.phoneNumber, p.lid].map(normalizeJid).filter(Boolean)
        return ids.some((id) => candidates.includes(id) || candidates.includes(normalizeJid(id)))
      })
      if (match) {
        const preferred =
          normalizeJid(match.phoneNumber) || normalizeJid(match.id) || normalizeJid(match.lid)
        if (preferred) {
          candidates = [
            preferred,
            ...candidates,
            normalizeJid(match.id),
            normalizeJid(match.lid),
            normalizeJid(match.phoneNumber),
          ].filter(Boolean)
        }
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
  {
    name: 'dick',
    aliases: ['pene', 'cock'],
    category: 'wink',
    title: 'ROLEPLAY · DICK',
    nsfwTags: ['waifu', 'neko', 'blowjob'],
  },
]

async function fetchNsfwAnimeGif(tags: string[]): Promise<string | null> {
  const endpoints = [
    ...tags.map((tag) => 'https://api.waifu.pics/nsfw/' + encodeURIComponent(tag)),
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
  await sendMediaOrTextFallback(
    ctx,
    async () => {
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
    },
    caption,
    mentions,
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

  if (!hasAdultConsent(other, [other])) {
    throw new Error(
      'El destinatario también debe confirmar mayoría de edad con ' + ctx.prefix + 'adult18 accept.',
    )
  }

  const roleplayText = renderAdultRoleplayMessage(def.name, ctx.sender, other)
  const caption = ['🔞 *' + def.title + '*', '━━━━━━━━━━━━━━', roleplayText].join('\n')
  const mentions = [ctx.sender, other]

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
    await sendMediaOrTextFallback(
      ctx,
      async () => {
        await ctx.socket.sendMessage(
          ctx.chatId,
          { image: local.data, caption, mentions },
          { quoted: ctx.message },
        )
      },
      caption,
      mentions,
    )
    return
  }

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

  try {
    const reaction = await getReactionGif(def.category)
    const video = await reactionGifToMp4(reaction.url)
    await sendGifPlayback(ctx, video, caption, mentions)
  } catch (error) {
    if (isRateOverlimit(error)) {
      await sendRoleplayText(ctx, caption, mentions)
      return
    }
    await sendRoleplayText(ctx, caption, mentions)
  }
}

function requireStaff(ctx: CommandContext) {
  if (!ctx.isBotStaff && !ctx.isOwner && !ctx.isSubbotOwner) {
    throw new Error('Solo staff, owner o dueño del subbot puede editar textos de roleplay.')
  }
}

export const adultRoleplayV8Commands: BotCommand[] = [
  ...defs.map((def) => ({
    name: def.name,
    aliases: def.aliases,
    category: 'adult' as const,
    description:
      'Roleplay 18+ con consentimiento mutuo: ' +
      def.name +
      '. Mensaje personalizable y medios con adultgif/adulttext.',
    usage: def.name + ' @usuario',
    handler: (ctx: CommandContext) => run(def, ctx),
  })),
  {
    name: 'adulttext',
    aliases: ['rptext', 'roleplaytext'],
    category: 'adult',
    staffOnly: true,
    description: 'Personaliza el texto de roleplay 18+ ({sender} {target}).',
    usage: 'adulttext list | set <comando> <texto> | reset <comando>',
    async handler(ctx) {
      requireStaff(ctx)
      const action = (ctx.args[0] || 'list').toLowerCase()
      if (action === 'list') {
        const rows = listAdultRoleplayMessages()
        await ctx.reply(
          [
            '📝 *TEXTOS ROLEPLAY 18+*',
            '━━━━━━━━━━━━━━',
            ...rows.map(
              (r) =>
                '• *' +
                r.command +
                '*' +
                (r.customized ? ' (custom)' : '') +
                '\n  ' +
                r.template,
            ),
            '',
            'Marcadores: {sender} {target}',
            ctx.prefix + 'adulttext set dick {sender} le mostró a {target}...',
          ].join('\n'),
        )
        return
      }
      if (action === 'set') {
        const command = ctx.args[1]
        const template = ctx.args.slice(2).join(' ')
        if (!command || !template) {
          throw new Error(
            'Uso: ' + ctx.prefix + 'adulttext set <fuck|preñar|cum|dick> <texto con {sender} y {target}>',
          )
        }
        const saved = setAdultRoleplayMessage(command, template)
        await ctx.reply('✅ Texto de *' + saved.command + '* guardado.\n' + saved.template)
        return
      }
      if (action === 'reset') {
        const command = ctx.args[1]
        if (!command) throw new Error('Uso: ' + ctx.prefix + 'adulttext reset <comando>')
        const saved = resetAdultRoleplayMessage(command)
        await ctx.reply('♻️ Texto de *' + saved.command + '* restablecido.\n' + saved.template)
        return
      }
      throw new Error('Uso: ' + ctx.prefix + 'adulttext list|set|reset')
    },
  },
]
