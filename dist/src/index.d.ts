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
export type OutputHandler = (content: string, data?: any) => void;
export type ToolCallsHandler = (toolCalls: any[], data?: any) => void;
export type ToolCallHandler = (toolCall: ToolCall) => void;
export type MCPCallHandler = (mcpCall: MCPCall) => void;
export type McpToolCallsHandler = (mcpToolCalls: any[], data?: any) => void;
export type ThoughtsHandler = (thoughts: any, metadata: {
    isFinal: boolean;
    data?: any;
}) => void;
export type ResponseHandler = (response: string, metadata: {
    isFinal: boolean;
    data?: any;
}) => void;
export type NLUHandler = (nluResult: NLUResult, data?: any) => void;
export type ConversationHandler = (conversation: any[], data?: any) => void;
export type ErrorHandler = (error: Error | string) => void;
export type DoneHandler = () => void;
export declare class JarvisStream {
    private client;
    private endpoint;
    private data;
    private outputHandlers;
    private toolCallsHandlers;
    private toolCallHandlers;
    private mcpCallHandlers;
    private mcpToolCallsHandlers;
    private thoughtsHandlers;
    private responseHandlers;
    private nluHandlers;
    private conversationHandlers;
    private errorHandlers;
    private doneHandlers;
    private abortController;
    private isStreaming;
    private buffer;
    readonly url: string;
    constructor(client: JarvisClient, endpoint: string, data: any);
    onOutput(handler: OutputHandler): this;
    onToolCalls(handler: ToolCallsHandler): this;
    onToolCall(handler: ToolCallHandler): this;
    onMcpToolCalls(handler: McpToolCallsHandler): this;
    onThoughts(handler: ThoughtsHandler): this;
    onResponse(handler: ResponseHandler): this;
    onNLU(handler: NLUHandler): this;
    onConversation(handler: ConversationHandler): this;
    onError(handler: ErrorHandler): this;
    onDone(handler: DoneHandler): this;
    start(): Promise<void>;
    private startEventSourceStream;
    private startFetchStream;
    private processSSEChunk;
    stop(): void;
    private handleStreamData;
    private handleError;
    private handleDone;
}
export interface JarvisStreamOptions {
    interrim?: boolean;
    speech?: boolean;
    model?: string;
    convo_updates?: boolean | string;
    save?: boolean;
    pa?: boolean;
    nlu?: boolean;
    nlu_config?: any;
    lat?: number;
    lon?: number;
    media?: string;
    dt?: number;
    [key: string]: any;
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
export declare class JarvisStreamRequest {
    private client;
    constructor(client: JarvisClient);
    jarvis(inputText: string, options?: JarvisStreamOptions): JarvisStream;
    tts(text: string, options?: TTSStreamOptions): JarvisStream;
    nlu(query: string, options?: NLUStreamOptions): JarvisStream;
}
export declare class JarvisRequest {
    private client;
    constructor(client: JarvisClient);
    get stream(): JarvisStreamRequest;
    jarvis(inputText: string, options?: JarvisStreamOptions): Promise<JarvisResponse>;
}
export declare class JarvisClient {
    private config;
    private baseUrl;
    readonly jarvis: JarvisRequest;
    constructor(config?: JarvisConfig);
    /**
     * Generate Text-to-Speech audio from text
     */
    genTTS(text: string): Promise<TTSResponse>;
    /**
     * Make a general request to the Jarvis API
     */
    apiRequest<T = any>(endpoint: string, data?: any, method?: 'GET' | 'POST' | 'PUT' | 'DELETE'): Promise<JarvisResponse<T>>;
    /**
     * Request Natural Language Understanding processing
     */
    requestNLU(query: string): Promise<NLUResponse>;
    /**
     * Internal method to make HTTP requests
     */
    private makeRequest;
    /**
     * Build URL for EventSource streaming with query parameters
     */
    buildStreamUrl(endpoint: string, data: any): string;
    /**
     * Internal method to make streaming HTTP requests
     */
    makeStreamRequest(endpoint: string, data: any, signal: AbortSignal): Promise<Response>;
    /**
     * Update the configuration
     */
    updateConfig(newConfig: Partial<JarvisConfig>): void;
    /**
     * Get current configuration
     */
    getConfig(): JarvisConfig;
}
export default JarvisClient;
//# sourceMappingURL=index.d.ts.map