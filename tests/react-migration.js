// React-specific migration: Direct replacement for getTogetherResponse function
// This function uses your exact React state variables and functions

import { JarvisClient } from '../dist/src/index.js';

/**
 * Direct replacement for getTogetherResponse using Jarvis SDK
 * Uses the same parameters and React state variables as your original function
 */
async function getTogetherResponse(
    input, 
    from = "text", 
    extraFiles = { files: [] }, 
    displayNotifs, 
    recentTranscripts = [], 
    isProactive = false, 
    nlu = false
) {
    return new Promise(async (resolve, reject) => {
        try {
            // Initialize SDK client (replace with your actual API configuration)
            const client = new JarvisClient({
                baseUrl: window.location.host === "localhost:8888" 
                    ? 'http://localhost:3000/api' 
                    : 'https://jarvis-online.vercel.app/api',
                apiKey: userData.id // Your existing userData variable
            });

            // Use your existing React state variables exactly as before
            const filesArray = Array.from(extraFiles.files || []);
            filesArray.push(...ImageFiles); // Your existing ImageFiles state
            const blobs = filesArray.map(file => URL.createObjectURL(new Blob([file], { type: file.type })));
            const now = new Date();

            // Your existing startWaiting function - unchanged
            function startWaiting(isProactive) {
                const metadata = `Day ${new Date().toISOString()}`;
                setVisableConversation([...visableConversation, {
                    role: "user",
                    sending: true,
                    content: filesArray.length === 0 ? `${input} | Metadata: ${metadata}` || "" : [
                        { type: "text", text: `${input} | Metadata: ${metadata}` || "" },
                        { type: "image_url", image_url: { url: blobs.join(",") } }
                    ]
                }]);

                setWaitingOnResponse(true);
                sleep(1000).then(() => {
                    playUrl("/send.mp3")
                })
            }

            if (!nlu) {
                startWaiting(isProactive)
            }

            // Your existing file upload logic
            const urls = filesArray.length === 0 ? null : await saveImage(supabase, { files: filesArray }, uid);
            console.warn(urls, filesArray, ImageFiles)

            setImageFiles([])
            document.getElementById("imageUpload").files = new DataTransfer().files

            // Your existing geolocation logic - unchanged
            let lat = "";
            let lon = "";
            if (navigator.geolocation) {
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

            let finalOutput = "";
            const speechQueuePromises = [];

            // Create SDK stream with exact same parameters as your original URL
            const stream = client.jarvis.stream.jarvis(
                (input||"").replaceAll("\n", "__NEWLINE__"), 
                {
                    speech: from === "voice" ? 'stream' : "false",
                    dt: Math.round(Number(new Date())/1000),
                    pa: isProactive,
                    lat: lat,
                    lon: lon,
                    media: urls ? urls : undefined,
                    nlu: nlu ? true : undefined,
                    nlu_config: (nlu && typeof nlu === 'object') ? nlu : undefined,
                    recentTranscripts: recentTranscripts ? recentTranscripts.map(t => `${t.type}: ${t.content}`).join(",,") : undefined
                }
            );

            console.warn('SDK Stream URL:', stream.url); // Same as your eventSource.url log

            // Set up SDK event handlers that match your original eventSource.onmessage logic
            stream
                .onOutput((content, data) => {
                    // Handle NLU results (from your original data?.nlu check)
                    if (data?.nlu) {
                        if (data.nlu) {
                            startWaiting(data.type === "proactive")
                        }
                    }

                    // Handle streamed audio chunks (your original audio_chunk handling)
                    if (data?.audio_chunk && from === "voice") {
                        speechQueuePromises.push(player.addChunk(data.audio_chunk))
                        console.warn(data.audio_chunk)
                    }

                    // Handle audio completion
                    if (data?.audio_done && from === "voice") {
                        console.log("Audio stream finished from backend.");
                    }

                    // Handle frames (your original frames handling)
                    if ((data?.frames || []).length > 0 && displayNotifs) {
                        setHudContent([...data.frames.map(url => ({ type: "frame", content: url }))])
                    }

                    // Handle local functions (your original localFunctions logic)
                    const localFunctions = data.lf || "";
                    console.warn(localFunctions, "<- localfunction")
                    if (localFunctions) {
                        localFunctions.split('|||').forEach(async (func) => {
                            if (func.includes('open(')) {
                                (func.startsWith('open(tel:') || func.startsWith('open(sms:')
                                    ? window.open
                                    : open_url)(func.split('(')[1].split(')')[0], '_blank');
                            }
                            if (func.includes('copy(')) {
                                const textToCopy = func.match(/\(([^)]*)\)/)[1];
                                if (textToCopy) {
                                    try {
                                        await navigator.clipboard.writeText(textToCopy);
                                        console.log('Successfully copied to clipboard!');
                                    } catch (err) {
                                        console.error('Failed to copy text: ', err);
                                    }
                                }
                            }
                        });
                    }

                    // Handle tool_call content (your original tool_call logic)
                    if (data?.tool_call && data?.tool_call?.content && from==="voice") {
                        if (data.tool_call.name === "search_web") {
                            const parsed = JSON.parse(JSON.parse(data.tool_call.content))
                            clearHud();
                            setHudContent((prev) => ([...prev, ...parsed?.results ? Array.isArray(parsed?.results) ? parsed?.results : [] : []]))
                        }
                    }

                    // Handle conversation updates (your original conversation logic)
                    const conversation = data.conversation;
                    if (conversation && data?.update === false && !data?.response && (data?.tool_calls || []).length === 0) {
                        setOutput(null)
                        setWaitingOnResponse(false);
                    }

                    if (conversation) {
                        setOutput(null)
                        setVisableConversation(conversation);
                    }
                })
                .onResponse((response, { isFinal, data }) => {
                    // Handle response (your original response logic)
                    if (response) {
                        console.warn(response)
                        finalOutput = response;
                        setOutput(response)
                    }
                })
                .onToolCall((toolCall) => {
                    console.log('Tool Call:', toolCall);
                })
                .onError((error) => {
                    // Your original eventSource.onerror logic
                    setOutput(null)
                    setWaitingOnResponse(false);
                    console.warn("ERROR", error)
                    speechQueuePromises.push(player.finishStream())
                    Promise.all(speechQueuePromises).then(() => resolve(finalOutput)).catch(reject);
                })
                .onDone(() => {
                    // Your original eventSource.onclose logic
                    setOutput(null)
                    setWaitingOnResponse(false);
                    speechQueuePromises.push(player.finishStream())
                    Promise.all(speechQueuePromises).then(() => resolve(finalOutput)).catch(reject);
                });

            // Start the stream (replaces creating EventSource)
            await stream.start();

        } catch (error) {
            // Your original catch block logic
            console.error("Error in getTogetherResponse:", error);
            setOutput(null)
            setWaitingOnResponse(false);
            reject(error);
        }
    });
}

export { getTogetherResponse };