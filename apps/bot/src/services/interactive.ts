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
    let imageMessage: proto.Message.IImageMessage | undefined
    if (card.imageUrl) {
      try {
        const content = await generateWAMessageContent({ image: { url: card.imageUrl } }, { upload: socket.waUploadToServer })
        imageMessage = content.imageMessage ?? undefined
      } catch {
        imageMessage = undefined
      }
    }
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
