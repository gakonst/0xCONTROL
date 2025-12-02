use std::collections::HashMap;
use std::f32::consts::PI;
use std::net::SocketAddr;

use axum::{
    body::Bytes,
    extract::{ContentLengthLimit, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use once_cell::sync::Lazy;
use rustfft::{num_complex::Complex, FftPlanner};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::{io::AsyncWriteExt, process::Command, signal};
use tracing::{error, info};
use tracing_subscriber::{fmt, EnvFilter};

const MAX_INPUT_BYTES: usize = 120 * 1024 * 1024; // ~120MB safety guard
const BANDS: &[(&str, f32, f32)] = &[
    ("bass", 20.0, 220.0),
    ("voice", 250.0, 2200.0),
    ("melody", 2200.0, 9000.0),
    ("air", 9000.0, 18000.0),
];

#[derive(Debug, Clone, Copy)]
struct Preset {
    resolution: usize,
    fft_size: usize,
    amplitude_gamma: f32,
    saturation_boost: f32,
    brightness_boost: f32,
    alpha_cap: Option<f32>,
    highs_cap: Option<f32>,
    smoothing_window: Option<usize>,
}

static PRESETS: Lazy<HashMap<&'static str, Preset>> = Lazy::new(|| {
    let mut map = HashMap::new();
    map.insert(
        "reference-clean",
        Preset {
            resolution: 5000,
            fft_size: 4096,
            amplitude_gamma: 0.9,
            saturation_boost: 10.0,
            brightness_boost: 0.05,
            alpha_cap: None,
            highs_cap: None,
            smoothing_window: None,
        },
    );
    map.insert(
        "vivid-studio",
        Preset {
            resolution: 2000,
            fft_size: 4096,
            amplitude_gamma: 1.0,
            saturation_boost: 0.12,
            brightness_boost: 0.05,
            alpha_cap: None,
            highs_cap: Some(0.25),
            smoothing_window: None,
        },
    );
    map.insert(
        "crisp-micro",
        Preset {
            resolution: 3200,
            fft_size: 2048,
            amplitude_gamma: 1.0,
            saturation_boost: 0.0,
            brightness_boost: 0.0,
            alpha_cap: Some(0.7),
            highs_cap: None,
            smoothing_window: None,
        },
    );
    map.insert(
        "balanced-film",
        Preset {
            resolution: 1800,
            fft_size: 4096,
            amplitude_gamma: 1.0,
            saturation_boost: -0.08,
            brightness_boost: 0.1,
            alpha_cap: None,
            highs_cap: None,
            smoothing_window: None,
        },
    );
    map.insert(
        "darkroom-contrast",
        Preset {
            resolution: 2400,
            fft_size: 4096,
            amplitude_gamma: 1.0,
            saturation_boost: -0.12,
            brightness_boost: -0.05,
            alpha_cap: None,
            highs_cap: Some(0.2),
            smoothing_window: None,
        },
    );
    map.insert(
        "soft-pastel",
        Preset {
            resolution: 2000,
            fft_size: 2048,
            amplitude_gamma: 1.1,
            saturation_boost: -0.25,
            brightness_boost: 0.2,
            alpha_cap: None,
            highs_cap: None,
            smoothing_window: None,
        },
    );
    map.insert(
        "chrome-accurate",
        Preset {
            resolution: 2200,
            fft_size: 4096,
            amplitude_gamma: 1.0,
            saturation_boost: 0.05,
            brightness_boost: 0.05,
            alpha_cap: None,
            highs_cap: Some(0.25),
            smoothing_window: None,
        },
    );
    map.insert(
        "gridliner",
        Preset {
            resolution: 2600,
            fft_size: 2048,
            amplitude_gamma: 0.95,
            saturation_boost: 0.0,
            brightness_boost: 0.0,
            alpha_cap: None,
            highs_cap: None,
            smoothing_window: None,
        },
    );
    map.insert(
        "smoothed-hifi",
        Preset {
            resolution: 2200,
            fft_size: 2048,
            amplitude_gamma: 1.0,
            saturation_boost: 0.0,
            brightness_boost: 0.0,
            alpha_cap: None,
            highs_cap: None,
            smoothing_window: Some(5),
        },
    );
    map.insert(
        "airy-highlight",
        Preset {
            resolution: 2100,
            fft_size: 4096,
            amplitude_gamma: 1.0,
            saturation_boost: 0.0,
            brightness_boost: 0.05,
            alpha_cap: None,
            highs_cap: Some(0.2),
            smoothing_window: None,
        },
    );
    map
});

