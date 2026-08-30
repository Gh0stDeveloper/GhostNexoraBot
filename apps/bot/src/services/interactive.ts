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

export type InteractiveButton =
  | { type: 'reply'; text: string; id: string }
  | { type: 'url'; text: string; url: string }

export type CarouselCard = {
  title: string
  body: string
  imageUrl?: string
  footer?: string
  buttons: InteractiveButton[]
}

function nativeButtons(buttons: InteractiveButton[]) {
  return buttons.slice(0, 3).map((button) => button.type === 'reply'
    ? { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: button.text, id: button.id }) }
    : { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: button.text, url: button.url, merchant_url: button.url }) })
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
    const content = await withTimeout(
      generateWAMessageContent({ image: { url: imageUrl } }, { upload: socket.waUploadToServer }),
      8_000,
      'interactive thumbnail',
    )
    return content.imageMessage ?? undefined
  } catch (error) {
    let host: string | undefined
    try { host = new URL(imageUrl).hostname } catch { /* ignore */ }
    logger.warn({ error, host }, 'interactive thumbnail failed; continuing without image')
    return undefined
  }
}

async function sendTextFallback(socket: WASocket, chatId: string, quoted: WAMessage, title: string, body: string, footer?: string) {
  const text = [
    `*${title}*`,
    body,
    footer ? `\n_${footer}_` : '',
  ].filter(Boolean).join('\n\n')
  await socket.sendMessage(chatId, { text }, { quoted })
}

export async function sendInteractiveCard(
  socket: WASocket,
  chatId: string,
  quoted: WAMessage,
  input: { title: string; body: string; footer?: string; imageUrl?: string; buttons?: InteractiveButton[] },
) {
  const userJid = socket.user?.id
  if (!userJid) throw new Error('La sesión de WhatsApp todavía no está autenticada.')
  const imageMessage = await imageMessageFromUrl(socket, input.imageUrl)
  const message = generateWAMessageFromContent(chatId, {
    viewOnceMessage: {
      message: {
        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
        interactiveMessage: proto.Message.InteractiveMessage.fromObject({
          body: proto.Message.InteractiveMessage.Body.create({ text: input.body }),
          footer: proto.Message.InteractiveMessage.Footer.create({ text: input.footer ?? 'Ghost Nexora Bot · Ghost Developer / Nexora' }),
          header: proto.Message.InteractiveMessage.Header.fromObject({
            title: input.title,
            hasMediaAttachment: Boolean(imageMessage),
            ...(imageMessage ? { imageMessage } : {}),
          }),
          nativeFlowMessage: nativeFlow(input.buttons ?? []),
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
    await sendTextFallback(socket, chatId, quoted, input.title, input.body, input.footer)
  }
}

export async function sendCarousel(
  socket: WASocket,
  chatId: string,
  quoted: WAMessage,
  input: { title: string; body?: string; footer?: string; cards: CarouselCard[] },
) {
  const userJid = socket.user?.id
  if (!userJid) throw new Error('La sesión de WhatsApp todavía no está autenticada.')

  const sourceCards = input.cards.slice(0, 8)
  const preparedImages = await Promise.all(sourceCards.map((card) => imageMessageFromUrl(socket, card.imageUrl)))
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
          body: proto.Message.InteractiveMessage.Body.create({ text: (input.body ?? input.title).slice(0, 200) }),
          footer: proto.Message.InteractiveMessage.Footer.create({ text: (input.footer ?? 'Ghost Nexora Bot').slice(0, 60) }),
          header: proto.Message.InteractiveMessage.Header.create({ title: input.title.slice(0, 80), hasMediaAttachment: false }),
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
        title: 'Navegación',
        body: 'Hay más opciones disponibles.',
        footer: input.footer ?? 'Ghost Nexora Bot',
        buttons: overflowButtons,
      })
    }
  } catch (error) {
    logger.warn({ error, chatId, cards: cards.length }, 'carousel relay failed; sending text fallback')
    const summary = input.cards.slice(0, 8).map((card, index) => `${index + 1}. *${card.title}*\n${card.body}`).join('\n\n')
    await sendTextFallback(socket, chatId, quoted, input.title, [input.body, summary].filter(Boolean).join('\n\n'), input.footer)
  }
}
