// Mentra conversion: handleFinalTranscript using Jarvis SDK
// This maintains all the same variables, actions, and flow as the original function

import { JarvisClient } from './dist/src/index.js'; // Local SDK reference

// Types for the existing variables (these would be defined in your Mentra app)
interface History {
  type: string;
  content: string;
  timestamp: Date;
  id: number;
}

interface UserData {
  nlu: any;
}

interface LocationData {
  location: {
    lat: number;
    lng: number;
  };
}

// External variables that exist in your Mentra environment
declare const userData: UserData;
declare let waiting: boolean;
declare const session: any;
declare const history: History[];
declare const generateTTS: boolean;
declare const getDT: () => Date;
declare let activeController: any;
declare const DisplayController: any;
declare const function_desc: (name: string, content: any) => string;
declare const combinePCMChunksToWavURL: (chunks: string[]) => Promise<string>;
declare const saveWavBase64ToFile: (data: string, path: string, baseUrl: string) => Promise<string>;
declare const dev: boolean;
declare const loadFunctionCard: (options: any) => Promise<void>;
declare const bmpToBase64: (path: string) => string;
declare const sleep: (ms: number) => Promise<void>;
declare const fetchImageAsBase64BMP: (url: string) => Promise<string>;
declare let latestTranscript: string;

