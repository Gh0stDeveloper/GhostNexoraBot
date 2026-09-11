import type { NormalizedUi } from '@ghostnexora/platform-contracts'
import { config } from '../../config.js'
import { settings } from '../../core/settings.js'
import {
  clearPlatformLocale,
  localizeLegacyText,
  localeName,
  platformLocalePreference,
  resolvePlatformLocale,
  setPlatformLocale,
  translate,
  type LocaleCode,
} from '../../i18n/index.js'
import { isSupportedLocale } from '../../i18n/types.js'
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
  ['language', 'language'], ['lang', 'language'], ['idioma', 'language'],
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
function t(locale: LocaleCode, key: string, values: Record<string, string | number | boolean | null | undefined> = {}) { return translate(locale, key, values) }

function parseLocale(raw?: string): LocaleCode | null {
  const value = raw?.trim().toLowerCase()
  if (!value) return null
  if (['español', 'espanol', 'spanish'].includes(value)) return 'es'
  if (['inglés', 'ingles', 'english'].includes(value)) return 'en'
  return isSupportedLocale(value) ? value : null
}

function inheritValue(raw?: string) {
  return ['inherit', 'heredar', 'default', 'auto', 'clear', 'reset'].includes(raw?.trim().toLowerCase() ?? '')
}

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

async function progress(adapter: TelegramAdapter, chatId: string, replyTo: string, subject: string, locale: LocaleCode) {
  const sent = await adapter.sendText(chatId, `${subject}\n${t(locale, 'common.preparing')}`, { replyTo })
  return async (stage: string) => adapter.editMessage?.(chatId, sent.messageId, `${subject}\n${stage}`).catch(() => undefined)
}

export class TelegramCommandRouter {
  constructor(
    private readonly adapter: TelegramAdapter,
    private readonly botUsername?: string,
  ) {}

  private locale(message: TelegramMessage) {
    return resolvePlatformLocale({
      platform: 'telegram',
      botInstanceId: this.adapter.botInstanceId,
      chatId: message.chat.id,
      userId: message.from?.id,
      clientLocale: message.from?.language_code,
    })
  }

  private async help(chatId: string, locale: LocaleCode, replyTo?: string) {
    const ui: NormalizedUi = {
      kind: 'list',
      title: `${config.botName} · Telegram`,
      body: t(locale, 'telegram.help.body'),
      items: [
        { id: 'ping', title: '/ping', description: t(locale, 'telegram.help.ping'), action: { kind: 'command', label: 'Ping', value: 'ping' } },
        { id: 'info', title: '/info', description: t(locale, 'telegram.help.info'), action: { kind: 'command', label: t(locale, 'menu.button.profile'), value: 'info' } },
        { id: 'language', title: '/language', description: t(locale, 'telegram.help.language'), action: { kind: 'command', label: localeName(locale, locale), value: 'language' } },
        { id: 'vk', title: '/vk <url>', description: t(locale, 'telegram.help.vk') },
        { id: 'am', title: '/apkmirror <app>', description: t(locale, 'telegram.help.apkmirror') },
        { id: 'ap', title: '/apkpure <package>', description: t(locale, 'telegram.help.apkpure') },
      ],
    }
    await this.adapter.sendUi(chatId, ui, replyTo ? { replyTo } : undefined)
  }

  private async language(message: TelegramMessage, argText: string, locale: LocaleCode) {
    const userId = message.from?.id
    if (!userId) return
    const platform = { platform: 'telegram' as const, botInstanceId: this.adapter.botInstanceId }
    const args = argText.trim().split(/\s+/).filter(Boolean)
    let scope: 'user' | 'chat' | 'bot' = 'user'
    let value = args[0] ?? ''
    if (['user', 'usuario', 'me', 'personal'].includes(value.toLowerCase())) { scope = 'user'; value = args[1] ?? '' }
    else if (['chat', 'group', 'grupo'].includes(value.toLowerCase())) { scope = 'chat'; value = args[1] ?? '' }
    else if (['bot', 'platform', 'plataforma'].includes(value.toLowerCase())) { scope = 'bot'; value = args[1] ?? '' }

    if (!argText.trim() || ['status', 'estado', 'current', 'actual'].includes(value.toLowerCase())) {
      const user = platformLocalePreference(platform, 'user', userId)
      const chat = platformLocalePreference(platform, 'chat', message.chat.id)
      const bot = platformLocalePreference(platform, 'bot', 'self')
      const effective = this.locale(message)
      await this.adapter.sendText(String(message.chat.id), [
        t(effective, 'language.status.title'),
        '━━━━━━━━━━━━━━',
        `${t(effective, 'language.status.user')}: ${user ? `${localeName(user, effective)} (${user})` : t(effective, 'language.status.none')}`,
        `${t(effective, 'language.status.chat')}: ${chat ? `${localeName(chat, effective)} (${chat})` : t(effective, 'language.status.none')}`,
        `${t(effective, 'language.status.bot')}: ${bot ? `${localeName(bot, effective)} (${bot})` : t(effective, 'language.status.none')}`,
        `${t(effective, 'language.status.effective')}: ${localeName(effective, effective)} (${effective})`,
        '',
        t(effective, 'language.usage.phase6', { command: '/language' }),
      ].join('\n'), { replyTo: String(message.message_id) })
      return
    }

    if ((scope === 'chat' || scope === 'bot') && !telegramStaff(userId)) throw new Error(t(locale, scope === 'chat' ? 'language.error.chatPermission' : 'language.error.botPermission'))
    const scopeId = scope === 'user' ? userId : scope === 'chat' ? message.chat.id : 'self'
    if (inheritValue(value)) {
      clearPlatformLocale(platform, scope, scopeId)
      const next = this.locale(message)
      const key = scope === 'user' ? 'language.changed.userInherit' : scope === 'chat' ? 'language.changed.chatInherit' : 'language.changed.botInherit'
      await this.adapter.sendText(String(message.chat.id), t(next, key), { replyTo: String(message.message_id) })
      return
    }
    const nextLocale = parseLocale(value)
    if (!nextLocale) throw new Error(t(locale, 'language.error.invalid'))
    setPlatformLocale(platform, scope, scopeId, nextLocale)
    const key = scope === 'user' ? 'language.changed.user' : scope === 'chat' ? 'language.changed.chat' : 'language.changed.bot'
    await this.adapter.sendText(String(message.chat.id), t(nextLocale, key, { language: localeName(nextLocale, nextLocale) }), { replyTo: String(message.message_id) })
  }

