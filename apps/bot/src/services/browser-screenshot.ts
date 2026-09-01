/**
 * Captura de página en el servidor ("proyector").
 * Usa Playwright/Chromium si está instalado; si no, falla con mensaje claro.
 */
import { logger } from '../utils/logger.js'

export type ScreenshotResult = {
  jpeg: Buffer
  width: number
  height: number
  finalUrl: string
}

let chromiumPathHint = ''

export async function capturePageScreenshot(
  startUrl: string,
  opts?: { width?: number; height?: number; timeoutMs?: number },
): Promise<ScreenshotResult> {
  const width = opts?.width ?? 720
  const height = opts?.height ?? 1100
  const timeoutMs = opts?.timeoutMs ?? 25_000

  let playwright: typeof import('playwright')
  try {
    playwright = await import('playwright')
  } catch {
    throw new Error(
      'Playwright no está instalado. En la VPS: cd apps/bot && npm i playwright && npx playwright install chromium',
    )
  }

  const browser = await playwright.chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
    ],
  })

  try {
    const context = await browser.newContext({
      viewport: { width, height },
      userAgent:
        'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36',
      javaScriptEnabled: true,
      ignoreHTTPSErrors: true,
    })
    const page = await context.newPage()
    page.setDefaultTimeout(timeoutMs)

    const response = await page.goto(startUrl, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    })

    // Esperar un poco a imágenes/JS ligeros
    await page.waitForTimeout(1200)

    const jpeg = await page.screenshot({
      type: 'jpeg',
      quality: 72,
      fullPage: false,
    })

    const finalUrl = page.url()
    await context.close()

    logger.info(
      {
        startUrl,
        finalUrl,
        status: response?.status(),
        bytes: jpeg.length,
        chromium: chromiumPathHint || 'bundled',
      },
      'browser screenshot ok',
    )

    return { jpeg: Buffer.from(jpeg), width, height, finalUrl }
  } finally {
    await browser.close().catch(() => {})
  }
}
