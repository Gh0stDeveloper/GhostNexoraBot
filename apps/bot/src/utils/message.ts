import { downloadContentFromMessage, type AnyMessageContent, type proto, type WAMessage } from 'baileys'

export function unwrapMessage(message: proto.IMessage | null | undefined): proto.IMessage | undefined {
  if (!message) return undefined
  if (message.ephemeralMessage?.message) return unwrapMessage(message.ephemeralMessage.message)
  if (message.viewOnceMessage?.message) return unwrapMessage(message.viewOnceMessage.message)
  if (message.viewOnceMessageV2?.message) return unwrapMessage(message.viewOnceMessageV2.message)
  if (message.documentWithCaptionMessage?.message) return unwrapMessage(message.documentWithCaptionMessage.message)
  return message
}

function interactiveReply(content: proto.IMessage) {
  const paramsJson = content.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson
  if (!paramsJson) return ''
  try {
    const data = JSON.parse(paramsJson) as Record<string, unknown>
    for (const key of ['id', 'selected_id', 'selectedId', 'row_id']) {
      if (typeof data[key] === 'string') return data[key] as string
    }
  } catch { return '' }
  return ''
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
    content.buttonsResponseMessage?.selectedButtonId ??
    content.listResponseMessage?.singleSelectReply?.selectedRowId ??
    content.templateButtonReplyMessage?.selectedId ??
    interactiveReply(content) ??
    ''
  ).trim()
}

export function getContextInfo(message: WAMessage): proto.IContextInfo | undefined {
  const content = unwrapMessage(message.message)
  return (
    content?.extendedTextMessage?.contextInfo ?? content?.imageMessage?.contextInfo ?? content?.videoMessage?.contextInfo ??
    content?.documentMessage?.contextInfo ?? content?.stickerMessage?.contextInfo ?? content?.buttonsResponseMessage?.contextInfo ??
    content?.listResponseMessage?.contextInfo ?? content?.interactiveResponseMessage?.contextInfo ?? undefined
  )
}

export function getSender(message: WAMessage): string { return message.key.participant ?? message.key.remoteJid ?? '' }
export function getSenderCandidates(message: WAMessage): string[] {
  return [...new Set([message.key.participantAlt, message.key.remoteJidAlt, message.key.participant, message.key.remoteJid].filter((value): value is string => Boolean(value)))]
}
export function digitsFromJid(jid: string): string { return jid.split('@')[0]?.split(':')[0]?.replace(/\D/g, '') ?? '' }

export interface DownloadedMedia {
  buffer: Buffer
  kind: 'image' | 'video' | 'sticker' | 'document'
  mimetype?: string | null
  fileName?: string | null
}

function selectMedia(content: proto.IMessage | undefined) {
  if (!content) return null
  if (content.imageMessage) return { node: content.imageMessage, kind: 'image' as const, mimetype: content.imageMessage.mimetype, fileName: null }
  if (content.videoMessage) return { node: content.videoMessage, kind: 'video' as const, mimetype: content.videoMessage.mimetype, fileName: null }
  if (content.stickerMessage) return { node: content.stickerMessage, kind: 'sticker' as const, mimetype: content.stickerMessage.mimetype, fileName: null }
  if (content.documentMessage) return { node: content.documentMessage, kind: 'document' as const, mimetype: content.documentMessage.mimetype, fileName: content.documentMessage.fileName ?? null }
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
  return { buffer: Buffer.concat(chunks), kind: target.kind, mimetype: target.mimetype, fileName: target.fileName }
}

export function textContent(text: string): AnyMessageContent { return { text } }
