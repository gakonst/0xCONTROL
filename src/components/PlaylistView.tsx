import { useMemo, useState } from 'react'

import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { cn } from '../lib/utils'

type LibraryTrack = {
  id: string
  title: string
  artist: string
  label: string
  bpm: number
  key: string
  duration: string
  energy: number
  genre: string
  mood: string
  color: string
}

type PlaylistEntry = LibraryTrack & { addedAt: string }

const TRACK_LIBRARY: LibraryTrack[] = [
  {
    id: 't1',
    title: "Don't Cha (BLOND:ISH Club Edit)",
    artist: 'The Pussycat Dolls',
    label: 'Alive Again Sessions',
    bpm: 124,
    key: '8B',
    duration: '5:12',
    energy: 82,
    genre: 'Club',
    mood: 'Neon Pulse',
    color: '#f472b6',
  },
  {
    id: 't2',
    title: 'La Danza',
    artist: 'John Summit',
    label: 'Off The Grid',
    bpm: 126,
    key: '7A',
    duration: '4:21',
    energy: 76,
    genre: 'Tech House',
    mood: 'Heatwave',
    color: '#f97316',
  },
  {
    id: 't3',
    title: 'Appetite',
    artist: 'Chloé Caillet',
    label: 'CircoLoco',
    bpm: 122,
    key: '9B',
    duration: '3:44',
    energy: 68,
    genre: 'Indie Dance',
    mood: 'Deep Haze',
    color: '#34d399',
  },
  {
    id: 't4',
    title: 'Backtrack Blow Up',
    artist: 'Max Styler',
    label: 'Realm Records',
    bpm: 128,
    key: '11B',
    duration: '3:58',
    energy: 88,
    genre: 'Techno',
    mood: 'Afterhours',
    color: '#60a5fa',
  },
  {
    id: 't5',
    title: 'Cash Out',
    artist: 'Flux Pavilion',
    label: 'Bassrush',
    bpm: 130,
    key: '6A',
    duration: '3:17',
    energy: 91,
    genre: 'Bass',
    mood: 'Low End',
    color: '#fbbf24',
  },
  {
    id: 't6',
    title: 'Clap With Me',
    artist: 'Eli Brown',
    label: 'Drumcode',
    bpm: 125,
    key: '10B',
    duration: '4:42',
    energy: 83,
    genre: 'Techno',
    mood: 'Afterhours',
    color: '#c084fc',
  },
  {
    id: 't7',
    title: 'Watercolor Dreams',
    artist: 'ODESZA',
    label: 'Foreign Family',
    bpm: 118,
    key: '12A',
    duration: '4:29',
    energy: 58,
    genre: 'Downtempo',
    mood: 'Skyline',
    color: '#93c5fd',
  },
  {
    id: 't8',
    title: 'Tape Deck Memories',
    artist: 'DJ Tennis',
    label: 'Life And Death',
    bpm: 119,
    key: '8A',
    duration: '6:03',
    energy: 64,
    genre: 'Leftfield',
    mood: 'Deep Haze',
    color: '#f9a8d4',
  },
]

const GENRE_FILTERS = ['All', 'Club', 'Tech House', 'Techno', 'Bass', 'Downtempo', 'Leftfield', 'Indie Dance']
const MOOD_FILTERS = ['Neon Pulse', 'Heatwave', 'Deep Haze', 'Afterhours', 'Low End', 'Skyline']

