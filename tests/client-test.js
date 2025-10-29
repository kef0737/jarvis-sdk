// Manual test script for Jarvis SDK

import { JarvisClient } from '../dist/src/index.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Encode Float32Array PCM to WAV (16-bit PCM)
 */
function encodeWAV(samples, sampleRate) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  let offset = 0;

  function writeString(str) {
    buffer.write(str, offset, "ascii");
    offset += str.length;
  }

  writeString("RIFF");
  buffer.writeUInt32LE(36 + samples.length * 2, offset);
  offset += 4;
  writeString("WAVE");
  writeString("fmt ");
  buffer.writeUInt32LE(16, offset); // Subchunk1Size
  offset += 4;
  buffer.writeUInt16LE(1, offset); // PCM format
  offset += 2;
  buffer.writeUInt16LE(1, offset); // Mono
  offset += 2;
  buffer.writeUInt32LE(sampleRate, offset); // SampleRate
  offset += 4;
  buffer.writeUInt32LE(sampleRate * 2, offset); // ByteRate
  offset += 4;
  buffer.writeUInt16LE(2, offset); // BlockAlign
  offset += 2;
  buffer.writeUInt16LE(16, offset); // BitsPerSample
  offset += 2;
  writeString("data");
  buffer.writeUInt32LE(samples.length * 2, offset);
  offset += 4;

  // Write PCM samples as 16-bit
  for (let i = 0; i < samples.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, Number(samples[i])));
    buffer.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7fff, offset);
  }

  return buffer;
}

/**
 * Combine Base64 PCM Float32 chunks into a WAV Buffer
 * @param chunks Array of Base64 PCM Float32 strings
 * @param sampleRate Audio sample rate (default 24000 for TTS)
 * @returns Buffer — WAV file buffer
 */
function combinePCMChunksToWav(chunks, sampleRate = 24000) {
  // Convert each Base64 chunk into Float32Array
  const pcmArrays = chunks.map((b64) => {
    const binary = Buffer.from(b64, "base64");
    return new Float32Array(binary.buffer, binary.byteOffset, binary.byteLength / 4);
  });

  // Flatten all Float32Arrays
  const totalLength = pcmArrays.reduce((sum, arr) => sum + arr.length, 0);
  const interleaved = new Float32Array(totalLength);
  let offset = 0;
  for (const arr of pcmArrays) {
    interleaved.set(arr, offset);
    offset += arr.length;
  }

  // Encode to WAV
  const wavBuffer = encodeWAV(interleaved, sampleRate);
  return wavBuffer;
}

/**
 * Save WAV buffer to a file
 */
function saveWavToFile(wavBuffer, outputDir = "./audio") {
  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  // Generate a random file name
  const fileName = `audio_${crypto.randomBytes(6).toString("hex")}.wav`;
  const filePath = path.join(outputDir, fileName);

  // Write buffer to file
  fs.writeFileSync(filePath, wavBuffer);

  console.log(`✅ WAV file saved: ${filePath}`);
  return filePath;
}

async function manualTest() {
  try {
    const client = new JarvisClient({
      baseUrl: "http://localhost:3000/api",
      timeout: 10000,
      // apiKey: "52455986",
      apiKey: "89045099",
      client_id: "test-instance"
    });

    await client.realtime.connect();

    client.realtime.handler.onOutput((payload) => {
      console.log('Received realtime message:', payload);
    });

    client.realtime.send_message({ type: "broadcast", event: "broadcast", payload: { message: "Hello from Jarvis SDK!" } });

    await new Promise((resolve) => setTimeout(resolve, 5000));

    await client.realtime.disconnect();

    // console.log('Starting manual test for Jarvis SDK...');
    // console.log('Testing the new fluent API:');

    // // // Test 1: Non-streaming request
    // // console.log('\n1. Testing non-streaming jarvis request:');
    // // try {
    // //   const response = await client.jarvis.jarvis('Hello, how are you?');
    // //   console.log('Response:', response);
    // // } catch (error) {
    // //   console.log('Non-streaming request failed (expected if server not running):', error.message);
    // // }

    // // Test 2: Streaming request with event handlers and new parameters

    // console.log('\n2. Testing streaming jarvis request with event handlers and new parameters:');
    
    // const stream = client.jarvis.stream.jarvis("Hello Jarvis, just testing the SDK", {
    //   dt: Math.floor(new Date().getTime() / 1000),
    //   nlu: false,  // Disable NLU to avoid server errors
    //   speech: "stream",
    // });

    // // Collect audio chunks
    // const audioChunks = [];

    // // Set up event handlers
    // stream
    //   .onAudioChunk((audioChunk, data) => {
    //     console.log('🔊 Audio chunk received:', audioChunk.length, 'bytes');
    //     audioChunks.push(audioChunk);
    //   })
    //   .onResponse((response, { isFinal, data }) => {
    //     if (isFinal) {
    //       console.log('✅ Final response:', response);
    //     } else {
    //       // console.log('📝 Interim response:', response);
    //     }
    //   })
    //   .onToolCall((toolCall) => {
    //     console.log('🔧 Tool call:', toolCall);
    //   })
    //   .onMcpToolCalls((mcpCall) => {
    //     console.log('🔌 MCP call:', mcpCall);
    //   })
    //   .onThoughts((thoughts, { isFinal }) => {
    //     if (isFinal) {
    //       console.log(` 💭 Final thoughts: ${thoughts}`);
    //     } else {
    //       // console.log(`💭 Interim thoughts ${thoughts}`);
    //     }
    //   })
    //   .onConversation((conversation, data) => {
    //     console.log('💬 Conversation updated:', conversation.length, 'messages');
    //   })
    //   .onNLU((nluResult, data) => {
    //     console.log('🧠 NLU Result:', nluResult.nlu.result);
    //   })
    //   .onError((error) => {
    //     console.log('❌ Stream error:', error.message);
    //   })
    //   .onDone((doneEvent) => {
    //     console.log('✅ Stream completed');
    //     console.log('📍 Done type:', JSON.stringify(doneEvent));
        
    //     // Process and save audio chunks if any were received
    //     if (audioChunks.length > 0) {
    //       console.log(`\n🎵 Processing ${audioChunks.length} audio chunks...`);
    //       try {
    //         // TTS audio is typically 24kHz, not 44.1kHz
    //         const wavBuffer = combinePCMChunksToWav(audioChunks, 24000);
    //         const filePath = saveWavToFile(wavBuffer, './audio');
    //         console.log(`📁 Audio file size: ${(wavBuffer.length / 1024).toFixed(2)} KB`);
    //       } catch (error) {
    //         console.error('❌ Failed to save audio:', error.message);
    //       }
    //     } else {
    //       console.log('ℹ️  No audio chunks received');
    //     }
    //   });

    // // Start the stream
    // try {
    //   console.log('Starting stream...', stream.url);
    //   await stream.start();
    // } catch (error) {
    //   console.log('Streaming failed (expected if server not running):', error.message);
    // }

    // console.log('\nManual test completed successfully.');
    
  } catch (error) {
    console.error('Manual test failed:', error);
  }
}

// Run the test
manualTest();
