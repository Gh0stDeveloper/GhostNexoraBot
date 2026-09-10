import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import {
  createPlatformCapabilities,
  normalizedUiToText,
  type NormalizedUi,
  type OutgoingMedia,
  type PlatformAdapter,
  type SendOptions,
  type SentMessage,
  type UiAction,
} from '@ghostnexora/platform-contracts'
import { DiscordRestClient } from './rest.js'
import type { DiscordActionRow, DiscordCreateMessageBody, DiscordEmbed, DiscordMessage } from './types.js'

const DISCORD_TEXT_LIMIT = 2000
const DISCORD_EMBED_DESCRIPTION_LIMIT = 4096
const DISCORD_CUSTOM_ID_LIMIT = 100
// Create Message has a 25 MiB request ceiling. Keep 1 MiB for multipart metadata/overhead.
const MAX_UPLOAD_BYTES = 24 * 1024 * 1024
const COMPONENT_TTL_MS = 30 * 60_000

type ComponentEntry = { command: string; expiresAt: number }

function chunks(text: string, limit = DISCORD_TEXT_LIMIT) {
  if (text.length <= limit) return [text]
  const result: string[] = []
  let rest = text
  while (rest.length > limit) {
    let splitAt = rest.lastIndexOf('\n', limit)
    if (splitAt < Math.floor(limit * 0.55)) splitAt = rest.lastIndexOf(' ', limit)
    if (splitAt < Math.floor(limit * 0.55)) splitAt = limit
    result.push(rest.slice(0, splitAt).trimEnd())
    rest = rest.slice(splitAt).trimStart()
  }
  if (rest) result.push(rest)
  return result
}

function sent(message: DiscordMessage): SentMessage {
  return {
    platform: 'discord',
    chatId: message.channel_id,
    messageId: message.id,
    raw: message,
  }
}

function baseBody(options?: SendOptions): DiscordCreateMessageBody {
  return {
    allowed_mentions: { parse: [], replied_user: false },
    ...(options?.replyTo ? {
      message_reference: {
        message_id: options.replyTo,
        fail_if_not_exists: false,
      },
    } : {}),
  }
}

function fallbackFileName(media: OutgoingMedia) {
  const extension = media.kind === 'image' ? 'jpg' : media.kind === 'video' ? 'mp4' : media.kind === 'audio' ? 'mp3' : 'bin'
  return `ghost-nexora-${Date.now()}.${extension}`
}

async function loadMedia(media: OutgoingMedia) {
  if (media.source.kind === 'bytes') return media.source.value
  if (media.source.kind === 'path') return new Uint8Array(await readFile(media.source.value))
  const response = await fetch(media.source.value, { signal: AbortSignal.timeout(120_000) })
  if (!response.ok) throw new Error(`No se pudo descargar media para Discord (${response.status}).`)
  const declared = Number(response.headers.get('content-length') || 0)
  if (declared > MAX_UPLOAD_BYTES) throw new Error('El archivo remoto supera el límite seguro de subida de Discord.')
  return new Uint8Array(await response.arrayBuffer())
}

function trim(value: string | undefined, limit: number) {
  if (!value) return undefined
  return value.length <= limit ? value : `${value.slice(0, Math.max(0, limit - 1))}…`
}

export class DiscordAdapter implements PlatformAdapter {
  readonly id = 'discord' as const
  readonly botInstanceId: string
  readonly capabilities = createPlatformCapabilities({
    editMessage: true,
    reactions: true,
    typing: true,
    buttons: true,
    carousel: false,
    embeds: true,
    files: true,
    polls: false,
    groupModeration: false,
    maxUploadBytes: MAX_UPLOAD_BYTES,
  })

  private readonly componentCommands = new Map<string, ComponentEntry>()

  constructor(
    readonly client: DiscordRestClient,
    botInstanceId = 'discord-main',
  ) {
    this.botInstanceId = botInstanceId
  }

  async start() { await this.client.getGatewayBot() }
  async stop() {}

  private pruneComponents() {
    const now = Date.now()
    for (const [key, value] of this.componentCommands) if (value.expiresAt <= now) this.componentCommands.delete(key)
  }

  private componentId(command: string) {
    this.pruneComponents()
    const direct = `gnb:cmd:${command}`
    if (Buffer.byteLength(direct, 'utf8') <= DISCORD_CUSTOM_ID_LIMIT) return direct
    const token = randomBytes(12).toString('base64url')
    this.componentCommands.set(token, { command, expiresAt: Date.now() + COMPONENT_TTL_MS })
    return `gnb:ref:${token}`
  }

