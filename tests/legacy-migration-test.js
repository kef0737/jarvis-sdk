// Migration example: Converting old direct EventSource function to use Jarvis SDK

import { JarvisClient } from '../dist/src/index.js';

/**
 * New SDK-based function that replaces the old getTogetherResponse
 * @param {string} input - The user input text
 * @param {string} from - "text" or "voice" 
 * @param {Object} extraFiles - Object with files array
 * @param {boolean} displayNotifs - Whether to display notifications
 * @param {Array} recentTranscripts - Array of recent transcripts
 * @param {boolean} isProactive - Whether this is a proactive message
 * @param {boolean|Object} nlu - NLU configuration or boolean
 * @param {Object} userData - User data object with id
 * @param {Object} callbacks - UI callback functions
 * @returns {Promise<string>} - Promise that resolves with final output
 */
async function getJarvisResponseSDK(
    input, 
    from = "text", 
    extraFiles = { files: [] }, 
    displayNotifs = false,
    recentTranscripts = [], 
    isProactive = false, 
    nlu = false,
    userData = { id: "demo-key" },
    callbacks = {}
) {
    return new Promise(async (resolve, reject) => {
        try {
            // Initialize the Jarvis SDK client
            const client = new JarvisClient({
                baseUrl: (typeof window !== 'undefined' && window?.location?.host === "localhost:8888") 
                    ? 'http://localhost:3000/api' 
                    : 'https://jarvis-online.vercel.app/api',
                apiKey: userData.id
            });

            // Handle file uploads (simplified - you'd need to implement saveImage equivalent)
            const filesArray = Array.from(extraFiles.files || []);
            let imageUrls = null;
            if (filesArray.length > 0) {
                // imageUrls = await saveImage(supabase, { files: filesArray }, uid);
                console.warn("File upload not implemented in this demo");
            }

            // Get geolocation (browser only)
            let lat = "";
            let lon = "";
            if (typeof navigator !== 'undefined' && navigator?.geolocation) {
                try {
                    const position = await new Promise((resolve, reject) => {
                        navigator.geolocation.getCurrentPosition(resolve, reject);
                    });
                    lat = position.coords.latitude;
                    lon = position.coords.longitude;
                } catch (error) {
                    console.error("Error getting location:", error);
                }
            }

            // Prepare stream options using the new SDK parameter structure
            const streamOptions = {
                speech: from === "voice",
                dt: Math.floor(Date.now() / 1000),
                pa: isProactive,
                lat: lat,
                lon: lon,
                media: imageUrls || undefined,
                nlu: Boolean(nlu),
                nlu_config: typeof nlu === 'object' ? nlu : undefined,
                // Add recent transcripts as a custom parameter
                recentTranscripts: recentTranscripts.length > 0 
                    ? recentTranscripts.map(t => `${t.type}: ${t.content}`).join(",,")
                    : undefined
            };

            let finalOutput = "";
            const speechQueuePromises = [];

            // Start waiting UI (equivalent to old startWaiting function)
            function startWaiting(isProactive) {
                const metadata = `Day ${new Date().toISOString()}`;
                if (callbacks.setVisableConversation) {
                    callbacks.setVisableConversation(prev => [...(prev || []), {
                        role: "user",
                        sending: true,
                        content: filesArray.length === 0 
                            ? `${input} | Metadata: ${metadata}` || ""
                            : [
                                { type: "text", text: `${input} | Metadata: ${metadata}` || "" },
                                { type: "image_url", image_url: { url: imageUrls } }
                            ]
                    }]);
                }
                
                if (callbacks.setWaitingOnResponse) {
                    callbacks.setWaitingOnResponse(true);
                }

                // Play send sound after delay
                setTimeout(() => {
                    if (callbacks.playUrl) {
                        callbacks.playUrl("/send.mp3");
                    }
                }, 1000);
            }

            if (!nlu) {
                startWaiting(isProactive);
            }

            // Create the streaming request using the new SDK
            const stream = client.jarvis.stream.jarvis(
                input?.replaceAll("\n", "__NEWLINE__") || "", 
                streamOptions
            );

            console.log('SDK Stream URL:', stream.url);

            // Set up event handlers using the new SDK fluent API
            stream
                .onResponse((response, { isFinal, data }) => {
                    console.warn('Response:', response);
                    finalOutput = response;
                    if (callbacks.setOutput) {
                        callbacks.setOutput(response);
                    }
                })
                .onNLU((nluResult, data) => {
                    console.log('NLU Result:', nluResult);
                    if (nluResult.nlu) {
                        startWaiting(data?.type === "proactive");
                    }
                })
                .onToolCall((toolCall) => {
                    console.log('Tool Call:', toolCall);
                    
                    // Handle search_web tool for voice mode
                    if (toolCall.name === "search_web" && toolCall.arguments && from === "voice") {
                        try {
                            const results = toolCall.arguments.results || [];
                            if (callbacks.clearHud) callbacks.clearHud();
                            if (callbacks.setHudContent) {
                                callbacks.setHudContent(prev => [
                                    ...(prev || []), 
                                    ...(Array.isArray(results) ? results : [])
                                ]);
                            }
                        } catch (e) {
                            console.error('Error parsing search results:', e);
                        }
                    }
                })
                .onOutput((content, data) => {
                    console.log('Stream Output:', content);
                    
                    // Handle audio chunks for voice mode
                    if (data?.audio_chunk && from === "voice") {
                        if (callbacks.player?.addChunk) {
                            speechQueuePromises.push(callbacks.player.addChunk(data.audio_chunk));
                        }
                    }

                    // Handle audio completion
                    if (data?.audio_done && from === "voice") {
                        console.log("Audio stream finished from backend.");
                    }

                    // Handle frames/notifications
                    if ((data?.frames || []).length > 0 && displayNotifs) {
                        if (callbacks.setHudContent) {
                            callbacks.setHudContent([
                                ...data.frames.map(url => ({ type: "frame", content: url }))
                            ]);
                        }
                    }

                    // Handle local functions
                    const localFunctions = data?.lf || "";
                    if (localFunctions) {
                        localFunctions.split('|||').forEach(async (func) => {
                            if (func.includes('open(')) {
                                const url = func.split('(')[1].split(')')[0];
                                if (func.startsWith('open(tel:') || func.startsWith('open(sms:')) {
                                    if (typeof window !== 'undefined') {
                                        window.open(url, '_blank');
                                    } else {
                                        console.log('Would open:', url);
                                    }
                                } else if (callbacks.open_url) {
                                    callbacks.open_url(url, '_blank');
                                }
                            }
                            if (func.includes('copy(')) {
                                const textToCopy = func.match(/\(([^)]*)\)/)?.[1];
                                if (textToCopy && typeof navigator !== 'undefined' && navigator?.clipboard) {
                                    try {
                                        await navigator.clipboard.writeText(textToCopy);
                                        console.log('Successfully copied to clipboard!');
                                    } catch (err) {
                                        console.error('Failed to copy text: ', err);
                                    }
                                } else if (textToCopy) {
                                    console.log('Would copy to clipboard:', textToCopy);
                                }
                            }
                        });
                    }

                    // Handle conversation updates
                    if (data?.conversation && data?.update === false && !data?.response && (data?.tool_calls || []).length === 0) {
                        if (callbacks.setOutput) callbacks.setOutput(null);
                        if (callbacks.setWaitingOnResponse) callbacks.setWaitingOnResponse(false);
                    }

                    if (data?.conversation) {
                        if (callbacks.setOutput) callbacks.setOutput(null);
                        if (callbacks.setVisableConversation) {
                            callbacks.setVisableConversation(data.conversation);
                        }
                    }
                })
                .onError((error) => {
                    console.error('Stream Error:', error);
                    if (callbacks.setOutput) callbacks.setOutput(null);
                    if (callbacks.setWaitingOnResponse) callbacks.setWaitingOnResponse(false);
                    
                    // Finish audio stream
                    if (callbacks.player?.finishStream) {
                        speechQueuePromises.push(callbacks.player.finishStream());
                    }
                    
                    Promise.all(speechQueuePromises)
                        .then(() => resolve(finalOutput))
                        .catch(reject);
                })
                .onDone(() => {
                    console.log('Stream completed');
                    if (callbacks.setOutput) callbacks.setOutput(null);
                    if (callbacks.setWaitingOnResponse) callbacks.setWaitingOnResponse(false);
                    
                    // Finish audio stream
                    if (callbacks.player?.finishStream) {
                        speechQueuePromises.push(callbacks.player.finishStream());
                    }
                    
                    Promise.all(speechQueuePromises)
                        .then(() => resolve(finalOutput))
                        .catch(reject);
                });

            // Start the stream
            await stream.start();

        } catch (error) {
            console.error("Error in getJarvisResponseSDK:", error);
            if (callbacks.setOutput) callbacks.setOutput(null);
            if (callbacks.setWaitingOnResponse) callbacks.setWaitingOnResponse(false);
            reject(error);
        }
    });
}

