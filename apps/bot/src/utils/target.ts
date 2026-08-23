import type { CommandContext } from '../types.js'
import { getContextInfo } from './message.js'
import { preferredJid, registerIdentity, resolveStoredIdentity } from '../services/identity.js'

export type ResolveTargetOptions = {
  allowNumber?: boolean
  requiredMessage?: string
}

export async function canonicalizeTarget(ctx: CommandContext, candidate: string) {
  if (!candidate) return ''
  if (!ctx.isGroup) return resolveStoredIdentity(candidate)
  const metadata = await ctx.socket.groupMetadata(ctx.chatId).catch(() => null)
  const participant = metadata?.participants.find((item) => [item.id, item.phoneNumber, item.lid].filter(Boolean).includes(candidate))
  if (!participant) return resolveStoredIdentity(candidate)
  const aliases = [participant.id, participant.phoneNumber, participant.lid, candidate].filter((value): value is string => Boolean(value))
  const canonical = preferredJid([participant.phoneNumber, participant.id, candidate, participant.lid])
  return canonical ? registerIdentity(ctx.chatId, aliases, canonical) : resolveStoredIdentity(candidate)
}

export async function resolveTarget(ctx: CommandContext, options: ResolveTargetOptions = {}) {
  const context = getContextInfo(ctx.message)
  const mentioned = context?.mentionedJid?.[0]
  const replied = context?.participant
  let candidate = mentioned ?? replied ?? ''

  if (!candidate && options.allowNumber !== false) {
    const raw = ctx.args.find((arg) => /^\+?[\d ()-]{8,22}$/.test(arg))?.replace(/\D/g, '')
    if (raw && raw.length >= 8 && raw.length <= 15) candidate = `${raw}@s.whatsapp.net`
  }

  if (!candidate) {
    if (options.requiredMessage) throw new Error(options.requiredMessage)
    return null
  }
  return canonicalizeTarget(ctx, candidate)
}

export async function isGroupAdministrator(ctx: CommandContext) {
  if (!ctx.isGroup) return ctx.isBotStaff || ctx.isOwner || ctx.isSubbotOwner
  if (ctx.isBotStaff || ctx.isOwner || ctx.isSubbotOwner) return true
  const metadata = await ctx.socket.groupMetadata(ctx.chatId).catch(() => null)
  if (!metadata) return false
  const participant = metadata.participants.find((item) => [item.id, item.phoneNumber, item.lid].filter(Boolean).includes(ctx.sender))
    ?? metadata.participants.find((item) => [item.id, item.phoneNumber, item.lid].filter(Boolean).some((jid) => jid && ctx.sender.startsWith(jid.split('@')[0]!)))
  return Boolean(participant?.admin)
}
