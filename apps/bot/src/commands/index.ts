import type { BotCommand } from '../types.js'
import { generalCommands } from './general.js'
import { profileCommands } from './profile.js'
import { reactionCommands } from './reactions.js'
import { stickerCommands } from './stickers.js'
import { downloadCommands } from './downloads.js'
import { youtubeFriendlyCommands } from './youtube-friendly.js'
import { lyricsCommands } from './lyrics.js'
import { resourceCommands } from './resources.js'
import { groupCommands } from './groups.js'
import { securityCommands } from './security.js'
import { economyCommands } from './economy.js'
import { advancedEconomyCommands } from './economy-advanced.js'
import { gameCommands } from './games.js'
import { waifuCommands } from './waifu.js'
import { subbotCommands } from './subbots.js'
import { adultCommands } from './adult.js'
import { ownerCommands } from './owner.js'

export const commands: BotCommand[] = [
  ...generalCommands,
  ...profileCommands,
  ...reactionCommands,
  ...stickerCommands,
  ...downloadCommands,
  ...youtubeFriendlyCommands,
  ...lyricsCommands,
  ...resourceCommands,
  ...groupCommands,
  ...securityCommands,
  ...economyCommands,
  ...advancedEconomyCommands,
  ...gameCommands,
  ...waifuCommands,
  ...subbotCommands,
  ...adultCommands,
  ...ownerCommands,
]