#[derive(Debug, Deserialize)]
struct AnalyzeQuery {
    resolution: Option<usize>,
    preset: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WaveformBar {
    amplitude: f32,
    color: Rgb,
    whiteness: f32,
}

#[derive(Debug, Serialize)]
struct Rgb {
    r: f32,
    g: f32,
    b: f32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WaveformData {
    bars: Vec<WaveformBar>,
    duration_seconds: f32,
    sample_rate: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AnalyzeResponse {
    waveform: WaveformData,
    preset: String,
    bpm: Option<f32>,
    beat_offset_seconds: Option<f32>,
}

#[derive(Debug, Clone)]
struct PcmData {
    samples: Vec<f32>,
    sample_rate: u32,
}

#[derive(Debug, Error)]
enum AnalyzeError {
    #[error("input too large")]
    InputTooLarge,
    #[error("empty request body")]
    EmptyBody,
    #[error("invalid resolution")]
    InvalidResolution,
    #[error("invalid preset")]
    InvalidPreset,
    #[error("ffmpeg failed: {0}")]
    Ffmpeg(String),
    #[error("ffmpeg produced empty output")]
    EmptyOutput,
    #[error("invalid ffmpeg output length")]
    InvalidOutput,
    #[error("fft error")]
    Fft,
    #[error("internal error: {0}")]
    Internal(String),
}

impl IntoResponse for AnalyzeError {
    fn into_response(self) -> Response {
        let status = match self {
            AnalyzeError::InputTooLarge
            | AnalyzeError::EmptyBody
            | AnalyzeError::InvalidPreset
            | AnalyzeError::InvalidResolution => StatusCode::BAD_REQUEST,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        };

        let body = Json(serde_json::json!({ "error": self.to_string() }));
        (status, body).into_response()
    }
}

#[tokio::main]
async fn main() {
    init_tracing();

    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "3000".to_string())
        .parse()
        .unwrap_or(3000);

    let app = Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/analyze", post(analyze))
        .with_state(());

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("listening on {:?}", addr);

    let server = axum::Server::bind(&addr).serve(app.into_make_service());

    if let Err(err) = server
        .with_graceful_shutdown(async move {
            signal::ctrl_c().await.ok();
        })
        .await
    {
        error!("server error: {err}");
    }
}

async fn analyze(
    Query(query): Query<AnalyzeQuery>,
    ContentLengthLimit(body): ContentLengthLimit<Bytes, MAX_INPUT_BYTES>,
    State(_): State<()>,
) -> Result<Json<AnalyzeResponse>, AnalyzeError> {
    if body.is_empty() {
        return Err(AnalyzeError::EmptyBody);
    }

    let preset_key = query
        .preset
        .unwrap_or_else(|| "reference-clean".to_string());
    let preset = PRESETS
        .get(preset_key.as_str())
        .ok_or(AnalyzeError::InvalidPreset)?;

    let resolution = query.resolution.unwrap_or(preset.resolution);
    if resolution == 0 {
        return Err(AnalyzeError::InvalidResolution);
    }
    let fft_size = preset.fft_size;

    let pcm = decode_to_pcm(&body).await?;

    let waveform = analyze_waveform(&pcm, resolution, fft_size).ok_or(AnalyzeError::Fft)?;
    let waveform = apply_preset(&waveform, preset);
    let (bpm, beat_offset_seconds) = estimate_bpm_and_offset(&pcm);

    Ok(Json(AnalyzeResponse {
        waveform,
        preset: preset_key,
        bpm,
        beat_offset_seconds,
    }))
}

async fn decode_to_pcm(input: &[u8]) -> Result<PcmData, AnalyzeError> {
    let mut child = Command::new("ffmpeg")
        .args([
            "-v", "error", "-i", "pipe:0", "-ac", "2", "-ar", "44100", "-f", "f32le", "pipe:1",
        ])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|err| AnalyzeError::Internal(format!("failed to spawn ffmpeg: {err}")))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(input)
            .await
            .map_err(|err| AnalyzeError::Internal(format!("failed to write to ffmpeg: {err}")))?;
    }

