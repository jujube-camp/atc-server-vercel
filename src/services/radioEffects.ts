/**
 * Radio Effects Module for ATC Audio Processing
 * 
 * This module implements professional radio/walkie-talkie audio effects
 * to simulate realistic ATC tower communications.
 * 
 * Audio Processing Pipeline:
 * 1. TTS Generation → 2. Bandpass Filter → 3. Compressor → 4. White Noise → 5. Distortion → 6. Volume Envelope
 * 
 * Reference Configuration Presets:
 * 
 * STANDARD RADIO EFFECT (Recommended):
 * - RADIO_LOWPASS_FREQ: 3400 Hz
 * - RADIO_HIGHPASS_FREQ: 300 Hz
 * - RADIO_COMPRESSION: true
 * - RADIO_COMPRESSOR_THRESHOLD: -24 dB
 * - RADIO_COMPRESSOR_RATIO: 12:1
 * - RADIO_NOISE_LEVEL: 0.02
 * - RADIO_DISTORTION_LEVEL: 10
 * - RADIO_FLUCTUATION_INTENSITY: 0.1
 * 
 * LIGHT RADIO EFFECT:
 * - RADIO_NOISE_LEVEL: 0.01
 * - RADIO_DISTORTION_LEVEL: 5
 * - RADIO_FLUCTUATION_INTENSITY: 0.05
 * 
 * HEAVY RADIO EFFECT:
 * - RADIO_NOISE_LEVEL: 0.05
 * - RADIO_DISTORTION_LEVEL: 20
 * - RADIO_FLUCTUATION_INTENSITY: 0.2
 * 
 * CLEAR (No Effects):
 * - All effects disabled
 */

export interface RadioEffectsConfig {
  enabled: boolean;
  lowpassFreq: number;      // Default: 3400 Hz
  highpassFreq: number;     // Default: 300 Hz
  compression: boolean;
  compressorThreshold: number;  // Default: -24 dB
  compressorRatio: number;      // Default: 12:1
  compressorAttack: number;     // Default: 0.003 seconds
  compressorRelease: number;    // Default: 0.25 seconds
  noiseLevel: number;           // Default: 0.02 (0.0-0.1)
  distortion: boolean;
  distortionLevel: number;      // Default: 10
  volumeFluctuation: boolean;
  fluctuationIntensity: number; // Default: 0.1 (0.0-0.3)
}

export const DEFAULT_RADIO_CONFIG: RadioEffectsConfig = {
  enabled: true,
  lowpassFreq: 3400,
  highpassFreq: 300,
  compression: true,
  compressorThreshold: -24,
  compressorRatio: 12,
  compressorAttack: 0.003,
  compressorRelease: 0.25,
  noiseLevel: 0.02,
  distortion: true,
  distortionLevel: 10,
  volumeFluctuation: true,
  fluctuationIntensity: 0.1,
};

/**
 * Apply radio effects to audio buffer
 * @param audioBuffer - Input audio buffer (PCM 16-bit)
 * @param config - Radio effects configuration
 * @param sampleRate - Audio sample rate (default: 24000 Hz for Fish Audio)
 * @returns Processed audio buffer
 */
/**
 * Parse WAV header to extract audio parameters
 * Supports various WAV formats with different chunk orders
 */
