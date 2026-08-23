const ENDPOINT = 'https://graphql.anilist.co'

export type AniListSeries = { animeId: number; title: string; imageUrl?: string; sourceUrl: string; score?: number }
export type AniListSeriesCharacter = { characterId: number; aniListId: number; name: string; imageUrl?: string; role?: string }

async function request<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  let last: unknown
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': 'GhostNexoraBot/2.3' },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(20_000),
      })
      const payload = await response.json().catch(() => ({})) as { data?: T; errors?: Array<{ message?: string }> }
      if (response.ok && payload.data) return payload.data
      last = new Error(payload.errors?.[0]?.message || `HTTP ${response.status}`)
      if (response.status !== 429 && response.status < 500) break
    } catch (error) { last = error }
    await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)))
  }
  throw last instanceof Error ? last : new Error('AniList no respondió.')
}

function title(raw?: { userPreferred?: string | null; romaji?: string | null; english?: string | null }) {
  return raw?.userPreferred?.trim() || raw?.romaji?.trim() || raw?.english?.trim() || 'Sin título'
}

export async function searchAniListSeries(text: string, limit = 8) {
  const query = `query($search:String,$perPage:Int){Page(page:1,perPage:$perPage){media(search:$search,type:ANIME,sort:POPULARITY_DESC){id title{userPreferred romaji english} coverImage{large} siteUrl averageScore}}}`
  const data = await request<{ Page?: { media?: Array<{ id?: number; title?: { userPreferred?: string; romaji?: string; english?: string }; coverImage?: { large?: string }; siteUrl?: string; averageScore?: number }> } }>(query, { search: text.trim(), perPage: Math.max(1, Math.min(15, limit)) })
  return (data.Page?.media ?? []).flatMap((item) => item.id ? [{ animeId: item.id, title: title(item.title), imageUrl: item.coverImage?.large, sourceUrl: item.siteUrl || `https://anilist.co/anime/${item.id}`, score: item.averageScore ? item.averageScore / 10 : undefined } satisfies AniListSeries] : [])
}

export async function aniListSeriesCharacters(animeId: number, limit = 12) {
  const query = `query($id:Int,$perPage:Int){Media(id:$id,type:ANIME){characters(page:1,perPage:$perPage,sort:[ROLE,FAVOURITES_DESC]){edges{role node{id name{userPreferred full} image{large}}}}}}`
  const data = await request<{ Media?: { characters?: { edges?: Array<{ role?: string; node?: { id?: number; name?: { userPreferred?: string; full?: string }; image?: { large?: string } } }> } } }>(query, { id: animeId, perPage: Math.max(1, Math.min(25, limit)) })
  return (data.Media?.characters?.edges ?? []).flatMap((edge) => {
    const id = Number(edge.node?.id ?? 0)
    const name = edge.node?.name?.userPreferred?.trim() || edge.node?.name?.full?.trim()
    if (!id || !name) return []
    return [{ characterId: 1_000_000_000 + id, aniListId: id, name, imageUrl: edge.node?.image?.large, role: edge.role } satisfies AniListSeriesCharacter]
  })
}

export async function popularAniListSeries(page = 1, limit = 15) {
  const query = `query($page:Int,$perPage:Int){Page(page:$page,perPage:$perPage){media(type:ANIME,sort:POPULARITY_DESC){id title{userPreferred romaji english} coverImage{large} siteUrl averageScore}}}`
  const data = await request<{ Page?: { media?: Array<{ id?: number; title?: { userPreferred?: string; romaji?: string; english?: string }; coverImage?: { large?: string }; siteUrl?: string; averageScore?: number }> } }>(query, { page: Math.max(1, Math.floor(page)), perPage: Math.max(1, Math.min(25, limit)) })
  return (data.Page?.media ?? []).flatMap((item) => item.id ? [{ animeId: item.id, title: title(item.title), imageUrl: item.coverImage?.large, sourceUrl: item.siteUrl || `https://anilist.co/anime/${item.id}`, score: item.averageScore ? item.averageScore / 10 : undefined } satisfies AniListSeries] : [])
}
