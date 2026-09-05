import '../services/work-compat-v4.js'
import '../services/economy-wallet-reconcile.js'
import type { BotCommand } from '../types.js'
import { config } from '../config.js'
import { setMenuCommandProvider } from '../services/menu-registry.js'
import { generalCommands } from './general.js'
import { creditsCommands } from './credits.js'
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
import { navegadorCommands } from './navegador.js'
import { minecraftCommands } from './minecraft.js'
import { transcribeCommands } from './transcribe.js'
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
import { spaceDodgeCommands } from './spacedodge.js'
import { gatoCommands } from './gato.js'
import { damasCommands } from './damas.js'
import { bankingV10Commands } from './banking-v10.js'
import { minershopV10Commands } from './minershop-v10.js'
import { balanceV10Commands } from './balance-v10.js'
import { minershopV11Commands } from './minershop-v11.js'
import { adultMediaV11Commands } from './adult-media-v11.js'
import { minecraftV12Commands } from './minecraft-v12.js'
import { botStylesV13Commands } from './bot-styles-v13.js'
import { shopStyleV13Commands } from './shop-style-v13.js'
import { minershopStyleV13Commands } from './minershop-style-v13.js'
import { adultRoleplayMessagesV14Commands } from './adult-roleplay-messages-v14.js'

// El stack local LLM depende de Ollama. Si OLLAMA_ENABLED=false, el router y el
// menú no registran .llm/.minillm/.localai ni el control de conversación libre.
// La IA HTTP (.ai/.investiga) se mantiene independiente porque no usa Ollama.
const localLlmCommands: BotCommand[] = config.ollamaEnabled
  ? [...miniLlmCommands, ...autoChatCommands]
  : []

// subbots.ts es la implementación canónica. v2.ts conserva un handler heredado
// con el mismo nombre; se excluye para evitar que sobrescriba la política web actual.
const registeredV2Commands = v2Commands.filter((command) => command.name !== 'subbot')
const registeredSubbotCommands = config.webEnabled
  ? subbotCommands
  : subbotCommands.filter((command) => command.name !== 'adminpanel')

export const commands: BotCommand[] = [
  ...generalCommands,
  ...creditsCommands,
  ...aiCommands,
  ...profileCommands,
  ...reactionCommands,
  ...stickerCommands,
  ...downloadCommands,
  ...lyricsCommands,
  ...resourceCommands,
  ...mangaDownloadCommands,
  ...webSearchCommands,
  ...navegadorCommands,
  ...minecraftCommands,
  ...transcribeCommands,
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
  ...spaceDodgeCommands,
  ...gatoCommands,
  ...pvpGameCommands,
  ...damasCommands,
  ...rpgCommands,
  ...waifuCommands,
  ...waifuExtendedCommands,
  ...registeredSubbotCommands,
  ...adultCommands,
  ...eromeCommands,
  ...hentaiV9Commands,
  ...personalizationCommands,
  ...privateAccessCommands,
  ...systemCommands,
  ...ownerCommands,
  ...apkMultisourceCommands,
  ...groupAdultModeCommands,
  ...registeredV2Commands,
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
  ...localLlmCommands,
  ...bankingV10Commands,
  ...minershopV10Commands,
  ...balanceV10Commands,
  ...minershopV11Commands,
  ...adultMediaV11Commands,
  ...minecraftV12Commands,
  ...botStylesV13Commands,
  ...shopStyleV13Commands,
  ...minershopStyleV13Commands,
  ...adultRoleplayMessagesV14Commands,
]

setMenuCommandProvider(() => commands)