  private async store(chatId: string, messageId: string, store: Phase3ApkStore, query: string, locale: LocaleCode) {
    if (!query) throw new Error(t(locale, 'common.storeUsage', { store }))
    const results = store === 'apkmirror' ? await searchApkMirror(query) : await searchApkPure(query)
    const command = store === 'apkmirror' ? 'apkmirrordl' : 'apkpuredl'
    const ui: NormalizedUi = {
      kind: 'carousel',
      title: `${storeLabel(store)} · ${t(locale, 'common.results')}`,
      cards: results.map((item) => ({
        id: item.token,
        title: item.name,
        body: [item.packageName && `${t(locale, 'common.package')}: ${item.packageName}`, item.version && `${t(locale, 'common.version')}: ${item.version}`, item.sizeLabel && `${t(locale, 'common.size')}: ${item.sizeLabel}`].filter(Boolean).join('\n') || t(locale, 'common.availableRelease'),
        imageUrl: item.icon,
        footer: storeLabel(store),
        buttons: [{ kind: 'command', label: t(locale, 'common.download'), value: `${command} ${item.token}` }],
      })),
    }
    await this.adapter.sendUi(chatId, ui, { replyTo: messageId })
  }

  private async storeDownload(chatId: string, messageId: string, store: Phase3ApkStore, token: string, locale: LocaleCode) {
    if (!token) throw new Error(t(locale, 'common.storeSelectFirst', { store }))
    const update = await progress(this.adapter, chatId, messageId, `${storeLabel(store)} · Android`, locale)
    await update(t(locale, store === 'apkmirror' ? 'common.storeResolvingMirror' : 'common.storeResolvingSigned'))
    const result = store === 'apkmirror'
      ? await withProviderLease('apkmirror', () => downloadPhase3Apk(token))
      : await downloadPhase3Apk(token)
    try {
      if (result.store !== store) throw new Error(t(locale, 'common.storeWrongToken'))
      if (result.size > this.adapter.capabilities.maxUploadBytes) {
        throw new Error(t(locale, 'common.storeUploadLimit', { size: humanBytes(result.size), platform: 'Telegram', limit: humanBytes(this.adapter.capabilities.maxUploadBytes) }))
      }
      await update(t(locale, 'common.sending', { value: `${result.packageKind} · ${humanBytes(result.size)}` }))
      await this.adapter.sendMedia(chatId, {
        kind: 'document',
        source: { kind: 'path', value: result.filePath },
        mimeType: result.packageKind === 'APK' ? 'application/vnd.android.package-archive' : 'application/zip',
        fileName: result.fileName,
        caption: [`${storeLabel(store)} · ${result.item.name}`, result.item.packageName && `${t(locale, 'common.package')}: ${result.item.packageName}`, result.item.version && `${t(locale, 'common.version')}: ${result.item.version}`, `${t(locale, 'common.format')}: ${result.packageKind}`, `${t(locale, 'common.size')}: ${humanBytes(result.size)}`].filter(Boolean).join('\n'),
      }, { replyTo: messageId })
      await update(t(locale, 'common.sent', { value: result.packageKind }))
    } finally {
      await result.cleanup()
    }
  }