function parseWavHeader(buffer: Buffer): {
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  dataOffset: number;
  dataSize: number;
} | null {
  // Check for RIFF header
  if (buffer.length < 44) {
    console.error('[WAV Parser] Buffer too small:', buffer.length);
    return null;
  }
  
  const riffHeader = buffer.toString('ascii', 0, 4);
  if (riffHeader !== 'RIFF') {
    console.error('[WAV Parser] Not a RIFF file, got:', riffHeader);
    return null;
  }
  
  // Check for WAVE format
  const waveFormat = buffer.toString('ascii', 8, 12);
  if (waveFormat !== 'WAVE') {
    console.error('[WAV Parser] Not a WAVE file, got:', waveFormat);
    return null;
  }
  
  // Search for chunks starting after WAVE header (offset 12)
  let offset = 12;
  let sampleRate = 0;
  let numChannels = 0;
  let bitsPerSample = 0;
  let dataOffset = 0;
  let dataSize = 0;
  
  // console.log('[WAV Parser] Scanning chunks...');
  
  while (offset < buffer.length - 8) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    
    // console.log(`[WAV Parser] Found chunk: "${chunkId}" at offset ${offset}, size: ${chunkSize}`);
    
    if (chunkId === 'fmt ') {
      // Parse format chunk
      numChannels = buffer.readUInt16LE(offset + 10);
      sampleRate = buffer.readUInt32LE(offset + 12);
      bitsPerSample = buffer.readUInt16LE(offset + 22);
    } else if (chunkId === 'data') {
      dataOffset = offset + 8;
      // Handle streaming WAV files where data chunk size is 0 or very small
      // In this case, calculate actual data size from buffer length
      if (chunkSize === 0 || chunkSize > buffer.length) {
        dataSize = buffer.length - dataOffset;
        // console.log(`[WAV Parser] Data chunk size is ${chunkSize}, using calculated size: ${dataSize}`);
      } else {
        dataSize = chunkSize;
      }
      // console.log(`[WAV Parser] Data chunk found: offset=${dataOffset}, size=${dataSize}`);
      // Found data chunk, we can break if we already have fmt info
      if (sampleRate > 0) {
        break;
      }
    }
    
    // Move to next chunk (chunk header is 8 bytes + chunk size)
    // Ensure chunkSize is valid to prevent infinite loop
    if (chunkSize === 0 && chunkId !== 'data') {
      console.warn(`[WAV Parser] Zero-size chunk "${chunkId}", skipping 8 bytes`);
      offset += 8;
    } else {
      offset += 8 + chunkSize;
      // WAV chunks are word-aligned (2-byte boundary)
      if (chunkSize % 2 !== 0) {
        offset += 1;
      }
    }
  }
  
  // Validate we found both fmt and data chunks
  if (sampleRate === 0 || dataOffset === 0) {
    console.error('[WAV Parser] Failed to find required chunks. sampleRate:', sampleRate, 'dataOffset:', dataOffset);
    // Fallback: assume standard 44-byte header
    console.log('[WAV Parser] Using fallback: standard 44-byte header');
    return {
      sampleRate: buffer.readUInt32LE(24),
      numChannels: buffer.readUInt16LE(22),
      bitsPerSample: buffer.readUInt16LE(34),
      dataOffset: 44,
      dataSize: buffer.length - 44,
    };
  }
  
  return {
    sampleRate,
    numChannels,
    bitsPerSample,
    dataOffset,
    dataSize,
  };
}

/**
 * Apply radio effects to audio buffer
 * @param audioBuffer - Input audio buffer (WAV or PCM)
 * @param config - Radio effects configuration
 * @param format - Audio format ('wav' or 'pcm')
 * @returns Processed audio buffer
 */
