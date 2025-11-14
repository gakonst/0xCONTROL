import { FormEvent, useCallback, useMemo, useState } from 'react'

type TrackRecord = {
  id: string
  name: string
  path: string
}

type CatalogResponse = {
  tracks: TrackRecord[]
}

export function SongCatalog() {
  const [inputPassword, setInputPassword] = useState('')
  const [activePassword, setActivePassword] = useState<string | null>(null)
  const [tracks, setTracks] = useState<TrackRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const isAuthenticated = useMemo(() => Boolean(activePassword), [activePassword])

  const fetchCatalog = useCallback(
    async (secret: string) => {
      setIsLoading(true)
      try {
        const response = await fetch('/api/catalog', {
          headers: {
            Authorization: `Bearer ${secret}`,
          },
        })

        if (response.status === 401) {
          throw new Error('Incorrect password. Please try again.')
        }

        if (!response.ok) {
          throw new Error('Failed to load catalog. Please try again later.')
        }

        const catalog = (await response.json()) as CatalogResponse
        setTracks(catalog.tracks)
        setActivePassword(secret)
        setError(null)
      } catch (catalogError) {
        const message =
          catalogError instanceof Error
            ? catalogError.message
            : 'Unable to load catalog. Please retry.'
        setError(message)
        setActivePassword(null)
        setTracks([])
      } finally {
        setIsLoading(false)
      }
    },
    [],
  )

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!inputPassword.trim()) {
        setError('Enter the catalog password to continue.')
        return
      }

      await fetchCatalog(inputPassword.trim())
    },
    [fetchCatalog, inputPassword],
  )

  const handleRefresh = useCallback(async () => {
    if (!activePassword) return
    await fetchCatalog(activePassword)
  }, [activePassword, fetchCatalog])

  return (
    <section className="card">
      <h2 className="card__title">Song Catalog</h2>
      <form className="catalog__form" onSubmit={handleSubmit}>
        <label className="catalog__label" htmlFor="catalog-password">
          Catalog password
        </label>
        <div className="catalog__controls">
          <input
            id="catalog-password"
            type="password"
            autoComplete="current-password"
            value={inputPassword}
            onChange={(event) => setInputPassword(event.target.value)}
            className="catalog__input"
            placeholder="Enter password"
          />
          <button className="button" type="submit" disabled={isLoading}>
            {isAuthenticated ? 'Re-authenticate' : 'View catalog'}
          </button>
          <button
            className="button button--ghost"
            type="button"
            onClick={handleRefresh}
            disabled={!isAuthenticated || isLoading}
          >
            Refresh
          </button>
        </div>
      </form>
      {error && <p className="error">{error}</p>}

      {isAuthenticated && tracks.length > 0 && (
        <div className="catalog__table-wrapper">
          <table className="catalog__table">
            <thead>
              <tr>
                <th scope="col">Track Name</th>
                <th scope="col">R2 Path</th>
              </tr>
            </thead>
            <tbody>
              {tracks.map((track) => (
                <tr key={track.id}>
                  <td>{track.name}</td>
                  <td>
                    <code>{track.path}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isAuthenticated && tracks.length === 0 && !isLoading && (
        <p>No tracks available in the catalog.</p>
      )}
    </section>
  )
}
