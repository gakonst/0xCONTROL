/// <reference types="@cloudflare/workers-types" />

interface TrackRecord {
  id: string
  name: string
  path: string
}

interface CatalogResponse {
  tracks: TrackRecord[]
}

const DEFAULT_TRACKS: TrackRecord[] = [
  {
    id: 'intro-beat',
    name: 'Intro Beat',
    path: 'r2://zero-control-tracks/intro-beat.mp3',
  },
  {
    id: 'ambient-flow',
    name: 'Ambient Flow',
    path: 'r2://zero-control-tracks/ambient-flow.mp3',
  },
  {
    id: 'closing-moment',
    name: 'Closing Moment',
    path: 'r2://zero-control-tracks/closing-moment.mp3',
  },
]

export interface Env {
  ASSETS: Fetcher
  SONG_PASSWORD: string
  SONG_CATALOG: DurableObjectNamespace<SongCatalogDO>
}

const INDEX_PATH = 'index.html'
const CATALOG_OBJECT_NAME = 'primary-catalog'
const CATALOG_DO_PATH = 'https://song-catalog.internal/tracks'

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/api/catalog') {
      return handleCatalogRequest(request, env)
    }

    const assetResponse = await env.ASSETS.fetch(request)

    if (assetResponse.status !== 404) {
      return assetResponse
    }

    if (request.method === 'GET' && shouldServeSPA(url)) {
      const indexUrl = new URL(`/${INDEX_PATH}`, url.origin)
      const indexRequest = new Request(indexUrl.toString(), request)
      const indexResponse = await env.ASSETS.fetch(indexRequest)
      if (indexResponse.status < 400) {
        return indexResponse
      }
    }

    return assetResponse
  },
} satisfies ExportedHandler<Env>

async function handleCatalogRequest(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: 'GET' },
    })
  }

  const authHeader = request.headers.get('Authorization') ?? ''
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : null

  if (!token || token.length === 0 || token !== env.SONG_PASSWORD) {
    return new Response('Unauthorized', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Bearer' },
    })
  }

  const id = env.SONG_CATALOG.idFromName(CATALOG_OBJECT_NAME)
  const stub = env.SONG_CATALOG.get(id)
  const response = await stub.fetch(CATALOG_DO_PATH)

  if (!response.ok) {
    return new Response('Failed to load catalog', { status: 502 })
  }

  const catalog = (await response.json()) as CatalogResponse
  return new Response(JSON.stringify(catalog), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

function shouldServeSPA(url: URL): boolean {
  return !url.pathname.split('/').at(-1)?.includes('.')
}

export class SongCatalogDO implements DurableObject {
  #state: DurableObjectState

  constructor(state: DurableObjectState) {
    this.#state = state
    this.#state.blockConcurrencyWhile(async () => {
      const existing = await this.#state.storage.get<TrackRecord[]>('tracks')
      if (!existing) {
        await this.#state.storage.put('tracks', DEFAULT_TRACKS)
      }
    })
  }

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url)

    if (request.method === 'GET' && pathname === '/tracks') {
      const tracks =
        (await this.#state.storage.get<TrackRecord[]>('tracks')) ?? DEFAULT_TRACKS
      return Response.json({ tracks })
    }

    return new Response('Not Found', { status: 404 })
  }
}
