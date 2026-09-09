import type { WAMessage, WASocket } from 'baileys'
import { config } from '../config.js'
import { localizeLegacyText, resolveChatLocale } from '../i18n/index.js'
import { logger } from '../utils/logger.js'
import { preloadWhatsAppMedia } from './whatsapp-media.js'

type RichLinkPreviewInput = {
  text: string
  imageSource?: string
  title: string
  description?: string
  url?: string
  mentions?: string[]
  quoted?: WAMessage
  label?: string
}

function isPublicHttpUrl(value: string | undefined) {
  if (!value) return false
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return false
    const host = url.hostname.toLowerCase()
    return !['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(host)
  } catch {
    return false
  }
}

export function richPreviewTargetUrl(preferred?: string) {
  if (isPublicHttpUrl(preferred)) return preferred!
  if (isPublicHttpUrl(config.publicWebUrl)) return config.publicWebUrl
  return config.officialChannelUrl
}

/**
 * Envía el mismo tipo de bloque que WhatsApp muestra como preview de enlace:
 * imagen grande, título/descripción y zona clicable que abre sourceUrl.
 *
 * La imagen puede seguir siendo un asset local: se materializa como Buffer y se
 * coloca en externalAdReply.thumbnail. El destino del clic es una URL pública
 * independiente (normalmente PUBLIC_WEB_URL).
 */
export async function sendRichLinkPreview(socket: WASocket, chatId: string, input: RichLinkPreviewInput) {
  const locale = resolveChatLocale(chatId)
  const sourceUrl = richPreviewTargetUrl(input.url)
  let thumbnail: Buffer | undefined
  let thumbnailUrl: string | undefined

  if (input.imageSource) {
    const prepared = await preloadWhatsAppMedia(input.imageSource, {
      maxBytes: 8 * 1024 * 1024,
      timeoutMs: 8_000,
      label: input.label ?? 'rich-link-preview',
    })
    if (Buffer.isBuffer(prepared)) thumbnail = prepared
    else if (/^https?:\/\//i.test(prepared.url)) thumbnailUrl = prepared.url
  }

  const text = localizeLegacyText(input.text, locale)
  const title = localizeLegacyText(input.title, locale).slice(0, 80)
  const body = localizeLegacyText(input.description ?? 'Ghost Nexora Bot', locale).slice(0, 120)

  try {
    return await socket.sendMessage(chatId, {
      text,
      contextInfo: {
        ...(input.mentions?.length ? { mentionedJid: input.mentions } : {}),
        externalAdReply: {
          title,
          body,
          sourceUrl,
          mediaUrl: sourceUrl,
          mediaType: 1,
          renderLargerThumbnail: true,
          showAdAttribution: false,
          ...(thumbnail ? { thumbnail } : {}),
          ...(thumbnailUrl ? { thumbnailUrl } : {}),
        },
      },
    }, input.quoted ? { quoted: input.quoted } : undefined)
  } catch (error) {
    logger.warn({ error, chatId, sourceUrl }, 'rich link preview failed; sending plain text fallback')
    return socket.sendMessage(chatId, {
      text,
      ...(input.mentions?.length ? { mentions: input.mentions } : {}),
    }, input.quoted ? { quoted: input.quoted } : undefined)
  }
}
