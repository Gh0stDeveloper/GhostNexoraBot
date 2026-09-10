import os from 'node:os'
import type { DiscordRestClient } from './rest.js'
import type {
  DiscordGatewayPayload,
  DiscordGatewaySession,
  DiscordInteraction,
  DiscordMessage,
  DiscordReady,
} from './types.js'

export type DiscordGatewayState = 'idle' | 'connecting' | 'identifying' | 'resuming' | 'ready' | 'reconnecting' | 'stopped' | 'error'

export interface DiscordGatewayHandlers {
  onReady?: (ready: DiscordReady) => void | Promise<void>
  onResumed?: () => void | Promise<void>
  onMessage?: (message: DiscordMessage) => void | Promise<void>
  onInteraction?: (interaction: DiscordInteraction) => void | Promise<void>
  onSession?: (session: DiscordGatewaySession | null) => void | Promise<void>
  onState?: (state: DiscordGatewayState, error?: string) => void | Promise<void>
}

interface DiscordSocket {
  readonly readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  addEventListener(type: 'open' | 'message' | 'close' | 'error', listener: (event: any) => void): void
}

type SocketFactory = (url: string) => DiscordSocket

const OPEN = 1
const FATAL_CLOSE_CODES = new Set([4004, 4010, 4011, 4012, 4013, 4014])
const NON_RESUMABLE_CLOSE_CODES = new Set([4007, 4009])

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function decodeMessageData(data: unknown) {
  if (typeof data === 'string') return data
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8')
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8')
  if (typeof Blob !== 'undefined' && data instanceof Blob) return data.text()
  return String(data ?? '')
}

function gatewayUrl(base: string) {
  const url = new URL(base)
  url.searchParams.set('v', '10')
  url.searchParams.set('encoding', 'json')
  return url.toString()
}

export class DiscordGateway {
  private socket?: DiscordSocket
  private baseGatewayUrl?: string
  private state: DiscordGatewayState = 'idle'
  private session: DiscordGatewaySession | null = null
  private heartbeatTimer?: NodeJS.Timeout
  private firstHeartbeatTimer?: NodeJS.Timeout
  private reconnectTimer?: NodeJS.Timeout
  private heartbeatIntervalMs = 0
  private heartbeatAcked = true
  private reconnectAttempts = 0
  private stopping = false

  constructor(
    private readonly rest: DiscordRestClient,
    private readonly token: string,
    private readonly intents: number,
    private readonly handlers: DiscordGatewayHandlers = {},
    private readonly options: {
      reconnectDelayMs?: number
      maxReconnectDelayMs?: number
      random?: () => number
      socketFactory?: SocketFactory
    } = {},
  ) {}

  getState() { return this.state }
  getSession() { return this.session ? { ...this.session } : null }

  private async setState(state: DiscordGatewayState, error?: string) {
    this.state = state
    await this.handlers.onState?.(state, error)
  }

  private socketFactory(): SocketFactory {
    if (this.options.socketFactory) return this.options.socketFactory
    return (url) => new WebSocket(url) as unknown as DiscordSocket
  }

