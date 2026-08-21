import type { BotCommand } from '../types.js'
import { generalCommands } from './general.js'
import { aiCommands } from './ai.js'
import { profileCommands } from './profile.js'
import { reactionCommands } from './reactions.js'
import { stickerCommands } from './stickers.js'
import { downloadCommands } from './downloads.js'
import { youtubeFriendlyCommands } from './youtube-friendly.js'
import { lyricsCommands } from './lyrics.js'
import { resourceCommands } from './resources.js'
import { mangaDownloadCommands } from './manga-download.js'
import { webSearchCommands } from './web-search.js'
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
import { eromeCommands } from './erome.js'
import { adultRoleplayCommands } from './adult-roleplay.js'
import { personalizationCommands } from './personalization.js'
import { privateAccessCommands } from './private-access.js'
import { systemCommands } from './system.js'
import { ownerCommands } from './owner.js'
import { apkMultisourceCommands } from './apk-multisource.js'
import { groupAdultModeCommands } from './group-adult-mode.js'

export const commands: BotCommand[] = [
  ...generalCommands,
  ...aiCommands,
  ...profileCommands,
  ...reactionCommands,
  ...stickerCommands,
  ...downloadCommands,
  ...youtubeFriendlyCommands,
  ...lyricsCommands,
  ...resourceCommands,
  ...mangaDownloadCommands,
  ...webSearchCommands,
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
  ...eromeCommands,
  ...adultRoleplayCommands,
  ...personalizationCommands,
  ...privateAccessCommands,
  ...systemCommands,
  ...ownerCommands,
  // Se registran al final a propósito: sustituyen las implementaciones legacy
  // de .apk y .adultmode sin romper sus otros comandos/aliases.
  ...apkMultisourceCommands,
  ...groupAdultModeCommands,
]
