import { load } from 'cheerio'

export type ExternalSocialPlatform = 'facebook' | 'instagram' | 'tiktok'

function validateInput(input: string, platform: ExternalSocialPlatform) {
  const url = new URL(input)
  const host = url.hostname.toLowerCase()
  const allowed: Record<ExternalSocialPlatform, string[]> = {
    facebook: ['facebook.com', 'fb.watch'],
    instagram: ['instagram.com'],
    tiktok: ['tiktok.com'],
  }
  if (!allowed[platform].some((domain) => host === domain || host.endsWith(`.${domain}`))) {
    throw new Error(`La URL no corresponde a ${platform}.`)
  }
  return url.toString()
}

export async function resolveExternalSocial(input: string, platform: ExternalSocialPlatform) {
  const url = validateInput(input, platform)
  const site = 'https://instatiktok.com/'
  const form = new URLSearchParams({ url, platform, siteurl: site })
  const response = await fetch(`${site}api`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      origin: site,
      referer: site,
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
      'x-requested-with': 'XMLHttpRequest',
    },
    body: form,
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`Proveedor externo respondió HTTP ${response.status}.`)
  const data = await response.json() as { status?: string; html?: string }
  if (data.status !== 'success' || !data.html) throw new Error('El proveedor externo no devolvió enlaces.')
  const $ = load(data.html)
  const links = new Set<string>()
  $('a[href^="http"]').each((_, element) => {
    const href = $(element).attr('href')
    if (href) links.add(href)
  })
  const list = [...links]
  if (!list.length) throw new Error('El proveedor externo no encontró una descarga pública.')

  if (platform === 'tiktok') {
    return list.find((link) => /hdplay|nowm|no.?watermark|download/i.test(link)) ?? list[0]!
  }
  if (platform === 'facebook') return list.at(-1)!
  return list[0]!
}