    let output = child
        .wait_with_output()
        .await
        .map_err(|err| AnalyzeError::Internal(format!("ffmpeg error: {err}")))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
        return Err(AnalyzeError::Ffmpeg(stderr));
    }

    if output.stdout.is_empty() {
        return Err(AnalyzeError::EmptyOutput);
    }

    if output.stdout.len() % 8 != 0 {
        return Err(AnalyzeError::InvalidOutput);
    }

    let float_view: &[f32] =
        bytemuck::try_cast_slice(&output.stdout).map_err(|_| AnalyzeError::InvalidOutput)?;

    let frames = float_view.len() / 2;
    let mut mono = Vec::with_capacity(frames);
    for i in 0..frames {
        let left = float_view[i * 2];
        let right = float_view[i * 2 + 1];
        mono.push((left + right) * 0.5);
    }

    Ok(PcmData {
        samples: mono,
        sample_rate: 44100,
    })
}

fn analyze_waveform(pcm: &PcmData, resolution: usize, fft_size: usize) -> Option<WaveformData> {
    if resolution == 0 || fft_size == 0 {
        return None;
    }

    let mono = mix_to_mono(&pcm.samples);
    if mono.is_empty() {
        return None;
    }

    let hop = std::cmp::max(1, mono.len() / resolution);
    let hann = build_hann_window(fft_size);
    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(fft_size);

    let mut bands_per_bar: Vec<HashMap<&str, f32>> = Vec::with_capacity(resolution);

    for bar_index in 0..resolution {
        let center = bar_index * hop + hop / 2;
        let start = center as isize - (fft_size as isize / 2);

        let mut buffer: Vec<Complex<f32>> = vec![Complex::new(0.0, 0.0); fft_size];
        for i in 0..fft_size {
            let source_index = start + i as isize;
            let value = if source_index >= 0 && (source_index as usize) < mono.len() {
                mono[source_index as usize] * hann[i]
            } else {
                0.0
            };
            buffer[i].re = value;
        }

        fft.process(&mut buffer);

        let energies = accumulate_band_energy(&buffer, pcm.sample_rate, fft_size as u32);
        bands_per_bar.push(energies);
    }

    let mut maxima: HashMap<&str, f32> = HashMap::new();
    maxima.insert("total", 0.0);
    for &(band, _, _) in BANDS {
        maxima.insert(band, 0.0);
    }

    for band in &bands_per_bar {
        for (key, value) in band {
            if let Some(entry) = maxima.get_mut(key.as_ref()) {
                *entry = entry.max(*value);
            }
        }
    }

    let bars: Vec<WaveformBar> = bands_per_bar
        .into_iter()
        .map(|band| {
            let amplitude = normalize(
                *band.get("total").unwrap_or(&0.0),
                *maxima.get("total").unwrap_or(&1.0),
                0.7,
            );
            let bass = normalize(
                *band.get("bass").unwrap_or(&0.0),
                *maxima.get("bass").unwrap_or(&1.0),
                0.6,
            );

            let voice_weight = 1.15;
            let melody_weight = 1.2;
            let voice = normalize(
                *band.get("voice").unwrap_or(&0.0) * voice_weight,
                *maxima.get("voice").unwrap_or(&1.0) * voice_weight,
                0.6,
            );
            let melody = normalize(
                *band.get("melody").unwrap_or(&0.0) * melody_weight,
                *maxima.get("melody").unwrap_or(&1.0) * melody_weight,
                0.5,
            );
            let air = normalize(
                *band.get("air").unwrap_or(&0.0),
                *maxima.get("air").unwrap_or(&1.0),
                0.9,
            );

            let whiteness = clamp((air.powf(1.05) * 0.2), 0.0, 0.22);
            let r = clamp(bass * 1.18 * (1.0 - whiteness) + whiteness * 0.8, 0.0, 1.0);
            let g = clamp(voice * 1.22 * (1.0 - whiteness) + whiteness * 0.8, 0.0, 1.0);
            let b = clamp(melody * 1.38 * (1.0 - whiteness) + whiteness, 0.0, 1.0);

            WaveformBar {
                amplitude,
                color: Rgb { r, g, b },
                whiteness,
            }
        })
        .collect();

    Some(WaveformData {
        bars,
        duration_seconds: pcm.samples.len() as f32 / pcm.sample_rate as f32,
        sample_rate: pcm.sample_rate,
    })
}

