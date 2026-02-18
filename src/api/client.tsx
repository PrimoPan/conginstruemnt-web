// src/api/client.ts
import type {
    LoginResponse,
    ConversationSummary,
    ConversationDetail,
    ConversationCreateResponse,
    GraphSaveResponse,
    TurnResponse,
    TurnItem,
    TurnStreamStartData,
    TurnStreamPingData,
    TurnStreamErrorData,
} from "../core/type";

const BASE =
    process.env.REACT_APP_API_BASE_URL?.replace(/\/$/, "") || "http://43.138.212.17:3001";

/** --------- 普通 JSON 请求 --------- */
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

/** --------- SSE（POST）流式 turn --------- */
export type TurnStreamHandlers = {
    signal?: AbortSignal;
    onStart?: (d: TurnStreamStartData) => void;
    onToken?: (t: string) => void;
    onPing?: (d: TurnStreamPingData) => void;
    onDone?: (out: TurnResponse) => void;
    onError?: (err: TurnStreamErrorData) => void;
};

function parseMaybeJson(raw: string): any {
    const s = raw.trim();
    if (!s) return s;
    try {
        return JSON.parse(s);
    } catch {
        return s;
    }
}

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
    // 忽略 retry / 注释行（:ok）
    const lines = block
        .split(/\r?\n/)
        .map((l) => l.trimEnd())
        .filter((l) => l.length > 0 && !l.startsWith("retry:") && !l.startsWith(":"));

    if (!lines.length) return null;

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

function toStartData(payload: any): TurnStreamStartData {
    return {
        conversationId:
            payload && typeof payload.conversationId === "string" ? payload.conversationId : "",
        graphVersion:
            payload && Number.isFinite(Number(payload.graphVersion))
                ? Number(payload.graphVersion)
                : 0,
    };
}

function toPingData(payload: any): TurnStreamPingData {
    return {
        t:
            payload && Number.isFinite(Number(payload.t))
                ? Number(payload.t)
                : Date.now(),
    };
}

async function postTurnStream(params: {
    token: string;
    cid: string;
    userText: string;
    handlers: TurnStreamHandlers;
}) {
    const { token, cid, userText, handlers } = params;

    const res = await fetch(`${BASE}/api/conversations/${cid}/turn/stream`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userText }),
        signal: handlers.signal,
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
    }
    if (!res.body) throw new Error("No response body (SSE stream not available)");

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");

    let buf = "";
    let gotDone = false;

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

            if (msg.event === "start") handlers.onStart?.(toStartData(payload));
            else if (msg.event === "ping") handlers.onPing?.(toPingData(payload));
            else if (msg.event === "token") {
                // 后端是 data: {"token":"..."}；也兼容直接 string
                const tk =
                    typeof payload === "string"
                        ? payload
                        : typeof payload?.token === "string"
                            ? payload.token
                            : "";
                if (tk) handlers.onToken?.(tk);
            } else if (msg.event === "done") {
                gotDone = true;
                handlers.onDone?.(payload as TurnResponse);
            } else if (msg.event === "error") {
                const errPayload: TurnStreamErrorData =
                    payload && typeof payload === "object" && typeof payload.message === "string"
                        ? (payload as TurnStreamErrorData)
                        : { message: typeof payload === "string" ? payload : "stream failed" };
                handlers.onError?.(errPayload);
            }
        }
    }

    if (!gotDone) {
        // 流结束但没有 done：通常是网络中断/后端异常
        throw new Error("SSE stream ended without done event");
    }
}

/** --------- API 导出 --------- */
export const api = {
    health: () => http<{ ok: boolean }>("/healthz"),

    login: (username: string) =>
        http<LoginResponse>("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({ username }),
        }),

    listConversations: (token: string) =>
        http<ConversationSummary[]>("/api/conversations", {}, token),

    createConversation: (token: string, title: string) =>
        http<ConversationCreateResponse>(
            "/api/conversations",
            { method: "POST", body: JSON.stringify({ title }) },
            token
        ),

    getConversation: (token: string, cid: string) =>
        http<ConversationDetail>(`/api/conversations/${cid}`, {}, token),

    saveGraph: (
        token: string,
        cid: string,
        graph: ConversationDetail["graph"],
        opts?: { requestAdvice?: boolean; advicePrompt?: string }
    ) =>
        http<GraphSaveResponse>(
            `/api/conversations/${cid}/graph`,
            {
                method: "PUT",
                body: JSON.stringify({
                    graph,
                    requestAdvice: !!opts?.requestAdvice,
                    advicePrompt: opts?.advicePrompt || "",
                }),
            },
            token
        ),

    getTurns: (token: string, cid: string, limit = 80) =>
        http<TurnItem[]>(`/api/conversations/${cid}/turns?limit=${limit}`, {}, token),

    // 非流式（保留）
    turn: (token: string, cid: string, userText: string) =>
        http<TurnResponse>(
            `/api/conversations/${cid}/turn`,
            { method: "POST", body: JSON.stringify({ userText }) },
            token
        ),

    // ✅ 流式（SSE）
    turnStream: (token: string, cid: string, userText: string, handlers: TurnStreamHandlers) =>
        postTurnStream({ token, cid, userText, handlers }),
};
