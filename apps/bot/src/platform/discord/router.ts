import type { NormalizedUi } from '@ghostnexora/platform-contracts'
import { config } from '../../config.js'
import { settings } from '../../core/settings.js'
import { downloadPhase3Apk, searchApkMirror, searchApkPure, type Phase3ApkStore } from '../../services/download-providers/apk-stores.js'
import { withProviderLease } from '../../services/download-providers/lease.js'
import { providerHealthSnapshot } from '../../services/download-providers/runtime.js'
import { downloadVkVideo } from '../../services/download-providers/vk.js'
import { logger } from '../../utils/logger.js'
import type { DiscordAdapter } from './adapter.js'
import { discordConfig, discordOwner, discordStaff } from './config.js'
import { normalizeDiscordMessage } from './normalize.js'
import type {
  DiscordApplicationCommandData,
  DiscordApplicationCommandDefinition,
  DiscordComponentInteractionData,
  DiscordInteraction,
  DiscordMessage,
  DiscordUser,
} from './types.js'

const aliases = new Map<string, string>([
  ['start', 'help'], ['help', 'help'], ['menu', 'help'], ['ayuda', 'help'],
  ['ping', 'ping'], ['info', 'info'], ['version', 'info'], ['botinfo', 'info'],
  ['vk', 'vk'], ['vkvideo', 'vk'], ['vkd', 'vk'],
  ['apkmirror', 'apkmirror'], ['apkm', 'apkmirror'], ['amirror', 'apkmirror'],
  ['apkmirrordl', 'apkmirrordl'], ['amdl', 'apkmirrordl'],
  ['apkpure', 'apkpure'], ['apkp', 'apkpure'], ['pureapk', 'apkpure'],
  ['apkpuredl', 'apkpuredl'], ['apdl', 'apkpuredl'],
  ['providerhealth', 'providerhealth'], ['dlhealth', 'providerhealth'],
  ['discordstatus', 'discordstatus'], ['dcstatus', 'discordstatus'],
])

export const discordApplicationCommands: DiscordApplicationCommandDefinition[] = [
  { name: 'start', description: 'Abre Ghost Nexora Bot en Discord.' },
  { name: 'help', description: 'Muestra los comandos disponibles en Discord.' },
  { name: 'menu', description: 'Abre el menú de Ghost Nexora Bot.' },
  { name: 'ping', description: 'Comprueba latencia y estado del runtime Discord.' },
  { name: 'info', description: 'Muestra información de Ghost Nexora Bot.' },
  { name: 'version', description: 'Muestra información de la versión actual.' },
  {
    name: 'vk',
    description: 'Descarga un video público de VK/VK Video.',
    options: [{ type: 3, name: 'url', description: 'URL de vk.com, vkvideo.ru o live.vkvideo.ru', required: true, max_length: 1900 }],
  },
  {
    name: 'apkmirror',
    description: 'Busca una aplicación en APKMirror.',
    options: [{ type: 3, name: 'query', description: 'Nombre o package de la aplicación', required: true, max_length: 200 }],
  },
  {
    name: 'apkpure',
    description: 'Busca una aplicación en APKPure.',
    options: [{ type: 3, name: 'query', description: 'Nombre o package de la aplicación', required: true, max_length: 200 }],
  },
  { name: 'providerhealth', description: 'Estado de providers V2. Requiere staff.' },
  { name: 'discordstatus', description: 'Estado técnico del runtime Discord. Requiere owner.' },
]

type Invocation = {
  command: string
  argText: string
  channelId: string
  messageId?: string
  user: DiscordUser
  guildId?: string
  source: 'message' | 'slash' | 'component'
}

type RuntimeStatusProvider = () => Record<string, unknown>

function humanBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

function storeLabel(store: Phase3ApkStore) { return store === 'apkmirror' ? 'APKMirror' : 'APKPure' }