fn apply_preset(waveform: &WaveformData, preset: &Preset) -> WaveformData {
    let gamma = preset.amplitude_gamma;
    let mut bars: Vec<WaveformBar> = waveform
        .bars
        .iter()
        .map(|bar| {
            let amp = bar.amplitude.powf(gamma);
            let mut r = bar.color.r;
            let mut g = bar.color.g;
            let mut b = bar.color.b;
            let mut whiteness = bar.whiteness;

            if let Some(cap) = preset.highs_cap {
                whiteness = whiteness.min(cap);
            }

            if preset.saturation_boost != 0.0 || preset.brightness_boost != 0.0 {
                let (h, s, l) = rgb_to_hsl(r, g, b);
                let s2 = clamp01(s * (1.0 + preset.saturation_boost));
                let l2 = clamp01(l * (1.0 + preset.brightness_boost));
                let rgb = hsl_to_rgb(h, s2, l2);
                r = rgb.r;
                g = rgb.g;
                b = rgb.b;
            }

            r = clamp01(r * (1.0 - whiteness) + whiteness);
            g = clamp01(g * (1.0 - whiteness) + whiteness);
            b = clamp01(b * (1.0 - whiteness) + whiteness);

            if let Some(cap) = preset.alpha_cap {
                r = r.min(cap);
                g = g.min(cap);
                b = b.min(cap);
            }

            WaveformBar {
                amplitude: amp,
                color: Rgb { r, g, b },
                whiteness,
            }
        })
        .collect();

    if let Some(window) = preset.smoothing_window {
        if window > 1 {
            let w = window;
            let len = bars.len();
            let mut smoothed = bars.clone();
            for i in 0..len {
                let mut sum = 0.0;
                let mut count = 0.0;
                for k in -(w as isize)..=(w as isize) {
                    let idx = i as isize + k;
                    if idx >= 0 && (idx as usize) < len {
                        sum += bars[idx as usize].amplitude;
                        count += 1.0;
                    }
                }
                if count > 0.0 {
                    smoothed[i].amplitude = sum / count;
                }
            }
            bars = smoothed;
        }
    }

    WaveformData {
        bars,
        duration_seconds: waveform.duration_seconds,
        sample_rate: waveform.sample_rate,
    }
}

fn mix_to_mono(samples: &[f32]) -> Vec<f32> {
    samples.to_vec()
}

fn build_hann_window(size: usize) -> Vec<f32> {
    let mut window = vec![0.0; size];
    let factor = PI * 2.0 / (size as f32 - 1.0);
    for i in 0..size {
        window[i] = 0.5 * (1.0 - (factor * i as f32).cos());
    }
    window
}

fn accumulate_band_energy(
    spectrum: &[Complex<f32>],
    sample_rate: u32,
    fft_size: u32,
) -> HashMap<&'static str, f32> {
    let nyquist = sample_rate as f32 / 2.0;
    let bin_size = nyquist / (fft_size as f32 / 2.0);

    let mut energy: HashMap<&'static str, f32> = HashMap::new();
    energy.insert("total", 0.0);
    for &(band, _, _) in BANDS {
        energy.insert(band, 0.0);
    }

    let half = spectrum.len() / 2;
    for bin in 0..half {
        let value = spectrum[bin];
        let magnitude = (value.re * value.re + value.im * value.im).sqrt();
        let freq = bin as f32 * bin_size;

        for &(band_key, min, max) in BANDS {
            if freq >= min && freq < max {
                if let Some(entry) = energy.get_mut(band_key) {
                    *entry += magnitude;
                }
                break;
            }
        }

        if let Some(total) = energy.get_mut("total") {
            *total += magnitude;
        }
    }

    energy
}