function parseDuration(duration: string) {
  const [minutes, seconds] = duration.split(':').map(Number)
  return minutes * 60 + seconds
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function PlaylistView() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedGenre, setSelectedGenre] = useState<string>('All')
  const [selectedMood, setSelectedMood] = useState<string | null>(null)
  const [playlistName, setPlaylistName] = useState('Zero Control · Reset 001')
  const [playlist, setPlaylist] = useState<PlaylistEntry[]>(() =>
    TRACK_LIBRARY.slice(0, 3).map((track) => ({ ...track, addedAt: new Date().toISOString() })),
  )
  const [focusedTrackId, setFocusedTrackId] = useState<string | null>(TRACK_LIBRARY[0]?.id ?? null)
  const [highlightedId, setHighlightedId] = useState<string | null>(null)

  const visibleTracks = useMemo(() => {
    return TRACK_LIBRARY.filter((track) => {
      const matchesSearch = `${track.title} ${track.artist} ${track.label}`
        .toLowerCase()
        .includes(searchQuery.toLowerCase())

      const matchesGenre = selectedGenre === 'All' || track.genre === selectedGenre
      const matchesMood = !selectedMood || track.mood === selectedMood

      return matchesSearch && matchesGenre && matchesMood
    })
  }, [searchQuery, selectedGenre, selectedMood])

  const focusedTrack = useMemo(() => {
    if (!focusedTrackId) return null
    return playlist.find((track) => track.id === focusedTrackId) ??
      TRACK_LIBRARY.find((track) => track.id === focusedTrackId) ??
      null
  }, [focusedTrackId, playlist])

  const playlistDuration = useMemo(() => {
    const totalSeconds = playlist.reduce((sum, track) => sum + parseDuration(track.duration), 0)
    return formatDuration(totalSeconds)
  }, [playlist])

  const handleAddTrack = (track: LibraryTrack) => {
    let inserted = false
    setPlaylist((previous) => {
      if (previous.some((entry) => entry.id === track.id)) {
        return previous
      }

      inserted = true
      return [...previous, { ...track, addedAt: new Date().toISOString() }]
    })

    setFocusedTrackId(track.id)

    if (inserted) {
      setHighlightedId(track.id)
      setTimeout(() => setHighlightedId(null), 800)
    }
  }

  const handleRemoveTrack = (trackId: string) => {
    setPlaylist((previous) => {
      const next = previous.filter((track) => track.id !== trackId)
      if (focusedTrackId === trackId) {
        setFocusedTrackId(next[0]?.id ?? null)
      }
      return next
    })
  }

  const handleMoveTrack = (trackId: string, direction: 'up' | 'down') => {
    setPlaylist((previous) => {
      const index = previous.findIndex((track) => track.id === trackId)
      if (index === -1) return previous

      const targetIndex = direction === 'up' ? index - 1 : index + 1
      if (targetIndex < 0 || targetIndex >= previous.length) return previous

      const copy = [...previous]
      const [removed] = copy.splice(index, 1)
      copy.splice(targetIndex, 0, removed)
      return copy
    })
  }

  const totalEnergy = useMemo(() => {
    if (!playlist.length) return 0
    const sum = playlist.reduce((acc, track) => acc + track.energy, 0)
    return Math.round(sum / playlist.length)
  }, [playlist])

  const emptyState = !visibleTracks.length

  return (
    <section className="playlist-view">
      <div className="playlist-view__intro">
        <div>
          <p className="eyebrow">Playlist lab</p>
          <h2>Design a set in one canvas</h2>
          <p className="hero__subtitle">
            Filter, audition and sequence every track in your crate. No network calls yet — this is a purely visual
            sandbox for the playlist UX.
          </p>
        </div>
        <div className="playlist-view__stats">
          <Badge variant="outline">{playlist.length} tracks queued</Badge>
          <Badge variant="outline">{playlistDuration} total</Badge>
          <Badge variant="outline">Avg energy {totalEnergy}%</Badge>
        </div>
      </div>

      <div className="playlist-grid">
        <Card className="library-card" variant="translucent">
          <CardHeader>
            <CardTitle>Library</CardTitle>
            <CardDescription>Tap to preview and swipe to add to your working list.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="library-controls">
              <div>
                <Label htmlFor="library-search">Search crate</Label>
                <Input
                  id="library-search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Track, artist, label"
                />
              </div>
              <div>
                <Label>Genre</Label>
                <div className="chip-row">
                  {GENRE_FILTERS.map((genre) => (
                    <button
                      key={genre}
                      type="button"
                      className={cn('chip', selectedGenre === genre && 'chip--active')}
                      onClick={() => setSelectedGenre(genre)}
                    >
                      {genre}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Mood focus</Label>
                <div className="chip-row">
                  {MOOD_FILTERS.map((mood) => (
                    <button
                      key={mood}
                      type="button"
                      className={cn('chip', selectedMood === mood && 'chip--active')}
                      onClick={() => setSelectedMood(selectedMood === mood ? null : mood)}
                    >
                      {mood}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="library-list">
              {emptyState && <p className="muted">No tracks match this filter combination.</p>}
              {!emptyState &&
                visibleTracks.map((track) => {
                  const isQueued = playlist.some((entry) => entry.id === track.id)
                  return (
                    <article
                      key={track.id}
                      className={cn(
                        'library-row',
                        highlightedId === track.id && 'library-row--highlight',
                        focusedTrackId === track.id && 'library-row--active',
                      )}
                      onClick={() => setFocusedTrackId(track.id)}
                    >
                      <div className="library-row__meta">
                        <div className="library-row__avatar" style={{ background: track.color }} />
                        <div>
                          <p className="library-row__title">{track.title}</p>
                          <p className="library-row__subtitle">{track.artist}</p>
                          <div className="library-row__tags">
                            <Badge>{track.genre}</Badge>
                            <Badge variant="info">{track.mood}</Badge>
                          </div>
                        </div>
                      </div>
                      <div className="library-row__metrics">
                        <span>{track.bpm} BPM</span>
                        <span>{track.key}</span>
                        <span>{track.duration}</span>
                      </div>
                      <div className="library-row__actions">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation()
                            setFocusedTrackId(track.id)
                          }}
                        >
                          Preview
                        </Button>
                        <Button
                          variant={isQueued ? 'outline' : 'secondary'}
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation()
                            handleAddTrack(track)
                          }}
                          disabled={isQueued}
                        >
                          {isQueued ? 'Queued' : 'Add to list'}
                        </Button>
                      </div>
                    </article>
                  )
                })}
            </div>
          </CardContent>
        </Card>

        <Card className="playlist-card" variant="translucent">
          <CardHeader>
            <CardTitle>Playlist queue</CardTitle>
            <CardDescription>Rename, resequence and annotate before saving to a crate.</CardDescription>
          </CardHeader>
          <CardContent className="playlist-card__content">
            <div className="playlist-name">
              <Label htmlFor="playlist-name">Playlist name</Label>
              <Input
                id="playlist-name"
                value={playlistName}
                onChange={(event) => setPlaylistName(event.target.value)}
              />
            </div>

            <div className="playlist-focus">
              {focusedTrack ? (
                <div className="playlist-focus__card" style={{ background: focusedTrack.color }}>
                  <div>
                    <p className="playlist-focus__label">Now highlighting</p>
                    <p className="playlist-focus__title">{focusedTrack.title}</p>
                    <p className="playlist-focus__subtitle">{focusedTrack.artist}</p>
                    <div className="playlist-focus__chips">
                      <Badge variant="outline">{focusedTrack.bpm} BPM</Badge>
                      <Badge variant="outline">Key {focusedTrack.key}</Badge>
                      <Badge variant="outline">{focusedTrack.duration}</Badge>
                    </div>
                  </div>
                  <div className="playlist-focus__actions">
                    <Button variant="ghost" size="sm" onClick={() => handleAddTrack(focusedTrack)}>
                      Pin to queue
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveTrack(focusedTrack.id)}
                      disabled={!playlist.some((track) => track.id === focusedTrack.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="playlist-focus__empty">
                  <p>Select a track to see rich context.</p>
                </div>
              )}
            </div>

            <div className="playlist-summary">
              <div>
                <p className="playlist-summary__label">Tracks</p>
                <p className="playlist-summary__value">{playlist.length}</p>
              </div>
              <div>
                <p className="playlist-summary__label">Total length</p>
                <p className="playlist-summary__value">{playlistDuration}</p>
              </div>
              <div>
                <p className="playlist-summary__label">Avg energy</p>
                <p className="playlist-summary__value">{totalEnergy}%</p>
              </div>
            </div>

            <div className="playlist-queue">
              {playlist.length === 0 && <p className="muted">Add tracks from the library to seed a playlist.</p>}
              {playlist.map((track, index) => (
                <div
                  key={track.id}
                  className={cn('playlist-queue__row', focusedTrackId === track.id && 'playlist-queue__row--active')}
                  onClick={() => setFocusedTrackId(track.id)}
                >
                  <div className="playlist-queue__index">{index + 1}</div>
                  <div>
                    <p className="playlist-queue__title">{track.title}</p>
                    <p className="playlist-queue__subtitle">
                      {track.artist} · {track.duration}
                    </p>
                  </div>
                  <div className="playlist-queue__badges">
                    <Badge variant="outline">{track.mood}</Badge>
                  </div>
                  <div className="playlist-queue__actions">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleMoveTrack(track.id, 'up')
                      }}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleMoveTrack(track.id, 'down')
                      }}
                    >
                      ↓
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleRemoveTrack(track.id)
                      }}
                    >
                      ✕
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
