import type { NormalizedMedia, NormalizedMessage } from '@ghostnexora/platform-contracts'
import type { DiscordAttachment, DiscordMessage } from './types.js'

function displayName(message: DiscordMessage) {
  return message.member?.nick || message.author.global_name || message.author.username || `Discord ${message.author.id}`
}

function media(attachment?: DiscordAttachment): NormalizedMedia | undefined {
  if (!attachment) return undefined
  const mime = attachment.content_type || ''
  const kind = mime.startsWith('image/')
    ? 'image'
    : mime.startsWith('video/')
      ? 'video'
      : mime.startsWith('audio/')
        ? 'audio'
        : 'document'
  return {
    kind,
    mimeType: attachment.content_type,
    fileName: attachment.filename,
    sizeBytes: attachment.size,
    url: attachment.url,
  }
}

export function normalizeDiscordMessage(message: DiscordMessage, botInstanceId = 'discord-main'): NormalizedMessage {
  return {
    platform: 'discord',
    botInstanceId,
    chatId: message.channel_id,
    senderId: `discord:${message.author.id}`,
    messageId: message.id,
    text: message.content || '',
    isGroup: Boolean(message.guild_id),
    replyTo: message.message_reference?.message_id,
    pushName: displayName(message),
    media: media(message.attachments?.[0]),
    raw: message,
  }
}