fn normalize(value: f32, max: f32, gamma: f32) -> f32 {
    if max <= 0.0 {
        return 0.0;
    }
    let ratio = clamp(value / max, 0.0, 1.0);
    ratio.powf(gamma)
}

fn clamp(value: f32, min: f32, max: f32) -> f32 {
    value.max(min).min(max)
}

fn clamp01(value: f32) -> f32 {
    clamp(value, 0.0, 1.0)
}

fn rgb_to_hsl(r: f32, g: f32, b: f32) -> (f32, f32, f32) {
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let mut h = 0.0;
    let mut s = 0.0;
    let l = (max + min) / 2.0;

    if max != min {
        let d = max - min;
        s = if l > 0.5 {
            d / (2.0 - max - min)
        } else {
            d / (max + min)
        };
        h = match max {
            _ if max == r => (g - b) / d + if g < b { 6.0 } else { 0.0 },
            _ if max == g => (b - r) / d + 2.0,
            _ => (r - g) / d + 4.0,
        };
        h /= 6.0;
    }

    (h, s, l)
}

fn hsl_to_rgb(h: f32, s: f32, l: f32) -> Rgb {
    if s == 0.0 {
        return Rgb { r: l, g: l, b: l };
    }

    let q = if l < 0.5 {
        l * (1.0 + s)
    } else {
        l + s - l * s
    };
    let p = 2.0 * l - q;

    let hue2rgb = |p: f32, q: f32, t: f32| -> f32 {
        let mut t = t;
        if t < 0.0 {
            t += 1.0;
        }
        if t > 1.0 {
            t -= 1.0;
        }
        if t < 1.0 / 6.0 {
            return p + (q - p) * 6.0 * t;
        }
        if t < 1.0 / 2.0 {
            return q;
        }
        if t < 2.0 / 3.0 {
            return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
        }
        p
    };

    Rgb {
        r: hue2rgb(p, q, h + 1.0 / 3.0),
        g: hue2rgb(p, q, h),
        b: hue2rgb(p, q, h - 1.0 / 3.0),
    }
}

