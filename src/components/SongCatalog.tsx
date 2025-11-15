import { CSSProperties, FormEvent, useCallback, useMemo, useState } from 'react'

import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'
import { Label } from './ui/label'

type TrackRecord = {
  id: string
  name: string
  path: string
}

type CatalogResponse = {
  tracks: TrackRecord[]
}

type EnhancedTrack = TrackRecord & {
  bpm: number
  scale: string
  duration: string
  energy: number
  mixTag: string
  accent: string
  mood: string
}

type EditableTrackFields = Pick<EnhancedTrack, 'bpm' | 'scale' | 'duration' | 'mixTag'>

const DEMO_TRACKS: TrackRecord[] = [
  { id: '1', name: "Don't Cha (with BLOND:ISH, The Pussycat Dolls)", path: 'mix/club/dont-cha' },
  { id: '2', name: 'La Danza', path: 'mix/club/la-danza' },
  { id: '3', name: 'Appetite', path: 'mix/club/appetite' },
  { id: '4', name: 'Backtrack Blow Up - Max', path: 'mix/club/backtrack-blow-up' },
  { id: '5', name: 'Cash Out', path: 'mix/club/cash-out' },
]

const SCALES = ['8B', '7A', '9B', '12A', '11B', '6A', '10B']
const DURATIONS = ['2:54', '3:12', '4:03', '5:21', '3:48', '2:41']
const TAGS = ['Texture Blend', 'Vocal Layer', 'Percussive', 'Peak Energy', 'Leftfield']
const MOODS = ['Neon Pulse', 'Afterhours', 'Deep Haze', 'Heatwave', 'Low End', 'Skyline']
const ACCENTS = ['#f472b6', '#34d399', '#fbbf24', '#60a5fa', '#c084fc', '#f97316']

function decorateTracks(records: TrackRecord[]): EnhancedTrack[] {
  return records.map((track, index) => ({
    ...track,
    bpm: 118 + ((index * 7) % 16),
    scale: SCALES[index % SCALES.length],
    duration: DURATIONS[index % DURATIONS.length],
    energy: 60 + ((index * 9) % 35),
    mixTag: TAGS[index % TAGS.length],
    accent: ACCENTS[index % ACCENTS.length],
    mood: MOODS[index % MOODS.length],
  }))
}

function createLongPressHandlers(callback: () => void, delay = 550) {
  let timer: number | null = null

  const start = () => {
    if (typeof window === 'undefined') return
    timer = window.setTimeout(() => {
      callback()
      timer = null
    }, delay)
  }

  const clear = () => {
    if (typeof window === 'undefined') return
    if (timer) {
      window.clearTimeout(timer)
      timer = null
    }
  }

  return {
    onMouseDown: start,
    onMouseUp: clear,
    onMouseLeave: clear,
    onTouchStart: start,
    onTouchEnd: clear,
  }
}

