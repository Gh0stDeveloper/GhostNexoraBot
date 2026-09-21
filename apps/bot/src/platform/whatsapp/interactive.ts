import {
  generateWAMessageContent,
  generateWAMessageFromContent,
  proto,
  type BinaryNode,
  type WAMessage,
  type WASocket,
} from 'baileys'
import { logger } from '../../utils/logger.js'
import { withTimeout } from '../../utils/timeout.js'
import { localizeLegacyText, resolveChatLocale, translate, type LocaleCode } from '../../i18n/index.js'
import { localizedSocketContext } from './localized-socket.js'
import { preloadWhatsAppMedia } from './media.js'
import {
  cardFallbackText,
  carouselFallbackText,
  planInteractiveCard,
  WHATSAPP_STABLE_UI_POLICY,
  type CarouselCard,
  type InteractiveButton,
} from './ui-compat.js'

export type {
  CarouselCard,
  InteractiveButton,
  InteractiveSelectRow,
  InteractiveSelectSection,
} from './ui-compat.js'

function interactiveLocale(socket: WASocket, chatId: string): LocaleCode {
  const context = localizedSocketContext(socket)
  if (context?.chatId === chatId) return context.locale
  return resolveChatLocale(chatId, undefined, context?.botInstanceId ?? 'main')
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

async function sendTextFallback(
  socket: WASocket,
  chatId: string,
  quoted: WAMessage | undefined,
  text: string,
) {
  const sent = await socket.sendMessage(chatId, { text }, quoted ? { quoted } : undefined)
  return sent?.key?.id ?? undefined
}

async function sendStandardCard(
  socket: WASocket,
  chatId: string,
  quoted: WAMessage | undefined,
  input: { title: string; body: string; footer?: string; imageUrl?: string },
) {
  const text = cardFallbackText(input)
  if (!input.imageUrl) return sendTextFallback(socket, chatId, quoted, text)

  try {
    const image = await preloadWhatsAppMedia(input.imageUrl, {
      maxBytes: 20 * 1024 * 1024,
      timeoutMs: 8_000,
      label: 'standard-card-image',
    })
    const sent = await socket.sendMessage(
      chatId,
      { image, caption: text },
      quoted ? { quoted } : undefined,
    )
    return sent?.key?.id ?? undefined
  } catch (error) {
    logger.warn({ error, chatId }, 'standard card image failed; sending text only')
    return sendTextFallback(socket, chatId, quoted, text)
  }
}

export type ClassicLocationMenuButton = {
  id: string
  text: string
}

export type ClassicLocationMenuInput = {
  name: string
  address: string
  body: string
  footer?: string
  thumbnailUrl?: string
  mentionedJids?: string[]
  buttons: ClassicLocationMenuButton[]
}

async function locationJpegThumbnail(source?: string) {
  if (!source) return undefined
  try {
    const media = await preloadWhatsAppMedia(source, {
      maxBytes: 8 * 1024 * 1024,
      timeoutMs: 8_000,
      label: 'classic-location-menu-thumbnail',
    })
    if (!Buffer.isBuffer(media)) return undefined

    try {
      const { default: sharp } = await import('sharp')
      return await sharp(media, { animated: false })
        .rotate()
        .resize(320, 180, { fit: 'cover', withoutEnlargement: true })
        .jpeg({ quality: 72, mozjpeg: true })
        .toBuffer()
    } catch (error) {
      logger.warn({ error }, 'classic location menu thumbnail conversion failed; continuing without thumbnail')
      return undefined
    }
  } catch (error) {
    logger.warn({ error }, 'classic location menu thumbnail preload failed; continuing without thumbnail')
    return undefined
  }
}

/**
 * Menú clásico de WhatsApp con locationMessage como cabecera visual.
 *
 * Se mantiene deliberadamente aislado a este transporte revisado. El resto de
 * la UI continúa usando InteractiveMessage/Native Flow. Si WhatsApp rechaza
 * el envelope clásico se vuelve al card moderno con botones quick-reply.
 */
export async function sendClassicLocationMenu(
  socket: WASocket,
  chatId: string,
  quoted: WAMessage | undefined,
  input: ClassicLocationMenuInput,
): Promise<string> {
  const locale = interactiveLocale(socket, chatId)
  const userJid = socket.user?.id
  if (!userJid) throw new Error(translate(locale, 'interactive.authRequired'))

  const body = localizeLegacyText(input.body, locale)
  const footer = localizeLegacyText(input.footer ?? 'Ghost Nexora Bot', locale)
  const name = localizeLegacyText(input.name, locale).slice(0, 80)
  const address = localizeLegacyText(input.address, locale).slice(0, 120)
  const buttons = input.buttons.slice(0, 3).map((button) => ({
    buttonId: button.id,
    buttonText: { displayText: localizeLegacyText(button.text, locale).slice(0, 20) },
    type: 1,
  }))
  const jpegThumbnail = await locationJpegThumbnail(input.thumbnailUrl)
  const mentionedJid = [...new Set(input.mentionedJids ?? [])].filter(Boolean)

  const locationMessage = proto.Message.LocationMessage.fromObject({
    degreesLatitude: 0,
    degreesLongitude: 0,
    name,
    address,
    ...(jpegThumbnail ? { jpegThumbnail } : {}),
    ...(mentionedJid.length ? {
      contextInfo: {
        mentionedJid,
        groupMentions: [],
        statusAttributions: [],
      },
    } : {}),
  })

  const message = generateWAMessageFromContent(chatId, {
    buttonsMessage: proto.Message.ButtonsMessage.fromObject({
      buttons,
      locationMessage,
      contentText: body,
      footerText: footer,
      headerType: 6,
    }),
  }, { ...(quoted ? { quoted } : {}), userJid })

  const generatedId = message.key.id
  if (!generatedId) throw new Error('WhatsApp classic location menu ID was not generated.')

  try {
    await withTimeout(
      socket.relayMessage(chatId, message.message!, { messageId: generatedId }),
      25_000,
      'classic location menu relay',
    )
    logger.info({
      chatId,
      messageId: generatedId,
      uiMode: 'classic-location-buttons',
      buttons: buttons.length,
      thumbnail: Boolean(jpegThumbnail),
    }, 'classic WhatsApp location menu relay completed')
    return generatedId
  } catch (error) {
    logger.warn({ error, chatId }, 'classic WhatsApp location menu failed; falling back to native-flow card')
    return sendInteractiveCard(socket, chatId, quoted, {
      title: name,
      body,
      footer,
      imageUrl: input.thumbnailUrl,
      buttons: input.buttons.slice(0, 3).map((button) => ({
        type: 'reply' as const,
        text: button.text,
        id: button.id,
      })),
    })
  }
}

/**
 * Transporte estable para tarjetas de WhatsApp.
 *
 * Los cards simples conservan Native Flow y los casos no representables mantienen
 * un fallback textual accionable. Este comportamiento es independiente del
 * transporte de carruseles nativos restaurado abajo.
 */
export async function sendInteractiveCard(
  socket: WASocket,
  chatId: string,
  quoted: WAMessage | undefined,
  input: { title: string; body: string; footer?: string; imageUrl?: string; buttons?: InteractiveButton[] },
): Promise<string> {
  const locale = interactiveLocale(socket, chatId)
  const userJid = socket.user?.id
  if (!userJid) throw new Error(translate(locale, 'interactive.authRequired'))

  const title = localizeLegacyText(input.title, locale)
  const body = localizeLegacyText(input.body, locale)
  const footer = localizeLegacyText(input.footer ?? 'Ghost Nexora Bot · Ghost Developer / Nexora', locale)
  const buttons = (input.buttons ?? []).map((button) => localizedButton(button, locale))
  const plan = planInteractiveCard(buttons)

  if (plan.mode === 'standard-message') {
    const messageId = await sendStandardCard(socket, chatId, quoted, {
      title,
      body,
      footer,
      imageUrl: input.imageUrl,
    })
    if (!messageId) throw new Error('WhatsApp standard card did not return a message ID.')
    logger.info({ chatId, messageId, uiMode: plan.mode }, 'compatible WhatsApp card sent')
    return messageId
  }

  if (plan.mode === 'text-fallback') {
    const messageId = await sendTextFallback(socket, chatId, quoted, cardFallbackText({
      title,
      body,
      footer,
      buttons: plan.buttons,
    }))
    if (!messageId) throw new Error('WhatsApp text fallback did not return a message ID.')
    logger.info({ chatId, messageId, uiMode: plan.mode, reason: plan.reason }, 'risky WhatsApp card replaced by text fallback')
    return messageId
  }

  const imageMessage = await imageMessageFromUrl(socket, input.imageUrl)
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
          nativeFlowMessage: nativeFlow(plan.buttons),
        }),
      },
    },
  }, { ...(quoted ? { quoted } : {}), userJid })
  const additionalNodes = interactiveRelayNodes(chatId)
  const generatedId = message.key.id
  if (!generatedId) throw new Error('WhatsApp interactive message ID was not generated.')

  try {
    await withTimeout(
      socket.relayMessage(chatId, message.message!, { messageId: generatedId, additionalNodes }),
      25_000,
      'interactive card relay',
    )
    logger.info({ chatId, messageId: generatedId, uiMode: plan.mode, relayNodes: additionalNodes.map((node) => node.tag) }, 'interactive card relay completed')
    return generatedId
  } catch (error) {
    logger.warn({ error, chatId }, 'interactive card relay failed; sending actionable text fallback')
    return (await sendTextFallback(socket, chatId, quoted, cardFallbackText({
      title,
      body,
      footer,
      buttons: plan.buttons,
    }))) ?? generatedId
  }
}

