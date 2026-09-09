import {
  generateWAMessageContent,
  generateWAMessageFromContent,
  proto,
  type BinaryNode,
  type WAMessage,
  type WASocket,
} from 'baileys'
import { logger } from '../utils/logger.js'
import { withTimeout } from '../utils/timeout.js'
import { localizeLegacyText, resolveChatLocale, translate, type LocaleCode } from '../i18n/index.js'
import { preloadWhatsAppMedia } from './whatsapp-media.js'

export type InteractiveSelectRow = {
  id: string
  title: string
  description?: string
  header?: string
}

export type InteractiveSelectSection = {
  title: string
  rows: InteractiveSelectRow[]
}

export type InteractiveButton =
  | { type: 'reply'; text: string; id: string }
  | { type: 'url'; text: string; url: string }
  | { type: 'select'; text: string; sections: InteractiveSelectSection[] }

export type CarouselCard = {
  title: string
  body: string
  imageUrl?: string
  footer?: string
  buttons: InteractiveButton[]
}

function localizedButton(button: InteractiveButton, locale: LocaleCode): InteractiveButton {
  if (button.type === 'reply') return { ...button, text: localizeLegacyText(button.text, locale) }
  if (button.type === 'url') return { ...button, text: localizeLegacyText(button.text, locale) }
  return {
    ...button,
    text: localizeLegacyText(button.text, locale),
    sections: button.sections.map((section) => ({
      ...section,
      title: localizeLegacyText(section.title, locale),
      rows: section.rows.map((row) => ({
        ...row,
        title: localizeLegacyText(row.title, locale),
        description: row.description ? localizeLegacyText(row.description, locale) : undefined,
        header: row.header ? localizeLegacyText(row.header, locale) : undefined,
      })),
    })),
  }
}

function nativeButton(button: InteractiveButton) {
  if (button.type === 'reply') {
    return { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: button.text, id: button.id }) }
  }
  if (button.type === 'url') {
    return { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: button.text, url: button.url, merchant_url: button.url }) }
  }
  return {
    name: 'single_select',
    buttonParamsJson: JSON.stringify({
      title: button.text,
      sections: button.sections.map((section) => ({
        title: section.title,
        rows: section.rows.map((row) => ({
          id: row.id,
          title: row.title,
          ...(row.description ? { description: row.description } : {}),
          ...(row.header ? { header: row.header } : {}),
        })),
      })),
    }),
  }
}

function nativeButtons(buttons: InteractiveButton[]) {
  return buttons.slice(0, 3).map(nativeButton)
}

function nativeFlow(buttons: InteractiveButton[]) {
  return proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
    buttons: nativeButtons(buttons),
    messageParamsJson: '{}',
    messageVersion: 1,
  })
}

function interactiveRelayNodes(chatId: string): BinaryNode[] {
  const bizNode: BinaryNode = {
    tag: 'biz',
    attrs: {
      actual_actors: '2',
      host_storage: '2',
      privacy_mode_ts: String(Math.floor(Date.now() / 1000)),
    },
    content: [
      {
        tag: 'interactive',
        attrs: { type: 'native_flow', v: '1' },
        content: [
          {
            tag: 'native_flow',
            attrs: { v: '9', name: 'mixed' },
          },
        ],
      },
      {
        tag: 'quality_control',
        attrs: { source_type: 'third_party' },
      },
    ],
  }

  if (chatId.endsWith('@g.us')) return [bizNode]
  const botNode: BinaryNode = { tag: 'bot', attrs: { biz_bot: '1' } }
  return [botNode, bizNode]
}

async function imageMessageFromUrl(socket: WASocket, imageUrl?: string) {
  if (!imageUrl) return undefined
  try {
    const image = await preloadWhatsAppMedia(imageUrl, {
      maxBytes: 20 * 1024 * 1024,
      timeoutMs: 8_000,
      label: 'interactive-image',
    })
    const content = await withTimeout(
      generateWAMessageContent({ image }, { upload: socket.waUploadToServer }),
      15_000,
      'interactive image upload',
    )
    return content.imageMessage ?? undefined
  } catch (error) {
    let host: string | undefined
    try { host = new URL(imageUrl).hostname } catch { /* local path or invalid URL */ }
    logger.warn({ error, host }, 'interactive image upload failed; continuing without image')
    return undefined
  }
}

async function sendTextFallback(socket: WASocket, chatId: string, quoted: WAMessage, title: string, body: string, footer?: string) {
  const locale = resolveChatLocale(chatId)
  const text = [
    `*${localizeLegacyText(title, locale)}*`,
    localizeLegacyText(body, locale),
    footer ? `\n_${localizeLegacyText(footer, locale)}_` : '',
  ].filter(Boolean).join('\n\n')
  await socket.sendMessage(chatId, { text }, { quoted })
}

