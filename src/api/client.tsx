import type {
    LoginResponse,
    ConversationCreateResponse,
    TurnResponse,
    CDG,
    TurnItem,
} from "../core/type";

const BASE =
    process.env.REACT_APP_API_BASE_URL?.replace(/\/$/, "") || "http://43.138.212.17:3001";

async function http<T>(path: string, opts: RequestInit = {}, token?: string): Promise<T> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(opts.headers as any),
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${BASE}${path}`, { ...opts, headers });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
    }
    return (await res.json()) as T;
}

type TurnStreamHandlers = {
    signal?: AbortSignal;
    onStart?: (d: any) => void;
    onToken?: (t: string) => void;
    onPing?: (d: any) => void;
    onDone?: (out: TurnResponse) => void;
    onError?: (err: any) => void;
};

function takeSseBlocks(buf: string): { blocks: string[]; rest: string } {
    // 兼容 \n\n 和 \r\n\r\n
    const blocks: string[] = [];
    while (true) {
        const idx = buf.search(/\r?\n\r?\n/);
        if (idx < 0) break;
        const block = buf.slice(0, idx);
        buf = buf.slice(idx).replace(/^\r?\n\r?\n/, "");
        if (block.trim()) blocks.push(block);
    }
    return { blocks, rest: buf };
}

function parseSseBlock(block: string): { event: string; data: string } | null {
    const lines = block.split(/\r?\n/);
    let event = "message";
    const dataLines: string[] = [];

    for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }

    const data = dataLines.join("\n");
    if (!data) return null;
    return { event, data };
}

function parseMaybeJson(raw: string): any {
    const s = raw.trim();
    if (!s) return s;
    try {
        return JSON.parse(s);
    } catch {
        return s;
    }
}

export const api = {
    health: () => http<{ ok: boolean }>("/healthz"),

    login: (username: string) =>
        http<LoginResponse>("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({ username }),
        }),

    createConversation: (token: string, title: string) =>
        http<ConversationCreateResponse>(
            "/api/conversations",
            { method: "POST", body: JSON.stringify({ title }) },
            token
        ),

    getConversation: (token: string, cid: string) =>
        http<{ conversationId: string; title: string; systemPrompt: string; graph: CDG }>(
            `/api/conversations/${cid}`,
            {},
            token
        ),

    getTurns: (token: string, cid: string, limit = 80) =>
        http<TurnItem[]>(`/api/conversations/${cid}/turns?limit=${limit}`, {}, token),

    turn: (token: string, cid: string, userText: string) =>
        http<TurnResponse>(
            `/api/conversations/${cid}/turn`,
            { method: "POST", body: JSON.stringify({ userText }) },
            token
        ),

    // ✅ POST + SSE（手动解析）
    turnStream: async (token: string, cid: string, userText: string, h: TurnStreamHandlers) => {
        const res = await fetch(`${BASE}/api/conversations/${cid}/turn/stream`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "text/event-stream",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ userText }),
            signal: h.signal,
        });

        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(text || `HTTP ${res.status}`);
        }
        if (!res.body) throw new Error("No response body");

        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");

        let buf = "";
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buf += decoder.decode(value, { stream: true });
            const { blocks, rest } = takeSseBlocks(buf);
            buf = rest;

            for (const b of blocks) {
                const msg = parseSseBlock(b);
                if (!msg) continue;

                const payload = parseMaybeJson(msg.data);

                if (msg.event === "start") h.onStart?.(payload);
                else if (msg.event === "ping") h.onPing?.(payload);
                else if (msg.event === "token") {
                    // ✅ 兼容 data 是 string 或 {token:string}
                    const tk =
                        typeof payload === "string"
                            ? payload
                            : typeof payload?.token === "string"
                                ? payload.token
                                : "";
                    if (tk) h.onToken?.(tk);
                } else if (msg.event === "done") {
                    h.onDone?.(payload as TurnResponse);
                } else if (msg.event === "error") {
                    h.onError?.(payload);
                }
            }
        }
    },
};
