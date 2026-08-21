import { downloadContentFromMessage, type AnyMessageContent, type proto, type WAMessage } from 'baileys'

export function unwrapMessage(message: proto.IMessage | null | undefined): proto.IMessage | undefined {
  if (!message) return undefined
  if (message.ephemeralMessage?.message) return unwrapMessage(message.ephemeralMessage.message)
  if (message.viewOnceMessage?.message) return unwrapMessage(message.viewOnceMessage.message)
  if (message.viewOnceMessageV2?.message) return unwrapMessage(message.viewOnceMessageV2.message)
  if (message.documentWithCaptionMessage?.message) return unwrapMessage(message.documentWithCaptionMessage.message)
  return message
}

export function getMessageText(message: WAMessage): string {
  const content = unwrapMessage(message.message)
  if (!content) return ''
  return (
    content.conversation ??
    content.extendedTextMessage?.text ??
    content.imageMessage?.caption ??
    content.videoMessage?.caption ??
    content.documentMessage?.caption ??
    ''
  ).trim()
}

export function getContextInfo(message: WAMessage): proto.IContextInfo | undefined {
  const content = unwrapMessage(message.message)
  return (
    content?.extendedTextMessage?.contextInfo ??
    content?.imageMessage?.contextInfo ??
    content?.videoMessage?.contextInfo ??
    content?.documentMessage?.contextInfo ??
    content?.stickerMessage?.contextInfo ??
    undefined
  )
}

export function getSender(message: WAMessage): string {
  return message.key.participant ?? message.key.remoteJid ?? ''
}

export function digitsFromJid(jid: string): string {
  return jid.split('@')[0]?.split(':')[0]?.replace(/\D/g, '') ?? ''
}

export interface DownloadedMedia {
  buffer: Buffer
  kind: 'image' | 'video' | 'sticker'
  mimetype?: string | null
}

function selectMedia(content: proto.IMessage | undefined) {
  if (!content) return null
  if (content.imageMessage) return { node: content.imageMessage, kind: 'image' as const, mimetype: content.imageMessage.mimetype }
  if (content.videoMessage) return { node: content.videoMessage, kind: 'video' as const, mimetype: content.videoMessage.mimetype }
  if (content.stickerMessage) return { node: content.stickerMessage, kind: 'sticker' as const, mimetype: content.stickerMessage.mimetype }
  return null
}

export async function downloadMessageMedia(message: WAMessage): Promise<DownloadedMedia | null> {
  const own = selectMedia(unwrapMessage(message.message))
  const quoted = selectMedia(unwrapMessage(getContextInfo(message)?.quotedMessage))
  const target = own ?? quoted
  if (!target) return null

  const stream = await downloadContentFromMessage(target.node as never, target.kind)
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return { buffer: Buffer.concat(chunks), kind: target.kind, mimetype: target.mimetype }
}

export function textContent(text: string): AnyMessageContent {
  return { text }
}
