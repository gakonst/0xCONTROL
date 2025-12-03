# Analyzer (Rust)

A Rust reimplementation of the waveform analysis container. It mirrors the `/health` and `/analyze` API exposed by the existing Bun-based analyzer but processes requests with axum and rustfft for better throughput.

## Running locally

```bash
cargo run --release --bin analyzer-rust
```

The service listens on `$PORT` (default `3000`) and depends on `ffmpeg` being available in `PATH`.

## API compatibility

- `GET /health` → `ok`
- `POST /analyze?resolution=<int>&preset=<preset-key>` with raw audio bytes in the body. Returns `{ waveform, preset, bpm, beatOffsetSeconds }` in the same shape as the JavaScript container.

## Switching implementations

Both the Bun and Rust analyzer containers are defined in `wrangler.toml`. Toggle `ANALYZER_IMPL` between `js` and `rust` (default `rust`) to choose which container binding the worker should start. If the preferred binding is missing, the worker will fall back to whichever analyzer container is available.