function splitCommand(raw: string) {
  const clean = raw.trim()
  const firstSpace = clean.search(/\s/)
  const name = (firstSpace < 0 ? clean : clean.slice(0, firstSpace)).toLowerCase()
  return {
    rawName: name,
    command: aliases.get(name),
    argText: firstSpace < 0 ? '' : clean.slice(firstSpace + 1).trim(),
  }
}

function parseMessageCommand(message: DiscordMessage, botUserId?: string) {
  let text = message.content.trim()
  if (!text) return undefined

  let mentioned = false
  if (botUserId) {
    const mention = new RegExp(`^<@!?${botUserId}>\\s*`)
    if (mention.test(text)) {
      mentioned = true
      text = text.replace(mention, '').trim()
    }
  }

  let body = text
  if (body.startsWith(settings.prefix)) body = body.slice(settings.prefix.length)
  else if (body.startsWith('/')) body = body.slice(1)
  else if (!mentioned) return undefined

  const parsed = splitCommand(body)
  if (!parsed.rawName) return undefined
  return parsed
}

function interactionUser(interaction: DiscordInteraction) {
  return interaction.member?.user || interaction.user
}

function commandArgText(data: DiscordApplicationCommandData) {
  const values: string[] = []
  const visit = (options = data.options ?? []) => {
    for (const option of options) {
      if (option.value !== undefined) values.push(String(option.value))
      if (option.options?.length) visit(option.options)
    }
  }
  visit()
  return values.join(' ').trim()
}

async function progress(adapter: DiscordAdapter, channelId: string, replyTo: string | undefined, subject: string) {
  const sent = await adapter.sendText(channelId, `${subject}\nPreparando…`, replyTo ? { replyTo } : undefined)
  return async (stage: string) => adapter.editMessage?.(channelId, sent.messageId, `${subject}\n${stage}`).catch(() => undefined)
}

export class DiscordCommandRouter {
  private botUserId?: string

  constructor(
    private readonly adapter: DiscordAdapter,
    botUserId?: string,
    private readonly statusProvider: RuntimeStatusProvider = () => ({}),
  ) {
    this.botUserId = botUserId
  }

  setBotUserId(botUserId: string) { this.botUserId = botUserId }

  private async help(invocation: Invocation) {
    const ui: NormalizedUi = {
      kind: 'list',
      title: `${config.botName} · Discord`,
      body: 'Plataforma Discord nativa V2. Usa slash commands o menciona al bot; el prefijo también funciona cuando MESSAGE_CONTENT está habilitado.',
      items: [
        { id: 'ping', title: '/ping', description: 'Comprueba Gateway + REST.', action: { kind: 'command', label: 'Ping', value: 'ping' } },
        { id: 'info', title: '/info', description: 'Información del runtime Discord.', action: { kind: 'command', label: 'Información', value: 'info' } },
        { id: 'vk', title: '/vk', description: 'Descarga video público de VK/VK Video.' },
        { id: 'am', title: '/apkmirror', description: 'Busca y descarga desde APKMirror.' },
        { id: 'ap', title: '/apkpure', description: 'Busca y descarga desde APKPure.' },
      ],
    }
    await this.adapter.sendUi(invocation.channelId, ui, invocation.messageId ? { replyTo: invocation.messageId } : undefined)
  }

  private async store(invocation: Invocation, store: Phase3ApkStore) {
    if (!invocation.argText) throw new Error(`Uso: /${store} <aplicación|package>`)
    const results = store === 'apkmirror' ? await searchApkMirror(invocation.argText) : await searchApkPure(invocation.argText)
    const command = store === 'apkmirror' ? 'apkmirrordl' : 'apkpuredl'
    const ui: NormalizedUi = {
      kind: 'carousel',
      title: `${storeLabel(store)} · resultados`,
      cards: results.map((item) => ({
        id: item.token,
        title: item.name,
        body: [
          item.packageName && `Package: ${item.packageName}`,
          item.version && `Versión: ${item.version}`,
          item.sizeLabel && `Tamaño: ${item.sizeLabel}`,
        ].filter(Boolean).join('\n') || 'Release disponible',
        imageUrl: item.icon,
        footer: storeLabel(store),
        buttons: [{ kind: 'command', label: 'Descargar', value: `${command} ${item.token}` }],
      })),
    }
    await this.adapter.sendUi(invocation.channelId, ui, invocation.messageId ? { replyTo: invocation.messageId } : undefined)
  }