export async function sendInteractiveCard(
  socket: WASocket,
  chatId: string,
  quoted: WAMessage,
  input: { title: string; body: string; footer?: string; imageUrl?: string; buttons?: InteractiveButton[] },
) {
  const locale = resolveChatLocale(chatId)
  const userJid = socket.user?.id
  if (!userJid) throw new Error(translate(locale, 'interactive.authRequired'))
  const imageMessage = await imageMessageFromUrl(socket, input.imageUrl)
  const title = localizeLegacyText(input.title, locale)
  const body = localizeLegacyText(input.body, locale)
  const footer = localizeLegacyText(input.footer ?? 'Ghost Nexora Bot · Ghost Developer / Nexora', locale)
  const buttons = (input.buttons ?? []).map((button) => localizedButton(button, locale))
  const message = generateWAMessageFromContent(chatId, {
    viewOnceMessage: {
      message: {
        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
        interactiveMessage: proto.Message.InteractiveMessage.fromObject({
          body: proto.Message.InteractiveMessage.Body.create({ text: body }),
          footer: proto.Message.InteractiveMessage.Footer.create({ text: footer }),
          header: proto.Message.InteractiveMessage.Header.fromObject({
            title,
            hasMediaAttachment: Boolean(imageMessage),
            ...(imageMessage ? { imageMessage } : {}),
          }),
          nativeFlowMessage: nativeFlow(buttons),
        }),
      },
    },
  }, { quoted, userJid })
  const additionalNodes = interactiveRelayNodes(chatId)
  try {
    await withTimeout(
      socket.relayMessage(chatId, message.message!, { messageId: message.key.id!, additionalNodes }),
      25_000,
      'interactive card relay',
    )
    logger.info({ chatId, messageId: message.key.id, relayNodes: additionalNodes.map((node) => node.tag) }, 'interactive card relay completed')
  } catch (error) {
    logger.warn({ error, chatId }, 'interactive card relay failed; sending text fallback')
    await sendTextFallback(socket, chatId, quoted, title, body, footer)
  }
}

export async function sendCarousel(
  socket: WASocket,
  chatId: string,
  quoted: WAMessage,
  input: { title: string; body?: string; footer?: string; cards: CarouselCard[] },
) {
  const locale = resolveChatLocale(chatId)
  const userJid = socket.user?.id
  if (!userJid) throw new Error(translate(locale, 'interactive.authRequired'))

  const localizedInput = {
    title: localizeLegacyText(input.title, locale),
    body: input.body ? localizeLegacyText(input.body, locale) : undefined,
    footer: input.footer ? localizeLegacyText(input.footer, locale) : undefined,
    cards: input.cards.map((card) => ({
      ...card,
      title: localizeLegacyText(card.title, locale),
      body: localizeLegacyText(card.body, locale),
      footer: card.footer ? localizeLegacyText(card.footer, locale) : undefined,
      buttons: card.buttons.map((button) => localizedButton(button, locale)),
    })),
  }

  const sourceCards = localizedInput.cards.slice(0, 8)
  // La tienda suele reutilizar exactamente la misma waifu en todas sus cards.
  // Prepararla una sola vez evita descargar/cifrar/subir el mismo archivo 4-8 veces.
  const imageCache = new Map<string, Promise<Awaited<ReturnType<typeof imageMessageFromUrl>>>>()
  const preparedImages = await Promise.all(sourceCards.map((card) => {
    if (!card.imageUrl) return undefined
    let prepared = imageCache.get(card.imageUrl)
    if (!prepared) {
      prepared = imageMessageFromUrl(socket, card.imageUrl)
      imageCache.set(card.imageUrl, prepared)
    }
    return prepared
  }))
  const overflowButtons = sourceCards.flatMap((card) => card.buttons.slice(2)).slice(0, 3)

  const cards = sourceCards.map((card, index) => {
    const imageMessage = preparedImages[index]
    return {
      body: proto.Message.InteractiveMessage.Body.fromObject({ text: card.body.slice(0, 140) }),
      footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: (card.footer ?? 'Ghost Nexora Bot').slice(0, 60) }),
      header: proto.Message.InteractiveMessage.Header.fromObject({
        title: card.title.slice(0, 80),
        hasMediaAttachment: Boolean(imageMessage),
        ...(imageMessage ? { imageMessage } : {}),
      }),
      nativeFlowMessage: nativeFlow(card.buttons.slice(0, 2)),
    }
  })

  const message = generateWAMessageFromContent(chatId, {
    viewOnceMessage: {
      message: {
        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
        interactiveMessage: proto.Message.InteractiveMessage.fromObject({
          body: proto.Message.InteractiveMessage.Body.create({ text: (localizedInput.body ?? localizedInput.title).slice(0, 200) }),
          footer: proto.Message.InteractiveMessage.Footer.create({ text: (localizedInput.footer ?? 'Ghost Nexora Bot').slice(0, 60) }),
          header: proto.Message.InteractiveMessage.Header.create({ title: localizedInput.title.slice(0, 80), hasMediaAttachment: false }),
          carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({ cards }),
        }),
      },
    },
  }, { quoted, userJid })

  const additionalNodes = interactiveRelayNodes(chatId)
  try {
    await withTimeout(
      socket.relayMessage(chatId, message.message!, { messageId: message.key.id!, additionalNodes }),
      25_000,
      'carousel relay',
    )
    logger.info({ chatId, messageId: message.key.id, cards: cards.length, relayNodes: additionalNodes.map((node) => node.tag) }, 'carousel relay completed')

    if (overflowButtons.length) {
      await sendInteractiveCard(socket, chatId, quoted, {
        title: translate(locale, 'interactive.navigation.title'),
        body: translate(locale, 'interactive.navigation.more'),
        footer: localizedInput.footer ?? 'Ghost Nexora Bot',
        buttons: overflowButtons,
      })
    }
  } catch (error) {
    logger.warn({ error, chatId, cards: cards.length }, 'carousel relay failed; sending text fallback')
    const summary = localizedInput.cards.slice(0, 8).map((card, index) => `${index + 1}. *${card.title}*\n${card.body}`).join('\n\n')
    await sendTextFallback(socket, chatId, quoted, localizedInput.title, [localizedInput.body, summary].filter(Boolean).join('\n\n'), localizedInput.footer)
  }
}
