import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { config } from '../config.js'

interface RuntimeSettings {
  prefix: string
  adultEnabled: boolean
  privateCommandsRequireAccess: boolean
}

export class SettingsStore {
  private readonly file = path.join(config.dataDir, 'settings.json')
  private data: RuntimeSettings = {
    prefix: config.defaultPrefix,
    adultEnabled: false,
    privateCommandsRequireAccess: false,
  }

  async init() {
    await mkdir(config.dataDir, { recursive: true })
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8')) as Partial<RuntimeSettings>
      if (typeof parsed.prefix === 'string' && parsed.prefix.length >= 1 && parsed.prefix.length <= 4) this.data.prefix = parsed.prefix
      if (typeof parsed.adultEnabled === 'boolean') this.data.adultEnabled = parsed.adultEnabled
      if (typeof parsed.privateCommandsRequireAccess === 'boolean') this.data.privateCommandsRequireAccess = parsed.privateCommandsRequireAccess
    } catch {
      await this.save()
    }
  }

  get prefix() { return this.data.prefix }
  get adultEnabled() { return this.data.adultEnabled }
  get privateCommandsRequireAccess() { return this.data.privateCommandsRequireAccess }

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