  private async storeDownload(invocation: Invocation, store: Phase3ApkStore) {
    const token = invocation.argText.split(/\s+/)[0] || ''
    if (!token) throw new Error(`Selecciona primero una aplicación con /${store} <búsqueda>.`)
    const update = await progress(this.adapter, invocation.channelId, invocation.messageId, `${storeLabel(store)} · paquete Android`)
    await update(store === 'apkmirror' ? 'Esperando turno y resolviendo cadena firmada…' : 'Resolviendo descarga firmada…')
    const result = store === 'apkmirror'
      ? await withProviderLease('apkmirror', () => downloadPhase3Apk(token))
      : await downloadPhase3Apk(token)
    try {
      if (result.store !== store) throw new Error('El token pertenece a otra tienda.')
      if (result.size > this.adapter.capabilities.maxUploadBytes) {
        throw new Error(`El archivo pesa ${humanBytes(result.size)} y supera el límite seguro de subida de Discord de ${humanBytes(this.adapter.capabilities.maxUploadBytes)}.`)
      }
      await update(`Enviando ${result.packageKind} · ${humanBytes(result.size)}…`)
      await this.adapter.sendMedia(invocation.channelId, {
        kind: 'document',
        source: { kind: 'path', value: result.filePath },
        mimeType: result.packageKind === 'APK' ? 'application/vnd.android.package-archive' : 'application/zip',
        fileName: result.fileName,
        caption: [
          `${storeLabel(store)} · ${result.item.name}`,
          result.item.packageName && `Package: ${result.item.packageName}`,
          result.item.version && `Versión: ${result.item.version}`,
          `Formato: ${result.packageKind}`,
          `Tamaño: ${humanBytes(result.size)}`,
        ].filter(Boolean).join('\n'),
      }, invocation.messageId ? { replyTo: invocation.messageId } : undefined)
      await update(`${result.packageKind} enviado correctamente.`)
    } finally {
      await result.cleanup()
    }
  }

  private async vk(invocation: Invocation) {
    try { new URL(invocation.argText) } catch { throw new Error('Uso: /vk <url de vk.com|vkvideo.ru|live.vkvideo.ru>') }
    const update = await progress(this.adapter, invocation.channelId, invocation.messageId, 'VK Video')
    await update('Resolviendo API 5.199 / fallback público…')
    const result = await downloadVkVideo(invocation.argText)
    try {
      if (result.size > this.adapter.capabilities.maxUploadBytes) {
        throw new Error(`El video pesa ${humanBytes(result.size)} y supera el límite seguro de subida de Discord.`)
      }
      await update(`Enviando ${humanBytes(result.size)}…`)
      await this.adapter.sendMedia(invocation.channelId, {
        kind: 'video',
        source: { kind: 'path', value: result.filePath },
        mimeType: 'video/mp4',
        fileName: 'vk-video.mp4',
        caption: `VK Video · ${result.quality ? `${result.quality}p · ` : ''}${humanBytes(result.size)}`,
      }, invocation.messageId ? { replyTo: invocation.messageId } : undefined)
      await update('Video enviado correctamente.')
    } finally {
      await result.cleanup()
    }
  }

