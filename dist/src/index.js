export class JarvisStream {
    constructor(client, endpoint, data) {
        this.client = client;
        this.endpoint = endpoint;
        this.data = data;
        this.outputHandlers = [];
        this.toolCallsHandlers = [];
        this.toolCallHandlers = [];
        this.mcpCallHandlers = [];
        this.mcpToolCallsHandlers = [];
        this.thoughtsHandlers = [];
        this.responseHandlers = [];
        this.nluHandlers = [];
        this.conversationHandlers = [];
        this.audioChunkHandlers = [];
        this.errorHandlers = [];
        this.doneHandlers = [];
        this.isStreaming = false;
        // Buffer for incomplete SSE data
        this.buffer = '';
        this.abortController = new AbortController();
        // Build the URL when the stream is created
        this.url = this.client.buildStreamUrl(this.endpoint, this.data);
    }
    onOutput(handler) {
        this.outputHandlers.push(handler);
        return this;
    }
    onToolCalls(handler) {
        this.toolCallsHandlers.push(handler);
        return this;
    }
    onToolCall(handler) {
        this.toolCallHandlers.push(handler);
        return this;
    }
    onMcpToolCalls(handler) {
        this.mcpToolCallsHandlers.push(handler);
        return this;
    }
    onThoughts(handler) {
        this.thoughtsHandlers.push(handler);
        return this;
    }
    onResponse(handler) {
        this.responseHandlers.push(handler);
        return this;
    }
    onNLU(handler) {
        this.nluHandlers.push(handler);
        return this;
    }
    onConversation(handler) {
        this.conversationHandlers.push(handler);
        return this;
    }
    onAudioChunk(handler) {
        this.audioChunkHandlers.push(handler);
        return this;
    }
    onError(handler) {
        this.errorHandlers.push(handler);
        return this;
    }
    onDone(handler) {
        this.doneHandlers.push(handler);
        return this;
    }
    async start() {
        if (this.isStreaming) {
            throw new Error('Stream is already active');
        }
        this.isStreaming = true;
        try {
            // Always try to use EventSource since your API expects GET requests
            // We'll use a polyfill for Node.js if needed
            await this.startEventSourceStream();
        }
        catch (error) {
            this.handleError(error instanceof Error ? error : new Error(String(error)));
        }
    }
    async startEventSourceStream() {
        // Since your API expects GET with query params, let's make a simple GET request
        // that handles the streaming response manually
        const response = await fetch(this.url, {
            method: 'GET',
            headers: {
                'Accept': 'text/event-stream',
                'Cache-Control': 'no-cache',
            },
            signal: this.abortController.signal
        });
        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
        }
        if (!response.body) {
            throw new Error('No response body available for streaming');
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (this.isStreaming) {
            const { done, value } = await reader.read();
            if (done) {
                this.handleDone({ type: '*' });
                break;
            }
            const chunk = decoder.decode(value, { stream: true });
            this.processSSEChunk(chunk);
        }
    }
    async startFetchStream() {
        const response = await this.client.makeStreamRequest(this.endpoint, this.data, this.abortController.signal);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('No response body available for streaming');
        }
        const decoder = new TextDecoder();
        while (this.isStreaming) {
            const { done, value } = await reader.read();
            if (done) {
                this.handleDone({ type: '*' });
                break;
            }
            const chunk = decoder.decode(value, { stream: true });
            this.processSSEChunk(chunk);
        }
    }
    processSSEChunk(chunk) {
        // Add chunk to buffer
        this.buffer += chunk;
        // Split by double newlines to separate complete SSE messages
        const messages = this.buffer.split('\n\n');
        // Keep the last message in buffer if it might be incomplete
        this.buffer = messages.pop() || '';
        // Process each complete message
        for (const message of messages) {
            if (!message.trim())
                continue;
            const lines = message.split('\n');
            let eventType = '';
            let data = '';
            // Parse SSE format
            for (const line of lines) {
                if (line.startsWith('event: ')) {
                    eventType = line.substring(7);
                }
                else if (line.startsWith('data: ')) {
                    data += line.substring(6);
                }
            }
            if (!data)
                continue;
            try {
                // Handle completion signals
                if (data === '[DONE]' || data === 'DONE') {
                    this.handleDone({ type: '*' });
                    return;
                }
                // Parse JSON data
                const parsedData = JSON.parse(data);
                this.handleStreamData(parsedData);
            }
            catch (error) {
                // If JSON parsing fails, it might be plain text
                if (data.trim()) {
                    this.outputHandlers.forEach(handler => handler(data));
                }
                console.warn('Failed to parse SSE data:', data, error);
            }
        }
    }
    stop() {
        this.isStreaming = false;
        this.abortController.abort();
    }
    handleStreamData(data) {
        // Handle interim response - route to onResponse with isFinal: false
        if (data.interrim_response) {
            this.responseHandlers.forEach(handler => handler(data.interrim_response, { isFinal: false, data }));
        }
        // Handle interim thoughts - route to onThoughts with isFinal: false
        if (data.interrim_thoughts) {
            this.thoughtsHandlers.forEach(handler => handler(data.interrim_thoughts, { isFinal: false, data }));
        }
        // Handle tool calls array
        if (data.tool_calls && Array.isArray(data.tool_calls)) {
            this.toolCallsHandlers.forEach(handler => handler(data.tool_calls, data));
            // Also trigger individual tool call handlers for each tool
            data.tool_calls.forEach((toolCall) => {
                this.toolCallHandlers.forEach(handler => handler(toolCall));
            });
        }
        // Handle MCP tool calls array
        if (data.mcp_tool_calls && Array.isArray(data.mcp_tool_calls)) {
            this.mcpToolCallsHandlers.forEach(handler => handler(data.mcp_tool_calls, data));
        }
        // Handle final thoughts (complete version) - route to onThoughts with isFinal: true
        if (data.thoughts) {
            this.thoughtsHandlers.forEach(handler => handler(data.thoughts, { isFinal: true, data }));
        }
        // Handle final response (complete version) - route to onResponse with isFinal: true
        if (data.response) {
            this.responseHandlers.forEach(handler => handler(data.response, { isFinal: true, data }));
        }
        // Handle NLU results - API sends: { nlu: { result: string } }
        if (data.nlu) {
            this.nluHandlers.forEach(handler => handler(data, data));
        }
        // Handle conversation updates - API sends: { convo: [...] }
        if (data.convo) {
            this.conversationHandlers.forEach(handler => handler(data.convo, data));
        }
        // Handle audio chunks - API sends: { audio_chunk: string }
        if (data.audio_chunk) {
            this.audioChunkHandlers.forEach(handler => handler(data.audio_chunk, data));
        }
        // Legacy handlers for backward compatibility
        // Handle text output/content
        if (data.content || data.text || data.message) {
            const content = data.content || data.text || data.message;
            this.outputHandlers.forEach(handler => handler(content, data));
        }
        // Handle errors - API sends: { error: "error message" } or { error: {error object} }
        if (data.error) {
            const error = typeof data.error === 'string'
                ? new Error(data.error)
                : new Error(data.error.message || 'Unknown error');
            this.handleError(error);
        }
        // Handle completion - API sends: { done: { type: 'output' | 'tts' | '*' } } or { done: true } or { finished: true }
        if (data.done || data.finished || data.complete) {
            // If done is an object with a type, pass it to handleDone
            if (typeof data.done === 'object' && data.done !== null) {
                this.handleDone(data.done);
            }
            else {
                this.handleDone({ type: '*' });
            }
        }
        // Handle specific event types if your API uses the 'type' field
        if (data.type) {
            switch (data.type) {
                case 'output':
                case 'text':
                case 'content':
                    this.outputHandlers.forEach(handler => handler(data.content || data.text || '', data));
                    break;
                case 'interrim_response':
                    this.responseHandlers.forEach(handler => handler(data.content || data.data || '', { isFinal: false, data }));
                    break;
                case 'interrim_thoughts':
                    this.thoughtsHandlers.forEach(handler => handler(data.data || data.content, { isFinal: false, data }));
                    break;
                case 'tool_calls':
                    if (Array.isArray(data.data)) {
                        this.toolCallsHandlers.forEach(handler => handler(data.data, data));
                    }
                    break;
                case 'mcp_tool_calls':
                    if (Array.isArray(data.data)) {
                        this.mcpToolCallsHandlers.forEach(handler => handler(data.data, data));
                    }
                    break;
                case 'tool_call':
                    this.toolCallHandlers.forEach(handler => handler(data.data || data));
                    break;
                case 'mcp_call':
                    this.mcpCallHandlers.forEach(handler => handler(data.data || data));
                    break;
                case 'thoughts':
                    this.thoughtsHandlers.forEach(handler => handler(data.data || data, { isFinal: true, data }));
                    break;
                case 'response':
                    this.responseHandlers.forEach(handler => handler(data.content || data.data || '', { isFinal: true, data }));
                    break;
                case 'nlu':
                    this.nluHandlers.forEach(handler => handler(data.data || data, data));
                    break;
                case 'conversation':
                    this.conversationHandlers.forEach(handler => handler(data.data || data.convo || data.conversation || [], data));
                    break;
                case 'audio_chunk':
                    this.audioChunkHandlers.forEach(handler => handler(data.data || data.audio_chunk || data.content || '', data));
                    break;
                case 'error':
                    this.handleError(new Error(data.content || data.message || 'Unknown error'));
                    break;
                case 'done':
                case 'complete':
                    // Pass the full data object to handleDone in case it contains type info
                    this.handleDone(data.data || data);
                    break;
            }
        }
    }
    handleError(error) {
        this.errorHandlers.forEach(handler => handler(error));
    }
    handleDone(doneEvent) {
        // If doneEvent is not provided or is a boolean/string, create a default event
        let event;
        if (!doneEvent || typeof doneEvent === 'boolean' || typeof doneEvent === 'string') {
            event = { type: '*' };
        }
        else if (doneEvent.type) {
            // Already a proper DoneEvent
            event = doneEvent;
        }
        else if (doneEvent.done) {
            // Handle { done: { type: '...' } } structure
            event = doneEvent.done;
        }
        else {
            // Fallback
            event = { type: '*', ...doneEvent };
        }
        // Fire the done handlers
        this.doneHandlers.forEach(handler => handler(event));
        // Only stop streaming when we receive the final done event with type "*"
        // Other done types (e.g., "output", "tts") indicate partial completion
        if (event.type === '*') {
            this.isStreaming = false;
        }
    }
}
export class JarvisStreamRequest {
    constructor(client) {
        this.client = client;
    }
    jarvis(inputText, options) {
        return new JarvisStream(this.client, '/new-jarvis-stream', {
            input: inputText,
            ...options,
            stream: true,
        });
    }
    tts(text, options) {
        return new JarvisStream(this.client, '/tts/stream', {
            text,
            stream: true,
            ...options
        });
    }
    nlu(query, options) {
        return new JarvisStream(this.client, '/nlu/stream', {
            query,
            stream: true,
            ...options
        });
    }
}
export class JarvisRequest {
    constructor(client) {
        this.client = client;
    }
    get stream() {
        return new JarvisStreamRequest(this.client);
    }
    // Non-streaming methods
    async jarvis(inputText, options) {
        return this.client.apiRequest('/new-jarvis-stream', { input: inputText, ...options });
    }
}
import { createClient } from '@supabase/supabase-js';
export class realtimeChannelHandler {
    // --- Listener Registration Methods (onOutput, onClientMessage, etc.) ---
    // These are correct as they push to the internal handler arrays.
    onOutput(handler) {
        this.onMessageHandlers.push(handler);
        return this;
    }
    onClientMessage(handler) {
        this.onClientMessageHandlers.push(handler);
        return this;
    }
    onWebhook(handler) {
        this.onWebhookHandlers.push(handler);
        return this;
    }
    onResponseInitiator(handler) {
        this.onResponseInitiatorHandlers.push(handler);
        return this;
    }
    // --- Message Handling Logic ---
    // This logic is mostly correct, assuming the event naming conventions are right.
    async handleMessage(payload) {
        console.warn('Handling message payload:', payload, typeof payload);
        // 1. Always call ALL message handlers
        this.onMessageHandlers.forEach(handler => handler(payload));
        // 2. Check for client-specific messages
        if (payload.event === `client-${this.jarvisClient.getConfig().client_id}`) {
            this.onClientMessageHandlers.forEach(handler => handler(payload));
        }
        // 3. Check for webhook-initiated messages
        if (payload.event === `webhook-init-client-${this.jarvisClient.getConfig().client_id}`) {
            this.onWebhookHandlers.forEach(handler => handler(payload));
            // 4. Check for response initiator within webhook messages
            if (payload.payload && payload.payload.type === "response_initiator") {
                this.onResponseInitiatorHandlers.forEach(handler => handler(payload));
            }
        }
    }
    // --- Subscription Setup (FIXED) ---
    setupSubscriptions({ callback }) {
        // Note: Removed 'channel' argument as 'this.channel' is already set.
        console.warn(this.channel.state);
        // *** FIX: Use 'this.channel' instead of creating a new one. ***
        this.channel
            .on('broadcast', { event: "*" }, (payload) => {
            callback(payload);
        })
            .subscribe((status) => {
            console.warn('Subscription status:', status);
            // Removed the temporary "test" channel send. Should use 'this.channel'.
            if (status === 'SUBSCRIBED') {
                console.warn('Connected to Supabase Realtime channel.');
                // You should use this.channel.send for broadcast/presence instead of httpSend
                this.channel.send({ type: "broadcast", event: "broadcast", payload: { message: "Hello, Jarvis Realtime!", status } });
            }
        });
    }
    // --- Test Method (Unchanged) ---
    async testWebhookTrigger(client) {
        await this.realtimeClient.send_message({ type: "broadcast", event: `webhook-init-client-${client || this.jarvisClient.getConfig().client_id}`, payload: { type: "response_initiator", message: "This is a test webhook message." } });
    }
    // --- Constructor (FIXED) ---
    constructor(channelName, supabaseClient, realtimeClient, jarvisClient) {
        this.onMessageHandlers = []; // handlers for ALL incoming messages
        this.onClientMessageHandlers = [];
        this.onWebhookHandlers = [];
        this.onResponseInitiatorHandlers = [];
        this.supabaseClient = supabaseClient;
        // 1. Create and store the *one* channel instance
        this.channel = this.supabaseClient.channel(channelName);
        this.realtimeClient = realtimeClient;
        this.jarvisClient = jarvisClient;
        // 2. Subscribe using the stored channel instance (no need to pass the name)
        this.setupSubscriptions({
            callback: async (payload) => {
                console.warn('Received payload in handler:', payload);
                await this.handleMessage(payload);
            }
        });
    }
}
export class realtime {
    constructor(client, supabase) {
        this.client = client;
        this.supabase = supabase;
        this.status = "offline";
        this.handler = null;
        this.jarvisClient = client;
        this.supabaseClient = supabase;
    }
    async updateStatus(online) {
        this.status = online ? "online" : "offline";
        await this.jarvisClient.apiRequest("clients", { "op": "update", "client_id": this.jarvisClient.getConfig().client_id, status: online ? 'online' : 'offline' }, "POST");
        // await this.channel.send({ type: "broadcast", event: "client-status-update", payload: { client_id: this.jarvisClient.getConfig().client_id, status: online ? 'online' : 'offline' } });
    }
    async connect() {
        await this.updateStatus(true);
        this.handler = new realtimeChannelHandler(String(this.jarvisClient.getConfig().apiKey), this.supabaseClient, this, this.jarvisClient);
    }
    async disconnect() {
        await this.updateStatus(false);
        this.handler = null;
    }
    async send_message(message) {
        try {
            const res = await this.supabaseClient.channel(String(this.jarvisClient.getConfig().apiKey)).send({ ...message });
            console.warn(res);
            return true;
        }
        catch (error) {
            console.error('Error sending message:', error);
            return false;
        }
    }
}
export class JarvisClient {
    constructor(config = {}) {
        this.config = {
            baseUrl: 'https://jarvis-online.vercel.app/api', // Default Jarvis endpoint
            timeout: 30000, // 30 seconds
            ...config
        };
        this.supabaseClient = createClient("https://qhwitrmufuwsnmkifxdo.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFod2l0cm11ZnV3c25ta2lmeGRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzA0ODAyODIsImV4cCI6MjA0NjA1NjI4Mn0.7Wp5_AKEUsUGMA3xrJbfU7SMpIHbH3H74y9I2kHJ_0E");
        this.baseUrl = this.config.baseUrl;
        this.jarvis = new JarvisRequest(this);
        this.realtime = new realtime(this, this.supabaseClient);
    }
    /**
     * Generate Text-to-Speech audio from text
     */
    async genTTS(text) {
        try {
            const response = await this.makeRequest('POST', '/tts', {
                text,
                format: 'wav' // Default audio format
            });
            return {
                success: true,
                audioUrl: response.data?.audioUrl,
                audioData: response.data?.audioData,
                message: response.data?.message || 'TTS generated successfully'
            };
        }
        catch (error) {
            return {
                success: false,
                message: error instanceof Error ? error.message : 'TTS generation failed'
            };
        }
    }
    /**
     * Make a general request to the Jarvis API
     */
    async apiRequest(endpoint, data, method = 'POST') {
        try {
            const response = await this.makeRequest(method, `/${endpoint}`, data);
            return {
                success: true,
                data: response.data,
                statusCode: response.status,
                message: 'Request completed successfully'
            };
        }
        catch (error) {
            return {
                success: false,
                message: error instanceof Error ? error.message : 'Request failed',
                statusCode: error instanceof Error && 'status' in error ? error.status : 500
            };
        }
    }
    /**
     * Request Natural Language Understanding processing
     */
    async requestNLU(query) {
        try {
            const response = await this.makeRequest('POST', '/nlu', {
                query,
                includeEntities: true
            });
            return {
                success: true,
                intent: response.data?.intent,
                entities: response.data?.entities,
                confidence: response.data?.confidence,
                message: response.data?.message || 'NLU processing completed'
            };
        }
        catch (error) {
            return {
                success: false,
                message: error instanceof Error ? error.message : 'NLU processing failed'
            };
        }
    }
    /**
     * Internal method to make HTTP requests
     */
    async makeRequest(method, endpoint, data) {
        const url = `${this.baseUrl}${endpoint}`;
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
            },
            ...(data && { body: JSON.stringify(data) })
        };
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const responseData = await response.json();
            return {
                data: responseData,
                status: response.status,
                statusText: response.statusText
            };
        }
        catch (error) {
            clearTimeout(timeoutId);
            if (error instanceof Error) {
                if (error.name === 'AbortError') {
                    throw new Error(`Request timed out after ${this.config.timeout}ms`);
                }
                throw error;
            }
            throw new Error('Unknown error occurred');
        }
    }
    /**
     * Build URL for EventSource streaming with query parameters
     */
    buildStreamUrl(endpoint, data) {
        let url = `${this.baseUrl}${endpoint}?key=${encodeURIComponent(this.config.apiKey || '')}`;
        // Add data as query parameters
        Object.keys(data).forEach(key => {
            let value = data[key];
            if (value !== undefined && value !== null) {
                url += `&${encodeURIComponent(key)}=${encodeURIComponent(typeof value === "object" ? JSON.stringify(value) : value)}`;
            }
        });
        console.warn('Built stream URL:', url); // Log the built URL for debugging
        return url;
    }
    /**
     * Internal method to make streaming HTTP requests
     */
    async makeStreamRequest(endpoint, data, signal) {
        const url = `${this.baseUrl}${endpoint}`;
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream',
                ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
            },
            body: JSON.stringify(data),
            signal
        };
        const response = await fetch(url, options);
        return response;
    }
    /**
     * Update the configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        if (newConfig.baseUrl) {
            this.baseUrl = newConfig.baseUrl;
        }
    }
    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }
}
// Default export for convenience
export default JarvisClient;
//# sourceMappingURL=index.js.map