import type { NeutralBotCommand } from '../types.js'
import { generalCommands } from './general.js'
import { creditsCommands } from './credits.js'
import { systemCommands } from './system.js'

// B2 starts with commands whose current canonical behavior is transport-neutral.
// Menu/help stays native until B3 central metadata can hide unsupported commands
// instead of advertising the full WhatsApp catalog on Discord/Telegram.
const generalShared = generalCommands.filter((command) => command.name !== 'menu')
const systemShared = systemCommands.filter((command) => command.name === 'system' || command.name === 'speedtest')

export const sharedNeutralCommands: NeutralBotCommand[] = [
  ...generalShared,
  ...creditsCommands,
  ...systemShared,
]

export const sharedNeutralCommandNames = new Set(
  sharedNeutralCommands.map((command) => command.name.toLowerCase()),
)