const handleFinalTranscript = async (
  transcript: string, 
  initialSkipCheck: boolean, 
  locationData: {location: {lat: number, lng: number}}, 
  forceProactive: boolean = false, 
  CheckNLU: boolean = true, 
  speaker: string|null = null, 
  localTranscriptId: number
): Promise<History[]|void> => {

  try {
    // If userData is unexpectedly null here (should be caught by onSession),
    // ensure `waiting` is released and exit.
    let latestResponse = {}

    if (!userData) {
      waiting = false;
      session.layouts.showReferenceCard("Settings", "User not found. Check specified API Key!", { durationMs: 10000 });
      return;
    }

    try {
      const api_key = session.settings.get("api_key");
      
      // Initialize Jarvis SDK client
      const client = new JarvisClient({
        baseUrl: session.settings.get("server") === "dev" 
          ? 'http://localhost:3000/api' 
          : 'https://jarvis-online.vercel.app/api',
        apiKey: api_key
      });

      // Prepare the input text (same logic as original)
      const inputText = transcript.includes(":") ? transcript.split(": ", 2)[1] : transcript;
      
      // Prepare recent transcripts (same logic as original)
      const recentTranscripts = history.slice(0, -1)
        .filter(t => (Number(new Date()) - Number(t.timestamp)) < 30000)
        .map(t => t.content);

      // Create streaming request with same parameters as original URL
      const streamOptions = {
        speech: generateTTS, // boolean instead of string
        dt: Math.round(Number(getDT())/1000),
        nlu: true,
        nlu_config: userData.nlu,
        lat: locationData?.location?.lat ? Number(locationData.location.lat) : undefined,
        lon: locationData?.location?.lng ? Number(locationData.location.lng) : undefined,
        speaker: speaker || undefined,
        conversation: false,
        thoughts: false,
        recentTranscripts: JSON.stringify(recentTranscripts)
      };

      const stream = client.jarvis.stream.jarvis(inputText, streamOptions);
      console.log("Connecting to Jarvis stream:", stream.url); // Use console.log for general info

      // Initialize all the same variables as original
      const frames: string[] = []; // To store image frame URLs from the API
      const images: string[] = [];
      let finalMessage = ""; // To build up the complete final response message
      const audioChunks: string[] = []; // fill this with streamed `data.audio_chunk`

      if (!CheckNLU) {
        session.layouts.showReferenceCard("Jarvis", "", { durationMs: 5000 })
        if (activeController) { activeController.abort() }
        activeController = new DisplayController()
      }

      // Same parse function as original
      function parse(json: string): any {
        try {
          if (!json) { return }
          while (typeof json === "string") {
            json = JSON.parse(json)
          }
          return json
        } catch (e) {
          console.warn(e)
          return {}
        }
      }

      // Wrap stream event handling in a Promise (same structure as original)
      return await new Promise<History[]|void>((resolve, reject) => {
        const pendingPromises: Promise<any>[] = []; // collect async tasks
        let showntext = ""
        let wasProactive = false
        const responses: History[] = []

        // Set up SDK event handlers that replicate original stream.onmessage logic
        stream
          .onOutput((content, data) => {
            // Handle NLU results (same logic as original)
            if (Object.keys(data).includes("nlu")) {
              if (!data.nlu) {
                console.warn("NLU says NO!"); // Log NLU rejection
              } else {
                if (activeController) { activeController.abort() }
                activeController = new DisplayController(true)
                session.layouts.showReferenceCard("// Jarvis", "...", { durationMs: 5000 })
              }
            }

            // Handle image data (same logic as original)
            if (data?.image) {
              images.push(data?.image)
              console.warn(images)
            }

            // Handle audio chunks (same logic as original)
            if (data?.audio_chunk) {
              audioChunks.push(data.audio_chunk)
            }

            // Handle audio completion (same logic as original)
            if (data?.audio_done) {
              try {
                const audioPromise = combinePCMChunksToWavURL(audioChunks)
                  .then(wavDataUrl => saveWavBase64ToFile(
                    String(wavDataUrl.split(",")[1]), 
                    './public/audio', 
                    dev ? 'https://quagga-settled-hopefully.ngrok-free.app' : 'https://augmentos-cloud-example-app-9vah.onrender.com'
                  ))
                  .then(url => {
                    console.warn(`${url} created with ${audioChunks.length} chunks.`)
                    const audioReq = session.audio.playAudio({ audioUrl: url })
                    pendingPromises.push(audioReq)
                    return audioReq.then((result: any) => {
                      console.warn(JSON.stringify(result))
                      return result;
                    });
                  });
                pendingPromises.push(audioPromise);
              } catch (error) {
                console.error("Audio processing error:", error);
              }
            }

            // Handle frames (same logic as original)
            const Newframes: string[] = data?.frames;
            if (Array.isArray(Newframes)) frames.push(...Newframes);

            console.warn(Object.keys(data), data?.image)
          })
          .onToolCall((toolCall) => {
            // Handle tool call information (same logic as original)
            const toolCallDesc = function_desc(toolCall.name, parse(JSON.stringify(toolCall.arguments || {})));
            if (toolCallDesc) {
              responses.push({ type: "response", content: showntext, timestamp: new Date(), id: localTranscriptId });
              responses.push({ type: "tool_call", content: String(toolCallDesc), timestamp: new Date(), id: localTranscriptId });
              showntext = ""
              console.warn(toolCall.name)

              // Handle search_web tool (same logic as original)
              if (toolCall.name === "search_web") {
                const content = parse(JSON.stringify(toolCall.arguments || {}));
                console.warn(content, "<- func content")
                if (content?.results && Array.isArray(content?.results)) {
                  content?.results.map((result: any) => {
                    let imageUrl = null
                    switch (result?.type) {
                      case "news_result":
                        imageUrl = result?.image
                        break
                      case "image_result":
                        imageUrl = result?.thumbnail?.src
                        break
                    }
                    console.warn(imageUrl)
                    if (imageUrl) images.push(imageUrl);
                    console.warn(images)
                  })
                }
              }

              // Handle manage_home_assistant tool (same logic as original)
              if (toolCall.name === "manage_home_assistant") {
                const content = parse(JSON.stringify(toolCall.arguments || {}));
                console.warn(content, "<- func content")
                if (content?.entity_id) {
                  console.warn(`/frames?type=device&json=${encodeURIComponent(JSON.stringify(content))}`)
                  frames.push(`/frames?type=device&json=${encodeURIComponent(JSON.stringify(content))}`)
                }
              }

              pendingPromises.push(activeController.showText(`\nTool Call: ${toolCallDesc}\n`, showntext, 110, true));
            }
          })
          .onResponse((response, { isFinal, data }) => {
            // Handle incremental and final text responses (same logic as original)
            if (response && !isFinal) {
              // Display incremental text responses
              if (response !== showntext && response.trim() !== showntext.trim()) {
                pendingPromises.push(activeController.showText(response, showntext, 70, false).then(() => {
                  showntext = response
                }));
              }
            } else if (isFinal && response) {
              // Handle final response
              showntext = response;
              finalMessage = response;
            }
          })
          .onError((error) => {
            // Same error handling logic as original
            console.error("Stream error:", error);
            latestResponse = { content: finalMessage, timestamp: new Date() };
            if (showntext) {
              responses.push({ type: "response", content: `[Jarvis Response]: ${showntext}`, timestamp: new Date(), id: localTranscriptId });
              showntext = ""
            }
            
            Promise.all(pendingPromises)
              .then(async () => {
                resolve(responses)
                await processFramesAndImages(); // Helper function defined below
              })
              .catch((e) => {
                console.warn(e)
                resolve(responses)
              });
          })
          .onDone(() => {
            // Same completion logic as original
            if (showntext) {
              responses.push({ type: "response", content: `[Jarvis Response]: ${showntext}`, timestamp: new Date(), id: localTranscriptId });
              showntext = ""
            }
            
            Promise.all(pendingPromises)
              .then(async () => {
                resolve(responses)
                await processFramesAndImages(); // Helper function defined below
              })
              .catch((e) => {
                console.warn(e)
                resolve(responses)
              });
          });

        // Helper function to process frames and images (same logic as original)
        async function processFramesAndImages() {
          if ((frames.length > 0 || images.length > 0) && !activeController.aborted) {
            console.log("Processing image frames:", frames);
            console.warn(frames, images)
            
            // Process frames
            for (const url of frames) {
              try {
                session.layouts.showReferenceCard("Jarvis", "-- card's rendering --", { durationMs: 5000 })
                const save = `./card-${session.userId.replaceAll(".", "-")}.bmp`
                await loadFunctionCard({ url, save, date: getDT() })
                session.layouts.showBitmapView(bmpToBase64(save))
                await sleep(frames.length > 1 ? 10000 : 18000);
              } catch (imageError) {
                console.error("Failed to capture or display image:", imageError);
                session.layouts.showReferenceCard("Jarvis", "-- failed rendering --", { durationMs: 5000 })
              }
            }
            
            // Process images
            console.log("Processing images:", images);
            for (const url of images) {
              console.warn(url)
              const b64 = await fetchImageAsBase64BMP(url)
              session.layouts.showBitmapView(b64)
              await sleep(images.length > 1 ? 5000 : 10000);
            }
            session.layouts.showTextWall("", { durationMs: 1000 })
          }
        }

        // Start the SDK stream (replaces EventSource creation)
        stream.start().catch((error) => {
          console.error("Failed to start stream:", error);
          reject(error);
        });

      }); // End of new Promise

    } catch (error) {
      console.error("Overall Processing Failure in handleFinalTranscript:", error);
      session.layouts.showTextWall("An error occurred during Jarvis processing.", { durationMs: 5000 });
      throw error; // Re-throw to propagate the error to the caller's .catch() block
    } finally {
      // Ensure `waiting` is reset to `false` when `handleFinalTranscript` finishes,
      // regardless of success or failure. This is a crucial safeguard.
      waiting = false;
      latestTranscript = ""; // Clear latest transcript
    }
  } catch (e) {
    console.warn(e)
  }
};

export { handleFinalTranscript };