export async function applyRadioEffects(
  audioBuffer: Buffer,
  config: RadioEffectsConfig = DEFAULT_RADIO_CONFIG,
  format: string = 'wav'
): Promise<Buffer> {
  if (!config.enabled) {
    console.log('[RadioEffects] Effects disabled, returning original buffer');
    return audioBuffer;
  }

  // console.log('[RadioEffects] Starting radio effects processing...');
  // console.log(`[RadioEffects] Format: ${format}, Buffer size: ${audioBuffer.length} bytes`);

  try {
    const startTime = Date.now();
    
    let pcmData: Buffer;
    let wavHeader: Buffer | null = null;
    let sampleRate = 24000;
    let bitsPerSample = 16;
    
    // Handle WAV format
    if (format === 'wav') {
      const wavInfo = parseWavHeader(audioBuffer);
      if (wavInfo) {
        sampleRate = wavInfo.sampleRate;
        bitsPerSample = wavInfo.bitsPerSample;
        wavHeader = audioBuffer.subarray(0, wavInfo.dataOffset);
        pcmData = audioBuffer.subarray(wavInfo.dataOffset, wavInfo.dataOffset + wavInfo.dataSize);
        // console.log(`[RadioEffects] WAV parsed: ${sampleRate}Hz, ${wavInfo.numChannels}ch, ${bitsPerSample}bit`);
        // console.log(`[RadioEffects] Header size: ${wavHeader.length}, Data size: ${pcmData.length}`);
      } else {
        console.warn('[RadioEffects] Failed to parse WAV header, treating as raw PCM');
        pcmData = audioBuffer;
      }
    } else {
      pcmData = audioBuffer;
    }

    // Convert PCM to Float32Array for processing
    let samples = bufferToFloat32Array(pcmData, bitsPerSample);
    
    // Apply bandpass filter
    samples = applyBandpassFilter(samples, sampleRate, config.highpassFreq, config.lowpassFreq);
    
    // Apply compressor (AM compression simulation)
    if (config.compression) {
      samples = applyCompressor(
        samples,
        config.compressorThreshold,
        config.compressorRatio
      );
    }
    
    // Add white noise
    if (config.noiseLevel > 0) {
      samples = addWhiteNoise(samples, config.noiseLevel);
    }
    
    // Apply distortion
    if (config.distortion) {
      samples = applyDistortion(samples, config.distortionLevel);
    }
    
    // Apply volume fluctuation (signal strength simulation)
    if (config.volumeFluctuation) {
      samples = applyVolumeFluctuation(samples, sampleRate, config.fluctuationIntensity);
    }
    
    // Convert back to PCM buffer (always 16-bit output)
    const processedPcm = float32ArrayToBuffer(samples);
    
    // Reassemble WAV if original was WAV
    let result: Buffer;
    if (wavHeader) {
      // Update data size in header if needed
      const newDataSize = processedPcm.length;
      const newHeader = Buffer.from(wavHeader);
      
      // Update RIFF chunk size (file size - 8)
      newHeader.writeUInt32LE(newDataSize + newHeader.length - 8, 4);
      
      // Update data chunk size - find 'data' marker
      for (let i = 0; i < newHeader.length - 4; i++) {
        if (newHeader.toString('ascii', i, i + 4) === 'data') {
          newHeader.writeUInt32LE(newDataSize, i + 4);
          break;
        }
      }
      
      result = Buffer.concat([newHeader, processedPcm]);
    } else {
      result = processedPcm;
    }
    
    const processingTime = Date.now() - startTime;
    console.log(`[RadioEffects] Applied in ${processingTime}ms, output: ${result.length} bytes`);
    
    return result;
  } catch (error) {
    console.error('[RadioEffects] ❌ Radio effects processing failed:', error);
    return audioBuffer; // Return original on error
  }
}

/**
 * Apply bandpass filter (300-3400 Hz) to simulate radio frequency response
 * Uses Butterworth 4th-order bandpass filter
 * @param samples - Input samples
 * @param sampleRate - Sample rate
 * @param lowCutoff - High-pass frequency (default: 300 Hz)
 * @param highCutoff - Low-pass frequency (default: 3400 Hz)
 * @returns Filtered samples
 */
function applyBandpassFilter(
  samples: Float32Array,
  sampleRate: number,
  lowCutoff: number,
  highCutoff: number
): Float32Array {
  // Butterworth bandpass filter implementation
  const nyquist = sampleRate / 2;
  const low = lowCutoff / nyquist;
  const high = highCutoff / nyquist;
  
  // Create filter coefficients for 4th-order Butterworth filter
  const { b, a } = butterworth4thOrderBandpass(low, high);
  
  // Apply filter (forward-backward filtering for zero phase distortion)
  return filtfilt(samples, b, a);
}

/**
 * Apply compressor to simulate AM compression
 * Controls dynamic range with threshold and ratio
 * @param samples - Input samples
 * @param threshold - Compression threshold in dB (default: -24)
 * @param ratio - Compression ratio (default: 12:1)
 * @returns Compressed samples
 */
function applyCompressor(
  samples: Float32Array,
  threshold: number,
  ratio: number
): Float32Array {
  const result = new Float32Array(samples.length);
  const thresholdLinear = Math.pow(10, threshold / 20);
  
  // Normalize
  let maxVal = 0;
  for (let i = 0; i < samples.length; i++) {
    maxVal = Math.max(maxVal, Math.abs(samples[i]));
  }
  
  for (let i = 0; i < samples.length; i++) {
    let sample = maxVal > 0 ? samples[i] / maxVal : samples[i];
    
    // Apply compression
    if (Math.abs(sample) > thresholdLinear) {
      const sign = sample >= 0 ? 1 : -1;
      const compressed = thresholdLinear + (Math.abs(sample) - thresholdLinear) / ratio;
      sample = sign * compressed;
    }
    
    // Restore amplitude
    result[i] = sample * maxVal;
  }
  
  return result;
}

/**
 * Add white noise to simulate radio static background
 * @param samples - Input samples
 * @param noiseLevel - Noise level (0.0-0.1, default: 0.02)
 * @returns Samples with noise
 */