/**
 * Transporte nativo de carruseles WhatsApp.
 *
 * Recupera el comportamiento V1/V15 que utilizaban yts, erome, proveedores +18,
 * shop, minershop y el resto de callers de sendCarousel(). Se mantienen los
 * límites compatibles de ocho cards y dos acciones por card; botones adicionales
 * se envían después como navegación independiente. Si el relay nativo falla de
 * verdad, se conserva un fallback textual completo en lugar de perder resultados.
 */
export async function sendCarousel(
  socket: WASocket,
  chatId: string,
  quoted: WAMessage | undefined,
  input: { title: string; body?: string; footer?: string; cards: CarouselCard[] },
): Promise<string> {
  const locale = interactiveLocale(socket, chatId)
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

  const sourceCards = localizedInput.cards.slice(0, WHATSAPP_STABLE_UI_POLICY.maxCards)
  if (!sourceCards.length) {
    const messageId = await sendTextFallback(socket, chatId, quoted, carouselFallbackText({
      title: localizedInput.title,
      body: localizedInput.body,
      footer: localizedInput.footer,
      cards: [],
    }))
    if (!messageId) throw new Error('WhatsApp empty carousel fallback did not return a message ID.')
    return messageId
  }

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

  const overflowButtons = sourceCards
    .flatMap((card) => card.buttons.slice(WHATSAPP_STABLE_UI_POLICY.maxButtonsPerCarouselCard))
    .slice(0, WHATSAPP_STABLE_UI_POLICY.maxNativeButtons)

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
      nativeFlowMessage: nativeFlow(card.buttons.slice(0, WHATSAPP_STABLE_UI_POLICY.maxButtonsPerCarouselCard)),
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
  }, { ...(quoted ? { quoted } : {}), userJid })

  const generatedId = message.key.id
  if (!generatedId) throw new Error('WhatsApp carousel message ID was not generated.')
  const additionalNodes = interactiveRelayNodes(chatId)

  try {
    await withTimeout(
      socket.relayMessage(chatId, message.message!, { messageId: generatedId, additionalNodes }),
      25_000,
      'carousel relay',
    )
    logger.info({
      chatId,
      messageId: generatedId,
      uiMode: 'native-carousel',
      cards: cards.length,
      relayNodes: additionalNodes.map((node) => node.tag),
    }, 'native WhatsApp carousel relay completed')

    if (overflowButtons.length) {
      await sendInteractiveCard(socket, chatId, quoted, {
        title: translate(locale, 'interactive.navigation.title'),
        body: translate(locale, 'interactive.navigation.more'),
        footer: localizedInput.footer ?? 'Ghost Nexora Bot',
        buttons: overflowButtons,
      })
    }
    return generatedId
  } catch (error) {
    logger.warn({ error, chatId, cards: cards.length }, 'native carousel relay failed; sending text fallback')
    return (await sendTextFallback(socket, chatId, quoted, carouselFallbackText({
      title: localizedInput.title,
      body: localizedInput.body,
      footer: localizedInput.footer,
      cards: sourceCards,
    }))) ?? generatedId
  }
}
