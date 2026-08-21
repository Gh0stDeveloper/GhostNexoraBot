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
          nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({ buttons: nativeButtons(input.buttons ?? []) }),
        }),
      },
    },
  }, { quoted, userJid })
  try {
    await socket.relayMessage(chatId, message.message!, { messageId: message.key.id! })
  } catch {
    // El menú y las tarjetas informativas no deben desaparecer si Meta rechaza
    // temporalmente un native-flow interactivo. El fallback evita exponer URLs
    // secretas de botones: solo envía el contenido textual de la tarjeta.
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

  try {
    await socket.relayMessage(chatId, message.message!, { messageId: message.key.id! })
  } catch {
    const summary = input.cards.slice(0, 10).map((card, index) => `${index + 1}. *${card.title}*\n${card.body}`).join('\n\n')
    await sendTextFallback(socket, chatId, quoted, input.title, [input.body, summary].filter(Boolean).join('\n\n'), input.footer)
  }
}