// Example usage demonstrating the migration
async function exampleUsage() {
    try {
        console.log('Testing legacy migration...');

        // Mock UI callbacks (replace with your actual UI functions)
        const mockCallbacks = {
            setVisableConversation: (data) => console.log('setVisableConversation:', data),
            setWaitingOnResponse: (waiting) => console.log('setWaitingOnResponse:', waiting),
            setOutput: (output) => console.log('setOutput:', output),
            setHudContent: (content) => console.log('setHudContent:', content),
            clearHud: () => console.log('clearHud called'),
            playUrl: (url) => console.log('playUrl:', url),
            open_url: (url, target) => console.log('open_url:', url, target),
            player: {
                addChunk: (chunk) => {
                    console.log('addChunk:', chunk);
                    return Promise.resolve();
                },
                finishStream: () => {
                    console.log('finishStream called');
                    return Promise.resolve();
                }
            }
        };

        // Test with basic text input
        const result = await getJarvisResponseSDK(
            "Hello, test the new SDK migration!",
            "text", // from
            { files: [] }, // extraFiles
            false, // displayNotifs
            [], // recentTranscripts
            false, // isProactive
            false, // nlu
            { id: "89045099" }, // userData
            mockCallbacks // callbacks
        );

        console.log('Final result:', result);

    } catch (error) {
        console.error('Example failed:', error);
    }
}

// Export for use in other files
export { getJarvisResponseSDK, exampleUsage };

// Run example if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    exampleUsage();
}