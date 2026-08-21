import pino from 'pino'
import { config } from '../config.js'

export const logger = pino({
  level: config.logLevel,
  base: { service: 'ghost-nexora-bot' },
})

export const silentWaLogger = pino({ level: process.env.WA_LOG_LEVEL ?? 'silent' })