function addWhiteNoise(samples: Float32Array, noiseLevel: number): Float32Array {
  const result = new Float32Array(samples.length);
  
  // Calculate signal amplitude
  let maxVal = 0;
  for (let i = 0; i < samples.length; i++) {
    maxVal = Math.max(maxVal, Math.abs(samples[i]));
  }
  
  // Add Gaussian white noise
  for (let i = 0; i < samples.length; i++) {
    const noise = gaussianRandom() * noiseLevel * maxVal;
    result[i] = samples[i] + noise;
  }
  
  return result;
}

/**
 * Apply distortion to simulate radio non-linearity
 * Uses tanh function for soft clipping
 * @param samples - Input samples
 * @param distortionLevel - Distortion level (default: 10)
 * @returns Distorted samples
 */
function applyDistortion(samples: Float32Array, distortionLevel: number): Float32Array {
  const result = new Float32Array(samples.length);
  
  // Normalize
  let maxVal = 0;
  for (let i = 0; i < samples.length; i++) {
    maxVal = Math.max(maxVal, Math.abs(samples[i]));
  }
  
  const gain = 1 + distortionLevel / 100;
  
  for (let i = 0; i < samples.length; i++) {
    const normalized = maxVal > 0 ? samples[i] / maxVal : samples[i];
    const distorted = Math.tanh(normalized * gain);
    result[i] = distorted * maxVal;
  }
  
  return result;
}

/**
 * Apply volume fluctuation to simulate signal strength variation
 * Uses multiple frequency modulation
 * @param samples - Input samples
 * @param sampleRate - Sample rate
 * @param intensity - Fluctuation intensity (0.0-0.3, default: 0.1)
 * @returns Modulated samples
 */
function applyVolumeFluctuation(
  samples: Float32Array,
  sampleRate: number,
  intensity: number
): Float32Array {
  const result = new Float32Array(samples.length);
  const duration = samples.length / sampleRate;
  
  for (let i = 0; i < samples.length; i++) {
    const t = (i / samples.length) * duration;
    
    // Multi-frequency modulation
    const modulation =
      0.5 * Math.sin(2 * Math.PI * 0.5 * t) +  // 0.5 Hz
      0.3 * Math.sin(2 * Math.PI * 1.2 * t) +  // 1.2 Hz
      0.2 * Math.sin(2 * Math.PI * 2.8 * t);   // 2.8 Hz
    
    const envelope = 1 + intensity * modulation;
    result[i] = samples[i] * envelope;
  }
  
  return result;
}

// ============================================================================
// DSP Helper Functions
// ============================================================================

/**
 * Convert Buffer to Float32Array
 * @param buffer - PCM buffer
 * @param bitsPerSample - 16 or 32 bit
 */
function bufferToFloat32Array(buffer: Buffer, bitsPerSample: number = 16): Float32Array {
  if (bitsPerSample === 32) {
    // 32-bit float PCM
    const samples = new Float32Array(buffer.length / 4);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = buffer.readFloatLE(i * 4);
    }
    return samples;
  }
  
  // 16-bit PCM (default)
  const samples = new Float32Array(buffer.length / 2);
  for (let i = 0; i < samples.length; i++) {
    const sample = buffer.readInt16LE(i * 2);
    samples[i] = sample / 32768.0;
  }
  return samples;
}

/**
 * Convert Float32Array to Buffer (Float32 → PCM 16-bit)
 */
function float32ArrayToBuffer(samples: Float32Array): Buffer {
  const buffer = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    // Clamp to [-1.0, 1.0]
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    // Convert to 16-bit integer
    const sample = Math.round(clamped * 32767);
    buffer.writeInt16LE(sample, i * 2);
  }
  return buffer;
}

/**
 * Design Butterworth 4th-order bandpass filter coefficients
 * Simplified implementation using bilinear transform
 */
function butterworth4thOrderBandpass(
  lowNorm: number,
  highNorm: number
): { b: number[]; a: number[] } {
  // Simplified 4th-order Butterworth bandpass filter
  // This is a basic implementation - for production, consider using a DSP library
  
  const Q = 1 / (highNorm - lowNorm);
  const centerFreq = Math.sqrt(lowNorm * highNorm);
  const omega = 2 * Math.PI * centerFreq;
  const alpha = Math.sin(omega) / (2 * Q);
  
  // Biquad filter coefficients
  const b = [alpha, 0, -alpha];
  const a = [1 + alpha, -2 * Math.cos(omega), 1 - alpha];
  
  return { b, a };
}