  resolveComponentCustomId(customId?: string) {
    if (!customId) return undefined
    if (customId.startsWith('gnb:cmd:')) return customId.slice('gnb:cmd:'.length)
    if (!customId.startsWith('gnb:ref:')) return undefined
    this.pruneComponents()
    const token = customId.slice('gnb:ref:'.length)
    const value = this.componentCommands.get(token)
    if (!value || value.expiresAt <= Date.now()) {
      this.componentCommands.delete(token)
      return undefined
    }
    return value.command
  }

  private button(action: UiAction) {
    const label = trim(action.label, 80) || 'Abrir'
    return action.kind === 'url'
      ? { type: 2 as const, style: 5 as const, label, url: action.value }
      : { type: 2 as const, style: 1 as const, label, custom_id: this.componentId(action.value) }
  }

  private rows(actions: UiAction[]) {
    const buttons = actions.slice(0, 25).map((action) => this.button(action))
    const rows: DiscordActionRow[] = []
    for (let index = 0; index < buttons.length; index += 5) {
      rows.push({ type: 1, components: buttons.slice(index, index + 5) })
    }
    return rows
  }

  private uiPayload(ui: NormalizedUi) {
    if (ui.kind === 'text') return { content: ui.text }

    const actions: UiAction[] = []
    const embeds: DiscordEmbed[] = []
    if (ui.kind === 'card') {
      embeds.push({
        title: trim(ui.title, 256),
        description: trim(ui.body, DISCORD_EMBED_DESCRIPTION_LIMIT),
        ...(ui.imageUrl ? { image: { url: ui.imageUrl } } : {}),
        ...(ui.footer ? { footer: { text: trim(ui.footer, 2048) || '' } } : {}),
      })
      actions.push(...(ui.buttons ?? []))
    } else if (ui.kind === 'list') {
      const lines = ui.items.map((item, index) => {
        if (item.action) actions.push(item.action)
        return `${index + 1}. **${item.title}**${item.description ? ` — ${item.description}` : ''}`
      })
      embeds.push({
        title: trim(ui.title, 256),
        description: trim([ui.body, ...lines].filter(Boolean).join('\n'), DISCORD_EMBED_DESCRIPTION_LIMIT),
      })
    } else {
      for (const card of ui.cards.slice(0, 10)) {
        embeds.push({
          title: trim(card.title, 256),
          description: trim(card.body, DISCORD_EMBED_DESCRIPTION_LIMIT),
          ...(card.imageUrl ? { image: { url: card.imageUrl } } : {}),
          ...(card.footer ? { footer: { text: trim(card.footer, 2048) || '' } } : {}),
        })
        actions.push(...(card.buttons ?? []))
      }
    }

    return {
      ...(embeds.length ? { embeds } : { content: trim(normalizedUiToText(ui), DISCORD_TEXT_LIMIT) }),
      ...(actions.length ? { components: this.rows(actions) } : {}),
    }
  }

  async sendText(chatId: string, text: string, options?: SendOptions): Promise<SentMessage> {
    let last: DiscordMessage | undefined
    const parts = chunks(text || ' ')
    for (let index = 0; index < parts.length; index += 1) {
      last = await this.client.createMessage(chatId, {
        ...baseBody(index === 0 ? options : undefined),
        content: parts[index],
      })
    }
    if (!last) throw new Error('Discord no devolvió mensaje al enviar texto.')
    return sent(last)
  }

  async sendMedia(chatId: string, media: OutgoingMedia, options?: SendOptions): Promise<SentMessage> {
    const bytes = await loadMedia(media)
    if (bytes.byteLength > MAX_UPLOAD_BYTES) {
      throw new Error(`El archivo pesa ${bytes.byteLength} bytes y supera el límite seguro de Discord (${MAX_UPLOAD_BYTES}).`)
    }
    const fileName = media.fileName || fallbackFileName(media)
    const message = await this.client.createMessageWithFile(chatId, {
      ...baseBody(options),
      ...(media.caption ? { content: trim(media.caption, DISCORD_TEXT_LIMIT) } : {}),
      attachments: [{ id: 0, filename: fileName }],
    }, bytes, fileName, media.mimeType)
    return sent(message)
  }

  async sendUi(chatId: string, ui: NormalizedUi, options?: SendOptions): Promise<SentMessage> {
    if (ui.kind === 'text') return this.sendText(chatId, ui.text, options)
    const message = await this.client.createMessage(chatId, {
      ...baseBody(options),
      ...this.uiPayload(ui),
    })
    return sent(message)
  }

  async editMessage(chatId: string, messageId: string, text: string) {
    await this.client.editMessage(chatId, messageId, {
      content: trim(text || ' ', DISCORD_TEXT_LIMIT),
      allowed_mentions: { parse: [], replied_user: false },
    })
  }

  async setTyping(chatId: string, active: boolean) {
    if (active) await this.client.triggerTyping(chatId)
  }

  async react(chatId: string, messageId: string, reaction: string) {
    if (!reaction) return
    await this.client.createReaction(chatId, messageId, reaction)
  }
}
