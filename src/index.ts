export interface JarvisConfig {
  baseUrl?: string;
  apiKey?: string;
  timeout?: number;
}

export interface TTSResponse {
  audioUrl?: string;
  audioData?: ArrayBuffer;
  success: boolean;
  message?: string;
}

export interface NLUResponse {
  intent?: string;
  entities?: Record<string, any>;
  confidence?: number;
  success: boolean;
  message?: string;
}

export interface JarvisResponse<T = any> {
  data?: T;
  success: boolean;
  message?: string;
  statusCode?: number;
}

// New interfaces for the fluent API
export interface JarvisStreamData {
  type: 'output' | 'tool_call' | 'mcp_call' | 'thoughts' | 'error' | 'done';
  content?: string;
  data?: any;
  timestamp?: number;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, any>;
  id?: string;
}

export interface MCPCall {
  server: string;
  method: string;
  params: Record<string, any>;
  id?: string;
}

export interface ThoughtsData {
  reasoning?: string;
  planning?: string;
  reflection?: string;
}

export interface NLUResult {
  nlu: {
    result: string;
  };
}

export interface DoneEvent {
  type: 'output' | 'tts' | '*' | string; // Subject to possible change
  [key: string]: any; // Allow additional properties
}

// Event handler types
export type OutputHandler = (content: string, data?: any) => void;
export type ToolCallsHandler = (toolCalls: any[], data?: any) => void;
export type ToolCallHandler = (toolCall: ToolCall) => void;
export type MCPCallHandler = (mcpCall: MCPCall) => void;
export type McpToolCallsHandler = (mcpToolCalls: any[], data?: any) => void;
export type ThoughtsHandler = (thoughts: any, metadata: { isFinal: boolean, data?: any }) => void;
export type ResponseHandler = (response: string, metadata: { isFinal: boolean, data?: any }) => void;
export type NLUHandler = (nluResult: NLUResult, data?: any) => void;
export type ConversationHandler = (conversation: any[], data?: any) => void;
export type AudioChunkHandler = (audioChunk: string, data?: any) => void;
export type ErrorHandler = (error: Error | string) => void;
export type DoneHandler = (doneEvent: DoneEvent) => void;

