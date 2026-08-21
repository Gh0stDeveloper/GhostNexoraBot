import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { config } from '../config.js'

interface RuntimeSettings {
  prefix: string
}

export class SettingsStore {
  private readonly file = path.join(config.dataDir, 'settings.json')
  private data: RuntimeSettings = { prefix: config.defaultPrefix }

  async init() {
    await mkdir(config.dataDir, { recursive: true })
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8')) as Partial<RuntimeSettings>
      if (typeof parsed.prefix === 'string' && parsed.prefix.length >= 1 && parsed.prefix.length <= 4) {
        this.data.prefix = parsed.prefix
      }
    } catch {
      await this.save()
    }
  }

  get prefix() {
    return this.data.prefix
  }

  async setPrefix(prefix: string) {
    const next = prefix.trim()
    if (!next || next.length > 4 || /\s/.test(next)) {
      throw new Error('El prefijo debe tener entre 1 y 4 caracteres y no contener espacios.')
    }
    this.data.prefix = next
    await this.save()
  }

  private async save() {
    await mkdir(config.dataDir, { recursive: true })
    await writeFile(this.file, `${JSON.stringify(this.data, null, 2)}\n`, { mode: 0o600 })
  }
}

export const settings = new SettingsStore()
