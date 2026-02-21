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

const API_BASE_STORAGE_KEY = "cg.apiBase";
const ENV_BASES_RAW =
    process.env.REACT_APP_API_BASE_URLS || process.env.REACT_APP_API_BASE_URL || "";

function normalizeBase(base: string): string {
    const trimmed = String(base || "").trim();
    if (!trimmed || trimmed === "/") return "";
    return trimmed.replace(/\/+$/, "");
}

function parseEnvBases(raw: string): string[] {
    return Array.from(
        new Set(
            String(raw || "")
                .split(",")
                .map((x) => normalizeBase(x))
                .filter(Boolean)
        )
    );
}

function readRuntimePreferredBase(): string {
    if (typeof window === "undefined") return "";
    try {
        const qs = new URLSearchParams(window.location.search);
        const fromQuery = normalizeBase(qs.get("apiBase") || "");
        if (fromQuery) {
            window.localStorage.setItem(API_BASE_STORAGE_KEY, fromQuery);
            return fromQuery;
        }
        return normalizeBase(window.localStorage.getItem(API_BASE_STORAGE_KEY) || "");
    } catch {
        return "";
    }
}

function resolveApiBases(): string[] {
    const envBases = parseEnvBases(ENV_BASES_RAW);
    const runtimeBase = readRuntimePreferredBase();
    const bases = [runtimeBase, "", ...envBases].map(normalizeBase).filter((x, i, arr) => arr.indexOf(x) === i);
    return bases.length ? bases : [""];
}

function buildUrl(base: string, path: string) {
    if (!path.startsWith("/")) path = `/${path}`;
    return `${base}${path}`;
}

function makeRetriableStatusSet() {
    return new Set([404, 408, 425, 429, 500, 502, 503, 504]);
}
const RETRIABLE_STATUS = makeRetriableStatusSet();

function withAuthHeaders(opts: RequestInit = {}, token?: string): HeadersInit {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(opts.headers as any),
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
}

function isNetworkLikeError(err: unknown) {
    const msg = String((err as any)?.message || err || "");
    return /failed to fetch|networkerror|load failed|fetch failed|network request failed/i.test(msg);
}

async function fetchWithBaseFallback(
    path: string,
    opts: RequestInit = {},
    token?: string
): Promise<{ res: Response; base: string }> {
    const bases = resolveApiBases();
    let lastErr: any = null;
    for (let i = 0; i < bases.length; i += 1) {
        const base = bases[i];
        const url = buildUrl(base, path);
        try {
            const res = await fetch(url, { ...opts, headers: withAuthHeaders(opts, token) });
            if (!res.ok && RETRIABLE_STATUS.has(res.status) && i < bases.length - 1) {
                lastErr = new Error(`HTTP ${res.status} from ${url}`);
                continue;
            }
            return { res, base };
        } catch (err: any) {
            lastErr = err;
            if (!isNetworkLikeError(err) || i >= bases.length - 1) {
                throw err;
            }
        }
    }
    throw lastErr || new Error("request failed");
}

/** --------- 普通 JSON 请求 --------- */
async function http<T>(path: string, opts: RequestInit = {}, token?: string): Promise<T> {
    const { res } = await fetchWithBaseFallback(path, opts, token);

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
    const bases = resolveApiBases();
    let res: Response | null = null;
    let lastErr: any = null;
    for (let i = 0; i < bases.length; i += 1) {
        const base = bases[i];
        const url = buildUrl(base, `/api/conversations/${cid}/turn/stream`);
        try {
            const attempt = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "text/event-stream",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ userText }),
                signal: handlers.signal,
            });
            if (!attempt.ok && RETRIABLE_STATUS.has(attempt.status) && i < bases.length - 1) {
                lastErr = new Error(`HTTP ${attempt.status} from ${url}`);
                continue;
            }
            res = attempt;
            break;
        } catch (err: any) {
            lastErr = err;
            if (!isNetworkLikeError(err) || i >= bases.length - 1) throw err;
        }
    }
    if (!res) throw lastErr || new Error("SSE stream failed");

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
