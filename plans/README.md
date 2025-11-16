# Roadmap Overview

This directory captures the multi-phase plan for transforming the playlist experience. Each phase builds on the previous ones, starting with core UI polish and culminating in collaborative playlist tooling.

| Phase | Theme | Outcome |
| --- | --- | --- |
| 1 | Full-page track management | Single screen for browsing, editing, and playing every track in the catalog using R2 audio + D2 metadata. |
| 2 | Filtering & search | Rich controls to slice the catalog by artist, label, color, BPM, genre, etc. |
| 3 | Metadata indexing | Cloudflare Worker processes that hydrate or refresh the catalog metadata automatically. |
| 4 | Playlist builder UX | Fast gesture-driven playlist creation and queue manipulation inspired by Spotify workflows. |

For the Phase 4 surface we now have a **[Playlist UI & shadcn implementation plan](./playlist-ui-spec.md)** that documents layout, component choices, and interaction details inspired by the Spotify references above.

Each phase is described in more detail in its dedicated markdown file.
