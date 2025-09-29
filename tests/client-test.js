// Manual test script for Jarvis SDK

import { JarvisClient } from '../dist/src/index.js';

async function manualTest() {
  try {
    const client = new JarvisClient({
      baseUrl: "http://localhost:3000/api",
      timeout: 10000,
      // apiKey: "52455986",
      apiKey: "89045099"
    });

    console.log('Starting manual test for Jarvis SDK...');
    console.log('Testing the new fluent API:');

    // // Test 1: Non-streaming request
    // console.log('\n1. Testing non-streaming jarvis request:');
    // try {
    //   const response = await client.jarvis.jarvis('Hello, how are you?');
    //   console.log('Response:', response);
    // } catch (error) {
    //   console.log('Non-streaming request failed (expected if server not running):', error.message);
    // }

    // Test 2: Streaming request with event handlers and new parameters

    console.log('\n2. Testing streaming jarvis request with event handlers and new parameters:');
    
    const stream = client.jarvis.stream.jarvis("Jarvis, you there? Testing out this new SDK i'm making for you. Easy way to build interfaces.", {
      dt: Math.floor(new Date().getTime() / 1000),
    });

    // Set up event handlers
    stream
      .onOutput((content, data) => {
        console.log('📝 Output:', content);
      })
      .onResponse((response, { isFinal, data }) => {
        if (isFinal) {
          console.log('✅ Final response:', response);
        } else {
          // console.log('📝 Interim response:', response);
        }
      })
      .onToolCall((toolCall) => {
        console.log('🔧 Tool call:', toolCall);
      })
      .onMcpToolCalls((mcpCall) => {
        console.log('🔌 MCP call:', mcpCall);
      })
      .onThoughts((thoughts, { isFinal }) => {
        if (isFinal) {
          console.log(` 💭 Final thoughts: ${thoughts}`);
        } else {
          // console.log(`💭 Interim thoughts ${thoughts}`);
        }
      })
      .onNLU((nluResult, data) => {
        console.log('🧠 NLU Result:', nluResult.nlu.result);
      })
      .onError((error) => {
        console.log('❌ Stream error:', error.message);
      })
      .onDone(() => {
        console.log('✅ Stream completed');
      });

    // Start the stream
    try {
      console.log('Starting stream...', stream.url);
      await stream.start();
    } catch (error) {
      console.log('Streaming failed (expected if server not running):', error.message);
    }

    console.log('\nManual test completed successfully.');
    
  } catch (error) {
    console.error('Manual test failed:', error);
  }
}

// Run the test
manualTest();
