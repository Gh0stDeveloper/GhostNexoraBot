import fs from 'node:fs'

const metadata = fs.readFileSync('apps/bot/src/services/command-metadata.ts', 'utf8')
const router = fs.readFileSync('apps/bot/src/platform/discord/router.ts', 'utf8')
const types = fs.readFileSync('apps/bot/src/platform/discord/types.ts', 'utf8')

const fail = (message) => {
  console.error(`PHASE_C1_FAIL: ${message}`)
  process.exit(1)
}

if (/slashTokens/.test(metadata)) fail('manual slashTokens inventory still exists in central metadata')
if (!router.includes("platformCommandMetadata('discord')")) fail('Discord slash generation is not sourced from central platform metadata')
if (!router.includes('if (!metadata.discoverable) continue')) fail('non-discoverable commands are not excluded')
if (!router.includes('...metadata.aliases')) fail('central aliases are not preserved for slash compatibility')
if (!router.includes('Discord slash command collision')) fail('slash collision detection is missing')
if (!router.includes('argument.maxLength')) fail('max length is not projected from argument metadata')
if (!router.includes('argument.required === true')) fail('required arguments are not projected')
if (!router.includes('description_localizations')) fail('localized slash descriptions are missing')
if (!router.includes("'en-US'") || !router.includes("'es-419'")) fail('English/Spanish Discord locales are incomplete')
if (!types.includes('max_length?: number')) fail('Discord option type lost max_length support')
if (!router.includes('parseMessageCommand')) fail('Discord message-command compatibility was removed')
if (!router.includes('SharedCommandEngine')) fail('SharedCommandEngine integration was removed')
if (!router.includes('createRequestContext')) fail('B5 immutable RequestContext integration was removed')

console.log('Phase C1 Discord metadata-driven slash command smoke passed')
