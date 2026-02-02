/**
 * Test Script: Multi-Level Audio Noise & Corruption System
 * 多等级音频噪音和破坏系统
 * 
 * 支持5个等级，从轻微干扰到极度恶劣
 * Level 1: 轻微干扰 - 清晰但有轻微背景噪音
 * Level 2: 中度干扰 - 明显噪音，偶尔断续
 * Level 3: 严重干扰 - 大量噪音，频繁丢帧
 * Level 4: 极度恶劣 - 严重破坏，难以理解
 * Level 5: 几乎不可用 - 极端破坏，几乎无法识别
 * 
 * 使用方法：
 * npm run test-audio-noise [level] [inputFile] [outputFile]
 * 例如：npm run test-audio-noise 3
 */

import ffmpeg from 'fluent-ffmpeg';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// 音频处理参数配置接口
interface AudioConfig {
  // 降采样参数
  downsampleRate: number;        // 降采样频率 (Hz)
  
  // Tremolo 参数（音量波动）
  tremoloFreq: number;           // 波动频率 (Hz)
  tremoloDepth: number;          // 波动深度 (0-1)
  
  // Noise Gate 参数（丢帧模拟）
  gateThreshold: number;         // 门限阈值 (0-1)
  gateRatio: number;             // 压缩比
  gateAttack: number;            // 启动时间 (ms)
  gateRelease: number;           // 释放时间 (ms)
  
  // Compand 参数（动态压缩）
  compandAttack: number;         // 启动时间 (s)
  compandDecay: number;          // 衰减时间 (s)
  compandSoftKnee: number;       // 软拐点 (dB)
  
  // Random Dropout 参数（随机丢帧）
  dropoutNoiseLevel: number;     // 随机噪声级别 (0-1)
  dropoutThreshold: number;      // 丢帧门限 (0-1)
  dropoutRatio: number;          // 丢帧比例
  dropoutWeight: number;         // 丢帧权重 (0-1)
  
  // 削波失真参数
  clipVolume: number;            // 削波前增益
  clipLimit: number;             // 削波限制 (0-1)
  
  // 音频音量
  audioVolume: number;           // 最终音频音量 (0-1)
  
  // 噪音参数
  brownNoiseLevel: number;       // Brown noise 级别
  whiteNoiseLevel: number;       // White noise 级别
  pinkNoiseLevel: number;        // Pink noise 级别
  
  // 噪音处理参数
  compressorThreshold: number;   // 压缩器门限 (dB)
  compressorRatio: number;       // 压缩比
  trebleGain: number;            // 高频增益 (dB)
  trebleFreq: number;            // 高频中心频率 (Hz)
  noiseVolume: number;           // 噪音增益
  noiseClipLimit: number;        // 噪音削波限制
  
  // 最终混合权重
  audioWeight: number;           // 音频权重
  noiseWeight: number;           // 噪音权重
}

