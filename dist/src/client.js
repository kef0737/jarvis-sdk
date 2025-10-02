// src/client.ts
import { request } from "./utils";
export class JarvisClient {
    constructor(apiKey, baseUrl = "http://localhost:3000/api") {
        this.requests = {
            input: {
                create: async (inputText, params) => {
                    const res = await request(`${this.baseUrl}/requests/input/create`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${this.apiKey}`,
                        },
                        body: JSON.stringify(Object.assign({ input: inputText }, params)),
                    });
                    return res.json();
                },
            },
            tts: {
                create: async (text, params) => {
                    const res = await request(`${this.baseUrl}/requests/tts/create`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${this.apiKey}`,
                        },
                        body: JSON.stringify(Object.assign({ text }, params)),
                    });
                    return res.json();
                },
            },
            nlu: {
                create: async (text, params) => {
                    const res = await request(`${this.baseUrl}/requests/nlu/create`, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${this.apiKey}`,
                        },
                        body: JSON.stringify(Object.assign({ text }, params)),
                    });
                    return res.json();
                },
            },
        };
        this.stream = {
            requests: {
                input: {
                    create: (inputText, params, callbacks) => {
                        const url = new URL(`${this.baseUrl}/new-jarvis-stream`);
                        url.searchParams.append("input", inputText);
                        url.searchParams.append("apiKey", this.apiKey);
                        if (params) {
                            Object.entries(params).forEach(([key, value]) => {
                                url.searchParams.append(key, String(value));
                            });
                        }
                        const eventSource = new EventSource(url.toString());
                        eventSource.onmessage = (e) => {
                            var _a, _b, _c, _d, _e, _f;
                            const data = JSON.parse(e.data);
                            // thoughs
                            if (data === null || data === void 0 ? void 0 : data.interrim_thoughts) {
                                (_a = callbacks.onThoughts) === null || _a === void 0 ? void 0 : _a.call(callbacks, { text: data.interrim_thoughts, isFinal: false });
                            }
                            if (data === null || data === void 0 ? void 0 : data.thoughts) {
                                (_b = callbacks.onThoughts) === null || _b === void 0 ? void 0 : _b.call(callbacks, { text: data.thoughts, isFinal: true });
                            }
                            // normal response
                            if (data === null || data === void 0 ? void 0 : data.interrim_response) {
                                (_c = callbacks.onResponse) === null || _c === void 0 ? void 0 : _c.call(callbacks, { text: data.interrim_response, isFinal: false });
                            }
                            if (data === null || data === void 0 ? void 0 : data.response) {
                                (_d = callbacks.onResponse) === null || _d === void 0 ? void 0 : _d.call(callbacks, { text: data.response, isFinal: true });
                            }
                            // tool calls
                            if (data === null || data === void 0 ? void 0 : data.tool_calls) {
                                for (const tool_call of data.tool_calls) {
                                    (_e = callbacks.onToolCall) === null || _e === void 0 ? void 0 : _e.call(callbacks, tool_call);
                                }
                            }
                            // mcp calls
                            if (data === null || data === void 0 ? void 0 : data.mcp_tool_calls) {
                                for (const mcp_call of data.mcp_tool_calls) {
                                    (_f = callbacks.onMCPCall) === null || _f === void 0 ? void 0 : _f.call(callbacks, mcp_call);
                                }
                            }
                        };
                        return eventSource;
                    },
                },
            },
        };
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
    }
}
// Usage example:
// const jarvis = new JarvisClient("YOUR_API_KEY");
// const res = await jarvis.requests.input.create("Hello");
// const stream = jarvis.stream.requests.input.create("Hello", {}, {
//   onText: console.log,
//   onThoughts: console.log,
//   onFunctionCall: console.log,
// });
