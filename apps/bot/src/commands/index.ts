import type { BotCommand } from '../types.js'
import { generalCommands } from './general.js'
import { stickerCommands } from './stickers.js'
import { downloadCommands } from './downloads.js'
import { resourceCommands } from './resources.js'
import { groupCommands } from './groups.js'
import { securityCommands } from './security.js'
import { economyCommands } from './economy.js'
import { subbotCommands } from './subbots.js'
import { adultCommands } from './adult.js'
import { ownerCommands } from './owner.js'

export const commands: BotCommand[] = [
  ...generalCommands,
  ...stickerCommands,
  ...downloadCommands,
  ...resourceCommands,
  ...groupCommands,
  ...securityCommands,
  ...economyCommands,
  ...subbotCommands,
  ...adultCommands,
  ...ownerCommands,
]
