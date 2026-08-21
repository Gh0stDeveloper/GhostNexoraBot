import type { BotCommand } from '../types.js'
import { generalCommands } from './general.js'
import { stickerCommands } from './stickers.js'
import { downloadCommands } from './downloads.js'
import { groupCommands } from './groups.js'
import { ownerCommands } from './owner.js'

export const commands: BotCommand[] = [
  ...generalCommands,
  ...stickerCommands,
  ...downloadCommands,
  ...groupCommands,
  ...ownerCommands,
]
