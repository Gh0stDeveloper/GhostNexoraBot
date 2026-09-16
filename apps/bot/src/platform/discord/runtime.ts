import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { logger } from '../../utils/logger.js'
import { DiscordAdapter } from './adapter.js'
import { discordConfig } from './config.js'
import { DiscordGateway, type DiscordGatewayState } from './gateway.js'
import { DiscordRestClient } from './rest.js'
import { DiscordCommandRouter, discordApplicationCommands } from './router.js'
import type { DiscordGatewaySession, DiscordInteraction, DiscordMessage, DiscordReady } from './types.js'

type DiscordRuntimeState = 'disabled' | 'starting' | 'running' | 'reconnecting' | 'stopped' | 'error'

type PersistedIdentity = {
  botId: string
  username: string
  applicationId: string
  guildCount: number
}

type PersistedState = {
  schemaVersion: 1
  session: DiscordGatewaySession | null
  identity?: PersistedIdentity
  updatedAt: string
}

let singleton: DiscordRuntime | undefined

function safeSession(value: unknown): DiscordGatewaySession | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Partial<DiscordGatewaySession>
  if (!row.sessionId || !row.resumeGatewayUrl) return null
  const sequence = row.sequence === null || Number.isSafeInteger(row.sequence) ? row.sequence ?? null : null
  return {
    sessionId: String(row.sessionId),
    resumeGatewayUrl: String(row.resumeGatewayUrl),
    sequence,
  }
}

function safeIdentity(value: unknown): PersistedIdentity | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Partial<PersistedIdentity>
  if (!row.botId || !row.applicationId || !row.username) return null
  return {
    botId: String(row.botId),
    username: String(row.username),
    applicationId: String(row.applicationId),
    guildCount: Number.isSafeInteger(row.guildCount) && Number(row.guildCount) >= 0 ? Number(row.guildCount) : 0,
  }
}

export class DiscordRuntime {
  private state: DiscordRuntimeState = 'disabled'
  private startedAt?: string
  private readyAt?: string
  private lastEventAt?: string
  private lastError?: string
  private botId?: string
  private username?: string
  private applicationId?: string
  private guildCount = 0
  private eventsProcessed = 0
  private session: DiscordGatewaySession | null = null
  private rest?: DiscordRestClient
  private adapter?: DiscordAdapter
  private router?: DiscordCommandRouter
  private gateway?: DiscordGateway

  status() {
    return {
      configured: Boolean(discordConfig.token),
      state: this.state,
      botId: this.botId ?? null,
      username: this.username ?? null,
      applicationId: this.applicationId ?? null,
      startedAt: this.startedAt ?? null,
      readyAt: this.readyAt ?? null,
      lastEventAt: this.lastEventAt ?? null,
      lastError: this.lastError ?? null,
      guildCount: this.guildCount,
      eventsProcessed: this.eventsProcessed,
      sessionResumable: Boolean(this.session?.sessionId && this.session?.resumeGatewayUrl),
      sequence: this.session?.sequence ?? null,
      messageContentEnabled: discordConfig.messageContentEnabled,
      commandRegistrationEnabled: discordConfig.registerCommands,
      commandScope: discordConfig.guildId ? `guild:${discordConfig.guildId}` : 'global',
    }
  }

  private identitySnapshot(): PersistedIdentity | undefined {
    if (!this.botId || !this.username || !this.applicationId) return undefined
    return {
      botId: this.botId,
      username: this.username,
      applicationId: this.applicationId,
      guildCount: this.guildCount,
    }
  }

  private async restoreState() {
    try {
      const raw = JSON.parse(await readFile(discordConfig.stateFile, 'utf8')) as Partial<PersistedState>
      if (raw.schemaVersion !== 1) return
      const identity = safeIdentity(raw.identity)
      const session = safeSession(raw.session)
      // A resumed Gateway session does not emit READY again. Resume is only safe
      // across process restarts when the bot/application identity was persisted too.
      if (session && identity) {
        this.session = session
        this.botId = identity.botId
        this.username = identity.username
        this.applicationId = identity.applicationId
        this.guildCount = identity.guildCount
      }
    } catch { /* first start */ }
  }