// 6个等级的预设配置 (0-5)
const LEVEL_CONFIGS: Record<number, AudioConfig> = {
  0: {
    // Level 0: 无干扰 - 原始音频，不做任何处理
    downsampleRate: 44100, // 保持原采样率
    tremoloFreq: 0,
    tremoloDepth: 0,
    gateThreshold: 0,
    gateRatio: 1,
    gateAttack: 0,
    gateRelease: 0,
    compandAttack: 0,
    compandDecay: 0,
    compandSoftKnee: 0,
    dropoutNoiseLevel: 0,
    dropoutThreshold: 1,
    dropoutRatio: 1,
    dropoutWeight: 0,
    clipVolume: 1,
    clipLimit: 1,
    audioVolume: 1,
    brownNoiseLevel: 0,
    whiteNoiseLevel: 0,
    pinkNoiseLevel: 0,
    compressorThreshold: 0,
    compressorRatio: 1,
    trebleGain: 0,
    trebleFreq: 5000,
    noiseVolume: 0,
    noiseClipLimit: 1,
    audioWeight: 1,
    noiseWeight: 0,
  },
  1: {
    // Level 1: 轻微干扰 - 清晰但有轻微背景噪音
    downsampleRate: 16000,
    tremoloFreq: 0.5,
    tremoloDepth: 0.2,
    gateThreshold: 0.01,
    gateRatio: 2,
    gateAttack: 5,
    gateRelease: 100,
    compandAttack: 0.1,
    compandDecay: 1.0,
    compandSoftKnee: 10,
    dropoutNoiseLevel: 0.05,
    dropoutThreshold: 0.8,
    dropoutRatio: 5,
    dropoutWeight: 0.2,
    clipVolume: 1.05,
    clipLimit: 0.9,
    audioVolume: 0.9,
    brownNoiseLevel: 0.01,
    whiteNoiseLevel: 0.008,
    pinkNoiseLevel: 0.006,
    compressorThreshold: -30,
    compressorRatio: 4,
    trebleGain: 2,
    trebleFreq: 5000,
    noiseVolume: 1.1,
    noiseClipLimit: 0.95,
    audioWeight: 1.0,
    noiseWeight: 0.3,
  },
  2: {
    // Level 2: 中度干扰 - 明显噪音，偶尔断续
    downsampleRate: 12000,
    tremoloFreq: 1.5,
    tremoloDepth: 0.4,
    gateThreshold: 0.015,
    gateRatio: 5,
    gateAttack: 3,
    gateRelease: 80,
    compandAttack: 0.05,
    compandDecay: 0.7,
    compandSoftKnee: 8,
    dropoutNoiseLevel: 0.15,
    dropoutThreshold: 0.65,
    dropoutRatio: 10,
    dropoutWeight: 0.4,
    clipVolume: 1.1,
    clipLimit: 0.8,
    audioVolume: 0.75,
    brownNoiseLevel: 0.03,
    whiteNoiseLevel: 0.025,
    pinkNoiseLevel: 0.02,
    compressorThreshold: -25,
    compressorRatio: 8,
    trebleGain: 4,
    trebleFreq: 5000,
    noiseVolume: 1.2,
    noiseClipLimit: 0.9,
    audioWeight: 0.85,
    noiseWeight: 0.7,
  },
  3: {
    // Level 3: 严重干扰 - 大量噪音，频繁丢帧
    downsampleRate: 10000,
    tremoloFreq: 3,
    tremoloDepth: 0.6,
    gateThreshold: 0.02,
    gateRatio: 8,
    gateAttack: 2,
    gateRelease: 60,
    compandAttack: 0.01,
    compandDecay: 0.5,
    compandSoftKnee: 6,
    dropoutNoiseLevel: 0.25,
    dropoutThreshold: 0.55,
    dropoutRatio: 15,
    dropoutWeight: 0.6,
    clipVolume: 1.15,
    clipLimit: 0.7,
    audioVolume: 0.6,
    brownNoiseLevel: 0.06,
    whiteNoiseLevel: 0.05,
    pinkNoiseLevel: 0.04,
    compressorThreshold: -22,
    compressorRatio: 12,
    trebleGain: 6,
    trebleFreq: 5000,
    noiseVolume: 1.3,
    noiseClipLimit: 0.85,
    audioWeight: 0.7,
    noiseWeight: 1.1,
  },
  4: {
    // Level 4: 极度恶劣 - 严重破坏，难以理解
    downsampleRate: 8000,
    tremoloFreq: 5,
    tremoloDepth: 0.8,
    gateThreshold: 0.025,
    gateRatio: 12,
    gateAttack: 1,
    gateRelease: 50,
    compandAttack: 0.005,
    compandDecay: 0.4,
    compandSoftKnee: 4,
    dropoutNoiseLevel: 0.35,
    dropoutThreshold: 0.5,
    dropoutRatio: 18,
    dropoutWeight: 0.75,
    clipVolume: 1.2,
    clipLimit: 0.6,
    audioVolume: 0.5,
    brownNoiseLevel: 0.1,
    whiteNoiseLevel: 0.08,
    pinkNoiseLevel: 0.065,
    compressorThreshold: -20,
    compressorRatio: 16,
    trebleGain: 8,
    trebleFreq: 5000,
    noiseVolume: 1.4,
    noiseClipLimit: 0.8,
    audioWeight: 0.6,
    noiseWeight: 1.4,
  },
  5: {
    // Level 5: 几乎不可用 - 极端破坏，几乎无法识别
    downsampleRate: 6000,
    tremoloFreq: 8,
    tremoloDepth: 0.95,
    gateThreshold: 0.03,
    gateRatio: 20,
    gateAttack: 0.5,
    gateRelease: 40,
    compandAttack: 0.001,
    compandDecay: 0.3,
    compandSoftKnee: 3,
    dropoutNoiseLevel: 0.5,
    dropoutThreshold: 0.45,
    dropoutRatio: 25,
    dropoutWeight: 0.9,
    clipVolume: 1.3,
    clipLimit: 0.5,
    audioVolume: 0.4,
    brownNoiseLevel: 0.15,
    whiteNoiseLevel: 0.12,
    pinkNoiseLevel: 0.1,
    compressorThreshold: -18,
    compressorRatio: 20,
    trebleGain: 10,
    trebleFreq: 5000,
    noiseVolume: 1.5,
    noiseClipLimit: 0.75,
    audioWeight: 0.5,
    noiseWeight: 1.8,
  },
};

