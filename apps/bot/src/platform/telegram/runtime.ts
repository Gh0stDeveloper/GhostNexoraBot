import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { ingestTelegramChannelPost, initTelegramBridgeCache } from '../../services/telegram-bridge-v7.js'
import { logger } from '../../utils/logger.js'
import { TelegramAdapter } from './adapter.js'
import { TelegramBotApiClient, TelegramApiError } from './client.js'
import { telegramConfig } from './config.js'
import { TelegramCommandRouter } from './router.js'
import type { TelegramBotIdentity, TelegramCallbackQuery, TelegramMessage, TelegramUpdate } from './types.js'

type TelegramRuntimeState = 'disabled' | 'starting' | 'running' | 'blocked-webhook' | 'stopped' | 'error'

type PersistedState = {
  schemaVersion: 1
  offset: number
  updatedAt: string
}

let singleton: TelegramRuntime | undefined

export class TelegramRuntime {
  private state: TelegramRuntimeState = 'disabled'
  private offset = 0
  private running = false
  private identity?: TelegramBotIdentity
  private startedAt?: string
  private lastUpdateAt?: string
  private lastError?: string
  private webhookUrl?: string
  private updatesProcessed = 0
  private adapter?: TelegramAdapter
  private client?: TelegramBotApiClient
  private router?: TelegramCommandRouter
  private loopPromise?: Promise<void>

  status() {
    return {
      configured: Boolean(telegramConfig.token),
      state: this.state,
      botId: this.identity?.id ?? null,
      username: this.identity?.username ?? null,
      startedAt: this.startedAt ?? null,
      lastUpdateAt: this.lastUpdateAt ?? null,
      lastError: this.lastError ?? null,
      webhookUrl: this.webhookUrl ?? null,
      offset: this.offset,
      updatesProcessed: this.updatesProcessed,
      bridgeChannelConfigured: Boolean(telegramConfig.channelId),
    }
  }

  private async restoreState() {
    try {
      const raw = JSON.parse(await readFile(telegramConfig.stateFile, 'utf8')) as Partial<PersistedState>
      const offset = Number(raw.offset ?? 0)
      if (Number.isSafeInteger(offset) && offset >= 0) this.offset = offset
    } catch { /* first start */ }
  }

  private async persistState() {
    await mkdir(path.dirname(telegramConfig.stateFile), { recursive: true })
    const payload: PersistedState = { schemaVersion: 1, offset: this.offset, updatedAt: new Date().toISOString() }
    await writeFile(telegramConfig.stateFile, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 })
  }

  private async callback(query: TelegramCallbackQuery) {
    const command = this.adapter!.resolveCallbackData(query.data)
    await this.client!.answerCallbackQuery(query.id, command ? undefined : 'Esta acción expiró. Ejecuta de nuevo el comando.').catch(() => undefined)
    if (!query.message || !command) return
    const synthetic: TelegramMessage = {
      ...query.message,
      from: query.from,
      text: `/${command}`,
      caption: undefined,
    }
    await this.router!.handle(synthetic)
  }

  private async processUpdate(update: TelegramUpdate) {
    if (update.channel_post) await ingestTelegramChannelPost(update.channel_post).catch((error) => logger.warn({ error }, 'Telegram channel cache ingest failed'))
    if (update.edited_channel_post) await ingestTelegramChannelPost(update.edited_channel_post).catch((error) => logger.warn({ error }, 'Telegram edited channel cache ingest failed'))
    if (update.callback_query) await this.callback(update.callback_query)
    if (update.message) await this.router!.handle(update.message)
    if (update.edited_message) await this.router!.handle(update.edited_message)
  }

  private async loop() {
    while (this.running) {
      try {
        const updates = await this.client!.getUpdates(this.offset, telegramConfig.pollTimeoutSeconds, (telegramConfig.pollTimeoutSeconds + 10) * 1000)
        for (const update of updates) {
          if (!this.running) break
          this.offset = Math.max(this.offset, Number(update.update_id) + 1)
          try {
            await this.processUpdate(update)
          } catch (error) {
            logger.warn({ error, updateId: update.update_id }, 'Telegram update failed')
          }
          this.updatesProcessed += 1
          this.lastUpdateAt = new Date().toISOString()
        }
        if (updates.length) await this.persistState()
        this.lastError = undefined
      } catch (error) {
        if (!this.running) break
        this.lastError = error instanceof Error ? error.message : String(error)
        if (error instanceof TelegramApiError && error.errorCode === 409) {
          this.state = 'error'
          this.running = false
          logger.error({ error: this.lastError }, 'Telegram getUpdates conflict; another poller or webhook is active')
          break
        }
        logger.warn({ error }, 'Telegram long poll failed; retrying')
        await new Promise((resolve) => setTimeout(resolve, telegramConfig.reconnectDelayMs))
      }
    }
  }

  async start() {
    if (this.running) return true
    if (!telegramConfig.token) {
      this.state = 'disabled'
      return false
    }

    this.state = 'starting'
    await this.restoreState()
    await initTelegramBridgeCache()
    this.client = new TelegramBotApiClient(telegramConfig.token)
    this.adapter = new TelegramAdapter(this.client)

    try {
      const webhook = await this.client.getWebhookInfo()
      this.webhookUrl = webhook.url || undefined
      if (webhook.url) {
        if (!telegramConfig.deleteWebhookOnStart) {
          this.state = 'blocked-webhook'
          this.lastError = `Telegram tiene webhook configurado: ${new URL(webhook.url).origin}. Activa TELEGRAM_DELETE_WEBHOOK_ON_START=true para migrar a long polling.`
          logger.warn({ webhookOrigin: new URL(webhook.url).origin }, 'Telegram native runtime blocked by existing webhook')
          return false
        }
        await this.client.deleteWebhook(telegramConfig.dropPendingUpdatesOnWebhookDelete)
        this.webhookUrl = undefined
      }

      this.identity = await this.client.getMe()
      this.router = new TelegramCommandRouter(this.adapter, this.identity.username)
      this.running = true
      this.state = 'running'
      this.startedAt = new Date().toISOString()
      this.lastError = undefined
      this.loopPromise = this.loop()
      logger.info({ botId: this.identity.id, username: this.identity.username, offset: this.offset }, 'Telegram native platform started')
      return true
    } catch (error) {
      this.state = 'error'
      this.lastError = error instanceof Error ? error.message : String(error)
      logger.warn({ error }, 'Telegram native platform not started')
      return false
    }
  }

  async stop() {
    this.running = false
    if (this.state === 'running' || this.state === 'starting') this.state = 'stopped'
    await this.persistState().catch(() => undefined)
    await this.adapter?.stop().catch(() => undefined)
    void this.loopPromise
  }
}

export async function startTelegramPlatform() {
  singleton ??= new TelegramRuntime()
  return singleton.start()
}

export async function stopTelegramPlatform() {
  await singleton?.stop()
}

export function telegramRuntimeStatus() {
  return singleton?.status() ?? {
    configured: Boolean(telegramConfig.token),
    state: 'disabled' as const,
    botId: null,
    username: null,
    startedAt: null,
    lastUpdateAt: null,
    lastError: null,
    webhookUrl: null,
    offset: 0,
    updatesProcessed: 0,
    bridgeChannelConfigured: Boolean(telegramConfig.channelId),
  }
}
