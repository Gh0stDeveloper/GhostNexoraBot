import type { NormalizedUi } from '@ghostnexora/platform-contracts'
import { config } from '../../config.js'
import { settings } from '../../core/settings.js'
import { downloadVkVideo } from '../../services/download-providers/vk.js'
import { downloadPhase3Apk, searchApkMirror, searchApkPure, type Phase3ApkStore } from '../../services/download-providers/apk-stores.js'
import { withProviderLease } from '../../services/download-providers/lease.js'
import { providerHealthSnapshot } from '../../services/download-providers/runtime.js'
import { telegramBridgeStatus } from '../../services/telegram-bridge-v7.js'
import { logger } from '../../utils/logger.js'
import { telegramOwner, telegramStaff } from './config.js'
import type { TelegramAdapter } from './adapter.js'
import { normalizeTelegramMessage } from './normalize.js'
import type { TelegramMessage } from './types.js'

const aliases = new Map<string, string>([
  ['start', 'start'], ['help', 'help'], ['menu', 'help'], ['ayuda', 'help'],
  ['ping', 'ping'], ['info', 'info'], ['version', 'info'], ['botinfo', 'info'],
  ['vk', 'vk'], ['vkvideo', 'vk'], ['vkd', 'vk'],
  ['apkmirror', 'apkmirror'], ['apkm', 'apkmirror'], ['amirror', 'apkmirror'],
  ['apkmirrordl', 'apkmirrordl'], ['amdl', 'apkmirrordl'],
  ['apkpure', 'apkpure'], ['apkp', 'apkpure'], ['pureapk', 'apkpure'],
  ['apkpuredl', 'apkpuredl'], ['apdl', 'apkpuredl'],
  ['providerhealth', 'providerhealth'], ['dlhealth', 'providerhealth'],
  ['tgstatus', 'tgstatus'], ['telegramstatus', 'tgstatus'],
])

function humanBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

function storeLabel(store: Phase3ApkStore) { return store === 'apkmirror' ? 'APKMirror' : 'APKPure' }

function parseCommand(text: string, botUsername?: string) {
  const clean = text.trim()
  const prefix = clean.startsWith('/') ? '/' : clean.startsWith(settings.prefix) ? settings.prefix : ''
  if (!prefix) return undefined
  const firstSpace = clean.search(/\s/)
  const head = (firstSpace < 0 ? clean : clean.slice(0, firstSpace)).slice(prefix.length)
  const [rawName, mention] = head.split('@', 2)
  if (mention && botUsername && mention.toLowerCase() !== botUsername.toLowerCase()) return undefined
  const command = aliases.get(rawName.toLowerCase())
  if (!command) return { command: rawName.toLowerCase(), argText: firstSpace < 0 ? '' : clean.slice(firstSpace + 1).trim(), known: false }
  return { command, argText: firstSpace < 0 ? '' : clean.slice(firstSpace + 1).trim(), known: true }
}

async function progress(adapter: TelegramAdapter, chatId: string, replyTo: string, subject: string) {
  const sent = await adapter.sendText(chatId, `${subject}\nPreparando…`, { replyTo })
  return async (stage: string) => adapter.editMessage?.(chatId, sent.messageId, `${subject}\n${stage}`).catch(() => undefined)
}

export class TelegramCommandRouter {
  constructor(
    private readonly adapter: TelegramAdapter,
    private readonly botUsername?: string,
  ) {}

  private async help(chatId: string, replyTo?: string) {
    const ui: NormalizedUi = {
      kind: 'list',
      title: `${config.botName} · Telegram`,
      body: 'Plataforma Telegram nativa V2. Los comandos de esta fase reutilizan Core/providers compartidos.',
      items: [
        { id: 'ping', title: '/ping', description: 'Comprueba el runtime Telegram.', action: { kind: 'command', label: 'Ping', value: 'ping' } },
        { id: 'info', title: '/info', description: 'Información de Ghost Nexora Bot.', action: { kind: 'command', label: 'Información', value: 'info' } },
        { id: 'vk', title: '/vk <url>', description: 'Descarga video público de VK/VK Video.' },
        { id: 'am', title: '/apkmirror <app>', description: 'Busca y descarga desde APKMirror.' },
        { id: 'ap', title: '/apkpure <package>', description: 'Busca y descarga desde APKPure.' },
      ],
    }
    await this.adapter.sendUi(chatId, ui, replyTo ? { replyTo } : undefined)
  }

