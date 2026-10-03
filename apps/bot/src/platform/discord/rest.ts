import { randomBytes } from 'node:crypto'
import { Readable } from 'node:stream'
import type {
  DiscordApplicationCommandDefinition,
  DiscordCreateMessageBody,
  DiscordGatewayBot,
  DiscordGuildSummary,
  DiscordMessage,
  DiscordRestErrorBody,
} from './types.js'

const API_ORIGIN = 'https://discord.com/api/v10'
const USER_AGENT = 'DiscordBot (https://github.com/Gh0stDeveloper/GhostNexoraBot, 2.0)'
const DEFAULT_TIMEOUT_MS = 30_000
const MAX_429_RETRIES = 3

type DiscordRateLimitBody = DiscordRestErrorBody & { global?: boolean }
type MediaStreamFactory = () => Promise<AsyncIterable<Uint8Array>>

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
  rawBodyFactory?: () => Promise<unknown> | unknown
  contentType?: string
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

function routeTemplate(method: string, path: string) {
  return `${method.toUpperCase()}:${safePath(path).replace(/\/\d{16,20}(?=\/|$)/g, '/:id')}`
}

function majorParameter(path: string) {
  const channel = /^\/channels\/([^/]+)/.exec(path)?.[1]
  if (channel) return `channel:${channel}`
  const guild = /^\/guilds\/([^/]+)/.exec(path)?.[1]
  if (guild) return `guild:${guild}`
  const webhook = /^\/webhooks\/([^/]+)\/([^/]+)/.exec(path)
  if (webhook?.[1] && webhook[2]) return `webhook:${webhook[1]}:${webhook[2]}`
  return 'global-route'
}

function multipartFileName(value: string) {
  return value.replace(/[\r\n"]/g, '_').slice(0, 240) || 'file.bin'
}

function multipartStream(
  boundary: string,
  body: DiscordCreateMessageBody,
  sourceFactory: MediaStreamFactory,
  fileName: string,
  mimeType: string | undefined,
  maxBytes: number,
) {
  const safeName = multipartFileName(fileName)
  const prefix = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="payload_json"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(body)}\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="files[0]"; filename="${safeName}"\r\nContent-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`,
  )
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`)
  return Readable.from((async function* () {
    yield prefix
    let total = 0
    const source = await sourceFactory()
    for await (const raw of source) {
      const chunk = raw instanceof Uint8Array ? raw : new Uint8Array(raw)
      total += chunk.byteLength
      if (total > maxBytes) throw new Error('Discord streaming upload exceeded configured maximum size.')
      yield chunk
    }
    yield suffix
  })())
}

export class DiscordRestClient {
  private globalRateLimitUntil = 0
  private readonly routeBuckets = new Map<string, string>()
  private readonly bucketReadyAt = new Map<string, number>()

