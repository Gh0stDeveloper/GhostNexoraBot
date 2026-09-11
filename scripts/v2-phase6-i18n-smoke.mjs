import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const temp = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-v2-phase6-'))
process.env.DATA_DIR = temp
process.env.SESSION_DIR = path.join(temp, 'session')
process.env.ADMIN_WEB_TOKEN = 'phase6-i18n-smoke-token'
process.env.NEXORA_INSTANCE_ROLE = 'main'

try {
  const { settings } = await import('../apps/bot/dist/core/settings.js')
  const { community } = await import('../apps/bot/dist/services/community.js')
  const {
    assertCatalogParity,
    clearPlatformLocale,
    localeFromLanguageTag,
    platformLocalePreference,
    resolveChatLocale,
    resolvePlatformLocale,
    setPlatformLocale,
    translate,
  } = await import('../apps/bot/dist/i18n/index.js')
  const { commands } = await import('../apps/bot/dist/commands/index.js')

  await settings.init()
  await settings.setLanguage('es')

  const parity = assertCatalogParity()
  assert.equal(parity.missingInEs.length, 0)
  assert.equal(parity.missingInEn.length, 0)
  assert.equal(parity.esKeys, parity.enKeys)
  assert.ok(parity.esKeys >= 180, `expected a substantial ES/EN catalog, got ${parity.esKeys}`)

  assert.equal(localeFromLanguageTag('es-MX'), 'es')
  assert.equal(localeFromLanguageTag('es_419'), 'es')
  assert.equal(localeFromLanguageTag('en-US'), 'en')
  assert.equal(localeFromLanguageTag('en_GB'), 'en')
  assert.equal(localeFromLanguageTag('fr-FR'), null)

  const telegram = { platform: 'telegram', botInstanceId: 'main' }
  assert.equal(resolvePlatformLocale({ ...telegram, chatId: '-1001', userId: '10', clientLocale: 'en-US' }), 'en', 'client locale must be used when no explicit preference exists')

  setPlatformLocale(telegram, 'bot', 'self', 'en')
  assert.equal(resolvePlatformLocale({ ...telegram, chatId: '-1001', userId: '10', clientLocale: 'es-MX' }), 'en', 'bot preference must beat client hint')

  setPlatformLocale(telegram, 'chat', '-1001', 'es')
  assert.equal(resolvePlatformLocale({ ...telegram, chatId: '-1001', userId: '10', clientLocale: 'en-US' }), 'es', 'chat preference must beat bot preference')

  setPlatformLocale(telegram, 'user', '10', 'en')
  assert.equal(resolvePlatformLocale({ ...telegram, chatId: '-1001', userId: '10', clientLocale: 'es-MX' }), 'en', 'user preference must have highest priority')
  assert.equal(resolvePlatformLocale({ ...telegram, chatId: '-1001', userId: '11', clientLocale: 'en-US' }), 'es', 'chat preference must remain isolated from another user')
  assert.equal(platformLocalePreference(telegram, 'user', '10'), 'en')

  assert.equal(
    resolvePlatformLocale({ platform: 'discord', botInstanceId: 'main', chatId: '-1001', userId: '10', clientLocale: 'es-MX' }),
    'es',
    'Telegram preferences must not leak to Discord',
  )
  assert.equal(
    resolvePlatformLocale({ platform: 'telegram', botInstanceId: 'subbot-7', chatId: '-1001', userId: '10', clientLocale: 'es-MX' }),
    'es',
    'Main instance preferences must not leak to another bot instance',
  )

  clearPlatformLocale(telegram, 'user', '10')
  assert.equal(resolvePlatformLocale({ ...telegram, chatId: '-1001', userId: '10', clientLocale: 'en-US' }), 'es')
  clearPlatformLocale(telegram, 'chat', '-1001')
  assert.equal(resolvePlatformLocale({ ...telegram, chatId: '-1001', userId: '10', clientLocale: 'es-MX' }), 'en')
  clearPlatformLocale(telegram, 'bot', 'self')
  assert.equal(resolvePlatformLocale({ ...telegram, chatId: '-1001', userId: '10', clientLocale: 'es-MX' }), 'es')

  const group = '11111-22222@g.us'
  community.setGroupLanguage(group, 'es')
  setPlatformLocale({ platform: 'whatsapp', botInstanceId: 'main' }, 'chat', group, 'en')
  assert.equal(resolveChatLocale(group, '5210000000001@s.whatsapp.net', 'main'), 'en', 'namespaced WhatsApp chat preference must beat legacy group locale')
  assert.equal(resolveChatLocale(group, '5210000000001@s.whatsapp.net', 'subbot-7'), 'es', 'subbot must fall back independently to legacy group locale')

  const privateChat = '5210000000002@s.whatsapp.net'
  setPlatformLocale({ platform: 'whatsapp', botInstanceId: 'main' }, 'user', privateChat, 'en')
  assert.equal(resolveChatLocale(privateChat, privateChat, 'main'), 'en')
  assert.equal(resolveChatLocale(privateChat, privateChat, 'subbot-7'), 'es', 'personal WhatsApp preference must be isolated by instance')

  assert.equal(translate('es', 'common.download'), 'Descargar')
  assert.equal(translate('en', 'common.download'), 'Download')
  assert.equal(translate('en', 'telegram.info.runtime').includes('Phase 6'), true)
  assert.equal(translate('en', 'discord.info.runtime').includes('Phase 6'), true)

  const language = commands.find((command) => command.name === 'language')
  assert.ok(language, 'WhatsApp language command must remain registered')
  assert.ok(language.aliases?.includes('lang'))
  assert.ok(language.aliases?.includes('idioma'))

  const routerSource = await readFile(new URL('../apps/bot/dist/core/router.js', import.meta.url), 'utf8')
  assert.match(routerSource, /resolveChatLocale\(chatId, sender, botInstanceId\)/, 'WhatsApp router must resolve locale by sender and instance')
  assert.match(routerSource, /contextChatId:\s*chatId/, 'WhatsApp localized socket must receive the active chat context')

  const adapterSource = await readFile(new URL('../apps/bot/dist/platform/whatsapp/adapter.js', import.meta.url), 'utf8')
  assert.match(adapterSource, /activeUserId/, 'WhatsApp adapter must retain active sender locale context')
  assert.match(adapterSource, /resolveChatLocale\(chatId, this\.activeUserId, this\.botInstanceId\)/, 'WhatsApp adapter must resolve sender + instance locale')

  const interactiveSource = await readFile(new URL('../apps/bot/dist/platform/whatsapp/interactive.js', import.meta.url), 'utf8')
  assert.match(interactiveSource, /localizedSocketContext/, 'WhatsApp interactive renderer must inherit socket locale context')

  console.log(`[v2-phase6-i18n] OK · catalogs=${parity.esKeys} · precedence=user>chat>bot>client>global · platform/instance isolation · WhatsApp context`)
} finally {
  await rm(temp, { recursive: true, force: true })
}
