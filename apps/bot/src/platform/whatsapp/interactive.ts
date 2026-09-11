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
  planCarousel,
  planInteractiveCard,
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

/**
 * Transporte estable para tarjetas de WhatsApp.
 *
 * Fase 2 evita emitir un Native Flow cuando la combinación de acciones no puede
 * representarse de forma conservadora. Un card sin acciones usa un mensaje
 * estándar; un card que mezcla `single_select` con otros botones cae a texto
 * accionable; el resto conserva Native Flow y su fallback textual completo.
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
 * Compatibilidad de carruseles V2.
 *
 * El sobre de carrusel nativo queda deliberadamente fuera del camino estable porque
 * el servidor puede aceptar el relay aunque el cliente termine mostrando el aviso
 * de actualización de WhatsApp. Los carruseles formados únicamente por acciones
 * de comando se convierten a una tarjeta `single_select`; si contienen URLs o
 * acciones anidadas se renderizan como texto accionable que conserva cada enlace
 * y comando. Así ningún caller heredado necesita reescribirse para recibir el fix.
 */
export async function sendCarousel(
  socket: WASocket,
  chatId: string,
  quoted: WAMessage | undefined,
  input: { title: string; body?: string; footer?: string; cards: CarouselCard[] },
): Promise<string> {
  const locale = interactiveLocale(socket, chatId)
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

  const plan = planCarousel(localizedInput.cards)
  if (plan.mode === 'text-fallback') {
    const messageId = await sendTextFallback(socket, chatId, quoted, carouselFallbackText({
      title: localizedInput.title,
      body: localizedInput.body,
      footer: localizedInput.footer,
      cards: plan.cards,
    }))
    if (!messageId) throw new Error('WhatsApp carousel compatibility fallback did not return a message ID.')
    logger.info({ chatId, messageId, uiMode: plan.mode, reason: plan.reason, cards: plan.cards.length }, 'carousel replaced by compatible text UI')
    return messageId
  }

  const firstImage = plan.cards.find((card) => Boolean(card.imageUrl))?.imageUrl
  const messageId = await sendInteractiveCard(socket, chatId, quoted, {
    title: localizedInput.title,
    body: localizedInput.body ?? `${plan.cards.length} resultados disponibles.`,
    footer: localizedInput.footer ?? 'Ghost Nexora Bot',
    imageUrl: firstImage,
    buttons: [{
      type: 'select',
      text: localizeLegacyText('Seleccionar', locale),
      sections: plan.sections,
    }],
  })
  logger.info({ chatId, messageId, uiMode: plan.mode, cards: plan.cards.length, sections: plan.sections.length }, 'carousel converted to select-first UI')
  return messageId
}
