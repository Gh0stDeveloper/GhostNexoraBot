export type BooruPost = {
  id: number
  imageUrl: string
  previewUrl?: string
  postUrl: string
  rating?: string
  score?: number
  tags?: string
}

const USER_AGENT = 'GhostNexoraBot/1.1 (https://github.com/Gh0stDeveloper/GhostNexoraBot)'

function absolute(url: unknown, base: string) {
  if (typeof url !== 'string' || !url) return undefined
  if (url.startsWith('//')) return `https:${url}`
  if (/^https?:\/\//i.test(url)) return url
  try { return new URL(url, base).toString() } catch { return undefined }
}

function blockedTags(tags: string) {
  return /(?:^|[\s_])(loli|lolicon|shota|shotacon|underage|minor|child|young)(?:$|[\s_])/i.test(tags)
}

export function assertSafeBooruTags(tags: string) {
  if (blockedTags(tags)) throw new Error('Esa búsqueda contiene términos no permitidos.')
}

export async function searchSafebooru(tags: string, limit = 8): Promise<BooruPost[]> {
  const query = tags.trim() || '1girl'
  assertSafeBooruTags(query)
  const params = new URLSearchParams({
    page: 'dapi', s: 'post', q: 'index', json: '1', limit: String(Math.max(1, Math.min(20, limit))),
    tags: `${query} rating:safe`,
  })
  const response = await fetch(`https://safebooru.org/index.php?${params}`, {
    headers: { accept: 'application/json', 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Safebooru respondió HTTP ${response.status}.`)
  const data = await response.json() as unknown
  const rows = Array.isArray(data) ? data : []
  return rows.flatMap((raw) => {
    const item = raw as Record<string, unknown>
    const id = Number(item.id ?? 0)
    const imageUrl = absolute(item.file_url ?? item.image, 'https://safebooru.org')
    if (!id || !imageUrl) return []
    return [{
      id,
      imageUrl,
      previewUrl: absolute(item.preview_url ?? item.sample_url, 'https://safebooru.org'),
      postUrl: `https://safebooru.org/index.php?page=post&s=view&id=${id}`,
      rating: String(item.rating ?? 'safe'),
      score: Number(item.score ?? 0),
      tags: typeof item.tags === 'string' ? item.tags : undefined,
    }]
  })
}

export async function searchGelbooru(tags: string, limit = 8): Promise<BooruPost[]> {
  const query = tags.trim() || '1girl'
  assertSafeBooruTags(query)
  const params = new URLSearchParams({
    page: 'dapi', s: 'post', q: 'index', json: '1', limit: String(Math.max(1, Math.min(20, limit))), tags: query,
  })
  const apiKey = process.env.GELBOORU_API_KEY?.trim()
  const userId = process.env.GELBOORU_USER_ID?.trim()
  if (apiKey && userId) { params.set('api_key', apiKey); params.set('user_id', userId) }
  const response = await fetch(`https://gelbooru.com/index.php?${params}`, {
    headers: { accept: 'application/json', 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Gelbooru respondió HTTP ${response.status}.${response.status === 401 || response.status === 403 ? ' Configura GELBOORU_API_KEY y GELBOORU_USER_ID si el proveedor exige autenticación.' : ''}`)
  const data = await response.json() as unknown
  const rows = Array.isArray(data)
    ? data
    : ((data as { post?: unknown[] } | null)?.post ?? [])
  return rows.flatMap((raw) => {
    const item = raw as Record<string, unknown>
    const id = Number(item.id ?? 0)
    const imageUrl = absolute(item.file_url, 'https://gelbooru.com')
    if (!id || !imageUrl) return []
    return [{
      id,
      imageUrl,
      previewUrl: absolute(item.preview_url ?? item.sample_url, 'https://gelbooru.com'),
      postUrl: `https://gelbooru.com/index.php?page=post&s=view&id=${id}`,
      rating: String(item.rating ?? ''),
      score: Number(item.score ?? 0),
      tags: typeof item.tags === 'string' ? item.tags : undefined,
    }]
  })
}

type E621Post = {
  id?: number
  rating?: string
  score?: { total?: number }
  file?: { url?: string | null }
  sample?: { url?: string | null }
  preview?: { url?: string | null }
  tags?: Record<string, string[]>
}

export async function searchE621(tags: string, limit = 8): Promise<BooruPost[]> {
  const query = tags.trim() || 'order:score'
  assertSafeBooruTags(query)
  const params = new URLSearchParams({ limit: String(Math.max(1, Math.min(20, limit))), tags: query })
  const response = await fetch(`https://e621.net/posts.json?${params}`, {
    headers: { accept: 'application/json', 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`e621 respondió HTTP ${response.status}.`)
  const data = await response.json() as { posts?: E621Post[] }
  return (data.posts ?? []).flatMap((item) => {
    const id = Number(item.id ?? 0)
    const imageUrl = item.file?.url ?? item.sample?.url ?? undefined
    if (!id || !imageUrl) return []
    const tagsText = item.tags ? Object.values(item.tags).flat().join(' ') : undefined
    return [{
      id,
      imageUrl,
      previewUrl: item.sample?.url ?? item.preview?.url ?? undefined,
      postUrl: `https://e621.net/posts/${id}`,
      rating: item.rating,
      score: Number(item.score?.total ?? 0),
      tags: tagsText,
    }]
  })
}