fn estimate_bpm_and_offset(pcm: &PcmData) -> (Option<f32>, Option<f32>) {
    let min_bpm = 70.0;
    let max_bpm = 180.0;

    let mono = mix_to_mono(&pcm.samples);
    if mono.is_empty() {
        return (None, None);
    }

    let frame_size = 1024usize;
    let hop = 512usize;
    let mut envelope = Vec::new();
    let mut raw_envelope = Vec::new();

    let mut start = 0usize;
    while start < mono.len() {
        let end = (start + frame_size).min(mono.len());
        if end <= start {
            break;
        }
        let mut sum = 0.0f32;
        for i in start..end {
            sum += mono[i] * mono[i];
        }
        let len = (end - start) as f32;
        let rms = (sum / len).sqrt();
        envelope.push(rms);
        raw_envelope.push(rms);
        start += hop;
    }

    if envelope.len() < 8 {
        return (None, None);
    }

    let mean: f32 = envelope.iter().copied().sum::<f32>() / envelope.len() as f32;
    for value in &mut envelope {
        *value -= mean;
    }
    let max_abs = envelope
        .iter()
        .copied()
        .fold(0.0f32, |acc, v| acc.max(v.abs()));
    if max_abs > 0.0 {
        for value in &mut envelope {
            *value /= max_abs;
        }
    }

    let envelope_rate = pcm.sample_rate as f32 / hop as f32;
    let min_lag = (envelope_rate * 60.0 / max_bpm).round().max(1.0) as usize;
    let max_lag =
        ((envelope_rate * 60.0 / min_bpm).round() as usize).min(envelope.len().saturating_sub(2));
    if max_lag <= min_lag {
        return (None, None);
    }

    let mut best_lag: isize = -1;
    let mut best_score = f32::NEG_INFINITY;
    let mut scores = vec![0.0f32; max_lag + 1];
    for lag in min_lag..=max_lag {
        let mut acc = 0.0f32;
        for i in 0..(envelope.len().saturating_sub(lag)) {
            acc += envelope[i] * envelope[i + lag];
        }
        scores[lag] = acc;
        if acc > best_score {
            best_score = acc;
            best_lag = lag as isize;
        }
    }

    if best_lag <= 0 || best_score <= 0.0 {
        return (None, None);
    }

    let best_lag = best_lag as usize;
    let left = scores
        .get(best_lag.wrapping_sub(1))
        .copied()
        .unwrap_or(best_score);
    let right = scores.get(best_lag + 1).copied().unwrap_or(best_score);
    let denom = left - 2.0 * best_score + right;
    let peak_offset = if denom != 0.0 {
        0.5 * (left - right) / denom
    } else {
        0.0
    };
    let refined_lag = ((best_lag as f32 + peak_offset).max(min_lag as f32)).min(max_lag as f32);

    let seconds_per_beat = refined_lag / envelope_rate;
    let mut bpm = if seconds_per_beat > 0.0 {
        Some(60.0 / seconds_per_beat)
    } else {
        None
    };

    if let Some(current) = bpm.as_mut() {
        let candidates = [*current, *current * 2.0, *current / 2.0];
        let mut pick = *current;
        for cand in candidates {
            if cand >= min_bpm && cand <= max_bpm {
                let current_delta = (cand - cand.round()).abs();
                let pick_delta = (pick - pick.round()).abs();
                if current_delta < pick_delta {
                    pick = cand;
                }
            }
        }
        *current = pick;
    }

    let mut beat_offset_seconds: Option<f32> = None;

    if !raw_envelope.is_empty() && seconds_per_beat.is_finite() && seconds_per_beat > 0.0 {
        let mut max_idx = 0usize;
        let mut max_val = f32::NEG_INFINITY;
        for (i, &v) in raw_envelope.iter().enumerate() {
            if v > max_val {
                max_val = v;
                max_idx = i;
            }
        }
        let peak_time = max_idx as f32 / envelope_rate;
        beat_offset_seconds =
            Some(((peak_time % seconds_per_beat) + seconds_per_beat) % seconds_per_beat);
    } else {
        let step = (best_lag / 32).max(1);
        let mut best_phase = 0usize;
        let mut best_phase_score = f32::NEG_INFINITY;
        for phase in (0..best_lag).step_by(step) {
            let mut acc = 0.0f32;
            let mut i = phase;
            while i + best_lag < envelope.len() {
                acc += envelope[i] * envelope[i + best_lag];
                i += 1;
            }
            if acc > best_phase_score {
                best_phase_score = acc;
                best_phase = phase;
            }
        }
        beat_offset_seconds = Some(best_phase as f32 / envelope_rate);
    }

    (
        bpm.map(|v| (v * 100.0).round() / 100.0),
        beat_offset_seconds.map(|v| (v * 1000.0).round() / 1000.0),
    )
}

fn init_tracing() {
    let env_filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    fmt()
        .with_env_filter(env_filter)
        .with_target(false)
        .with_level(true)
        .init();
}

#[cfg(test)]
mod tests {
    use super::*;

    fn approx_eq(a: f32, b: f32, tolerance: f32) {
        assert!(
            (a - b).abs() <= tolerance,
            "expected {a} to equal {b} within {tolerance}"
        );
    }

    #[test]
    fn hann_window_has_expected_shape() {
        let window = build_hann_window(5);
        approx_eq(window[0], 0.0, 1e-6);
        approx_eq(window[4], 0.0, 1e-6);
        approx_eq(window[2], 1.0, 1e-6);
    }

    #[test]
    fn normalize_handles_zero_max_and_gamma() {
        approx_eq(normalize(10.0, 0.0, 0.5), 0.0, 1e-6);
        approx_eq(normalize(2.0, 4.0, 1.0), 0.5, 1e-6);
        approx_eq(normalize(2.0, 8.0, 0.5), (0.25f32).sqrt(), 1e-6);
    }

    #[test]
    fn rgb_round_trip_preserves_color() {
        let (r, g, b) = (0.2, 0.4, 0.6);
        let (h, s, l) = rgb_to_hsl(r, g, b);
        let rgb = hsl_to_rgb(h, s, l);
        approx_eq(rgb.r, r, 1e-6);
        approx_eq(rgb.g, g, 1e-6);
        approx_eq(rgb.b, b, 1e-6);
    }

