import {
  generateWAMessageContent,
  generateWAMessageFromContent,
  proto,
  type WAMessage,
  type WASocket,
} from 'baileys'

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

async function imageMessageFromUrl(socket: WASocket, imageUrl?: string) {
  if (!imageUrl) return undefined
  try {
    const content = await generateWAMessageContent({ image: { url: imageUrl } }, { upload: socket.waUploadToServer })
    return content.imageMessage ?? undefined
  } catch {
    return undefined
  }
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
          nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({ buttons: nativeButtons(input.buttons ?? []) }),
        }),
      },
    },
  }, { quoted, userJid })
  await socket.relayMessage(chatId, message.message!, { messageId: message.key.id! })
}

export async function sendCarousel(
  socket: WASocket,
  chatId: string,
  quoted: WAMessage,
  input: { title: string; body?: string; footer?: string; cards: CarouselCard[] },
) {
  const userJid = socket.user?.id
  if (!userJid) throw new Error('La sesión de WhatsApp todavía no está autenticada.')

  const cards = []
  for (const card of input.cards.slice(0, 12)) {
    const imageMessage = await imageMessageFromUrl(socket, card.imageUrl)
    cards.push({
      body: proto.Message.InteractiveMessage.Body.fromObject({ text: card.body }),
      footer: proto.Message.InteractiveMessage.Footer.fromObject({ text: card.footer ?? 'Ghost Nexora Bot' }),
      header: proto.Message.InteractiveMessage.Header.fromObject({
        title: card.title,
        hasMediaAttachment: Boolean(imageMessage),
        ...(imageMessage ? { imageMessage } : {}),
      }),
      nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({ buttons: nativeButtons(card.buttons) }),
    })
  }

  const message = generateWAMessageFromContent(chatId, {
    viewOnceMessage: {
      message: {
        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
        interactiveMessage: proto.Message.InteractiveMessage.fromObject({
          body: proto.Message.InteractiveMessage.Body.create({ text: input.body ?? input.title }),
          footer: proto.Message.InteractiveMessage.Footer.create({ text: input.footer ?? 'Ghost Nexora Bot' }),
          header: proto.Message.InteractiveMessage.Header.create({ title: input.title, hasMediaAttachment: false }),
          carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({ cards }),
        }),
      },
    },
  }, { quoted, userJid })

  await socket.relayMessage(chatId, message.message!, { messageId: message.key.id! })
}
