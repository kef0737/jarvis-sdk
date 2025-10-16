# Done Event Handler

The `.onDone()` handler now receives a `DoneEvent` object that provides information about what type of completion occurred.

## DoneEvent Interface

```typescript
interface DoneEvent {
  type: 'output' | 'tts' | '*' | string;
  [key: string]: any; // Additional properties may be present
}
```

## Event Types

- **`output`**: The text/output generation is complete (stream continues)
- **`tts`**: The text-to-speech audio generation is complete (stream continues)
- **`*`**: **Final completion** - the stream has finished sending all data
- Additional types may be added in the future

### Important: Stream Lifecycle

The stream can send **multiple done events** as different parts complete:
1. `{ done: { type: "output" } }` - Text output is done, but stream continues
2. `{ done: { type: "tts" } }` - Audio is done, but stream continues
3. `{ done: { type: "*" } }` - **Everything is done**, stream stops

**The stream only truly finishes when `type: "*"` is received.**

## Usage

```typescript
stream
  .onDone((doneEvent) => {
    console.log('Done event received:', doneEvent.type);
    
    // Handle different completion types
    switch (doneEvent.type) {
      case 'output':
        console.log('Text output is complete (stream continues)');
        // Text is ready, but more data may still be coming
        break;
        
      case 'tts':
        console.log('TTS audio is complete (stream continues)');
        // All audio chunks have been sent, safe to process
        processAudioChunks();
        break;
        
      case '*':
        console.log('Stream fully completed!');
        // Everything is done, stream has stopped
        cleanup();
        break;
    }
  });
```

### Example: Processing Audio After TTS Completion

```typescript
const audioChunks = [];

stream
  .onAudioChunk((chunk) => {
    audioChunks.push(chunk);
  })
  .onDone((doneEvent) => {
    if (doneEvent.type === 'tts') {
      // TTS is done, all audio chunks received
      const wavFile = combineAudioChunks(audioChunks);
      playAudio(wavFile);
    }
    
    if (doneEvent.type === '*') {
      // Stream completely finished
      console.log('All processing complete');
    }
  });
```

## API Response Format

The API can send completion in different formats:

### Object with type (preferred)
```json
{
  "done": {
    "type": "tts"
  }
}
```

### Boolean (legacy)
```json
{
  "done": true
}
```

### String signal (legacy)
```
data: [DONE]
```

All formats are supported - the SDK will normalize them to a `DoneEvent` object.

## Migration from Previous Version

**Before:**
```typescript
.onDone(() => {
  console.log('Done!');
});
```

**After:**
```typescript
.onDone((doneEvent) => {
  console.log('Done!', doneEvent.type);
});
```

The handler signature changed from `() => void` to `(doneEvent: DoneEvent) => void`.

## Note

This feature is **subject to possible change** as the API evolves. Additional type values may be added in future versions.