    #[test]
    fn accumulate_band_energy_distributes_per_band() {
        let sample_rate = 48_000u32;
        let fft_size = 1024u32;
        let mut spectrum = vec![Complex::new(0.0, 0.0); fft_size as usize];
        let bin_size = (sample_rate as f32 / 2.0) / (fft_size as f32 / 2.0);

        let targets = [100.0f32, 1000.0, 4000.0, 12_000.0];
        for freq in targets {
            let bin = (freq / bin_size).round() as usize;
            spectrum[bin] = Complex::new(1.0, 0.0);
        }

        let energy = accumulate_band_energy(&spectrum, sample_rate, fft_size);
        approx_eq(*energy.get("bass").unwrap(), 1.0, 1e-6);
        approx_eq(*energy.get("voice").unwrap(), 1.0, 1e-6);
        approx_eq(*energy.get("melody").unwrap(), 1.0, 1e-6);
        approx_eq(*energy.get("air").unwrap(), 1.0, 1e-6);
        approx_eq(*energy.get("total").unwrap(), 4.0, 1e-6);
    }

    #[test]
    fn apply_preset_respects_caps_and_smoothing() {
        let waveform = WaveformData {
            bars: vec![
                WaveformBar {
                    amplitude: 0.0,
                    color: Rgb {
                        r: 0.1,
                        g: 0.2,
                        b: 0.3,
                    },
                    whiteness: 0.5,
                },
                WaveformBar {
                    amplitude: 1.0,
                    color: Rgb {
                        r: 0.2,
                        g: 0.3,
                        b: 0.4,
                    },
                    whiteness: 0.5,
                },
                WaveformBar {
                    amplitude: 0.0,
                    color: Rgb {
                        r: 0.3,
                        g: 0.4,
                        b: 0.5,
                    },
                    whiteness: 0.5,
                },
            ],
            duration_seconds: 1.0,
            sample_rate: 48_000,
        };

        let preset = Preset {
            resolution: 3,
            fft_size: 8,
            amplitude_gamma: 2.0,
            saturation_boost: 0.0,
            brightness_boost: 0.0,
            alpha_cap: Some(0.4),
            highs_cap: Some(0.2),
            smoothing_window: Some(2),
        };

        let result = apply_preset(&waveform, &preset);
        assert_eq!(result.bars.len(), 3);
        for bar in &result.bars {
            approx_eq(bar.whiteness, 0.2, 1e-6);
            assert!(bar.color.r <= 0.4 && bar.color.g <= 0.4 && bar.color.b <= 0.4);
        }

        for bar in result.bars {
            approx_eq(bar.amplitude, 1.0 / 3.0, 1e-6);
        }
    }

    fn build_click_track(bpm: f32, seconds: f32, sample_rate: u32) -> PcmData {
        let total_samples = (seconds * sample_rate as f32) as usize;
        let mut samples = vec![0.0f32; total_samples];
        let step = (sample_rate as f32 * 60.0 / bpm) as usize;

        let pulse_len = 128usize.min(step);
        let mut idx = 0usize;
        while idx < total_samples {
            for i in 0..pulse_len {
                let pos = idx + i;
                if pos < total_samples {
                    samples[pos] = 1.0;
                }
            }
            idx += step;
        }

        PcmData {
            samples,
            sample_rate,
        }
    }

    #[test]
    fn estimate_bpm_detects_click_track() {
        let pcm = build_click_track(120.0, 10.0, 48_000);
        let (bpm, offset) = estimate_bpm_and_offset(&pcm);

        assert!(bpm.is_some());
        approx_eq(bpm.unwrap(), 120.0, 1.0);
        assert!(offset.is_some());
        approx_eq(offset.unwrap(), 0.0, 0.02);
    }

    #[test]
    fn estimate_bpm_returns_none_for_short_input() {
        let pcm = PcmData {
            samples: vec![0.0; 100],
            sample_rate: 48_000,
        };
        let (bpm, offset) = estimate_bpm_and_offset(&pcm);
        assert!(bpm.is_none());
        assert!(offset.is_none());
    }
}
