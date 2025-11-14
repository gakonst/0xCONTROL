/// <reference types="@cloudflare/workers-types" />

export interface Env {
  ASSETS: Fetcher
}

const INDEX_PATH = "index.html"

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url)

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

function shouldServeSPA(url: URL): boolean {
  return !url.pathname.split('/').at(-1)?.includes('.')
}