export function SongCatalog() {
  const [inputPassword, setInputPassword] = useState('')
  const [activePassword, setActivePassword] = useState<string | null>('demo-session')
  const [tracks, setTracks] = useState<EnhancedTrack[]>(() => decorateTracks(DEMO_TRACKS))
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isCredentialDialogOpen, setIsCredentialDialogOpen] = useState(false)
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null)
  const [draft, setDraft] = useState<EditableTrackFields | null>(null)

  const editingTrack = useMemo(() => tracks.find((track) => track.id === editingTrackId) ?? null, [tracks, editingTrackId])

  const averageBpm = useMemo(() => {
    if (!tracks.length) return 0
    const sum = tracks.reduce((total, track) => total + track.bpm, 0)
    return Math.round(sum / tracks.length)
  }, [tracks])

  const peakEnergy = useMemo(() => {
    if (!tracks.length) return 0
    return Math.max(...tracks.map((track) => track.energy))
  }, [tracks])

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
        setTracks(decorateTracks(catalog.tracks))
        setActivePassword(secret)
        setError(null)
      } catch (catalogError) {
        const message =
          catalogError instanceof Error ? catalogError.message : 'Unable to load catalog. Please retry.'
        setError(message)
        setActivePassword(null)
      } finally {
        setIsLoading(false)
      }
    },
    [],
  )

  const handleCredentialSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!inputPassword.trim()) {
        setError('Enter the catalog password to continue.')
        return
      }

      await fetchCatalog(inputPassword.trim())
      setIsCredentialDialogOpen(false)
    },
    [fetchCatalog, inputPassword],
  )

  const handleRefresh = useCallback(async () => {
    if (!activePassword) {
      setIsCredentialDialogOpen(true)
      return
    }

    await fetchCatalog(activePassword)
  }, [activePassword, fetchCatalog])

  const handleTrackPress = useCallback((trackId: string) => {
    const nextTrack = tracks.find((track) => track.id === trackId)
    if (!nextTrack) return
    setEditingTrackId(trackId)
    setDraft({
      bpm: nextTrack.bpm,
      scale: nextTrack.scale,
      duration: nextTrack.duration,
      mixTag: nextTrack.mixTag,
    })
  }, [tracks])

  const handleEditSave = useCallback(() => {
    if (!editingTrackId || !draft) return

    setTracks((previous) =>
      previous.map((track) =>
        track.id === editingTrackId
          ? {
              ...track,
              bpm: Number(draft.bpm),
              scale: draft.scale,
              duration: draft.duration,
              mixTag: draft.mixTag,
            }
          : track,
      ),
    )

    setEditingTrackId(null)
    setDraft(null)
  }, [draft, editingTrackId])

  const handleEditCancel = useCallback(() => {
    setEditingTrackId(null)
    setDraft(null)
  }, [])

  return (
    <Card className="mix-card" variant="translucent">
      <CardContent>
        <div className="mix-card__top">
          <div>
            <p className="eyebrow">Mix mode</p>
            <h2 className="mix-card__title">Zero Control Sessions</h2>
            <p className="mix-card__subtitle">
              Real-time crates curated from your R2 catalog. Long-press a song tile to fine-tune BPM, key or tag.
            </p>
            <div className="mix-card__stats">
              <Badge variant="outline">{tracks.length} tracks</Badge>
              <Badge variant="outline">Avg {averageBpm} BPM</Badge>
              <Badge variant="outline">Peak energy {peakEnergy}%</Badge>
            </div>
          </div>
          <div className="mix-card__actions">
            <Button variant="secondary" onClick={handleRefresh} disabled={isLoading}>
              {isLoading ? 'Syncing…' : 'Sync catalog'}
            </Button>
            <Button variant="ghost" onClick={() => setIsCredentialDialogOpen(true)}>
              Update credential
            </Button>
          </div>
        </div>

        {error && <p className="mix-card__error">{error}</p>}

        <div className="mix-legend">
          <p>Hold to edit · Release to keep playing</p>
          <div className="mix-legend__chips">
            {ACCENTS.slice(0, 3).map((color) => (
              <span key={color} className="mix-legend__chip" style={{ backgroundColor: color }} />
            ))}
          </div>
        </div>

        <div className="mix-list">
          {tracks.map((track) => {
            const pressHandlers = createLongPressHandlers(() => handleTrackPress(track.id))
            return (
              <article
                key={track.id}
                className="mix-row"
                style={{ '--track-accent': track.accent } as CSSProperties}
                {...pressHandlers}
              >
                <div className="mix-row__primary">
                  <div className="mix-row__art" aria-hidden="true">
                    <span>{track.scale}</span>
                  </div>
                  <div>
                    <p className="mix-row__title">{track.name}</p>
                    <p className="mix-row__path">{track.path}</p>
                    <div className="mix-row__tags">
                      <Badge>{track.mixTag}</Badge>
                      <Badge variant="info">{track.mood}</Badge>
                    </div>
                  </div>
                </div>
                <div className="mix-row__metrics">
                  <div>
                    <span className="metric-label">BPM</span>
                    <span className="metric-value">{track.bpm}</span>
                  </div>
                  <div>
                    <span className="metric-label">Scale</span>
                    <span className="metric-value">{track.scale}</span>
                  </div>
                  <div>
                    <span className="metric-label">Length</span>
                    <span className="metric-value">{track.duration}</span>
                  </div>
                </div>
                <div className="mix-row__energy">
                  <div className="energy-chip">Energy {track.energy}%</div>
                </div>
              </article>
            )
          })}
        </div>

        {!tracks.length && (
          <div className="empty-state">
            <p>No tracks in the crate yet. Sync your catalog to populate the mix.</p>
            <Button variant="secondary" onClick={handleRefresh}>
              Pull tracks
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog open={isCredentialDialogOpen} onClose={() => setIsCredentialDialogOpen(false)}>
        <form className="dialog-form" onSubmit={handleCredentialSubmit}>
          <DialogHeader>
            <DialogTitle>Update catalog access</DialogTitle>
            <DialogDescription>Enter the password for the zero-control catalog.</DialogDescription>
          </DialogHeader>
          <Label htmlFor="catalog-password">Catalog password</Label>
          <Input
            id="catalog-password"
            type="password"
            value={inputPassword}
            onChange={(event) => setInputPassword(event.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setIsCredentialDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Authenticate</Button>
          </DialogFooter>
        </form>
      </Dialog>

      <Dialog open={Boolean(editingTrack)} onClose={handleEditCancel}>
        <div className="dialog-form">
          <DialogHeader>
            <DialogTitle>Edit track</DialogTitle>
            {editingTrack && <DialogDescription>{editingTrack.name}</DialogDescription>}
          </DialogHeader>
          <div className="dialog-grid">
            <div>
              <Label htmlFor="edit-bpm">BPM</Label>
              <Input
                id="edit-bpm"
                type="number"
                min={60}
                max={180}
                value={draft?.bpm ?? ''}
                onChange={(event) =>
                  setDraft((previous) =>
                    previous
                      ? {
                          ...previous,
                          bpm: Number(event.target.value),
                        }
                      : previous,
                  )
                }
              />
            </div>
            <div>
              <Label htmlFor="edit-scale">Scale</Label>
              <Input
                id="edit-scale"
                value={draft?.scale ?? ''}
                onChange={(event) =>
                  setDraft((previous) =>
                    previous
                      ? {
                          ...previous,
                          scale: event.target.value,
                        }
                      : previous,
                  )
                }
              />
            </div>
            <div>
              <Label htmlFor="edit-duration">Length</Label>
              <Input
                id="edit-duration"
                value={draft?.duration ?? ''}
                onChange={(event) =>
                  setDraft((previous) =>
                    previous
                      ? {
                          ...previous,
                          duration: event.target.value,
                        }
                      : previous,
                  )
                }
              />
            </div>
            <div>
              <Label htmlFor="edit-tag">Tag</Label>
              <Input
                id="edit-tag"
                value={draft?.mixTag ?? ''}
                onChange={(event) =>
                  setDraft((previous) =>
                    previous
                      ? {
                          ...previous,
                          mixTag: event.target.value,
                        }
                      : previous,
                  )
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={handleEditCancel}>
              Cancel
            </Button>
            <Button onClick={handleEditSave}>Save changes</Button>
          </DialogFooter>
        </div>
      </Dialog>
    </Card>
  )
}