  private async execute(invocation: Invocation) {
    await this.adapter.setTyping?.(invocation.channelId, true).catch(() => undefined)
    try {
      if (invocation.command === 'help') await this.help(invocation)
      else if (invocation.command === 'ping') {
        const started = Date.now()
        const sent = await this.adapter.sendText(invocation.channelId, 'Pong · comprobando…', invocation.messageId ? { replyTo: invocation.messageId } : undefined)
        await this.adapter.editMessage?.(invocation.channelId, sent.messageId, `Pong · Discord ${Date.now() - started} ms`)
      } else if (invocation.command === 'info') {
        await this.adapter.sendText(invocation.channelId, [
          config.botName,
          'Plataforma: Discord nativo',
          'Runtime: V2 Phase 5',
          `MESSAGE_CONTENT: ${discordConfig.messageContentEnabled ? 'habilitado' : 'deshabilitado; usa slash commands/DM/mención'}`,
          'Comandos: /help',
        ].join('\n'), invocation.messageId ? { replyTo: invocation.messageId } : undefined)
      } else if (invocation.command === 'vk') await this.vk(invocation)
      else if (invocation.command === 'apkmirror') await this.store(invocation, 'apkmirror')
      else if (invocation.command === 'apkpure') await this.store(invocation, 'apkpure')
      else if (invocation.command === 'apkmirrordl') await this.storeDownload(invocation, 'apkmirror')
      else if (invocation.command === 'apkpuredl') await this.storeDownload(invocation, 'apkpure')
      else if (invocation.command === 'providerhealth') {
        if (!discordStaff(invocation.user.id)) throw new Error('Este comando requiere owner/staff de Discord.')
        const rows = providerHealthSnapshot()
        await this.adapter.sendText(invocation.channelId, rows.length
          ? ['PROVIDER HEALTH', ...rows.map((row) => `${row.provider}: ${row.successes}/${row.attempts} OK · fallos ${row.failures}${row.lastError ? ` · ${row.lastError}` : ''}`)].join('\n')
          : 'Aún no hay intentos de providers registrados.')
      } else if (invocation.command === 'discordstatus') {
        if (!discordOwner(invocation.user.id)) throw new Error('Este comando requiere owner de Discord.')
        const status = this.statusProvider()
        await this.adapter.sendText(invocation.channelId, ['DISCORD RUNTIME', ...Object.entries(status).map(([key, value]) => `${key}: ${String(value)}`)].join('\n'))
      }
      return true
    } catch (error) {
      logger.warn({ error, chatId: invocation.channelId, command: invocation.command }, 'Discord command failed')
      await this.adapter.sendText(invocation.channelId, `Error: ${error instanceof Error ? error.message : 'error interno'}`, invocation.messageId ? { replyTo: invocation.messageId } : undefined).catch(() => undefined)
      return true
    }
  }

  async handleMessage(message: DiscordMessage) {
    if (message.author.bot) return false
    const normalized = normalizeDiscordMessage(message, this.adapter.botInstanceId)
    const parsed = parseMessageCommand(message, this.botUserId)
    if (!parsed) return false
    if (!parsed.command) {
      await this.adapter.sendText(normalized.chatId, `Comando no disponible en Discord: ${parsed.rawName}\nUsa /help para ver los comandos portados.`, { replyTo: normalized.messageId })
      return true
    }
    return this.execute({
      command: parsed.command,
      argText: parsed.argText,
      channelId: normalized.chatId,
      messageId: normalized.messageId,
      user: message.author,
      guildId: message.guild_id,
      source: 'message',
    })
  }

  async handleInteraction(interaction: DiscordInteraction) {
    const user = interactionUser(interaction)
    const channelId = interaction.channel_id
    if (!user || user.bot || !channelId || !interaction.data) return false

    if (interaction.type === 2) {
      const data = interaction.data as DiscordApplicationCommandData
      const command = aliases.get(data.name.toLowerCase())
      if (!command) return false
      return this.execute({
        command,
        argText: commandArgText(data),
        channelId,
        user,
        guildId: interaction.guild_id,
        source: 'slash',
      })
    }

    if (interaction.type === 3) {
      const data = interaction.data as DiscordComponentInteractionData
      const raw = this.adapter.resolveComponentCustomId(data.custom_id)
      if (!raw) {
        await this.adapter.sendText(channelId, 'Esta acción expiró. Ejecuta de nuevo el comando.')
        return true
      }
      const parsed = splitCommand(raw)
      if (!parsed.command) return false
      return this.execute({
        command: parsed.command,
        argText: parsed.argText,
        channelId,
        user,
        guildId: interaction.guild_id,
        source: 'component',
      })
    }

    return false
  }
}
