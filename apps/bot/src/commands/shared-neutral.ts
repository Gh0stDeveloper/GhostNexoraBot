import type { NeutralBotCommand } from '../types.js'
import { generalCommands } from './general.js'
import { creditsCommands } from './credits.js'
import { systemCommands } from './system.js'

// B2 starts with commands whose canonical behavior is transport-neutral.
// Menu/help keeps a platform-native presentation shell for now, while B3 central
// metadata generates its contents and prevents unsupported commands being advertised.
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