  private clearHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    if (this.firstHeartbeatTimer) clearTimeout(this.firstHeartbeatTimer)
    this.heartbeatTimer = undefined
    this.firstHeartbeatTimer = undefined
    this.heartbeatIntervalMs = 0
    this.heartbeatAcked = true
  }

  private send(payload: DiscordGatewayPayload) {
    if (!this.socket || this.socket.readyState !== OPEN) throw new Error('Discord Gateway socket no está abierto.')
    this.socket.send(JSON.stringify(payload))
  }

  private async persistSession() {
    await this.handlers.onSession?.(this.session ? { ...this.session } : null)
  }

  private heartbeat() {
    if (!this.socket || this.socket.readyState !== OPEN) return
    if (!this.heartbeatAcked) {
      try { this.socket.close(4000, 'heartbeat ack timeout') } catch {}
      return
    }
    this.heartbeatAcked = false
    this.send({ op: 1, d: this.session?.sequence ?? null })
  }

  private startHeartbeat(intervalMs: number) {
    this.clearHeartbeat()
    this.heartbeatIntervalMs = intervalMs
    const random = this.options.random ?? Math.random
    const firstDelay = Math.max(0, Math.floor(intervalMs * random()))
    this.firstHeartbeatTimer = setTimeout(() => {
      this.heartbeat()
      this.heartbeatTimer = setInterval(() => this.heartbeat(), intervalMs)
      this.heartbeatTimer.unref?.()
    }, firstDelay)
    this.firstHeartbeatTimer.unref?.()
  }

  private identify() {
    void this.setState('identifying')
    this.send({
      op: 2,
      d: {
        token: this.token,
        intents: this.intents,
        properties: {
          os: `${os.platform()} ${os.release()}`,
          browser: 'ghost-nexora-bot',
          device: 'ghost-nexora-bot',
        },
      },
    })
  }

  private resume() {
    if (!this.session) return this.identify()
    void this.setState('resuming')
    this.send({
      op: 6,
      d: {
        token: this.token,
        session_id: this.session.sessionId,
        seq: this.session.sequence,
      },
    })
  }

  private async dispatch(payload: DiscordGatewayPayload) {
    if (typeof payload.s === 'number' && this.session) {
      this.session.sequence = payload.s
      await this.persistSession()
    }

    if (payload.t === 'READY') {
      const ready = payload.d as DiscordReady
      this.session = {
        sessionId: ready.session_id,
        resumeGatewayUrl: ready.resume_gateway_url,
        sequence: typeof payload.s === 'number' ? payload.s : null,
      }
      this.reconnectAttempts = 0
      await this.persistSession()
      await this.setState('ready')
      await this.handlers.onReady?.(ready)
      return
    }

    if (payload.t === 'RESUMED') {
      this.reconnectAttempts = 0
      await this.setState('ready')
      await this.handlers.onResumed?.()
      return
    }

    if (payload.t === 'MESSAGE_CREATE') {
      await this.handlers.onMessage?.(payload.d as DiscordMessage)
      return
    }

    if (payload.t === 'INTERACTION_CREATE') {
      await this.handlers.onInteraction?.(payload.d as DiscordInteraction)
    }
  }

  private async handlePayload(payload: DiscordGatewayPayload) {
    if (payload.op === 10) {
      const interval = Number((payload.d as { heartbeat_interval?: number })?.heartbeat_interval || 0)
      if (!Number.isFinite(interval) || interval < 100) throw new Error('Discord Gateway devolvió heartbeat_interval inválido.')
      this.startHeartbeat(interval)
      if (this.session) this.resume()
      else this.identify()
      return
    }
    if (payload.op === 11) {
      this.heartbeatAcked = true
      return
    }
    if (payload.op === 1) {
      this.heartbeatAcked = true
      this.heartbeat()
      return
    }
    if (payload.op === 0) {
      await this.dispatch(payload)
      return
    }
    if (payload.op === 7) {
      this.requestReconnect('server requested reconnect')
      return
    }
    if (payload.op === 9) {
      const resumable = payload.d === true
      if (!resumable) {
        this.session = null
        await this.persistSession()
      }
      const random = this.options.random ?? Math.random
      this.requestReconnect('invalid session', 1000 + Math.floor(random() * 4000))
    }
  }

  private requestReconnect(reason: string, requestedDelayMs?: number) {
    if (this.stopping || this.reconnectTimer) return
    this.clearHeartbeat()
    try { this.socket?.close(4000, reason.slice(0, 120)) } catch {}
    this.socket = undefined
    this.reconnectAttempts += 1
    const base = this.options.reconnectDelayMs ?? 3000
    const max = this.options.maxReconnectDelayMs ?? 60_000
    const backoff = Math.min(max, base * (2 ** Math.min(5, Math.max(0, this.reconnectAttempts - 1))))
    const wait = requestedDelayMs ?? backoff
    void this.setState('reconnecting', reason)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined
      void this.openSocket().catch((error) => this.requestReconnect(error instanceof Error ? error.message : 'reconnect failed'))
    }, wait)
    this.reconnectTimer.unref?.()
  }

  private async invalidateAndReconnect(code: number) {
    this.session = null
    await this.persistSession().catch(() => undefined)
    this.requestReconnect(`gateway close ${code}; new session required`)
  }

  private async openSocket() {
    if (this.stopping) return
    const base = this.session?.resumeGatewayUrl || this.baseGatewayUrl
    if (!base) throw new Error('Discord Gateway URL no disponible.')
    await this.setState('connecting')
    const socket = this.socketFactory()(gatewayUrl(base))
    this.socket = socket

    socket.addEventListener('message', (event) => {
      void decodeMessageData(event.data)
        .then((text) => JSON.parse(text) as DiscordGatewayPayload)
        .then((payload) => this.handlePayload(payload))
        .catch((error) => {
          void this.setState('error', error instanceof Error ? error.message : String(error))
          try { socket.close(4002, 'decode error') } catch {}
        })
    })

    socket.addEventListener('close', (event) => {
      this.clearHeartbeat()
      if (this.socket === socket) this.socket = undefined
      if (this.stopping) return
      const code = Number(event.code || 0)
      if (FATAL_CLOSE_CODES.has(code)) {
        const hint = code === 4014
          ? 'Discord rechazó intents privilegiados. Revisa MESSAGE_CONTENT en Developer Portal o desactiva DISCORD_MESSAGE_CONTENT_ENABLED.'
          : `Discord Gateway cerró la sesión con código fatal ${code}.`
        void this.setState('error', hint)
        return
      }
      if (NON_RESUMABLE_CLOSE_CODES.has(code)) {
        void this.invalidateAndReconnect(code)
        return
      }
      this.requestReconnect(`gateway close ${code || 'unknown'}`)
    })

    socket.addEventListener('error', () => {
      if (!this.stopping) this.requestReconnect('Discord Gateway WebSocket error')
    })
  }

  async start(persistedSession: DiscordGatewaySession | null = null) {
    if (this.state !== 'idle' && this.state !== 'stopped' && this.state !== 'error') return
    this.stopping = false
    this.session = persistedSession
    const gateway = await this.rest.getGatewayBot()
    this.baseGatewayUrl = gateway.url
    if (!this.session && gateway.session_start_limit.remaining <= 0) {
      const seconds = Math.ceil(gateway.session_start_limit.reset_after / 1000)
      await this.setState('error', `Discord IDENTIFY agotado; vuelve a intentarlo después de ${seconds}s.`)
      return
    }
    await this.openSocket()
  }

  async stop() {
    this.stopping = true
    this.clearHeartbeat()
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = undefined
    try { this.socket?.close(1000, 'shutdown') } catch {}
    this.socket = undefined
    this.session = null
    await this.persistSession()
    await this.setState('stopped')
    await delay(0)
  }
}
