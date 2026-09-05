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
  BOT_MESSAGE_TIMEOUT_MS: z.coerce.number().int().min(120_000).max(3_600_000).default(900_000),
  LOG_LEVEL: z.string().default('info'),
  PUBLIC_WEB_URL: z.string().default('http://127.0.0.1:3000'),
  ADMIN_WEB_TOKEN: z.string().min(12).default('change-this-admin-token'),
  ADULT_PRIVATE_ENABLED: z.string().default('true'),
  EROME_COOKIE: z.string().default(''),
  WELCOME_IMAGE_URL: z.string().default(''),
  OFFICIAL_CHANNEL_URL: z.string().url().default('https://whatsapp.com/channel/0029VbCWbix9RZAfkkKOqP2i'),

  // Lempi: LEMPI_API_KEY remains supported for backwards compatibility.
  // Prefer LEMPI_API_KEYS with comma- or newline-separated keys.
  LEMPI_API_KEY: z.string().default(''),
  LEMPI_API_KEYS: z.string().default(''),
  LEMPI_BASE_URL: z.string().url().default('https://api.lempi.lat'),
  LEMPI_YOUTUBE_AUDIO_ENDPOINT: z.string().default('/dl/yta'),
  LEMPI_YOUTUBE_VIDEO_ENDPOINT: z.string().default('/dl/ytv'),
  LEMPI_FACEBOOK_ENDPOINT: z.string().default('/dl/facebook'),
  LEMPI_INSTAGRAM_ENDPOINTS: z.string().default('/d/instagram,/d/ig,/d/igdl,/d/igimg,/download/instagram,/download/ig'),
  LEMPI_PINTEREST_SEARCH_ENDPOINTS: z.string().default('/s/pin,/s/pinterest,/search/pinterest'),
  LEMPI_HAPPYMOD_SEARCH_ENDPOINTS: z.string().default('/s/happymod,/s/hm,/search/happymod,/search/hm'),
  LEMPI_HAPPYMOD_DOWNLOAD_ENDPOINTS: z.string().default('/d/happymod,/d/hm,/d/happymoddl,/download/happymod,/download/hm'),

  // Local LLM (Ollama). Disabled by default so existing installations keep the
  // deterministic Mini-LLM path until explicitly enabled in .env.
  OLLAMA_ENABLED: z.string().default('false'),
  OLLAMA_MODEL: z.string().min(1).default('qwen2.5:1.5b'),
  OLLAMA_BASE_URL: z.string().url().default('http://127.0.0.1:11434'),
  OLLAMA_TIMEOUT_MS: z.coerce.number().int().min(2_000).max(900_000).default(360_000),
  OLLAMA_QUEUE_WAIT_MS: z.coerce.number().int().min(30_000).max(1_800_000).default(360_000),
  OLLAMA_MAX_QUEUE: z.coerce.number().int().min(1).max(32).default(8),
  OLLAMA_KEEP_ALIVE: z.string().min(1).max(32).default('30m'),
  OLLAMA_NUM_PREDICT: z.coerce.number().int().min(128).max(2048).default(768),
  OLLAMA_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.65),
  OLLAMA_TOP_P: z.coerce.number().min(0).max(1).default(0.9),
  OLLAMA_MAX_HISTORY: z.coerce.number().int().min(2).max(20).default(10),
  OLLAMA_SYSTEM_PROMPT: z.string().default('Eres Ghost Nexora Bot, un asistente de WhatsApp rápido, natural y útil. Responde en el idioma del usuario. Sé directo, evita inventar datos y no repitas la pregunta.'),

  // Navegador embebido (.nav) — proxy en 3847 (3000 suele estar ocupado)
  BROWSER_PROXY_PUBLIC_URL: z.string().default('https://ghostnexorabot.duckdns.org/proxy'),
  BROWSER_PROXY_PORT: z.coerce.number().int().min(1).max(65535).default(3847),

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
const splitList = (value: string) => value
  .split(/[\n,]+/)
  .map((item) => item.trim())
  .filter(Boolean)

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
  botMessageTimeoutMs: raw.BOT_MESSAGE_TIMEOUT_MS,
  logLevel: raw.LOG_LEVEL,
  publicWebUrl: raw.PUBLIC_WEB_URL,
  adminWebToken: raw.ADMIN_WEB_TOKEN,
  adultPrivateEnabled: truthy(raw.ADULT_PRIVATE_ENABLED),
  eromeCookie: raw.EROME_COOKIE,
  welcomeImageUrl: raw.WELCOME_IMAGE_URL,
  officialChannelUrl: raw.OFFICIAL_CHANNEL_URL,
  lempiApiKey: raw.LEMPI_API_KEY,
  lempiApiKeys: splitList(raw.LEMPI_API_KEYS),
  lempiBaseUrl: raw.LEMPI_BASE_URL,
  lempiYoutubeAudioEndpoint: raw.LEMPI_YOUTUBE_AUDIO_ENDPOINT,
  lempiYoutubeVideoEndpoint: raw.LEMPI_YOUTUBE_VIDEO_ENDPOINT,
  lempiFacebookEndpoint: raw.LEMPI_FACEBOOK_ENDPOINT,
  lempiInstagramEndpoints: splitList(raw.LEMPI_INSTAGRAM_ENDPOINTS),
  lempiPinterestSearchEndpoints: splitList(raw.LEMPI_PINTEREST_SEARCH_ENDPOINTS),
  lempiHappyModSearchEndpoints: splitList(raw.LEMPI_HAPPYMOD_SEARCH_ENDPOINTS),
  lempiHappyModDownloadEndpoints: splitList(raw.LEMPI_HAPPYMOD_DOWNLOAD_ENDPOINTS),
  ollamaEnabled: truthy(raw.OLLAMA_ENABLED),
  ollamaModel: raw.OLLAMA_MODEL,
  ollamaBaseUrl: raw.OLLAMA_BASE_URL.replace(/\/+$/, ''),
  ollamaTimeoutMs: raw.OLLAMA_TIMEOUT_MS,
  ollamaQueueWaitMs: raw.OLLAMA_QUEUE_WAIT_MS,
  ollamaMaxQueue: raw.OLLAMA_MAX_QUEUE,
  ollamaKeepAlive: raw.OLLAMA_KEEP_ALIVE,
  ollamaNumPredict: raw.OLLAMA_NUM_PREDICT,
  ollamaTemperature: raw.OLLAMA_TEMPERATURE,
  ollamaTopP: raw.OLLAMA_TOP_P,
  ollamaMaxHistory: raw.OLLAMA_MAX_HISTORY,
  ollamaSystemPrompt: raw.OLLAMA_SYSTEM_PROMPT,
  browserProxyPublicUrl: raw.BROWSER_PROXY_PUBLIC_URL.replace(/\/+$/, ''),
  browserProxyPort: raw.BROWSER_PROXY_PORT,
  telegramBotToken: raw.TELEGRAM_BOT_TOKEN,
  telegramChannelId: raw.TELEGRAM_CHANNEL_ID,
  telegramChannelUrl: raw.TELEGRAM_CHANNEL_URL,
  ytdlpCookiesFile: raw.YTDLP_COOKIES_FILE
    ? resolveFromRoot(raw.YTDLP_COOKIES_FILE)
    : '',
  workspaceRoot,
} as const
