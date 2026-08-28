import { existsSync } from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import { z } from 'zod'

const envCandidates = [
  process.env.ENV_FILE,
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../../.env'),
].filter(Boolean) as string[]

for (const candidate of envCandidates) {
  if (existsSync(candidate)) {
    dotenv.config({ path: candidate, override: false })
    break
  }
}

const schema = z.object({
  BOT_NAME: z.string().min(1).default('Ghost Nexora Bot'),
  PREFIX: z.string().min(1).max(4).default('.'),
  OWNER_NUMBERS: z.string().default(''),
  AUTO_REACT: z.string().default('true'),
  MAX_DOWNLOAD_MB: z.coerce.number().int().min(5).max(1950).default(1900),
  SESSION_DIR: z.string().default('./data/session'),
  DATA_DIR: z.string().default('./data'),
  BOT_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  LOG_LEVEL: z.string().default('info'),
  PUBLIC_WEB_URL: z.string().default('http://127.0.0.1:3000'),
  ADMIN_WEB_TOKEN: z.string().min(12).default('change-this-admin-token'),
  ADULT_PRIVATE_ENABLED: z.string().default('true'),
  EROME_COOKIE: z.string().default(''),
  WELCOME_IMAGE_URL: z.string().default(''),
  OFFICIAL_CHANNEL_URL: z.string().url().default('https://whatsapp.com/channel/0029VbCWbix9RZAfkkKOqP2i'),
  LEMPI_API_KEY: z.string().default(''),
  LEMPI_BASE_URL: z.string().url().default('https://api.lempi.lat'),
  LEMPI_YOUTUBE_AUDIO_ENDPOINT: z.string().default('/dl/yta'),
  LEMPI_YOUTUBE_VIDEO_ENDPOINT: z.string().default('/dl/ytv'),
  LEMPI_FACEBOOK_ENDPOINT: z.string().default('/dl/facebook'),
  TELEGRAM_BOT_TOKEN: z.string().default(''),
  TELEGRAM_CHANNEL_ID: z.string().default(''),
  TELEGRAM_CHANNEL_URL: z.string().default(''),
  YTDLP_COOKIES_FILE: z.string().default(''),
})

const raw = schema.parse(process.env)
const workspaceRoot = process.cwd().endsWith(`${path.sep}apps${path.sep}bot`)
  ? path.resolve(process.cwd(), '../..')
  : process.cwd()

const resolveFromRoot = (value: string) => (path.isAbsolute(value) ? value : path.resolve(workspaceRoot, value))
const truthy = (value: string) => ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())

export const config = {
  botName: raw.BOT_NAME,
  defaultPrefix: raw.PREFIX,
  owners: raw.OWNER_NUMBERS.split(',').map((value) => value.replace(/\D/g, '')).filter(Boolean),
  autoReact: truthy(raw.AUTO_REACT),
  maxDownloadBytes: raw.MAX_DOWNLOAD_MB * 1024 * 1024,
  maxDownloadMb: raw.MAX_DOWNLOAD_MB,
  sessionDir: resolveFromRoot(raw.SESSION_DIR),
  dataDir: resolveFromRoot(raw.DATA_DIR),
  healthPort: raw.BOT_HEALTH_PORT,
  logLevel: raw.LOG_LEVEL,
  publicWebUrl: raw.PUBLIC_WEB_URL,
  adminWebToken: raw.ADMIN_WEB_TOKEN,
  adultPrivateEnabled: truthy(raw.ADULT_PRIVATE_ENABLED),
  eromeCookie: raw.EROME_COOKIE,
  welcomeImageUrl: raw.WELCOME_IMAGE_URL,
  officialChannelUrl: raw.OFFICIAL_CHANNEL_URL,
  lempiApiKey: raw.LEMPI_API_KEY,
  lempiBaseUrl: raw.LEMPI_BASE_URL,
  lempiYoutubeAudioEndpoint: raw.LEMPI_YOUTUBE_AUDIO_ENDPOINT,
  lempiYoutubeVideoEndpoint: raw.LEMPI_YOUTUBE_VIDEO_ENDPOINT,
  lempiFacebookEndpoint: raw.LEMPI_FACEBOOK_ENDPOINT,
  telegramBotToken: raw.TELEGRAM_BOT_TOKEN,
  telegramChannelId: raw.TELEGRAM_CHANNEL_ID,
  telegramChannelUrl: raw.TELEGRAM_CHANNEL_URL,
  ytdlpCookiesFile: raw.YTDLP_COOKIES_FILE
    ? resolveFromRoot(raw.YTDLP_COOKIES_FILE)
    : '',
  workspaceRoot,
} as const