  private async store(chatId: string, messageId: string, store: Phase3ApkStore, query: string) {
    if (!query) throw new Error(`Uso: /${store} <aplicación|package>`)
    const results = store === 'apkmirror' ? await searchApkMirror(query) : await searchApkPure(query)
    const command = store === 'apkmirror' ? 'apkmirrordl' : 'apkpuredl'
    const ui: NormalizedUi = {
      kind: 'carousel',
      title: `${storeLabel(store)} · resultados`,
      cards: results.map((item) => ({
        id: item.token,
        title: item.name,
        body: [item.packageName && `Package: ${item.packageName}`, item.version && `Versión: ${item.version}`, item.sizeLabel && `Tamaño: ${item.sizeLabel}`].filter(Boolean).join('\n') || 'Release disponible',
        imageUrl: item.icon,
        footer: storeLabel(store),
        buttons: [{ kind: 'command', label: 'Descargar', value: `${command} ${item.token}` }],
      })),
    }
    await this.adapter.sendUi(chatId, ui, { replyTo: messageId })
  }

  private async storeDownload(chatId: string, messageId: string, store: Phase3ApkStore, token: string) {
    if (!token) throw new Error(`Selecciona primero una aplicación con /${store} <búsqueda>.`)
    const update = await progress(this.adapter, chatId, messageId, `${storeLabel(store)} · paquete Android`)
    await update(store === 'apkmirror' ? 'Esperando turno y resolviendo cadena firmada…' : 'Resolviendo descarga firmada…')
    const result = store === 'apkmirror'
      ? await withProviderLease('apkmirror', () => downloadPhase3Apk(token))
      : await downloadPhase3Apk(token)
    try {
      if (result.store !== store) throw new Error('El token pertenece a otra tienda.')
      if (result.size > this.adapter.capabilities.maxUploadBytes) {
        throw new Error(`El archivo pesa ${humanBytes(result.size)} y supera el límite de subida de Telegram de ${humanBytes(this.adapter.capabilities.maxUploadBytes)}.`)
      }
      await update(`Enviando ${result.packageKind} · ${humanBytes(result.size)}…`)
      await this.adapter.sendMedia(chatId, {
        kind: 'document',
        source: { kind: 'path', value: result.filePath },
        mimeType: result.packageKind === 'APK' ? 'application/vnd.android.package-archive' : 'application/zip',
        fileName: result.fileName,
        caption: [`${storeLabel(store)} · ${result.item.name}`, result.item.packageName && `Package: ${result.item.packageName}`, result.item.version && `Versión: ${result.item.version}`, `Formato: ${result.packageKind}`, `Tamaño: ${humanBytes(result.size)}`].filter(Boolean).join('\n'),
      }, { replyTo: messageId })
      await update(`${result.packageKind} enviado correctamente.`)
    } finally {
      await result.cleanup()
    }
  }

  private async vk(chatId: string, messageId: string, url: string) {
    try { new URL(url) } catch { throw new Error('Uso: /vk <url de vk.com|vkvideo.ru|live.vkvideo.ru>') }
    const update = await progress(this.adapter, chatId, messageId, 'VK Video')
    await update('Resolviendo API 5.199 / fallback público…')
    const result = await downloadVkVideo(url)
    try {
      if (result.size > this.adapter.capabilities.maxUploadBytes) throw new Error(`El video pesa ${humanBytes(result.size)} y supera el límite de subida de Telegram.`)
      await update(`Enviando ${humanBytes(result.size)}…`)
      await this.adapter.sendMedia(chatId, {
        kind: 'video',
        source: { kind: 'path', value: result.filePath },
        mimeType: 'video/mp4',
        fileName: 'vk-video.mp4',
        caption: `VK Video · ${result.quality ? `${result.quality}p · ` : ''}${humanBytes(result.size)}`,
      }, { replyTo: messageId })
      await update('Video enviado correctamente.')
    } finally {
      await result.cleanup()
    }
  }