export class JarvisStream {
  private outputHandlers: OutputHandler[] = [];
  private toolCallsHandlers: ToolCallsHandler[] = [];
  private toolCallHandlers: ToolCallHandler[] = [];
  private mcpCallHandlers: MCPCallHandler[] = [];
  private mcpToolCallsHandlers: McpToolCallsHandler[] = [];
  private thoughtsHandlers: ThoughtsHandler[] = [];
  private responseHandlers: ResponseHandler[] = [];
  private nluHandlers: NLUHandler[] = [];
  private conversationHandlers: ConversationHandler[] = [];
  private audioChunkHandlers: AudioChunkHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];
  private doneHandlers: DoneHandler[] = [];
  
  private abortController: AbortController;
  private isStreaming: boolean = false;
  
  // Buffer for incomplete SSE data
  private buffer: string = '';
  
  // Public property to access the stream URL
  public readonly url: string;

  constructor(
    private client: JarvisClient,
    private endpoint: string,
    private data: any,
  ) {
    this.abortController = new AbortController();
    // Build the URL when the stream is created
    this.url = this.client.buildStreamUrl(this.endpoint, this.data);
  }

  onOutput(handler: OutputHandler): this {
    this.outputHandlers.push(handler);
    return this;
  }

  onToolCalls(handler: ToolCallsHandler): this {
    this.toolCallsHandlers.push(handler);
    return this;
  }

  onToolCall(handler: ToolCallHandler): this {
    this.toolCallHandlers.push(handler);
    return this;
  }

  onMcpToolCalls(handler: McpToolCallsHandler): this {
    this.mcpToolCallsHandlers.push(handler);
    return this;
  }

  onThoughts(handler: ThoughtsHandler): this {
    this.thoughtsHandlers.push(handler);
    return this;
  }

  onResponse(handler: ResponseHandler): this {
    this.responseHandlers.push(handler);
    return this;
  }

  onNLU(handler: NLUHandler): this {
    this.nluHandlers.push(handler);
    return this;
  }

  onConversation(handler: ConversationHandler): this {
    this.conversationHandlers.push(handler);
    return this;
  }

  onAudioChunk(handler: AudioChunkHandler): this {
    this.audioChunkHandlers.push(handler);
    return this;
  }

  onError(handler: ErrorHandler): this {
    this.errorHandlers.push(handler);
    return this;
  }

  onDone(handler: DoneHandler): this {
    this.doneHandlers.push(handler);
    return this;
  }

  async start(): Promise<void> {
    if (this.isStreaming) {
      throw new Error('Stream is already active');
    }

    this.isStreaming = true;

    try {
      // Always try to use EventSource since your API expects GET requests
      // We'll use a polyfill for Node.js if needed
      await this.startEventSourceStream();
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async startEventSourceStream(): Promise<void> {
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

  private async startFetchStream(): Promise<void> {
    const response = await this.client.makeStreamRequest(
      this.endpoint,
      this.data,
      this.abortController.signal
    );

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

  private processSSEChunk(chunk: string): void {
    // Add chunk to buffer
    this.buffer += chunk;
    
    // Split by double newlines to separate complete SSE messages
    const messages = this.buffer.split('\n\n');
    
    // Keep the last message in buffer if it might be incomplete
    this.buffer = messages.pop() || '';
    
    // Process each complete message
    for (const message of messages) {
      if (!message.trim()) continue;
      
      const lines = message.split('\n');
      let eventType = '';
      let data = '';
      
      // Parse SSE format
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.substring(7);
        } else if (line.startsWith('data: ')) {
          data += line.substring(6);
        }
      }
      
      if (!data) continue;
      
      try {
        // Handle completion signals
        if (data === '[DONE]' || data === 'DONE') {
          this.handleDone({ type: '*' });
          return;
        }
        
        // Parse JSON data
        const parsedData = JSON.parse(data);
        this.handleStreamData(parsedData);
        
      } catch (error) {
        // If JSON parsing fails, it might be plain text
        if (data.trim()) {
          this.outputHandlers.forEach(handler => handler(data));
        }
        console.warn('Failed to parse SSE data:', data, error);
      }
    }
  }

  stop(): void {
    this.isStreaming = false;
    this.abortController.abort();
  }

  private handleStreamData(data: any): void {
    // Handle interim response - route to onResponse with isFinal: false
    if (data.interrim_response) {
      this.responseHandlers.forEach(handler => 
        handler(data.interrim_response, { isFinal: false, data })
      );
    }
    
    // Handle interim thoughts - route to onThoughts with isFinal: false
    if (data.interrim_thoughts) {
      this.thoughtsHandlers.forEach(handler => 
        handler(data.interrim_thoughts, { isFinal: false, data })
      );
    }
    
    // Handle tool calls array
    if (data.tool_calls && Array.isArray(data.tool_calls)) {
      this.toolCallsHandlers.forEach(handler => 
        handler(data.tool_calls, data)
      );
      // Also trigger individual tool call handlers for each tool
      data.tool_calls.forEach((toolCall: any) => {
        this.toolCallHandlers.forEach(handler => handler(toolCall));
      });
    }
    
    // Handle MCP tool calls array
    if (data.mcp_tool_calls && Array.isArray(data.mcp_tool_calls)) {
      this.mcpToolCallsHandlers.forEach(handler => 
        handler(data.mcp_tool_calls, data)
      );
    }
    
    // Handle final thoughts (complete version) - route to onThoughts with isFinal: true
    if (data.thoughts) {
      this.thoughtsHandlers.forEach(handler => 
        handler(data.thoughts, { isFinal: true, data })
      );
    }
    
    // Handle final response (complete version) - route to onResponse with isFinal: true
    if (data.response) {
      this.responseHandlers.forEach(handler => 
        handler(data.response, { isFinal: true, data })
      );
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
      } else {
        this.handleDone({ type: '*' });
      }
    }
    
    // Handle specific event types if your API uses the 'type' field
    if (data.type) {
      switch (data.type) {
        case 'output':
        case 'text':
        case 'content':
          this.outputHandlers.forEach(handler => 
            handler(data.content || data.text || '', data)
          );
          break;
        
        case 'interrim_response':
          this.responseHandlers.forEach(handler => 
            handler(data.content || data.data || '', { isFinal: false, data })
          );
          break;
          
        case 'interrim_thoughts':
          this.thoughtsHandlers.forEach(handler => 
            handler(data.data || data.content, { isFinal: false, data })
          );
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
          this.thoughtsHandlers.forEach(handler => 
            handler(data.data || data, { isFinal: true, data })
          );
          break;
          
        case 'response':
          this.responseHandlers.forEach(handler => 
            handler(data.content || data.data || '', { isFinal: true, data })
          );
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
  }  private handleError(error: Error): void {
    this.errorHandlers.forEach(handler => handler(error));
  }

  private handleDone(doneEvent?: DoneEvent | any): void {
    // If doneEvent is not provided or is a boolean/string, create a default event
    let event: DoneEvent;
    if (!doneEvent || typeof doneEvent === 'boolean' || typeof doneEvent === 'string') {
      event = { type: '*' };
    } else if (doneEvent.type) {
      // Already a proper DoneEvent
      event = doneEvent;
    } else if (doneEvent.done) {
      // Handle { done: { type: '...' } } structure
      event = doneEvent.done;
    } else {
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

export interface JarvisStreamOptions {
  interrim?: boolean;  // Whether to provide interim results (default true)
  speech?: boolean;    // Generate speech or not (default false) 
  model?: string;      // Force model choice, otherwise user's default (default null)
  convo_updates?: boolean | string; // Send full conversation or just new messages
  save?: boolean;      // Save message or not (default true)
  pa?: boolean;        // Force the message to be proactive, overriding NLU (default false)
  nlu?: boolean;       // Run message through NLU to determine if it's for jarvis (default false)
  nlu_config?: any;    // NLU configuration object for server speedup (avoids DB queries)
  lat?: number;        // Latitude parameter
  lon?: number;        // Longitude parameter  
  media?: string;      // URLs separated by commas for vision models
  dt?: number;         // Datetime parameter - Unix timestamp (new Date().getTime() / 1000)
  [key: string]: any;  // Allow additional options
}

export interface TTSStreamOptions {
  voice?: string;
  speed?: number;
  format?: string;
  [key: string]: any;
}

export interface NLUStreamOptions {
  includeEntities?: boolean;
  context?: string;
  [key: string]: any;
}

export class JarvisStreamRequest {
  constructor(private client: JarvisClient) {}

  jarvis(inputText: string, options?: JarvisStreamOptions): JarvisStream {
    return new JarvisStream(this.client, '/new-jarvis-stream', {
      input: inputText,
      ...options,
      stream: true,
    });
  }

  tts(text: string, options?: TTSStreamOptions): JarvisStream {
    return new JarvisStream(this.client, '/tts/stream', {
      text,
      stream: true,
      ...options
    });
  }

  nlu(query: string, options?: NLUStreamOptions): JarvisStream {
    return new JarvisStream(this.client, '/nlu/stream', {
      query,
      stream: true,
      ...options
    });
  }
}

export class JarvisRequest {
  constructor(private client: JarvisClient) {}

  get stream() {
    return new JarvisStreamRequest(this.client);
  }

  // Non-streaming methods
  async jarvis(inputText: string, options?: JarvisStreamOptions): Promise<JarvisResponse> {
    return this.client.apiRequest('/new-jarvis-stream', { input: inputText, ...options });
  }
}

export class JarvisClient {
  private config: JarvisConfig;
  private baseUrl: string;
  public readonly jarvis: JarvisRequest;

  constructor(config: JarvisConfig = {}) {
    this.config = {
      baseUrl: 'https://jarvis-online.vercel.app/api', // Default Jarvis endpoint
      timeout: 30000, // 30 seconds
      ...config
    };
    this.baseUrl = this.config.baseUrl!;
    this.jarvis = new JarvisRequest(this);
  }

  /**
   * Generate Text-to-Speech audio from text
   */
  async genTTS(text: string): Promise<TTSResponse> {
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
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'TTS generation failed'
      };
    }
  }

  /**
   * Make a general request to the Jarvis API
   */
  async apiRequest<T = any>(endpoint: string, data?: any, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'POST'): Promise<JarvisResponse<T>> {
    try {
      const response = await this.makeRequest(method, `/${endpoint}`, data);
      return {
        success: true,
        data: response.data,
        statusCode: response.status,
        message: 'Request completed successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Request failed',
        statusCode: error instanceof Error && 'status' in error ? (error as any).status : 500
      };
    }
  }

  /**
   * Request Natural Language Understanding processing
   */
  async requestNLU(query: string): Promise<NLUResponse> {
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
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'NLU processing failed'
      };
    }
  }

  /**
   * Internal method to make HTTP requests
   */
  private async makeRequest(method: string, endpoint: string, data?: any): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const options: RequestInit = {
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
    } catch (error) {
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
  buildStreamUrl(endpoint: string, data: any): string {
    let url = `${this.baseUrl}${endpoint}?key=${encodeURIComponent(this.config.apiKey || '')}`;
    
    // Add data as query parameters
    Object.keys(data).forEach(key => {
      let value = data[key];
      if (value !== undefined && value !== null) {
        url += `&${encodeURIComponent(key)}=${encodeURIComponent( typeof value==="object" ? JSON.stringify(value) : value )}`;
      }
    });

    console.warn('Built stream URL:', url); // Log the built URL for debugging
    return url;
  }

  /**
   * Internal method to make streaming HTTP requests
   */
  async makeStreamRequest(endpoint: string, data: any, signal: AbortSignal): Promise<Response> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const options: RequestInit = {
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
  updateConfig(newConfig: Partial<JarvisConfig>): void {
    this.config = { ...this.config, ...newConfig };
    if (newConfig.baseUrl) {
      this.baseUrl = newConfig.baseUrl;
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): JarvisConfig {
    return { ...this.config };
  }
}

// Default export for convenience
export default JarvisClient;