  private async persistSession(session: DiscordGatewaySession | null) {
    this.session = safeSession(session)
    await mkdir(path.dirname(discordConfig.stateFile), { recursive: true })
    const payload: PersistedState = {
      schemaVersion: 1,
      session: this.session,
      identity: this.identitySnapshot(),
      updatedAt: new Date().toISOString(),
    }
    await writeFile(discordConfig.stateFile, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 })
  }

  private mapGatewayState(state: DiscordGatewayState, error?: string) {
    if (error) this.lastError = error
    if (state === 'ready') this.state = 'running'
    else if (state === 'reconnecting') this.state = 'reconnecting'
    else if (state === 'error') this.state = 'error'
    else if (state === 'stopped') this.state = 'stopped'
    else if (state === 'connecting' || state === 'identifying' || state === 'resuming') this.state = 'starting'
  }

  private async registerCommands(applicationId: string) {
    if (!discordConfig.registerCommands || !this.rest) return
    await this.rest.overwriteApplicationCommands(applicationId, discordApplicationCommands, discordConfig.guildId || undefined)
    logger.info({
      commands: discordApplicationCommands.length,
      scope: discordConfig.guildId ? `guild:${discordConfig.guildId}` : 'global',
    }, 'Discord application commands synchronized')
  }

  private async onReady(ready: DiscordReady) {
    this.botId = ready.user.id
    this.username = ready.user.global_name || ready.user.username
    this.applicationId = ready.application.id
    this.guildCount = ready.guilds.length
    this.readyAt = new Date().toISOString()
    this.lastEventAt = this.readyAt
    this.lastError = undefined
    this.router?.setBotUserId(ready.user.id)
    await this.persistSession(this.session).catch((error) =>
      logger.warn({ error }, 'Discord READY identity state could not be persisted'))
    try {
      await this.registerCommands(ready.application.id)
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error)
      logger.warn({ error }, 'Discord application command sync failed; Gateway remains active')
    }
    logger.info({ botId: this.botId, username: this.username, guilds: this.guildCount }, 'Discord native platform ready')
  }

  private async onResumed() {
    this.readyAt = new Date().toISOString()
    this.lastEventAt = this.readyAt
    this.lastError = undefined
    if (this.botId) this.router?.setBotUserId(this.botId)
    if (this.applicationId) {
      try {
        await this.registerCommands(this.applicationId)
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error)
        logger.warn({ error }, 'Discord command sync after RESUMED failed; Gateway remains active')
      }
    }
    logger.info({ botId: this.botId, username: this.username, sequence: this.session?.sequence }, 'Discord native platform resumed')
  }

  private async onMessage(message: DiscordMessage) {
    this.lastEventAt = new Date().toISOString()
    this.eventsProcessed += 1
    await this.router?.handleMessage(message)
  }

  private async onInteraction(interaction: DiscordInteraction) {
    this.lastEventAt = new Date().toISOString()
    this.eventsProcessed += 1
    if (!this.rest || !this.router) return

    // Discord requiere reconocer la interacción rápidamente. Para slash commands
    // usamos deferred channel message; para botones deferred message update.
    const callbackType = interaction.type === 2 ? 5 : interaction.type === 3 ? 6 : undefined
    if (callbackType) {
      await this.rest.interactionCallback(interaction.id, interaction.token, callbackType).catch((error) =>
        logger.warn({ error, interactionId: interaction.id }, 'Discord interaction acknowledgement failed'))
    }

    try {
      await this.router.handleInteraction(interaction)
    } finally {
      // El router entrega la respuesta normal mediante PlatformAdapter. Retiramos
      // únicamente el placeholder "thinking" de slash commands para no duplicar UI.
      if (interaction.type === 2) {
        await this.rest.deleteOriginalInteractionResponse(interaction.application_id, interaction.token).catch(() => undefined)
      }
    }
  }

  async start() {
    if (this.state === 'running' || this.state === 'starting' || this.state === 'reconnecting') return true
    if (!discordConfig.token) {
      this.state = 'disabled'
      return false
    }

    this.state = 'starting'
    this.startedAt = new Date().toISOString()
    this.lastError = undefined
    await this.restoreState()

    this.rest = new DiscordRestClient(discordConfig.token)
    this.adapter = new DiscordAdapter(this.rest)
    this.router = new DiscordCommandRouter(this.adapter, this.botId, () => this.status())
    this.gateway = new DiscordGateway(this.rest, discordConfig.token, discordConfig.intents, {
      onState: (state, error) => this.mapGatewayState(state, error),
      onSession: (session) => this.persistSession(session).catch((error) =>
        logger.warn({ error }, 'Discord Gateway session state could not be persisted')),
      onReady: (ready) => this.onReady(ready),
      onResumed: () => this.onResumed(),
      onMessage: (message) => this.onMessage(message).catch((error) =>
        logger.warn({ error, channelId: message.channel_id }, 'Discord message failed')),
      onInteraction: (interaction) => this.onInteraction(interaction).catch((error) =>
        logger.warn({ error, interactionId: interaction.id }, 'Discord interaction failed')),
    }, {
      reconnectDelayMs: discordConfig.reconnectDelayMs,
      maxReconnectDelayMs: discordConfig.maxReconnectDelayMs,
    })

    try {
      await this.gateway.start(this.session)
      if (this.gateway.getState() === 'error') {
        this.state = 'error'
        return false
      }
      return true
    } catch (error) {
      this.state = 'error'
      this.lastError = error instanceof Error ? error.message : String(error)
      logger.warn({ error }, 'Discord native platform not started')
      return false
    }
  }

  async stop() {
    await this.gateway?.stop().catch((error) => logger.warn({ error }, 'Discord Gateway stop failed'))
    await this.adapter?.stop().catch(() => undefined)
    this.state = 'stopped'
  }
}

export async function startDiscordPlatform() {
  singleton ??= new DiscordRuntime()
  return singleton.start()
}

export async function stopDiscordPlatform() {
  await singleton?.stop()
}

export function discordRuntimeStatus() {
  return singleton?.status() ?? {
    configured: Boolean(discordConfig.token),
    state: 'disabled' as const,
    botId: null,
    username: null,
    applicationId: null,
    startedAt: null,
    readyAt: null,
    lastEventAt: null,
    lastError: null,
    guildCount: 0,
    eventsProcessed: 0,
    sessionResumable: false,
    sequence: null,
    messageContentEnabled: discordConfig.messageContentEnabled,
    commandRegistrationEnabled: discordConfig.registerCommands,
    commandScope: discordConfig.guildId ? `guild:${discordConfig.guildId}` : 'global',
  }
}