  async handle(message: TelegramMessage) {
    if (message.from?.is_bot) return false
    const normalized = normalizeTelegramMessage(message, this.adapter.botInstanceId)
    const parsed = parseCommand(normalized.text, this.botUsername)
    if (!parsed) return false
    if (!parsed.known) {
      await this.adapter.sendText(normalized.chatId, `Comando no disponible en Telegram: /${parsed.command}\nUsa /help para ver los comandos portados.`, { replyTo: normalized.messageId })
      return true
    }

    await this.adapter.setTyping?.(normalized.chatId, true).catch(() => undefined)
    try {
      if (parsed.command === 'start' || parsed.command === 'help') await this.help(normalized.chatId, normalized.messageId)
      else if (parsed.command === 'ping') {
        const started = Date.now()
        const sent = await this.adapter.sendText(normalized.chatId, 'Pong · comprobando…', { replyTo: normalized.messageId })
        await this.adapter.editMessage?.(normalized.chatId, sent.messageId, `Pong · Telegram ${Date.now() - started} ms`)
      } else if (parsed.command === 'info') {
        await this.adapter.sendText(normalized.chatId, `${config.botName}\nPlataforma: Telegram nativo\nRuntime: V2 Phase 4\nPrefijo WhatsApp: ${settings.prefix}\nComandos Telegram: /help`, { replyTo: normalized.messageId })
      } else if (parsed.command === 'vk') await this.vk(normalized.chatId, normalized.messageId, parsed.argText)
      else if (parsed.command === 'apkmirror') await this.store(normalized.chatId, normalized.messageId, 'apkmirror', parsed.argText)
      else if (parsed.command === 'apkpure') await this.store(normalized.chatId, normalized.messageId, 'apkpure', parsed.argText)
      else if (parsed.command === 'apkmirrordl') await this.storeDownload(normalized.chatId, normalized.messageId, 'apkmirror', parsed.argText.split(/\s+/)[0] || '')
      else if (parsed.command === 'apkpuredl') await this.storeDownload(normalized.chatId, normalized.messageId, 'apkpure', parsed.argText.split(/\s+/)[0] || '')
      else if (parsed.command === 'providerhealth') {
        if (!telegramStaff(message.from?.id)) throw new Error('Este comando requiere owner/staff de Telegram.')
        const rows = providerHealthSnapshot()
        await this.adapter.sendText(normalized.chatId, rows.length ? ['PROVIDER HEALTH', ...rows.map((row) => `${row.provider}: ${row.successes}/${row.attempts} OK · fallos ${row.failures}${row.lastError ? ` · ${row.lastError}` : ''}`)].join('\n') : 'Aún no hay intentos de providers registrados.', { replyTo: normalized.messageId })
      } else if (parsed.command === 'tgstatus') {
        if (!telegramOwner(message.from?.id)) throw new Error('Este comando requiere owner de Telegram.')
        const bridge = telegramBridgeStatus()
        await this.adapter.sendText(normalized.chatId, `Telegram runtime activo.\nBridge cache: ${bridge.initialized ? 'inicializada' : 'pendiente'}\nMensajes cacheados: ${bridge.cachedMessages}\nCanal configurado: ${bridge.configured ? 'sí' : 'no'}`, { replyTo: normalized.messageId })
      }
      return true
    } catch (error) {
      logger.warn({ error, chatId: normalized.chatId, command: parsed.command }, 'Telegram command failed')
      await this.adapter.sendText(normalized.chatId, `Error: ${error instanceof Error ? error.message : 'error interno'}`, { replyTo: normalized.messageId }).catch(() => undefined)
      return true
    }
  }
}