const INPUT_FILE = join(process.cwd(), 'scripts', 'test-audio-input.mp3');
const OUTPUT_FILE = join(process.cwd(), 'scripts', 'test-audio-output-simple.mp3');

async function processAudio(level: number, inputFile: string, outputFile: string) {
  const config = LEVEL_CONFIGS[level];
  if (!config) {
    throw new Error(`Invalid level: ${level}. Must be 0-5.`);
  }

  const levelNames = ['无干扰 (原始)', '轻微干扰', '中度干扰', '严重干扰', '极度恶劣', '几乎不可用'];
  
  console.log('🎵 Multi-Level Audio Noise Processing');
  console.log(`📊 Level: ${level} - ${levelNames[level]}`);
  console.log(`📁 Input: ${inputFile}`);
  console.log(`📁 Output: ${outputFile}`);
  
  // Level 0: 直接复制原音频，不做任何处理
  if (level === 0) {
    console.log(`\n✨ Level 0: Copying original audio without any processing...\n`);
    
    return new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(inputFile)
        .outputFormat('mp3')
        .audioCodec('libmp3lame')
        .audioBitrate('192k')
        .on('start', (cmd) => {
          console.log('▶️  FFmpeg command:', cmd);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`⏳ Processing: ${progress.percent.toFixed(1)}%`);
          }
        })
        .on('end', () => {
          console.log('✅ Processing complete!');
          resolve();
        })
        .on('error', (err) => {
          console.error('❌ Error:', err.message);
          reject(err);
        })
        .save(outputFile);
    });
  }
  
  // Level 1-5: 应用各种音频处理效果
  console.log(`\n📋 Configuration:`);
  console.log(`   Downsample: ${config.downsampleRate}Hz`);
  console.log(`   Tremolo: f=${config.tremoloFreq}Hz, d=${config.tremoloDepth}`);
  console.log(`   Dropout: ${(config.dropoutWeight * 100).toFixed(0)}% probability`);
  console.log(`   Audio Volume: ${(config.audioVolume * 100).toFixed(0)}%`);
  console.log(`   Noise Mix: Brown=${config.brownNoiseLevel.toFixed(3)}, White=${config.whiteNoiseLevel.toFixed(3)}, Pink=${config.pinkNoiseLevel.toFixed(3)}`);
  console.log(`   Final Mix: Audio=${config.audioWeight.toFixed(1)}, Noise=${config.noiseWeight.toFixed(1)}\n`);

  return new Promise<void>((resolve, reject) => {
    // Use a generous duration to ensure noise covers entire audio
    // The duration=longest parameter will handle proper synchronization
    const noiseDuration = 60; // 60 seconds should cover most test audio files
    
    ffmpeg()
      .input(inputFile)
      .complexFilter([
        // === 原始音频破坏性处理 ===
        
        // 1. 降低采样率制造数字失真
        `[0:a]aresample=${config.downsampleRate}[lowrate]`,
        
        // 2. 恢复采样率但保留失真效果
        '[lowrate]aresample=44100[restored]',
        
        // 3. 添加随机音量波动（模拟信号不稳定）
        `[restored]tremolo=f=${config.tremoloFreq}:d=${config.tremoloDepth}[tremolo]`,
        
        // 4. 添加噪声门，随机切断低音量片段（模拟丢帧）
        `[tremolo]agate=threshold=${config.gateThreshold}:ratio=${config.gateRatio}:attack=${config.gateAttack}:release=${config.gateRelease}:makeup=1[gated1]`,
        
        // 5. 使用 compand 制造门控效果（压缩/扩展制造断续）
        `[gated1]compand=attacks=${config.compandAttack}:decays=${config.compandDecay}:points=-90/-90|-50/-50|-40/-20|-30/-10|-20/-5:soft-knee=${config.compandSoftKnee}[gated2]`,
        
        // 6. 随机丢帧效果 - 使用随机噪声控制音量
        `anoisesrc=d=${noiseDuration}:c=white:r=44100:a=${config.dropoutNoiseLevel}[random]`,
        `[random]agate=threshold=${config.dropoutThreshold}:ratio=${config.dropoutRatio}:attack=0.1:release=5[dropout_mask]`,
        `[gated2][dropout_mask]amix=inputs=2:duration=longest:weights=1 ${config.dropoutWeight}[with_dropouts]`,
        
        // 7. 添加削波失真
        `[with_dropouts]volume=${config.clipVolume},alimiter=limit=${config.clipLimit}[clipped]`,
        
        // 8. 调整音频音量
        `[clipped]volume=${config.audioVolume}[audio]`,
        
        // === 噪音层级生成 ===
        
        // Layer 1: Brown noise（低频嗡嗡声）
        `anoisesrc=d=${noiseDuration}:c=brown:r=44100:a=${config.brownNoiseLevel}[noise1]`,
        
        // Layer 2: White noise（全频段嘶嘶声）
        `anoisesrc=d=${noiseDuration}:c=white:r=44100:a=${config.whiteNoiseLevel}[noise2]`,
        
        // Layer 3: Pink noise（中频噪音）
        `anoisesrc=d=${noiseDuration}:c=pink:r=44100:a=${config.pinkNoiseLevel}[noise3]`,
        
        // 混合三种噪音 - 使用 longest 确保覆盖整个音频
        '[noise1][noise2][noise3]amix=inputs=3:duration=longest[base_noise]',
        
        // 添加压缩失真效果
        `[base_noise]acompressor=threshold=${config.compressorThreshold}dB:ratio=${config.compressorRatio}:attack=5:release=50[compressed]`,
        
        // 添加高频增强，让嘶嘶声更刺耳
        `[compressed]treble=g=${config.trebleGain}:f=${config.trebleFreq}[harsh_noise]`,
        
        // 添加削波失真
        `[harsh_noise]volume=${config.noiseVolume},alimiter=limit=${config.noiseClipLimit}[clipped_noise]`,
        
        // === 最终混合 ===
        // 使用 duration=longest 确保噪音持续到音频结束
        `[audio][clipped_noise]amix=inputs=2:duration=longest:weights=${config.audioWeight} ${config.noiseWeight}[out]`
      ].join(';'), 'out')
      .outputFormat('mp3')
      .on('start', (cmd) => {
        console.log('▶️  FFmpeg command:', cmd);
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          console.log(`⏳ Processing: ${progress.percent.toFixed(1)}%`);
        }
      })
      .on('end', () => {
        console.log('✅ Processing complete!');
        resolve();
      })
      .on('error', (err) => {
        console.error('❌ Error:', err.message);
        reject(err);
      })
      .save(outputFile);
  });
}

