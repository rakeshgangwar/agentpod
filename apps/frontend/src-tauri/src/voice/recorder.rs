//! Audio recording module using cpal (macOS/Windows) and parec (Linux)
//!
//! Provides cross-platform microphone capture for voice input.
//! On Linux with PipeWire/PulseAudio, we use `parec` subprocess because
//! cpal's ALSA backend doesn't work reliably with PipeWire's ALSA plugin.

use parking_lot::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

#[cfg(not(target_os = "linux"))]
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
#[cfg(not(target_os = "linux"))]
use cpal::{Device, Host, SampleFormat, StreamConfig};

use super::audio_utils::{self, WHISPER_SAMPLE_RATE};
use super::VoiceError;

/// Find the best input device for recording
/// On Linux with PipeWire/PulseAudio, we prefer those over raw ALSA
#[cfg(not(target_os = "linux"))]
fn find_best_input_device(host: &Host, device_names: &[String]) -> Result<Device, VoiceError> {
    // On Linux with PipeWire, try pulse device first as it uses the PulseAudio API
    // which PipeWire supports well. The "pipewire" ALSA plugin often doesn't work correctly.
    // Priority: pulse > pipewire > default
    let preferred_devices = ["pulse", "pipewire"];

    // Try preferred devices first
    for preferred in preferred_devices {
        if device_names.contains(&preferred.to_string()) {
            if let Ok(devices) = host.input_devices() {
                for device in devices {
                    if let Ok(name) = device.name() {
                        if name == preferred {
                            // Verify we can get a config for this device
                            if device.default_input_config().is_ok() {
                                tracing::info!("Using preferred audio device: {}", name);
                                return Ok(device);
                            } else {
                                tracing::warn!(
                                    "Device {} doesn't support input config, skipping",
                                    name
                                );
                            }
                        }
                    }
                }
            }
        }
    }

    // Try hw: devices which might work better on some systems
    if let Ok(devices) = host.input_devices() {
        for device in devices {
            if let Ok(name) = device.name() {
                // Skip monitor devices (they capture output, not input)
                if name.contains("monitor") {
                    continue;
                }
                // Try plughw devices (they handle format conversion)
                if name.starts_with("plughw:") {
                    if device.default_input_config().is_ok() {
                        tracing::info!("Using plughw device: {}", name);
                        return Ok(device);
                    }
                }
            }
        }
    }

    // Fall back to default device
    tracing::info!("No preferred device found, using default");
    host.default_input_device()
        .ok_or_else(|| VoiceError::AudioDevice("No default input device found".to_string()))
}

// ============================================================================
// Linux-specific recording using parec (PulseAudio/PipeWire CLI)
// ============================================================================

#[cfg(target_os = "linux")]
mod linux_recorder {
    use super::*;
    use std::io::Read;
    use std::process::{Command, Stdio};

