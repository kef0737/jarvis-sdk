import JarvisClient from '../src/index';

// Example: Using the new onAudioChunk handler
const client = new JarvisClient({
  apiKey: 'your-api-key-here',
  baseUrl: 'https://jarvis-online.vercel.app/api'
});

// Create a stream with audio enabled
const stream = client.jarvis.stream.jarvis('Hello, tell me a story', {
  speech: true,  // Enable speech generation
  interrim: true // Get interim results
});

// Store audio chunks for later processing
const audioChunks: string[] = [];

stream
  .onAudioChunk((audioChunk, data) => {
    console.log('Received audio chunk:', audioChunk.substring(0, 50) + '...');
    audioChunks.push(audioChunk);
  })
  .onResponse((response, metadata) => {
    if (metadata.isFinal) {
      console.log('Final response:', response);
    } else {
      console.log('Interim response:', response);
    }
  })
  .onDone((doneEvent) => {
    console.log('Stream completed!');
    console.log('Done type:', doneEvent.type); // 'output', 'tts', or '*'
    console.log(`Total audio chunks received: ${audioChunks.length}`);
    
    // Now you can process all audio chunks
    // e.g., combine them into a WAV file
    // combinePCMChunksToWavURL(audioChunks).then(url => { ... });
  })
  .onError((error) => {
    console.error('Stream error:', error);
  });

// Start the stream
stream.start();
