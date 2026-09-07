import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const temp = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-i18n-'))
process.env.DATA_DIR = temp
process.env.SESSION_DIR = path.join(temp, 'session')
process.env.ADMIN_WEB_TOKEN = 'i18n-smoke-admin-token'

try {
  const { messages: esDefault } = await import('../apps/bot/dist/i18n/locales/es/default.js')
  const { messages: enDefault } = await import('../apps/bot/dist/i18n/locales/en/default.js')
  const { messages: esSystem } = await import('../apps/bot/dist/i18n/locales/es/system.js')
  const { messages: enSystem } = await import('../apps/bot/dist/i18n/locales/en/system.js')
  assert.deepEqual(Object.keys(esDefault).sort(), Object.keys(enDefault).sort(), 'default es/en catalogs must have identical keys')
  assert.deepEqual(Object.keys(esSystem).sort(), Object.keys(enSystem).sort(), 'system es/en catalogs must have identical keys')

  const { settings, SettingsStore } = await import('../apps/bot/dist/core/settings.js')
  const { community } = await import('../apps/bot/dist/services/community.js')
  const { resolveChatLocale, translate, localizeLegacyText } = await import('../apps/bot/dist/i18n/index.js')
  const { commands } = await import('../apps/bot/dist/commands/index.js')

  await settings.init()
  assert.equal(settings.language, 'es')
  assert.equal(resolveChatLocale('5210000000000@s.whatsapp.net'), 'es')
  assert.equal(translate('en', 'menu.button.shop'), 'Shop')
  assert.equal(translate('es', 'menu.button.shop'), 'Tienda')
  assert.equal(localizeLegacyText('Resultados para: Minecraft · Descargar', 'en'), 'Results for: Minecraft · Download')

  await settings.setLanguage('en')
  assert.equal(resolveChatLocale('5210000000000@s.whatsapp.net'), 'en')

  const groupEnglishByInheritance = '11111-22222@g.us'
  const groupSpanishOverride = '33333-44444@g.us'
  assert.equal(resolveChatLocale(groupEnglishByInheritance), 'en')
  community.setGroupLanguage(groupSpanishOverride, 'es')
  assert.equal(resolveChatLocale(groupSpanishOverride), 'es')

  await settings.setLanguage('es')
  community.setGroupLanguage(groupEnglishByInheritance, 'en')
  assert.equal(resolveChatLocale(groupEnglishByInheritance), 'en')
  assert.equal(resolveChatLocale(groupSpanishOverride), 'es')

  community.setGroupLanguage(groupEnglishByInheritance, null)
  assert.equal(resolveChatLocale(groupEnglishByInheritance), 'es')

  await settings.setLanguage('en')
  const reloaded = new SettingsStore()
  await reloaded.init()
  assert.equal(reloaded.language, 'en', 'global locale must persist in settings.json')
  const stored = JSON.parse(await readFile(path.join(temp, 'settings.json'), 'utf8'))
  assert.equal(stored.language, 'en')

  const language = commands.find((command) => command.name === 'language')
  assert.ok(language, 'language command must be registered')
  assert.ok(language.aliases?.includes('lang'))
  assert.ok(language.aliases?.includes('idioma'))

  console.log('[i18n-smoke] OK · es/en catalogs · global persistence · per-group override/inherit')
} finally {
  await rm(temp, { recursive: true, force: true })
}
