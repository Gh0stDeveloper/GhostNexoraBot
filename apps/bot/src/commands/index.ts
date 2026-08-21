import type { BotCommand } from '../types.js'
import { generalCommands } from './general.js'
import { profileCommands } from './profile.js'
import { reactionCommands } from './reactions.js'
import { stickerCommands } from './stickers.js'
import { downloadCommands } from './downloads.js'
import { youtubeFriendlyCommands } from './youtube-friendly.js'
import { lyricsCommands } from './lyrics.js'
import { resourceCommands } from './resources.js'
import { booruCommands } from './booru.js'
import { groupCommands } from './groups.js'
import { securityCommands } from './security.js'
import { economyCommands } from './economy.js'
import { advancedEconomyCommands } from './economy-advanced.js'
import { gameCommands } from './games.js'
import { pvpGameCommands } from './games-pvp.js'
import { rpgCommands } from './rpg.js'
import { waifuCommands } from './waifu.js'
import { waifuExtendedCommands } from './waifu-extended.js'
import { subbotCommands } from './subbots.js'
import { adultCommands } from './adult.js'
import { adultRoleplayCommands } from './adult-roleplay.js'
import { personalizationCommands } from './personalization.js'
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
  ...booruCommands,
  ...groupCommands,
  ...securityCommands,
  ...economyCommands,
  ...advancedEconomyCommands,
  ...gameCommands,
  ...pvpGameCommands,
  ...rpgCommands,
  ...waifuCommands,
  ...waifuExtendedCommands,
  ...subbotCommands,
  ...adultCommands,
  ...adultRoleplayCommands,
  ...personalizationCommands,
  ...ownerCommands,
]
