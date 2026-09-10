import type { NormalizedMedia, NormalizedMessage } from '@ghostnexora/platform-contracts'
import type { TelegramMessage } from './types.js'

function displayName(message: TelegramMessage) {
  const user = message.from
  if (!user) return message.sender_chat?.title || message.chat.title || 'Telegram'
  const full = [user.first_name, user.last_name].filter(Boolean).join(' ').trim()
  return full || (user.username ? `@${user.username}` : `Telegram ${user.id}`)
}

function media(message: TelegramMessage): NormalizedMedia | undefined {
  if (message.photo?.length) {
    const item = message.photo.at(-1)!
    return { kind: 'image', mimeType: 'image/jpeg', sizeBytes: item.file_size }
  }
  if (message.video) return { kind: 'video', mimeType: message.video.mime_type, sizeBytes: message.video.file_size, fileName: message.video.file_name }
  if (message.audio) return { kind: 'audio', mimeType: message.audio.mime_type, sizeBytes: message.audio.file_size, fileName: message.audio.file_name }
  if (message.voice) return { kind: 'audio', mimeType: message.voice.mime_type || 'audio/ogg', sizeBytes: message.voice.file_size, fileName: message.voice.file_name }
  if (message.document) return { kind: 'document', mimeType: message.document.mime_type, sizeBytes: message.document.file_size, fileName: message.document.file_name }
  if (message.sticker) return { kind: 'sticker', mimeType: message.sticker.mime_type, sizeBytes: message.sticker.file_size, fileName: message.sticker.file_name }
  return undefined
}

export function telegramFileId(message: TelegramMessage) {
  if (message.photo?.length) return message.photo.at(-1)?.file_id
  return message.video?.file_id || message.audio?.file_id || message.voice?.file_id || message.document?.file_id || message.sticker?.file_id
}

export function normalizeTelegramMessage(message: TelegramMessage, botInstanceId = 'telegram-main'): NormalizedMessage {
  return {
    platform: 'telegram',
    botInstanceId,
    chatId: String(message.chat.id),
    senderId: `telegram:${message.from?.id ?? message.sender_chat?.id ?? message.chat.id}`,
    messageId: String(message.message_id),
    text: message.text ?? message.caption ?? '',
    isGroup: message.chat.type === 'group' || message.chat.type === 'supergroup',
    replyTo: message.reply_to_message ? String(message.reply_to_message.message_id) : undefined,
    pushName: displayName(message),
    media: media(message),
    raw: message,
  }
}