  private async vk(chatId: string, messageId: string, url: string, locale: LocaleCode) {
    try { new URL(url) } catch { throw new Error(t(locale, 'common.vkUsage')) }
    const update = await progress(this.adapter, chatId, messageId, 'VK Video', locale)
    await update(t(locale, 'common.vkResolving'))
    const result = await downloadVkVideo(url)
    try {
      if (result.size > this.adapter.capabilities.maxUploadBytes) throw new Error(t(locale, 'common.vkUploadLimit', { size: humanBytes(result.size), platform: 'Telegram' }))
      await update(t(locale, 'common.sending', { value: humanBytes(result.size) }))
      await this.adapter.sendMedia(chatId, {
        kind: 'video',
        source: { kind: 'path', value: result.filePath },
        mimeType: 'video/mp4',
        fileName: 'vk-video.mp4',
        caption: `VK Video · ${result.quality ? `${result.quality}p · ` : ''}${humanBytes(result.size)}`,
      }, { replyTo: messageId })
      await update(t(locale, 'common.videoSent'))
    } finally {
      await result.cleanup()
    }
  }

  async handle(message: TelegramMessage) {
    if (message.from?.is_bot) return false
    const normalized = normalizeTelegramMessage(message, this.adapter.botInstanceId)
    const locale = this.locale(message)
    const parsed = parseCommand(normalized.text, this.botUsername)
    if (!parsed) return false
    if (!parsed.known) {
      await this.adapter.sendText(normalized.chatId, t(locale, 'common.commandUnavailable', { platform: 'Telegram', command: `/${parsed.command}`, help: '/help' }), { replyTo: normalized.messageId })
      return true
    }

    await this.adapter.setTyping?.(normalized.chatId, true).catch(() => undefined)
    try {
      if (parsed.command === 'start' || parsed.command === 'help') await this.help(normalized.chatId, locale, normalized.messageId)
      else if (parsed.command === 'language') await this.language(message, parsed.argText, locale)
      else if (parsed.command === 'ping') {
        const started = Date.now()
        const sent = await this.adapter.sendText(normalized.chatId, t(locale, 'telegram.ping.checking'), { replyTo: normalized.messageId })
        await this.adapter.editMessage?.(normalized.chatId, sent.messageId, t(locale, 'telegram.ping.result', { ms: Date.now() - started }))
      } else if (parsed.command === 'info') {
        await this.adapter.sendText(normalized.chatId, [config.botName, t(locale, 'telegram.info.platform'), t(locale, 'telegram.info.runtime'), t(locale, 'telegram.info.whatsappPrefix', { prefix: settings.prefix }), t(locale, 'telegram.info.commands')].join('\n'), { replyTo: normalized.messageId })
      } else if (parsed.command === 'vk') await this.vk(normalized.chatId, normalized.messageId, parsed.argText, locale)
      else if (parsed.command === 'apkmirror') await this.store(normalized.chatId, normalized.messageId, 'apkmirror', parsed.argText, locale)
      else if (parsed.command === 'apkpure') await this.store(normalized.chatId, normalized.messageId, 'apkpure', parsed.argText, locale)
      else if (parsed.command === 'apkmirrordl') await this.storeDownload(normalized.chatId, normalized.messageId, 'apkmirror', parsed.argText.split(/\s+/)[0] || '', locale)
      else if (parsed.command === 'apkpuredl') await this.storeDownload(normalized.chatId, normalized.messageId, 'apkpure', parsed.argText.split(/\s+/)[0] || '', locale)
      else if (parsed.command === 'providerhealth') {
        if (!telegramStaff(message.from?.id)) throw new Error(t(locale, 'common.staffRequired', { platform: 'Telegram' }))
        const rows = providerHealthSnapshot()
        await this.adapter.sendText(normalized.chatId, rows.length ? ['PROVIDER HEALTH', ...rows.map((row) => `${row.provider}: ${row.successes}/${row.attempts} OK · ${t(locale, 'common.providerFailures')} ${row.failures}${row.lastError ? ` · ${localizeLegacyText(row.lastError, locale)}` : ''}`)].join('\n') : t(locale, 'common.providerAttemptsEmpty'), { replyTo: normalized.messageId })
      } else if (parsed.command === 'tgstatus') {
        if (!telegramOwner(message.from?.id)) throw new Error(t(locale, 'common.ownerRequired', { platform: 'Telegram' }))
        const bridge = telegramBridgeStatus()
        await this.adapter.sendText(normalized.chatId, [t(locale, 'telegram.status.active'), t(locale, 'telegram.status.bridge', { value: bridge.initialized ? t(locale, 'common.initialized') : t(locale, 'common.pending') }), t(locale, 'telegram.status.cached', { count: bridge.cachedMessages }), t(locale, 'telegram.status.channel', { value: bridge.configured ? t(locale, 'common.yes') : t(locale, 'common.no') })].join('\n'), { replyTo: normalized.messageId })
      }
      return true
    } catch (error) {
      logger.warn({ error, chatId: normalized.chatId, command: parsed.command }, 'Telegram command failed')
      const publicError = localizeLegacyText(error instanceof Error ? error.message : t(locale, 'common.internalError'), locale)
      await this.adapter.sendText(normalized.chatId, t(locale, 'telegram.error.public', { error: publicError }), { replyTo: normalized.messageId }).catch(() => undefined)
      return true
    }
  }
}
