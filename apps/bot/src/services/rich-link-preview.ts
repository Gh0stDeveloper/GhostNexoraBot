import type { WAMessage, WASocket } from 'baileys'
import { config } from '../config.js'
import { settings } from '../core/settings.js'
import { localizeLegacyText, resolveChatLocale } from '../i18n/index.js'
import { logger } from '../utils/logger.js'
import { sendInteractiveCard } from './interactive.js'
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

function isParticipantGreeting(label?: string) {
  return label === 'welcome-waifu-link-preview' || label === 'goodbye-waifu-link-preview'
}

/**
 * Envía previews enriquecidos para superficies que todavía los necesitan.
 * Bienvenidas y despedidas usan el mismo transporte interactivo estable del menú,
 * porque los externalAdReply no se renderizan de forma consistente en todos los
 * clientes recientes de WhatsApp.
 */
export async function sendRichLinkPreview(socket: WASocket, chatId: string, input: RichLinkPreviewInput) {
  const locale = resolveChatLocale(chatId)
  const sourceUrl = richPreviewTargetUrl(input.url)
  const text = localizeLegacyText(input.text, locale)
  const title = localizeLegacyText(input.title, locale).slice(0, 80)
  const body = localizeLegacyText(input.description ?? 'Ghost Nexora Bot', locale).slice(0, 120)

  if (isParticipantGreeting(input.label)) {
    return sendInteractiveCard(socket, chatId, input.quoted, {
      title,
      body: text,
      imageUrl: input.imageSource,
      footer: body,
      buttons: [
        {
          type: 'reply',
          text: locale === 'en' ? 'Open menu' : 'Abrir menú',
          id: `${settings.prefix}menu`,
        },
      ],
    })
  }

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
