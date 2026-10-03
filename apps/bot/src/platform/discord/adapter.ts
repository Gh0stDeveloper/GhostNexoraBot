import { randomBytes } from 'node:crypto'
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
import { outgoingMediaStreamSource } from '../../services/outgoing-media-stream.js'
import { persistDiscordComponentRef, resolveDiscordComponentRef } from './component-store.js'
import { DiscordRestClient } from './rest.js'
import type { DiscordActionRow, DiscordCreateMessageBody, DiscordEmbed, DiscordMessage } from './types.js'

const DISCORD_TEXT_LIMIT = 2000
const DISCORD_EMBED_DESCRIPTION_LIMIT = 4096
const DISCORD_EMBED_TOTAL_LIMIT = 6000
const DISCORD_CUSTOM_ID_LIMIT = 100
// Create Message has a 25 MiB request ceiling. Keep 1 MiB for multipart metadata/overhead.
const MAX_UPLOAD_BYTES = 24 * 1024 * 1024
const COMPONENT_TTL_MS = 30 * 60_000

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

function trim(value: string | undefined, limit: number) {
  if (!value || limit <= 0) return undefined
  if (value.length <= limit) return value
  if (limit === 1) return '…'
  return `${value.slice(0, limit - 1)}…`
}

function embedCharacters(embed: DiscordEmbed) {
  return (embed.title?.length ?? 0) +
    (embed.description?.length ?? 0) +
    (embed.footer?.text.length ?? 0)
}

function fitEmbeds(embeds: DiscordEmbed[]) {
  const input = embeds.slice(0, 10)
  let remaining = DISCORD_EMBED_TOTAL_LIMIT
  const result: DiscordEmbed[] = []

  for (let index = 0; index < input.length; index += 1) {
    const source = input[index]
    const embedsLeft = input.length - index
    const budget = Math.max(1, Math.floor(remaining / embedsLeft))
    const title = trim(source.title, Math.min(256, budget))
    let localRemaining = Math.max(0, budget - (title?.length ?? 0))

    // Preserve most of each card for its description while keeping room for a
    // footer when present. The global 6000-char budget is shared across embeds.
    const footerReserve = source.footer?.text ? Math.min(2048, Math.floor(localRemaining * 0.2)) : 0
    const description = trim(source.description, Math.min(DISCORD_EMBED_DESCRIPTION_LIMIT, Math.max(0, localRemaining - footerReserve)))
    localRemaining -= description?.length ?? 0
    const footerText = trim(source.footer?.text, Math.min(2048, localRemaining))

    const embed: DiscordEmbed = {
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      ...(source.url ? { url: source.url } : {}),
      ...(source.image ? { image: source.image } : {}),
      ...(source.thumbnail ? { thumbnail: source.thumbnail } : {}),
      ...(footerText ? { footer: { text: footerText } } : {}),
    }
    const used = embedCharacters(embed)
    remaining = Math.max(0, remaining - used)
    result.push(embed)
  }

  return result
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

  constructor(
    readonly client: DiscordRestClient,
    botInstanceId = 'discord-main',
  ) {
    this.botInstanceId = botInstanceId
  }

  async start() { await this.client.getGatewayBot() }
  async stop() {}

  private componentId(command: string) {
    const direct = `gnb:cmd:${command}`
    if (Buffer.byteLength(direct, 'utf8') <= DISCORD_CUSTOM_ID_LIMIT) return direct
    const token = randomBytes(12).toString('base64url')
    persistDiscordComponentRef(this.botInstanceId, token, command, COMPONENT_TTL_MS)
    return `gnb:ref:${token}`
  }

  resolveComponentCustomId(customId?: string) {
    if (!customId) return undefined
    if (customId.startsWith('gnb:cmd:')) return customId.slice('gnb:cmd:'.length)
    if (!customId.startsWith('gnb:ref:')) return undefined
    return resolveDiscordComponentRef(this.botInstanceId, customId.slice('gnb:ref:'.length))
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

    const fittedEmbeds = fitEmbeds(embeds)
    return {
      ...(fittedEmbeds.length ? { embeds: fittedEmbeds } : { content: trim(normalizedUiToText(ui), DISCORD_TEXT_LIMIT) }),
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
    const source = await outgoingMediaStreamSource(media, MAX_UPLOAD_BYTES, 'Discord')
    const fileName = media.fileName || fallbackFileName(media)
    const message = await this.client.createMessageWithFileStream(chatId, {
      ...baseBody(options),
      ...(media.caption ? { content: trim(media.caption, DISCORD_TEXT_LIMIT) } : {}),
      attachments: [{ id: 0, filename: fileName }],
    }, source.open, fileName, media.mimeType, MAX_UPLOAD_BYTES)
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
