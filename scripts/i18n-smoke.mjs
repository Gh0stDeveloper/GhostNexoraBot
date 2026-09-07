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
  assert.equal(
    localizeLegacyText('Descargar\n```js\nconst label = "Seleccionar"\n```\nSiguiente', 'en'),
    'Download\n```js\nconst label = "Seleccionar"\n```\nNext',
    'legacy translator must never mutate fenced code',
  )

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

  const routerSource = await readFile(new URL('../apps/bot/dist/core/router.js', import.meta.url), 'utf8')
  assert.equal(routerSource.includes('resolveChatLocale'), true, 'router must resolve effective chat locale')
  assert.equal(routerSource.includes('createLocalizedSocket'), true, 'router must localize legacy command output')
  assert.equal(routerSource.includes("'language'"), true, 'language must remain available as a bootstrap/private command')

  const menuSource = await readFile(new URL('../apps/bot/dist/commands/menu-v5.js', import.meta.url), 'utf8')
  assert.equal(menuSource.includes('menu.header.language'), true, 'menu must display effective locale')
  assert.equal(menuSource.includes('menu.section.'), true, 'menu section labels must come from catalogs')

  const browserSource = await readFile(new URL('../apps/bot/dist/commands/navegador.js', import.meta.url), 'utf8')
  assert.equal(browserSource.includes("ctx.t('browser.go')"), true, 'browser toolbar must use locale catalog')
  assert.equal(browserSource.includes('>Ir</button>'), false, 'browser toolbar must not hardcode the Spanish Go button')

  const autoChatSource = await readFile(new URL('../apps/bot/dist/services/auto-chat.js', import.meta.url), 'utf8')
  const contextualSource = await readFile(new URL('../apps/bot/dist/services/llm-contextual-answer.js', import.meta.url), 'utf8')
  assert.equal(autoChatSource.includes('assistant.languageInstruction'), true, 'auto-chat must follow configured locale')
  assert.equal(contextualSource.includes('assistant.languageInstruction'), true, 'Ollama contextual answers must follow configured locale')

  console.log('[i18n-smoke] OK · catalogs · persistence · group isolation · menu/router/browser/AI · fenced code protected')
} finally {
  await rm(temp, { recursive: true, force: true })
}
