//! Audio utility functions for format conversion

/// Convert i16 PCM samples to f32 normalized samples
/// 
/// Whisper expects f32 samples in the range [-1.0, 1.0]
pub fn convert_i16_to_f32(samples: &[i16]) -> Vec<f32> {
    samples
        .iter()
        .map(|&s| s as f32 / i16::MAX as f32)
        .collect()
}

/// Convert f32 normalized samples back to i16 PCM
pub fn convert_f32_to_i16(samples: &[f32]) -> Vec<i16> {
    samples
        .iter()
        .map(|&s| (s * i16::MAX as f32) as i16)
        .collect()
}

/// Convert stereo samples to mono by averaging channels
pub fn stereo_to_mono(samples: &[f32]) -> Vec<f32> {
    samples
        .chunks(2)
        .map(|chunk| {
            if chunk.len() == 2 {
                (chunk[0] + chunk[1]) / 2.0
            } else {
                chunk[0]
            }
        })
        .collect()
}

/// Resample audio from one sample rate to another
/// 
/// Uses simple linear interpolation. For high-quality resampling,
/// consider using a proper resampling library.
pub fn resample(samples: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
    if from_rate == to_rate {
        return samples.to_vec();
    }
    
    let ratio = from_rate as f64 / to_rate as f64;
    let new_len = (samples.len() as f64 / ratio) as usize;
    let mut resampled = Vec::with_capacity(new_len);
    
    for i in 0..new_len {
        let src_idx = i as f64 * ratio;
        let src_idx_floor = src_idx.floor() as usize;
        let src_idx_ceil = (src_idx_floor + 1).min(samples.len() - 1);
        let frac = src_idx - src_idx_floor as f64;
        
        let sample = samples[src_idx_floor] as f64 * (1.0 - frac) 
                   + samples[src_idx_ceil] as f64 * frac;
        resampled.push(sample as f32);
    }
    
    resampled
}

/// Calculate RMS (Root Mean Square) audio level
/// 
/// Returns a value between 0.0 and 1.0 representing the audio level
pub fn calculate_rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    
    let sum_squares: f32 = samples.iter().map(|&s| s * s).sum();
    (sum_squares / samples.len() as f32).sqrt()
}

/// Calculate peak audio level
/// 
/// Returns the maximum absolute sample value
pub fn calculate_peak(samples: &[f32]) -> f32 {
    samples
        .iter()
        .map(|&s| s.abs())
        .max_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
        .unwrap_or(0.0)
}

/// Normalize audio to a target peak level
pub fn normalize(samples: &mut [f32], target_peak: f32) {
    let current_peak = calculate_peak(samples);
    if current_peak > 0.0 {
        let scale = target_peak / current_peak;
        for sample in samples.iter_mut() {
            *sample *= scale;
        }
    }
}

/// Apply simple noise gate (silence detection)
/// 
/// Returns true if the audio chunk is considered silence
pub fn is_silence(samples: &[f32], threshold: f32) -> bool {
    calculate_rms(samples) < threshold
}

/// Whisper's required sample rate
pub const WHISPER_SAMPLE_RATE: u32 = 16000;

/// Whisper's required number of channels (mono)
pub const WHISPER_CHANNELS: u16 = 1;

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_i16_f32_conversion() {
        let i16_samples = vec![0i16, i16::MAX, i16::MIN, i16::MAX / 2];
        let f32_samples = convert_i16_to_f32(&i16_samples);
        
        assert!((f32_samples[0] - 0.0).abs() < 0.001);
        assert!((f32_samples[1] - 1.0).abs() < 0.001);
        assert!((f32_samples[2] - (-1.0)).abs() < 0.001);
    }
    
    #[test]
    fn test_stereo_to_mono() {
        let stereo = vec![0.5f32, 0.5, 1.0, 0.0, -0.5, 0.5];
        let mono = stereo_to_mono(&stereo);
        
        assert_eq!(mono.len(), 3);
        assert!((mono[0] - 0.5).abs() < 0.001);
        assert!((mono[1] - 0.5).abs() < 0.001);
        assert!((mono[2] - 0.0).abs() < 0.001);
    }
    
    #[test]
    fn test_rms_calculation() {
        let silence = vec![0.0f32; 100];
        assert_eq!(calculate_rms(&silence), 0.0);
        
        let loud = vec![1.0f32; 100];
        assert!((calculate_rms(&loud) - 1.0).abs() < 0.001);
    }
}
