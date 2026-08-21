import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { config } from '../config.js'

interface RuntimeSettings {
  prefix: string
  adultEnabled: boolean
  privateCommandsRequireAccess: boolean
  botAdmins: string[]
  botDisplayName: string
  currencyName: string
}

function normalizeNumber(value: string) {
  return value.replace(/\D/g, '')
}

export class SettingsStore {
  private readonly file = path.join(config.dataDir, 'settings.json')
  private data: RuntimeSettings = {
    prefix: config.defaultPrefix,
    adultEnabled: false,
    privateCommandsRequireAccess: false,
    botAdmins: [],
    botDisplayName: config.botName,
    currencyName: 'Nexora Coins',
  }

  async init() {
    await mkdir(config.dataDir, { recursive: true })
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8')) as Partial<RuntimeSettings>
      if (typeof parsed.prefix === 'string' && parsed.prefix.length >= 1 && parsed.prefix.length <= 4) this.data.prefix = parsed.prefix
      if (typeof parsed.adultEnabled === 'boolean') this.data.adultEnabled = parsed.adultEnabled
      if (typeof parsed.privateCommandsRequireAccess === 'boolean') this.data.privateCommandsRequireAccess = parsed.privateCommandsRequireAccess
      if (Array.isArray(parsed.botAdmins)) this.data.botAdmins = [...new Set(parsed.botAdmins.map((value) => normalizeNumber(String(value))).filter(Boolean))]
      if (typeof parsed.botDisplayName === 'string' && parsed.botDisplayName.trim()) this.data.botDisplayName = parsed.botDisplayName.trim().slice(0, 60)
      if (typeof parsed.currencyName === 'string' && parsed.currencyName.trim()) this.data.currencyName = parsed.currencyName.trim().slice(0, 32)
    } catch {
      await this.save()
    }
  }

  get prefix() { return this.data.prefix }
  get adultEnabled() { return this.data.adultEnabled }
  get privateCommandsRequireAccess() { return this.data.privateCommandsRequireAccess }
  get botAdmins() { return [...this.data.botAdmins] }
  get botDisplayName() { return this.data.botDisplayName }
  get currencyName() { return this.data.currencyName }

  isBotAdmin(number: string) {
    const normalized = normalizeNumber(number)
    return Boolean(normalized) && this.data.botAdmins.includes(normalized)
  }

  async addBotAdmin(number: string) {
    const normalized = normalizeNumber(number)
    if (normalized.length < 8 || normalized.length > 20) throw new Error('Número de WhatsApp inválido para administrador.')
    if (!this.data.botAdmins.includes(normalized)) this.data.botAdmins.push(normalized)
    await this.save()
    return normalized
  }

  async removeBotAdmin(number: string) {
    const normalized = normalizeNumber(number)
    const before = this.data.botAdmins.length
    this.data.botAdmins = this.data.botAdmins.filter((item) => item !== normalized)
    await this.save()
    return this.data.botAdmins.length !== before
  }

  async setBotDisplayName(name: string) {
    const next = name.trim()
    if (next.length < 2 || next.length > 60) throw new Error('El nombre del bot debe tener entre 2 y 60 caracteres.')
    this.data.botDisplayName = next
    await this.save()
  }

  async setCurrencyName(name: string) {
    const next = name.trim()
    if (next.length < 2 || next.length > 32) throw new Error('El nombre de la moneda debe tener entre 2 y 32 caracteres.')
    this.data.currencyName = next
    await this.save()
  }

  async setPrefix(prefix: string) {
    const next = prefix.trim()
    if (!next || next.length > 4 || /\s/.test(next)) throw new Error('El prefijo debe tener entre 1 y 4 caracteres y no contener espacios.')
    this.data.prefix = next
    await this.save()
  }

  async setAdultEnabled(enabled: boolean) {
    this.data.adultEnabled = enabled
    await this.save()
  }

  async setPrivateCommandsRequireAccess(enabled: boolean) {
    this.data.privateCommandsRequireAccess = enabled
    await this.save()
  }

  private async save() {
    await mkdir(config.dataDir, { recursive: true })
    await writeFile(this.file, `${JSON.stringify(this.data, null, 2)}\n`, { mode: 0o600 })
  }
}

export const settings = new SettingsStore()
