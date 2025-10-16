# Audio Output Directory

This directory contains WAV audio files generated from Jarvis SDK audio streams.

## Generated Files

Files are automatically named with the pattern: `audio_[random-hex].wav`

Example: `audio_a3f2c8.wav`

## How It Works

1. The SDK streams audio chunks as Base64-encoded PCM Float32 data
2. Chunks are collected by the `.onAudioChunk()` handler
3. On stream completion, chunks are combined and encoded as a 16-bit WAV file
4. The file is saved to this directory

## Audio Specifications

- **Format**: WAV (16-bit PCM)
- **Sample Rate**: 24,000 Hz (24 kHz - standard for TTS)
- **Channels**: Mono (1 channel)
- **Encoding**: 16-bit signed integer

> **Note**: TTS engines typically output at 24kHz. Using the wrong sample rate (e.g., 44.1kHz) will make the audio play too fast and sound high-pitched.

## Usage in Tests

See `tests/client-test.js` for implementation details.
