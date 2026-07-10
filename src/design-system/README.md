# 0xControl UI system

The original `HEAD` interface is the golden source of truth. This system is a
1:1 component port of that UI, not a reinterpretation of it.

Open `/ui` in the running app for the complete interactive reference: tokens,
type, controls, headers, rows, waveform canvases, annotation editing, playback
surfaces, tabs, empty states, and contextual action sheets.

## Golden primitives

- `AppShell`: full viewport, 16px content inset, fixed footer stack.
- `LibraryHeader`: compact uppercase title/stats, search, four-column sort strip.
- `ScreenHeader`: fullscreen title/action row.
- `PlaybackSurface`: waveform overlay, metadata row, and 3px progress line.
- `TrackEditor`: compact annotation color/note row.
- `LibraryTabs`: persistent Home / Playlists / Search controls; Search
  expands the active screen's input and sort strip directly above the menu.
- `FullPlayerBottom`: bar jumps, previous/play/next controls.

## Golden product recipes

- Track rows stay 56px minimum with a 96×36 RGB waveform on mobile, complete
  BPM/key/duration metadata, and swipe actions. No persistent overflow button.
- Playlist rows retain their original 56px recipe and pin/delete swipes.
- Fullscreen playback retains the original responsive waveform heights,
  centered metadata, fixed editor/control/tab stack, and blurred cover field.
- The New screen retains its original playlist-name-or-URL workflow.

New capabilities may add contextual actions, but must not replace or normalize
the golden markup, dimensions, spacing, type, or interaction patterns.

Search and sort controls belong in the persistent bottom tools area. Content
headers carry screen identity, context, and stats only.

## Tokens

The legacy variables in `src/index.css` are canonical. Semantic aliases exist
only so auth, download feedback, and future integration surfaces can reuse the
same exact palette without changing the original recipes.
