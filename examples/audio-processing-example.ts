import JarvisClient from '../src/index';

// Example: Using onAudioChunk with audio processing (similar to mentra_convert.ts)
const client = new JarvisClient({
  apiKey: 'your-api-key-here',
  baseUrl: 'https://jarvis-online.vercel.app/api'
});

// Helper function reference (you'd need to implement or import this)
// declare function combinePCMChunksToWavURL(chunks: string[]): Promise<string>;

async function streamWithAudio(message: string) {
  const stream = client.jarvis.stream.jarvis(message, {
    speech: true,
    interrim: true,
    save: true
  });

  const audioChunks: string[] = [];
  let fullResponse = '';

  return new Promise((resolve, reject) => {
    stream
      .onAudioChunk((audioChunk, data) => {
        // Collect audio chunks as they arrive
        audioChunks.push(audioChunk);
        console.log(`Received audio chunk ${audioChunks.length}`);
      })
      .onResponse((response, metadata) => {
        if (metadata.isFinal) {
          fullResponse = response;
          console.log('Final response received:', response);
        } else {
          console.log('Interim response:', response);
        }
      })
      .onDone(async () => {
        console.log(`Stream completed with ${audioChunks.length} audio chunks`);
        
        // Process audio chunks if available
        if (audioChunks.length > 0) {
          try {
            // Here you would process the audio chunks
            // const wavUrl = await combinePCMChunksToWavURL(audioChunks);
            // console.log('Audio URL created:', wavUrl);
            console.log('Ready to process audio chunks:', audioChunks.length);
          } catch (error) {
            console.error('Audio processing error:', error);
          }
        }
        
        resolve({
          response: fullResponse,
          audioChunks: audioChunks,
          audioChunkCount: audioChunks.length
        });
      })
      .onError((error) => {
        console.error('Stream error:', error);
        reject(error);
      });

    // Start the stream
    stream.start().catch(reject);
  });
}

// Usage
streamWithAudio('Tell me a joke').then((result) => {
  console.log('Stream result:', result);
});
