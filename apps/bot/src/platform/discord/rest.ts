import type {
  DiscordApplicationCommandDefinition,
  DiscordCreateMessageBody,
  DiscordGatewayBot,
  DiscordMessage,
  DiscordRestErrorBody,
} from './types.js'

const API_ORIGIN = 'https://discord.com/api/v10'
const USER_AGENT = 'DiscordBot (https://github.com/Gh0stDeveloper/GhostNexoraBot, 2.0)'
const DEFAULT_TIMEOUT_MS = 30_000
const MAX_429_RETRIES = 2

export class DiscordRestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
    readonly retryAfter?: number,
  ) {
    super(message)
    this.name = 'DiscordRestError'
  }
}

type RequestOptions = {
  body?: unknown
  form?: FormData
  authenticated?: boolean
  timeoutMs?: number
  retryCount?: number
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function safePath(path: string) {
  if (!path.startsWith('/') || path.includes('://')) throw new Error('Ruta REST de Discord inválida.')
  return path
}

function copyToArrayBuffer(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

export class DiscordRestClient {
  private globalRateLimitUntil = 0

  constructor(
    private readonly token: string,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {
    if (!token.trim()) throw new Error('DISCORD_BOT_TOKEN vacío.')
  }

  private endpoint(path: string) {
    return `${API_ORIGIN}${safePath(path)}`
  }

  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const retryCount = options.retryCount ?? 0
    const waitMs = this.globalRateLimitUntil - Date.now()
    if (waitMs > 0) await delay(waitMs)

    const headers = new Headers({
      accept: 'application/json',
      'user-agent': USER_AGENT,
    })
    if (options.authenticated !== false) headers.set('authorization', `Bot ${this.token}`)

    let body: BodyInit | undefined
    if (options.form) {
      body = options.form
    } else if (options.body !== undefined) {
      headers.set('content-type', 'application/json')
      body = JSON.stringify(options.body)
    }

    const response = await fetch(this.endpoint(path), {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(options.timeoutMs ?? this.timeoutMs),
    })

    if (response.status === 204) return undefined as T

    const payload = await response.json().catch(() => null) as (DiscordRestErrorBody & T) | null
    if (response.ok) return payload as T

    if (response.status === 429) {
      const headerSeconds = Number(response.headers.get('retry-after') || 0)
      const bodySeconds = Number(payload?.retry_after || 0)
      const retryAfter = Math.max(headerSeconds, bodySeconds)
      if (payload?.global && retryAfter > 0) this.globalRateLimitUntil = Date.now() + Math.ceil(retryAfter * 1000)
      if (retryCount < MAX_429_RETRIES && retryAfter > 0 && retryAfter <= 60) {
        await delay(Math.ceil(retryAfter * 1000))
        return this.request<T>(method, path, { ...options, retryCount: retryCount + 1 })
      }
      throw new DiscordRestError(payload?.message || 'Discord API rate limited.', 429, payload?.code, retryAfter || undefined)
    }

    throw new DiscordRestError(
      payload?.message || `Discord API HTTP ${response.status}`,
      response.status,
      payload?.code,
    )
  }

  getGatewayBot() {
    return this.request<DiscordGatewayBot>('GET', '/gateway/bot')
  }

  createMessage(channelId: string, body: DiscordCreateMessageBody) {
    return this.request<DiscordMessage>('POST', `/channels/${channelId}/messages`, { body })
  }

  async createMessageWithFile(
    channelId: string,
    body: DiscordCreateMessageBody,
    bytes: Uint8Array,
    fileName: string,
    mimeType?: string,
  ) {
    const form = new FormData()
    form.append('payload_json', JSON.stringify(body))
    const blob = new Blob([copyToArrayBuffer(bytes)], mimeType ? { type: mimeType } : undefined)
    form.append('files[0]', blob, fileName)
    return this.request<DiscordMessage>('POST', `/channels/${channelId}/messages`, { form, timeoutMs: 120_000 })
  }

  editMessage(channelId: string, messageId: string, body: DiscordCreateMessageBody) {
    return this.request<DiscordMessage>('PATCH', `/channels/${channelId}/messages/${messageId}`, { body })
  }

  triggerTyping(channelId: string) {
    return this.request<void>('POST', `/channels/${channelId}/typing`)
  }

  createReaction(channelId: string, messageId: string, emoji: string) {
    return this.request<void>('PUT', `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`)
  }

  overwriteApplicationCommands(applicationId: string, commands: DiscordApplicationCommandDefinition[], guildId?: string) {
    const path = guildId
      ? `/applications/${applicationId}/guilds/${guildId}/commands`
      : `/applications/${applicationId}/commands`
    return this.request<Array<Record<string, unknown>>>('PUT', path, { body: commands })
  }

  interactionCallback(interactionId: string, interactionToken: string, type: 5 | 6) {
    return this.request<void>('POST', `/interactions/${interactionId}/${interactionToken}/callback`, {
      authenticated: false,
      body: { type },
    })
  }

  deleteOriginalInteractionResponse(applicationId: string, interactionToken: string) {
    return this.request<void>('DELETE', `/webhooks/${applicationId}/${interactionToken}/messages/@original`, {
      authenticated: false,
    })
  }
}
