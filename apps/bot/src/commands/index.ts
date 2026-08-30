import '../services/work-compat-v4.js'
import type { BotCommand } from '../types.js'
import { setMenuCommandProvider } from '../services/menu-registry.js'
import { generalCommands } from './general.js'
import { aiCommands } from './ai.js'
import { profileCommands } from './profile.js'
import { reactionCommands } from './reactions.js'
import { stickerCommands } from './stickers.js'
import { downloadCommands } from './downloads.js'
import { lyricsCommands } from './lyrics.js'
import { resourceCommands } from './resources.js'
import { mangaDownloadCommands } from './manga-download.js'
import { animeDownloadCommands } from './anime-download.js'
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
import { hentaiV9Commands } from './hentai-v9.js'
import { personalizationCommands } from './personalization.js'
import { privateAccessCommands } from './private-access.js'
import { systemCommands } from './system.js'
import { ownerCommands } from './owner.js'
import { apkMultisourceCommands } from './apk-multisource.js'
import { groupAdultModeCommands } from './group-adult-mode.js'
import { v2Commands } from './v2.js'
import { adultV2Commands } from './adult-v2.js'
import { downloadProgressV2Commands } from './downloads-progress-v2.js'
import { economyFixV2Commands } from './economy-fixes-v2.js'
import { eromeProgressV2Commands } from './erome-progress-v2.js'
import { youtubeV3Commands } from './youtube-v3.js'
import { carouselCompatV3Commands } from './carousel-compat-v3.js'
import { menuV3Commands } from './menu-v3.js'
import { expansionV4Commands } from './expansion-v4.js'
import { casinoGuardV4Commands } from './casino-guard-v4.js'
import { downloadUiV5Commands } from './download-ui-v5.js'
import { stickerAdminV5Commands } from './sticker-admin-v5.js'
import { waifuV5Commands } from './waifu-v5.js'
import { economyCareersV5Commands } from './economy-careers-v5.js'
import { menuV5Commands } from './menu-v5.js'
import { pvz2Commands } from './pvz2.js'
import { officialApkV7Commands } from './official-apk-v7.js'
import { developerV7Commands } from './developer-v7.js'
import { telegramBridgeV7Commands } from './telegram-bridge-v7.js'
import { sourceOverrideV7Commands } from './source-overrides-v7.js'
import { channelV8Commands } from './channel-v8.js'
import { economyCareersV8Commands } from './economy-careers-v8.js'
import { versionV8Commands } from './version-v8.js'
import { adultMediaV8Commands } from './adult-media-v8.js'
import { adultRoleplayV8Commands } from './adult-roleplay-v8.js'
import { reactionV8Commands } from './reactions-v8.js'
import { happyModCommands } from './happymod.js'
import { officialApkV9Commands } from './official-apk-v9.js'
import { developerV8Commands } from './developer-v8.js'
import { groupControlsV9Commands } from './group-controls-v9.js'
import { lempiApiCommands } from './lempi-api.js'
import { mediaDownloadFixCommands } from './media-download-fixes-v2.js'
import { miniLlmCommands } from './mini-llm.js'
import { autoChatCommands } from './auto-chat.js'
import { dinoCommands } from './dino.js'
import { snakeCommands } from './snake.js'
import { doomCommands } from './doom.js'
import { ninjaCommands } from './ninja.js'

export const commands: BotCommand[] = [
  ...generalCommands,
  ...aiCommands,
  ...profileCommands,
  ...reactionCommands,
  ...stickerCommands,
  ...downloadCommands,
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
  ...dinoCommands,
  ...snakeCommands,
  ...doomCommands,
  ...ninjaCommands,
  ...pvpGameCommands,
  ...rpgCommands,
  ...waifuCommands,
  ...waifuExtendedCommands,
  ...subbotCommands,
  ...adultCommands,
  ...eromeCommands,
  ...hentaiV9Commands,
  ...personalizationCommands,
  ...privateAccessCommands,
  ...systemCommands,
  ...ownerCommands,
  ...apkMultisourceCommands,
  ...groupAdultModeCommands,
  ...v2Commands,
  ...adultV2Commands,
  ...downloadProgressV2Commands,
  ...eromeProgressV2Commands,
  ...economyFixV2Commands,
  ...youtubeV3Commands,
  ...carouselCompatV3Commands,
  ...menuV3Commands,
  ...expansionV4Commands,
  ...casinoGuardV4Commands,
  ...downloadUiV5Commands,
  ...stickerAdminV5Commands,
  ...waifuV5Commands,
  ...economyCareersV5Commands,
  ...pvz2Commands,
  ...menuV5Commands,
  ...officialApkV7Commands,
  ...developerV7Commands,
  ...telegramBridgeV7Commands,
  ...sourceOverrideV7Commands,
  ...channelV8Commands,
  ...economyCareersV8Commands,
  ...versionV8Commands,
  ...adultMediaV8Commands,
  ...adultRoleplayV8Commands,
  ...reactionV8Commands,
  ...officialApkV9Commands,
  ...happyModCommands,
  ...developerV8Commands,
  ...groupControlsV9Commands,
  ...lempiApiCommands,
  ...mediaDownloadFixCommands,
  ...animeDownloadCommands,
  ...miniLlmCommands,
  ...autoChatCommands,
]

setMenuCommandProvider(() => commands)
