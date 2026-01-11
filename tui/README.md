# Rekordbox TUI Library Manager

A production-focused terminal UI for browsing and managing a Rekordbox library using
`pyrekordbox` as the **only** database interface. Playback is handled in-process with
`python-vlc`.

> ⚠️ **Safety first:** always back up your Rekordbox database before performing mutations.
> This app will never silently mutate the database—mutations require explicit actions
> and are disabled while Rekordbox is running.

## Requirements

- Python 3.11+
- [uv](https://github.com/astral-sh/uv)
- Rekordbox database accessible to `pyrekordbox`
- VLC installed (for the `python-vlc` bindings)

## Setup

```bash
cd tui
uv sync
```

## Run

```bash
uv run rbtui
```

or

```bash
uv run python -m rbtui
```

## Read-only mode

If Rekordbox is running, the app detects it via `pyrekordbox.utils.get_rekordbox_pid()`
and enters **READ ONLY** mode. Browsing and playback are available, but all mutations
are disabled.

## Key bindings (core)

- Startup
  - `Enter`: select playlist
  - `n`: create playlist
  - `/`: search playlists
  - `Esc`: clear search
  - `q`: quit
- Split mode
  - `Tab`: switch focus
  - `\`: toggle fullscreen pane
  - `/`: search
  - `Space`: multi-select
  - `a`: add selected collection tracks to active playlist
  - `d`: remove selected playlist entries
  - `J/K`: reorder playlist entry down/up
  - `c`: color picker
  - `m`: metadata editor
  - `Enter`: play highlighted track
  - `p`: pause/resume
  - `n/b`: next/previous
  - `←/→`: seek ±5s
  - `Shift+←/→`: seek ±30s
  - `+/-`: volume