    /// Check if parec is available on the system
    pub fn is_parec_available() -> bool {
        Command::new("parec")
            .arg("--version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }

    /// Start recording using parec on Linux
    ///
    /// parec captures audio from PulseAudio/PipeWire and writes raw audio to stdout.
    /// We request f32le format at 16kHz mono which is what Whisper needs.
    pub fn start_parec_recording(
        state: Arc<RecordingState>,
    ) -> Result<std::thread::JoinHandle<()>, VoiceError> {
        if state.is_recording.load(Ordering::Relaxed) {
            return Err(VoiceError::AlreadyRecording);
        }

        if !is_parec_available() {
            return Err(VoiceError::AudioDevice(
                "parec not found. Install pulseaudio-utils or pipewire-pulse.".to_string(),
            ));
        }

        tracing::info!("Starting Linux audio recording using parec");

        // Clear previous samples
        state.clear();

        // Set recording flag
        state.is_recording.store(true, Ordering::Relaxed);
        *state.device_sample_rate.lock() = WHISPER_SAMPLE_RATE;

        let state_clone = Arc::clone(&state);

        let handle = std::thread::spawn(move || {
            if let Err(e) = run_parec_recording_loop(state_clone) {
                tracing::error!("Linux parec recording error: {}", e);
            }
        });

        Ok(handle)
    }

    /// Run the parec recording loop
    fn run_parec_recording_loop(state: Arc<RecordingState>) -> Result<(), VoiceError> {
        // parec with --raw defaults to s16le stereo 44100Hz.
        // This is the most reliable format across PipeWire/PulseAudio systems.
        // We convert stereo to mono and resample to 16kHz for Whisper.

        // Audio format constants (parec default with --raw)
        const PAREC_SAMPLE_RATE: u32 = 44100;
        const PAREC_CHANNELS: u16 = 2;

        let mut child = Command::new("parec")
            .args([
                "--raw",
                "--latency-msec=100", // 100ms latency for stable capture
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| VoiceError::AudioDevice(format!("Failed to start parec: {}", e)))?;

        let mut stdout = child
            .stdout
            .take()
            .ok_or_else(|| VoiceError::AudioDevice("Failed to get parec stdout".to_string()))?;

        tracing::info!(
            "parec started (s16le {}ch {}Hz), reading audio data...",
            PAREC_CHANNELS,
            PAREC_SAMPLE_RATE
        );

        // Buffer for reading audio data
        // s16le stereo = 4 bytes per frame (2 bytes * 2 channels)
        // Read ~100ms worth of data at a time: 44100 * 0.1 * 4 = 17640 bytes
        let buffer_size = (PAREC_SAMPLE_RATE as usize / 10) * 4;
        let mut buffer = vec![0u8; buffer_size];
        let mut logged_first = false;

        while state.is_recording.load(Ordering::Relaxed) {
            match stdout.read(&mut buffer) {
                Ok(0) => {
                    // EOF - parec exited
                    tracing::warn!("parec EOF - process may have exited");
                    break;
                }
                Ok(bytes_read) => {
                    // Convert s16le stereo bytes to f32 samples
                    // Each frame is 4 bytes: [left_low, left_high, right_low, right_high]
                    let frame_count = bytes_read / 4;
                    let stereo_samples: Vec<f32> = (0..frame_count * 2)
                        .map(|i| {
                            let start = i * 2;
                            if start + 1 >= bytes_read {
                                return 0.0;
                            }
                            let bytes = [buffer[start], buffer[start + 1]];
                            let sample = i16::from_le_bytes(bytes);
                            // Convert i16 to f32 in range [-1.0, 1.0]
                            sample as f32 / i16::MAX as f32
                        })
                        .collect();

                    // Convert stereo to mono by averaging channels
                    let mono_samples = audio_utils::stereo_to_mono(&stereo_samples);

                    // Resample from 44100Hz to 16000Hz
                    let samples = audio_utils::resample(
                        &mono_samples,
                        PAREC_SAMPLE_RATE,
                        WHISPER_SAMPLE_RATE,
                    );

                    // Log first batch for debugging
                    if !logged_first && !samples.is_empty() {
                        let max_sample = samples.iter().map(|s| s.abs()).fold(0.0f32, f32::max);
                        tracing::info!(
                            "First parec audio batch: {} samples (from {} bytes), max_amplitude={:.6}",
                            samples.len(),
                            bytes_read,
                            max_sample
                        );
                        logged_first = true;
                    }

                    // Calculate audio level
                    let level = audio_utils::calculate_rms(&samples);
                    *state.audio_level.lock() = level;

                    // Store samples
                    state.samples.lock().extend(samples);
                }
                Err(e) => {
                    if e.kind() != std::io::ErrorKind::Interrupted {
                        tracing::error!("Error reading from parec: {}", e);
                        break;
                    }
                }
            }
        }

        // Kill the parec process
        let _ = child.kill();
        let _ = child.wait();

        tracing::info!("Linux parec recording stopped");
        Ok(())
    }
}

/// Shared recording state that can be passed between threads
/// This is the Send+Sync part that Tauri state needs
pub struct RecordingState {
    /// Collected audio samples (f32, mono, 16kHz)
    pub samples: Arc<Mutex<Vec<f32>>>,
    /// Whether currently recording
    pub is_recording: Arc<AtomicBool>,
    /// Current audio level (RMS, 0.0-1.0)
    pub audio_level: Arc<Mutex<f32>>,
    /// Device sample rate (for duration calculation)
    pub device_sample_rate: Arc<Mutex<u32>>,
}

impl RecordingState {
    pub fn new() -> Self {
        Self {
            samples: Arc::new(Mutex::new(Vec::new())),
            is_recording: Arc::new(AtomicBool::new(false)),
            audio_level: Arc::new(Mutex::new(0.0)),
            device_sample_rate: Arc::new(Mutex::new(WHISPER_SAMPLE_RATE)),
        }
    }

    /// Check if currently recording
    pub fn is_recording(&self) -> bool {
        self.is_recording.load(Ordering::Relaxed)
    }

    /// Get current audio level (RMS, 0.0-1.0)
    pub fn get_audio_level(&self) -> f32 {
        *self.audio_level.lock()
    }

    /// Get recording duration in seconds
    pub fn get_duration(&self) -> f32 {
        let samples_len = self.samples.lock().len();
        samples_len as f32 / WHISPER_SAMPLE_RATE as f32
    }

    /// Clear all recorded samples
    pub fn clear(&self) {
        self.samples.lock().clear();
        *self.audio_level.lock() = 0.0;
    }

    /// Take the collected samples
    pub fn take_samples(&self) -> Vec<f32> {
        std::mem::take(&mut *self.samples.lock())
    }
}

impl Default for RecordingState {
    fn default() -> Self {
        Self::new()
    }
}

// Make RecordingState explicitly Send + Sync
unsafe impl Send for RecordingState {}
unsafe impl Sync for RecordingState {}

/// Start recording audio from the microphone
///
/// This function spawns a recording thread and returns immediately.
/// The recording continues until `stop_recording` is called.
///
/// Returns a handle that must be used to stop the recording.
pub fn start_recording(
    state: Arc<RecordingState>,
) -> Result<std::thread::JoinHandle<()>, VoiceError> {
    // On Linux, use parec for reliable PipeWire/PulseAudio capture
    #[cfg(target_os = "linux")]
    {
        return linux_recorder::start_parec_recording(state);
    }

    // On other platforms (macOS, Windows), use cpal
    #[cfg(not(target_os = "linux"))]
    {
        if state.is_recording.load(Ordering::Relaxed) {
            return Err(VoiceError::AlreadyRecording);
        }

        tracing::info!("Starting audio recording");

        // Clear previous samples
        state.clear();

        // Clone state for the recording thread
        let state_clone = Arc::clone(&state);

        // Set recording flag before spawning thread
        state.is_recording.store(true, Ordering::Relaxed);

        // Spawn recording thread (Stream is not Send, so we need a dedicated thread)
        let handle = std::thread::spawn(move || {
            if let Err(e) = run_recording_loop(state_clone) {
                tracing::error!("Recording error: {}", e);
            }
        });

        Ok(handle)
    }
}

/// Internal recording loop - runs in a dedicated thread (non-Linux only)
#[cfg(not(target_os = "linux"))]
fn run_recording_loop(state: Arc<RecordingState>) -> Result<(), VoiceError> {
    let host = cpal::default_host();
    tracing::info!("Using audio host: {}", host.id().name());

    // List all available input devices for debugging
    let device_names: Vec<String> = if let Ok(devices) = host.input_devices() {
        devices.filter_map(|d| d.name().ok()).collect()
    } else {
        vec![]
    };
    tracing::info!("Available input devices: {:?}", device_names);

    // Try to find a working input device
    // Priority: pipewire > pulse > default > any hw device
    let device = find_best_input_device(&host, &device_names)?;

    tracing::info!(
        "Selected input device: {:?}",
        device.name().unwrap_or_default()
    );

    let supported_config = device
        .default_input_config()
        .map_err(|e| VoiceError::AudioDevice(format!("Failed to get input config: {}", e)))?;

    let config: StreamConfig = supported_config.clone().into();
    let device_sample_rate = config.sample_rate.0;
    let device_channels = config.channels;

    *state.device_sample_rate.lock() = device_sample_rate;

    tracing::info!(
        "Recording config: {} Hz, {} channels, format={:?}",
        device_sample_rate,
        device_channels,
        supported_config.sample_format()
    );

    let samples = Arc::clone(&state.samples);
    let is_recording = Arc::clone(&state.is_recording);
    let audio_level = Arc::clone(&state.audio_level);

    let err_fn = |err| {
        tracing::error!("Audio stream error: {}", err);
    };

    let stream = match supported_config.sample_format() {
        SampleFormat::F32 => device.build_input_stream(
            &config,
            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                if !is_recording.load(Ordering::Relaxed) {
                    return;
                }
                process_samples(
                    data,
                    &samples,
                    &audio_level,
                    device_sample_rate,
                    device_channels,
                );
            },
            err_fn,
            None,
        ),
        SampleFormat::I16 => device.build_input_stream(
            &config,
            move |data: &[i16], _: &cpal::InputCallbackInfo| {
                if !is_recording.load(Ordering::Relaxed) {
                    return;
                }
                let f32_data = audio_utils::convert_i16_to_f32(data);
                process_samples(
                    &f32_data,
                    &samples,
                    &audio_level,
                    device_sample_rate,
                    device_channels,
                );
            },
            err_fn,
            None,
        ),
        SampleFormat::U16 => {
            device.build_input_stream(
                &config,
                move |data: &[u16], _: &cpal::InputCallbackInfo| {
                    if !is_recording.load(Ordering::Relaxed) {
                        return;
                    }
                    // Convert u16 to f32 (centered at 0)
                    let f32_data: Vec<f32> = data
                        .iter()
                        .map(|&s| (s as f32 / u16::MAX as f32) * 2.0 - 1.0)
                        .collect();
                    process_samples(
                        &f32_data,
                        &samples,
                        &audio_level,
                        device_sample_rate,
                        device_channels,
                    );
                },
                err_fn,
                None,
            )
        }
        _ => {
            return Err(VoiceError::AudioDevice(format!(
                "Unsupported sample format: {:?}",
                supported_config.sample_format()
            )));
        }
    }
    .map_err(|e| VoiceError::AudioDevice(format!("Failed to build input stream: {}", e)))?;

    // Start the stream
    stream
        .play()
        .map_err(|e| VoiceError::Recording(format!("Failed to start stream: {}", e)))?;

    tracing::info!("Audio recording started, waiting for stop signal");

    // Wait until recording is stopped
    while state.is_recording.load(Ordering::Relaxed) {
        std::thread::sleep(std::time::Duration::from_millis(10));
    }

    // Stream is dropped here, stopping recording
    tracing::info!("Audio recording stopped");

    Ok(())
}

/// Process incoming audio samples (non-Linux only, Linux uses parec which outputs correct format)
#[cfg(not(target_os = "linux"))]
fn process_samples(
    data: &[f32],
    samples: &Arc<Mutex<Vec<f32>>>,
    audio_level: &Arc<Mutex<f32>>,
    device_sample_rate: u32,
    device_channels: u16,
) {
    // Log first batch of samples for debugging
    static LOGGED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
    if !LOGGED.swap(true, std::sync::atomic::Ordering::Relaxed) {
        let max_sample = data.iter().map(|s| s.abs()).fold(0.0f32, f32::max);
        tracing::info!(
            "First audio batch: {} samples, max_amplitude={:.6}, channels={}",
            data.len(),
            max_sample,
            device_channels
        );
    }

    // Convert to mono if stereo
    let mono_data = if device_channels > 1 {
        audio_utils::stereo_to_mono(data)
    } else {
        data.to_vec()
    };

    // Resample to 16kHz if needed
    let resampled = if device_sample_rate != WHISPER_SAMPLE_RATE {
        audio_utils::resample(&mono_data, device_sample_rate, WHISPER_SAMPLE_RATE)
    } else {
        mono_data
    };

    // Calculate and store audio level
    let level = audio_utils::calculate_rms(&resampled);
    *audio_level.lock() = level;

    // Store samples
    samples.lock().extend(resampled);
}

/// Stop recording and return the collected audio samples
///
/// Returns audio as f32 samples, mono, 16kHz - ready for Whisper
pub fn stop_recording(state: &RecordingState) -> Result<Vec<f32>, VoiceError> {
    if !state.is_recording.load(Ordering::Relaxed) {
        return Err(VoiceError::NotRecording);
    }

    tracing::info!("Stopping audio recording");

    // Signal the recording thread to stop
    state.is_recording.store(false, Ordering::Relaxed);

    // Give the recording thread time to finish
    std::thread::sleep(std::time::Duration::from_millis(50));

    // Get the collected samples
    let samples = state.take_samples();

    let duration_secs = samples.len() as f32 / WHISPER_SAMPLE_RATE as f32;

    // Calculate audio statistics for debugging
    let max_amplitude = samples.iter().map(|s| s.abs()).fold(0.0f32, f32::max);
    let rms = if !samples.is_empty() {
        (samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32).sqrt()
    } else {
        0.0
    };

    tracing::info!(
        "Recording complete. Captured {} samples ({:.2}s), max_amplitude={:.4}, rms={:.4}",
        samples.len(),
        duration_secs,
        max_amplitude,
        rms
    );

    // Warn if audio seems too quiet
    if max_amplitude < 0.01 {
        tracing::warn!(
            "Recording appears to be very quiet (max_amplitude < 0.01). Check microphone."
        );
    }

    // Warn if recording is too short
    if duration_secs < 0.5 {
        tracing::warn!(
            "Recording is very short ({:.2}s). May not produce good transcription.",
            duration_secs
        );
    }

    Ok(samples)
}

/// Cancel recording without returning samples
pub fn cancel_recording(state: &RecordingState) -> Result<(), VoiceError> {
    if !state.is_recording.load(Ordering::Relaxed) {
        return Err(VoiceError::NotRecording);
    }

    tracing::info!("Cancelling audio recording");

    // Signal the recording thread to stop
    state.is_recording.store(false, Ordering::Relaxed);

    // Give the recording thread time to finish
    std::thread::sleep(std::time::Duration::from_millis(50));

    // Clear samples
    state.clear();

    Ok(())
}

/// List available audio input devices
pub fn list_input_devices() -> Result<Vec<String>, VoiceError> {
    #[cfg(target_os = "linux")]
    {
        // On Linux, use pactl to list sources
        list_pulseaudio_sources()
    }

    #[cfg(not(target_os = "linux"))]
    {
        let host = cpal::default_host();
        let devices = host
            .input_devices()
            .map_err(|e| VoiceError::AudioDevice(format!("Failed to enumerate devices: {}", e)))?;

        let names: Vec<String> = devices.filter_map(|d| d.name().ok()).collect();

        Ok(names)
    }
}

/// Get the default input device name
pub fn get_default_input_device_name() -> Result<String, VoiceError> {
    #[cfg(target_os = "linux")]
    {
        // On Linux, use pactl to get default source
        get_pulseaudio_default_source()
    }

    #[cfg(not(target_os = "linux"))]
    {
        let host = cpal::default_host();
        let device = host
            .default_input_device()
            .ok_or_else(|| VoiceError::AudioDevice("No default input device".to_string()))?;

        device
            .name()
            .map_err(|e| VoiceError::AudioDevice(format!("Failed to get device name: {}", e)))
    }
}

// ============================================================================
// Linux PulseAudio/PipeWire device listing helpers
// ============================================================================

#[cfg(target_os = "linux")]
fn list_pulseaudio_sources() -> Result<Vec<String>, VoiceError> {
    use std::process::Command;

    // Use pactl to list sources (input devices)
    let output = Command::new("pactl")
        .args(["list", "sources", "short"])
        .output()
        .map_err(|e| VoiceError::AudioDevice(format!("Failed to run pactl: {}", e)))?;

    if !output.status.success() {
        return Err(VoiceError::AudioDevice(
            "pactl failed to list sources".to_string(),
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let sources: Vec<String> = stdout
        .lines()
        .filter_map(|line| {
            // Format: ID\tNAME\tDRIVER\tSAMPLE_SPEC\tSTATE
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() >= 2 {
                let name = parts[1].to_string();
                // Filter out monitor sources (they capture output, not input)
                if !name.contains(".monitor") {
                    return Some(name);
                }
            }
            None
        })
        .collect();

    if sources.is_empty() {
        // Fallback: just say we use the default
        Ok(vec!["default".to_string()])
    } else {
        Ok(sources)
    }
}

#[cfg(target_os = "linux")]
fn get_pulseaudio_default_source() -> Result<String, VoiceError> {
    use std::process::Command;

    // Use pactl to get the default source
    let output = Command::new("pactl")
        .args(["get-default-source"])
        .output()
        .map_err(|e| VoiceError::AudioDevice(format!("Failed to run pactl: {}", e)))?;

    if !output.status.success() {
        // Fallback to "default" if pactl fails
        return Ok("default".to_string());
    }

    let source = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if source.is_empty() {
        Ok("default".to_string())
    } else {
        Ok(source)
    }
}
