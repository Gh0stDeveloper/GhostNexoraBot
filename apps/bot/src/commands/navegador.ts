/**
 * .nav | .navegador | .view
 *
 * Navegador server-rendered para el HTML Primitive de WhatsApp.
 * La página inicial siempre queda renderizada en el DOM como fallback;
 * JavaScript solo mejora la navegación entre páginas ya precargadas.
 */
import { randomBytes } from 'node:crypto'
import { generateWAMessageFromContent } from 'baileys'
import type { BotCommand, CommandContext } from '../types.js'
import {
  buildOfflineBrowserBundle,
  humanBrowserBytes,
  offlineBrowserPayloadWithinHardLimit,
  prepareOfflineBrowserPayload,
  resolveBrowserStartUrl,
  type BrowserLabels,
  type PreparedOfflineBrowser,
} from '../services/offline-browser.js'
import { logger } from '../utils/logger.js'
import { withTimeout } from '../utils/timeout.js'

function browserLabels(ctx: CommandContext): BrowserLabels {
  return {
    go: ctx.t('browser.go'),
    preloaded: ctx.t('browser.preloaded'),
    pages: ctx.t('browser.pages'),
    image: ctx.t('browser.image'),
    noVisibleContent: ctx.t('browser.noVisibleContent'),
    links: ctx.t('browser.links'),
    unavailableTitle: ctx.t('browser.unavailableTitle'),
    networkBlocked: ctx.t('browser.networkBlocked'),
    unavailableBody: ctx.t('browser.unavailableBody'),
    networkExplanation: ctx.t('browser.networkExplanation'),
    copyCommand: ctx.t('browser.copyCommand'),
    commandCopied: ctx.t('browser.commandCopied'),
    initialPackFailed: ctx.t('browser.initialPackFailed'),
    runtimeWarning: ctx.t('browser.runtimeWarning'),
    runtimeError: ctx.t('browser.runtimeError'),
    postUnsupported: ctx.t('browser.postUnsupported'),
  }
}

async function relayBrowserPayload(ctx: CommandContext, responseId: string, payload: PreparedOfflineBrowser) {
  const userJid = ctx.socket.user?.id ?? ctx.sender
  if (!userJid) throw new Error(ctx.t('browser.botJidFailed'))

  const slots: Record<string, unknown> = {
    messageContextInfo: {
      deviceListMetadata: {},
      deviceListMetadataVersion: 2,
      messageSecret: randomBytes(32).toString('base64'),
      botMetadata: { messageDisclaimerText: '', botResponseId: responseId },
    },
    botForwardedMessage: {
      message: {
        richResponseMessage: {
          messageType: 1,
          submessages: [{ messageType: 2, messageText: ctx.t('browser.messageTitle') }],
          unifiedResponse: { data: payload.unifiedData },
          contextInfo: {
            mentionedJid: [],
            groupMentions: [],
            statusAttributions: [],
            forwardingScore: 1,
            isForwarded: true,
            forwardedAiBotMessageInfo: { botJid: '867051314767696@bot' },
            forwardOrigin: 4,
          },
        },
      },
    },
  }

  const message = generateWAMessageFromContent(ctx.chatId, slots as never, { userJid })
  await withTimeout(
    ctx.socket.relayMessage(ctx.chatId, message.message!, { messageId: message.key.id! }),
    25_000,
    'offline browser relay',
  )
  return message.key.id
}

function logPayload(startUrl: string, payload: PreparedOfflineBrowser, attempt: 'normal' | 'minimal') {
  logger.info({
    attempt,
    startUrl,
    pages: payload.pages.length,
    compacted: payload.compacted,
    htmlBytes: payload.htmlBytes,
    html: humanBrowserBytes(payload.htmlBytes),
    unifiedBytes: payload.unifiedBytes,
    unified: humanBrowserBytes(payload.unifiedBytes),
  }, 'offline browser payload prepared')
}

async function sendBrowserMessage(ctx: CommandContext, startUrl: string) {
  const sid = randomBytes(16).toString('hex')
  const labels = browserLabels(ctx)

  let bundle: Awaited<ReturnType<typeof buildOfflineBrowserBundle>>
  try {
    bundle = await buildOfflineBrowserBundle({ startUrl, sid, locale: ctx.locale, labels })
  } catch (error) {
    logger.warn({ error, startUrl }, 'offline browser bundle fetch failed')
    await ctx.reply(ctx.t('browser.loadFailed'))
    return
  }

  const responseId = `message-${Date.now()}-${randomBytes(4).toString('hex')}`
  const payload = prepareOfflineBrowserPayload({
    startUrl,
    bundle,
    locale: ctx.locale,
    labels,
    responseId,
  })
  logPayload(startUrl, payload, 'normal')

  if (!offlineBrowserPayloadWithinHardLimit(payload)) {
    logger.warn({
      startUrl,
      htmlBytes: payload.htmlBytes,
      unifiedBytes: payload.unifiedBytes,
    }, 'offline browser payload exceeded hard limits before relay')
    await ctx.reply(ctx.t('browser.tooHeavy', { size: humanBrowserBytes(payload.unifiedBytes) }))
    return
  }

  try {
    await relayBrowserPayload(ctx, responseId, payload)
    return
  } catch (error) {
    logger.warn({ error, startUrl, pages: payload.pages.length }, 'offline browser relay failed; retrying minimal payload')
  }

  const retryId = `message-${Date.now()}-${randomBytes(4).toString('hex')}`
  const minimal = prepareOfflineBrowserPayload({
    startUrl,
    bundle,
    locale: ctx.locale,
    labels,
    responseId: retryId,
    minimal: true,
  })
  logPayload(startUrl, minimal, 'minimal')

  if (!offlineBrowserPayloadWithinHardLimit(minimal)) {
    logger.warn({ startUrl, htmlBytes: minimal.htmlBytes, unifiedBytes: minimal.unifiedBytes }, 'minimal browser payload still too large')
    await ctx.reply(ctx.t('browser.tooHeavy', { size: humanBrowserBytes(minimal.unifiedBytes) }))
    return
  }

  try {
    await relayBrowserPayload(ctx, retryId, minimal)
  } catch (error) {
    logger.warn({ error, startUrl }, 'minimal offline browser relay failed')
    await ctx.reply(ctx.t('browser.sendFailed'))
  }
}

export const navegadorCommands: BotCommand[] = [
  {
    name: 'nav',
    aliases: ['navegador', 'view', 'browser', 'browse'],
    category: 'tools',
    description: 'Navegador server-rendered para WhatsApp con páginas precargadas.',
    usage: 'nav [url|búsqueda]',
    async handler(ctx) {
      const startUrl = resolveBrowserStartUrl(ctx.args, ctx.argText, ctx.locale)
      try {
        await sendBrowserMessage(ctx, startUrl)
      } catch (error) {
        logger.warn({ error, startUrl }, 'offline browser command failed')
        await ctx.reply(ctx.t('browser.startFailed'))
      }
    },
  },
]