  constructor(
    private readonly token: string,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {
    if (!token.trim()) throw new Error('DISCORD_BOT_TOKEN vacío.')
  }

  private endpoint(path: string) {
    return `${API_ORIGIN}${safePath(path)}`
  }

  private bucketScope(method: string, path: string, bucketId?: string | null) {
    const route = routeTemplate(method, path)
    const bucket = bucketId || this.routeBuckets.get(route)
    return bucket ? `bucket:${bucket}:${majorParameter(path)}` : `route:${route}:${majorParameter(path)}`
  }

  private async waitForRateLimit(method: string, path: string) {
    const now = Date.now()
    const scope = this.bucketScope(method, path)
    const waitUntil = Math.max(this.globalRateLimitUntil, this.bucketReadyAt.get(scope) ?? 0)
    if (waitUntil > now) await delay(waitUntil - now)
  }

  private rememberRateLimit(method: string, path: string, response: Response, payload?: DiscordRateLimitBody | null) {
    const route = routeTemplate(method, path)
    const bucketId = response.headers.get('x-ratelimit-bucket')
    if (bucketId) this.routeBuckets.set(route, bucketId)

    const retryAfter = Math.max(
      Number(response.headers.get('retry-after') || 0),
      Number(payload?.retry_after || 0),
    )
    const resetAfter = Number(response.headers.get('x-ratelimit-reset-after') || 0)
    const remaining = Number(response.headers.get('x-ratelimit-remaining') ?? Number.NaN)
    const isGlobal = payload?.global === true || response.headers.get('x-ratelimit-global') === 'true'
    const now = Date.now()

    if (response.status === 429 && isGlobal && retryAfter > 0) {
      this.globalRateLimitUntil = Math.max(this.globalRateLimitUntil, now + Math.ceil(retryAfter * 1000))
      return
    }

    const shouldBlock = response.status === 429 || remaining === 0
    const seconds = response.status === 429 ? retryAfter : resetAfter
    if (shouldBlock && seconds > 0) {
      const scope = this.bucketScope(method, path, bucketId)
      const until = now + Math.ceil(seconds * 1000)
      this.bucketReadyAt.set(scope, Math.max(this.bucketReadyAt.get(scope) ?? 0, until))
    }

    if (this.bucketReadyAt.size > 256) {
      for (const [scope, until] of this.bucketReadyAt) if (until <= now) this.bucketReadyAt.delete(scope)
    }
  }

  rateLimitSnapshot() {
    return {
      globalUntil: this.globalRateLimitUntil,
      routeMappings: this.routeBuckets.size,
      buckets: [...this.bucketReadyAt.entries()].map(([scope, readyAt]) => ({ scope, readyAt })),
    }
  }

  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const retryCount = options.retryCount ?? 0
    await this.waitForRateLimit(method, path)

    const headers = new Headers({
      accept: 'application/json',
      'user-agent': USER_AGENT,
    })
    if (options.authenticated !== false) headers.set('authorization', `Bot ${this.token}`)

    let body: BodyInit | undefined
    let streamed = false
    if (options.rawBodyFactory) {
      body = await options.rawBodyFactory() as BodyInit
      streamed = true
      if (options.contentType) headers.set('content-type', options.contentType)
    } else if (options.form) {
      body = options.form
    } else if (options.body !== undefined) {
      headers.set('content-type', 'application/json')
      body = JSON.stringify(options.body)
    }

    const requestInit: RequestInit & { duplex?: 'half' } = {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(options.timeoutMs ?? this.timeoutMs),
    }
    if (streamed) requestInit.duplex = 'half'

    const response = await fetch(this.endpoint(path), requestInit)
    this.rememberRateLimit(method, path, response)

    if (response.status === 204) return undefined as T

    const payload = await response.json().catch(() => null) as (DiscordRateLimitBody & T) | null
    if (response.ok) return payload as T

    if (response.status === 429) {
      this.rememberRateLimit(method, path, response, payload)
      const headerSeconds = Number(response.headers.get('retry-after') || 0)
      const bodySeconds = Number(payload?.retry_after || 0)
      const retryAfter = Math.max(headerSeconds, bodySeconds)
      if (retryCount < MAX_429_RETRIES && retryAfter > 0 && retryAfter <= 60) {
        await this.waitForRateLimit(method, path)
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

  getGuild(guildId: string) {
    return this.request<DiscordGuildSummary>('GET', `/guilds/${encodeURIComponent(guildId)}?with_counts=true`)
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

  createMessageWithFileStream(
    channelId: string,
    body: DiscordCreateMessageBody,
    sourceFactory: MediaStreamFactory,
    fileName: string,
    mimeType: string | undefined,
    maxBytes: number,
  ) {
    const boundary = `----ghostnexora-${randomBytes(12).toString('hex')}`
    return this.request<DiscordMessage>('POST', `/channels/${channelId}/messages`, {
      timeoutMs: 120_000,
      contentType: `multipart/form-data; boundary=${boundary}`,
      rawBodyFactory: () => multipartStream(boundary, body, sourceFactory, fileName, mimeType, maxBytes),
    })
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
