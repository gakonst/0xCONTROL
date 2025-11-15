# Phase 4 — Playlist Builder & Quick-Add UX

## Goals
- Deliver a lightning-fast way to assemble and reorder playlists without modal fatigue.
- Mimic the best parts of Spotify/Apple Music gestures while tailoring them to our DJ workflow (swipe-to-queue, stack-based last playlist, etc.).
- Provide enough instrumentation so we can measure playlist velocity and feature adoption.

## Deliverables
1. **Playlist data model**
   - Tables for playlists, playlist_tracks (with ordering, added_by, timestamps), and activity logs.
   - Support for collaborative playlists (multi-owner) from day one.
2. **Builder workspace**
   - Split-pane layout: catalog on the left, active playlist(s) on the right.
   - Drag-and-drop + swipe gestures for adding tracks.
   - Undo/redo stack for rapid experimentation.
3. **Quick-add interactions**
   - Swipe or keyboard shortcut to add to the "last touched" playlist.
   - Prompt to create/select a playlist if no history exists.
   - Toast/snackbar feedback with deep links to open the playlist.
4. **Queue and playback integration**
   - Keep the global player in sync with playlist edits.
   - Allow pre-hear vs. live-queue toggles for DJs.
5. **Analytics + quality**
   - Instrument events (track added, removed, reordered, playlist created).
   - NPS-style micro-surveys inside the builder for qualitative feedback.

## Milestones
- M1: Static interactions with mock data proving gestures and layout.
- M2: Persisted playlists with optimistic updates + conflict resolution.
- M3: Collaboration features (shared editing, activity feed, notifications).

## Zero inspiration
- Replicate the Zero playlist sample’s swipe-to-act gestures as the baseline interaction language.
- Leverage the sample’s conflict-free replicated data types to let multiple DJs edit the same playlist without clobbering order.
- Study their inline activity feed pattern so collaborators can see who added which track in real time.
