import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'

const FILE = path.join(config.dataDir, 'auto-chat.json')
type State = Record<string, boolean>

function load(): State {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8')) as unknown
    return parsed && typeof parsed === 'object' ? parsed as State : {}
  } catch {
    return {}
  }
}

function save(state: State) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  const tmp = `${FILE}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2))
  fs.renameSync(tmp, FILE)
}

export const autoChat = {
  isEnabled(chatId: string) {
    return Boolean(load()[chatId])
  },
  setEnabled(chatId: string, enabled: boolean) {
    const state = load()
    if (enabled) state[chatId] = true
    else delete state[chatId]
    save(state)
    return enabled
  },
  reset(chatId: string) {
    this.setEnabled(chatId, false)
  },
}
