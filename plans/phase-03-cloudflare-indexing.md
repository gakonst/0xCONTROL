# Phase 3 — Cloudflare Worker Metadata Indexing

## Goals
- Automatically ingest metadata for every track stored in R2.
- Keep the D2 catalog synchronized with audio uploads without manual intervention.
- Provide observability over background jobs.

## Deliverables
1. **Worker orchestrator**
   - Scheduled cron trigger plus manual HTTP endpoint for re-index requests.
   - Pagination over R2 objects with delta detection (new/updated/deleted files).
2. **Metadata extractors**
   - ID3/RIFF parsing for embedded fields.
   - Hook for external enrichment (Discogs, Spotify, custom ML models).
   - Waveform + BPM analysis with pluggable workers.
3. **Catalog writer**
   - Upsert logic for D2 with conflict resolution.
   - Audit table recording the source of each metadata value.
4. **Monitoring**
   - Durable Object or KV log of job runs, counts, durations, and errors.
   - Dashboard page that surfaces job history + retry controls.

## Milestones
- M1: Worker lists R2 files and writes placeholders to D2.
- M2: Metadata extraction + enrichment with retries.
- M3: Monitoring dashboard linked from the admin UI.

## Zero inspiration
- Bring over the Zero “Background sync” sample’s approach for reconciling worker-side mutations with client caches.
- Use their Durable Object logging tricks to keep lightweight observability without standing up a separate service.
- Borrow the sample cron + manual trigger duality so ops can force a re-index on demand during launches.
