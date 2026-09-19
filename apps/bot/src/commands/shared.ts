import type { NeutralBotCommand } from '../types.js'
import { generalCommands } from './general.js'
import { languageCommands } from './language.js'
import { creditsCommands } from './credits.js'
import { systemCommands } from './system.js'
import { versionV8Commands } from './version-v8.js'
import { downloadProvidersV3Commands } from './download-providers-v3.js'

/**
 * B2 catalog executed by every native platform through CommandEngine.
 *
 * Only transport-neutral command modules belong here. WhatsApp keeps the full
 * legacy catalog through its compatibility context while Discord/Telegram
 * consume this catalog for commands that have completed the neutral migration.
 */
export const sharedNeutralCommands: NeutralBotCommand[] = [
  ...generalCommands,
  ...languageCommands,
  ...creditsCommands,
  ...systemCommands,
  ...versionV8Commands,
  ...downloadProvidersV3Commands,
]
