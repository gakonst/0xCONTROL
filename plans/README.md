# Roadmap Overview

This directory captures the multi-phase plan for transforming the playlist experience. Each phase builds on the previous ones, starting with core UI polish and culminating in collaborative playlist tooling.

| Phase | Theme | Outcome |
| --- | --- | --- |
| 1 | Full-page track management | Single screen for browsing, editing, and playing every track in the catalog using R2 audio + D2 metadata. |
| 2 | Filtering & search | Rich controls to slice the catalog by artist, label, color, BPM, genre, etc. |
| 3 | Metadata indexing | Cloudflare Worker processes that hydrate or refresh the catalog metadata automatically. |
| 4 | Playlist builder UX | Fast gesture-driven playlist creation and queue manipulation inspired by Spotify workflows. |

## Reference inspiration

- We are borrowing UX pacing cues from the [Zero sample apps](https://zero.rocicorp.dev/docs/samples), particularly the "Playlist" and "Todo" demos that illustrate instant client updates paired with background sync.
- Those samples also highlight how optimistic updates plus conflict-free data structures can make cross-device playlist editing feel responsive—an experience we want to emulate across every phase below.
- As the plans evolve we will keep a running log of which Zero primitives (mutators, sync workers, snapshotting) we expect to lean on so the implementation handoff is straightforward.

Each phase is described in more detail in its dedicated markdown file.