/**
 * Apply filter forward and backward (zero-phase filtering)
 * Implements filtfilt similar to scipy.signal.filtfilt
 */
function filtfilt(samples: Float32Array, b: number[], a: number[]): Float32Array {
  // Forward filter
  const forward = filter(samples, b, a);
  
  // Reverse
  const reversed = new Float32Array(forward.length);
  for (let i = 0; i < forward.length; i++) {
    reversed[i] = forward[forward.length - 1 - i];
  }
  
  // Backward filter
  const backward = filter(reversed, b, a);
  
  // Reverse again
  const result = new Float32Array(backward.length);
  for (let i = 0; i < backward.length; i++) {
    result[i] = backward[backward.length - 1 - i];
  }
  
  return result;
}

/**
 * Apply IIR filter (Direct Form II)
 */
function filter(samples: Float32Array, b: number[], a: number[]): Float32Array {
  const result = new Float32Array(samples.length);
  const orderB = b.length - 1;
  const orderA = a.length - 1;
  
  // State variables
  const w = new Float32Array(Math.max(orderB, orderA) + 1);
  
  // Normalize coefficients by a[0]
  const a0 = a[0];
  const bNorm = b.map(coef => coef / a0);
  const aNorm = a.map(coef => coef / a0);
  
  for (let n = 0; n < samples.length; n++) {
    // Compute w[0]
    w[0] = samples[n];
    for (let k = 1; k <= orderA; k++) {
      w[0] -= aNorm[k] * w[k];
    }
    
    // Compute output
    result[n] = 0;
    for (let k = 0; k <= orderB; k++) {
      result[n] += bNorm[k] * w[k];
    }
    
    // Shift state
    for (let k = w.length - 1; k > 0; k--) {
      w[k] = w[k - 1];
    }
  }
  
  return result;
}

/**
 * Generate Gaussian random number (Box-Muller transform)
 */
function gaussianRandom(): number {
  let u1 = 0, u2 = 0;
  while (u1 === 0) u1 = Math.random(); // Converting [0,1) to (0,1)
  while (u2 === 0) u2 = Math.random();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

// ============================================================================
// Preset Configurations
// ============================================================================

/**
 * Standard radio effect configuration (recommended)
 */
export const STANDARD_RADIO_CONFIG: RadioEffectsConfig = {
  enabled: true,
  lowpassFreq: 3400,
  highpassFreq: 300,
  compression: true,
  compressorThreshold: -24,
  compressorRatio: 12,
  compressorAttack: 0.003,
  compressorRelease: 0.25,
  noiseLevel: 0.02,
  distortion: true,
  distortionLevel: 10,
  volumeFluctuation: true,
  fluctuationIntensity: 0.1,
};

/**
 * Light radio effect configuration
 * Optimized for voice clarity with minimal radio character
 */
export const LIGHT_RADIO_CONFIG: RadioEffectsConfig = {
  ...STANDARD_RADIO_CONFIG,
  // Extended frequency range for better voice clarity
  highpassFreq: 100,        // Keep more bass presence
  lowpassFreq: 8000,        // Keep more high frequency detail
  // Minimal compression for natural dynamics
  compression: true,
  compressorThreshold: -12, // Higher threshold = less compression
  compressorRatio: 4,       // Gentle ratio for natural sound
  // All extra effects disabled
  noiseLevel: 0,
  distortion: false,
  distortionLevel: 0,
  volumeFluctuation: false,
  fluctuationIntensity: 0,
};

/**
 * Heavy radio effect configuration
 */
export const HEAVY_RADIO_CONFIG: RadioEffectsConfig = {
  ...STANDARD_RADIO_CONFIG,
  noiseLevel: 0.05,
  distortionLevel: 20,
  fluctuationIntensity: 0.2,
};

/**
 * Clear audio (no effects)
 */
export const CLEAR_CONFIG: RadioEffectsConfig = {
  enabled: false,
  lowpassFreq: 3400,
  highpassFreq: 300,
  compression: false,
  compressorThreshold: -24,
  compressorRatio: 12,
  compressorAttack: 0.003,
  compressorRelease: 0.25,
  noiseLevel: 0.0,
  distortion: false,
  distortionLevel: 0,
  volumeFluctuation: false,
  fluctuationIntensity: 0.0,
};

