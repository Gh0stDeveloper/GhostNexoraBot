import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(path, 'utf8')

const index = read('apps/bot/src/commands/index.ts')
const spotify = read('apps/bot/src/commands/spotify.ts')
const spotifyService = read('apps/bot/src/services/spotify.ts')
const anime = read('apps/bot/src/services/anime.ts')
const adultDownloads = read('apps/bot/src/commands/adult-download-v15.ts')
const adultMode = read('apps/bot/src/commands/group-adult-mode.ts')
const security = read('apps/bot/src/commands/security.ts')
const installer = read('scripts/install-windows.ps1')
const manager = read('scripts/windows/ghostnexora.ps1')
const cmdInstaller = read('scripts/install-windows.cmd')

assert.ok(index.includes("import { spotifyCommands } from './spotify.js'"), 'Spotify functional commands must be registered')
assert.ok(
  index.indexOf('...spotifyCommands') > index.indexOf('...sourceOverrideV7Commands'),
  'Functional Spotify commands must override the old link-only source command',
)
assert.match(spotify, /name: 'spotify'/, 'spotify command missing')
assert.match(spotify, /name: 'spotifydl'/, 'spotifydl command missing')
assert.match(spotifyService, /https:\/\/accounts\.spotify\.com\/api\/token/, 'Spotify Client Credentials token flow missing')
assert.match(spotifyService, /\/v1\/search\?type=track/, 'Spotify track search endpoint missing')

assert.match(anime, /https:\/\/api\.jikan\.moe\/v4\/anime/, 'Jikan metadata integration missing')
assert.match(anime, /api\/v1\/anime\/search/, 'Anime1v search integration missing')
assert.match(anime, /encodeRef\(/, 'Anime provider provenance encoding missing')
assert.doesNotMatch(anime, /command -v/, 'Anime downloader availability check must remain cross-platform')

assert.doesNotMatch(adultDownloads, /staffOnly\s*:\s*true/, 'Public adult download commands must not be staff-only')
assert.doesNotMatch(adultDownloads, /ownerOnly\s*:\s*true/, 'Public adult download commands must not be owner-only')
assert.match(adultMode, /setGroupCategoryOverride\(ctx\.chatId, 'adult', enabled \? 'allow' : 'deny'\)/, 'adultmode must synchronize router category policy')
assert.match(security, /setGroupCategoryOverride\(ctx\.chatId, 'adult', enabled \? 'allow' : 'deny'\)/, 'nsfw must synchronize router category policy')

assert.doesNotMatch(installer, /Cierra PowerShell/i, 'Windows installer must not require closing the terminal')
assert.match(installer, /Repair-CommandPath/, 'Windows installer must repair PATH in the same process')
assert.match(installer, /managerPath configure/, 'Windows installer must open the post-install configuration menu')
assert.doesNotMatch(installer, /managerPath start/, 'Windows installer must not auto-start MainBot')
assert.match(manager, /'configure' \{ Configure-Bot \}/, 'Windows manager configure action missing')
assert.match(manager, /developer\.spotify\.com\/dashboard/, 'Windows configuration menu must explain Spotify credentials')
assert.match(cmdInstaller, /pause/i, 'CMD wrapper must keep the terminal visible at completion')
assert.doesNotMatch(cmdInstaller, /^start\s/mi, 'CMD wrapper must not detach into a disposable window')

console.log('Spotify, anime, adult permissions and Windows installer smoke passed')
