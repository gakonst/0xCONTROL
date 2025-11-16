# Phase 1 — Full-Page Track Management

## Goals
- Present the entire collection on a single responsive canvas that combines waveform preview, metadata, and status cues.
- Allow inline editing for essential metadata (title, artist, label, BPM, key, color) backed by D2 SQLite.
- Stream audio from R2 with a low-latency player that can jump between tracks instantly.

## Deliverables
1. **Data plumbing**
   - Track manifest loader that correlates R2 object keys with D2 rows.
   - Client-side caching layer to keep scroll performance high.
2. **Library surface**
   - Virtualized list/grid that adapts between desktop and tablet breakpoints.
   - Row actions for play/pause, edit, duplicate, and favorite.
3. **Inline editor**
   - Modal or in-row editor with optimistic updates to D2.
   - Validation states plus audit logging (who edited, when).
4. **Playback UX**
   - Mini transport controls pinned to the page.
   - Visual indicator on the currently playing track with seek progress.

## Milestones
- M1: Static mock populated with fixtures to prove layout.
- M2: Hooked up to real R2/D2 data sources with optimistic writes.
- M3: Usability pass (keyboard shortcuts, accessible focus states).