// 解析命令行参数
function parseArgs() {
  const levelArg = process.argv[2];
  const level = levelArg !== undefined ? parseInt(levelArg) : 3; // 默认 Level 3
  const inputFile = process.argv[3] || INPUT_FILE;
  const outputFile = process.argv[4] || OUTPUT_FILE;
  
  return { level, inputFile, outputFile };
}

// 显示使用说明
function showUsage() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║         Multi-Level Audio Noise Processing System             ║
╚════════════════════════════════════════════════════════════════╝

Usage: npm run test-audio-noise [level] [inputFile] [outputFile]

Parameters:
  level       - Noise level (0-5), default: 3
  inputFile   - Input audio file path (optional)
  outputFile  - Output audio file path (optional)

Levels:
  0 - 无干扰 (Original)     : 原始音频，不做任何处理
  1 - 轻微干扰 (Light)      : 清晰但有轻微背景噪音
  2 - 中度干扰 (Moderate)   : 明显噪音，偶尔断续
  3 - 严重干扰 (Severe)     : 大量噪音，频繁丢帧
  4 - 极度恶劣 (Extreme)    : 严重破坏，难以理解
  5 - 几乎不可用 (Critical) : 极端破坏，几乎无法识别

Examples:
  npm run test-audio-noise 0
  npm run test-audio-noise 1
  npm run test-audio-noise 3 input.mp3 output.mp3
  npm run test-audio-noise 5

`);
}

// Run test
const args = parseArgs();

// 验证 level
if (args.level < 0 || args.level > 5) {
  console.error('❌ Error: Level must be between 0 and 5\n');
  showUsage();
  process.exit(1);
}

// 显示欢迎信息
console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║         Multi-Level Audio Noise Processing System             ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

processAudio(args.level, args.inputFile, args.outputFile)
  .then(() => {
    console.log('\n✨ Test completed successfully!');
    console.log(`🎧 Listen to: ${args.outputFile}`);
    console.log('\n💡 Tip: Try different levels (0-5) to compare the effects!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Test failed:', error);
    process.exit(1);
  });
