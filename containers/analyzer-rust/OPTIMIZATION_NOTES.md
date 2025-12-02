# Analyzer Rust – performance to-dos

- **Avoid per-request ffmpeg spawn:** Replace the external process with an in-process decoder (e.g., `symphonia`) or a small worker pool of persistent ffmpeg processes to remove spawn + I/O overhead.
- **Cache FFT state:** Keep per-`fft_size` Hann windows, `FftPlanner` plans, and scratch buffers inside `AnalyzerService` to eliminate repeated allocations and planner setup.
- **Reduce copies:** Reuse buffers for mono conversion and spectrum accumulation; minimize `Vec` cloning in smoothing and preset application.
- **Downsample before analysis:** Optionally downsample long inputs to the minimum acceptable rate to shrink `resolution * fft_size` work.
- **Math micro-optimizations:** Replace repeated `powf` calls with faster approximations/precomputed tables where quality allows; clamp operations could be fused.
- **Config surface:** Expose tuning knobs (window size, smoothing, gamma) to allow lighter-weight presets for realtime scenarios.
