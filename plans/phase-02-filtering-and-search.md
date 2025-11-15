# Phase 2 — Filtering & Search

## Goals
- Give curators instant control over the visible slice of the catalog.
- Support multi-filter combinations without reloading the page.
- Offer saved views for common workflows (e.g., "House 120-125 BPM").

## Deliverables
1. **Filter model**
   - Shared TypeScript schema for every filterable field.
   - Serialization format to share filter URLs/state.
2. **UI controls**
   - Text, dropdown, slider, and color swatch inputs with debounced updates.
   - Pills/chips that summarize active filters and allow single-click removal.
3. **Search infrastructure**
   - Client-side index (Lunr/Fuse) for fuzzy title/artist search.
   - Optional worker endpoint for server-assisted filtering when the dataset grows.
4. **Saved views**
   - Persisted presets stored per user.
   - Quick switcher (Cmd+K) to jump between presets.

## Milestones
- M1: Filters wired to fixture data with optimistic UI states.
- M2: URL serialization and shareable deep links.
- M3: Saved view CRUD plus analytics on filter usage.

## Zero inspiration
- Use the Zero “Todo” sample’s filter pills as a reference for how to keep state in sync across tabs/devices.
- Follow their pattern of speculative local filtering backed by background sync so results appear instantly even while queries propagate.
- Reuse the sample’s command palette UX concepts for our Cmd+K preset switcher to stay consistent with established patterns.
