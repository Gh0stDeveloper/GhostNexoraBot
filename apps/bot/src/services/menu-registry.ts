import type { BotCommand } from '../types.js'

let provider: () => readonly BotCommand[] = () => []

export function setMenuCommandProvider(next: () => readonly BotCommand[]) {
  provider = next
}

export function registeredCommands() {
  return provider()
}

export function effectiveCommands() {
  const tokenOwner = new Map<string, BotCommand>()
  for (const command of provider()) {
    tokenOwner.set(command.name.toLowerCase(), command)
    for (const alias of command.aliases ?? []) tokenOwner.set(alias.toLowerCase(), command)
  }

  const rows = new Map<BotCommand, string[]>()
  for (const [token, command] of tokenOwner) {
    const current = rows.get(command) ?? []
    current.push(token)
    rows.set(command, current)
  }
  return [...rows.entries()].map(([command, tokens]) => ({ command, tokens }))
}
