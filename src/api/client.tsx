// src/api/client.ts
import type {
    AppLocale,
    ConceptItem,
    ConceptMotif,
    MotifLink,
    ContextItem,
    ConceptSaveResponse,
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
    TravelPlanningBootstrapRequest,
    MotifTransferState,
} from "../core/type";

type ManualReferencePayload = {
    motif_type_id?: string;
    title?: string;
    text: string;
};

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
        const fromQueryRaw = String(qs.get("apiBase") || "").trim();
        if (fromQueryRaw.toLowerCase() === "auto") {
            window.localStorage.removeItem(API_BASE_STORAGE_KEY);
            return "";
        }

        const fromQuery = normalizeBase(fromQueryRaw);
        if (fromQuery) {
            window.localStorage.setItem(API_BASE_STORAGE_KEY, fromQuery);
            return fromQuery;
        }
        return normalizeBase(window.localStorage.getItem(API_BASE_STORAGE_KEY) || "");
    } catch {
        return "";
    }
}

function inferHostApiBase(): string {
    if (typeof window === "undefined") return "";
    try {
        const { protocol, hostname } = window.location;
        if (!protocol || !hostname) return "";
        return normalizeBase(`${protocol}//${hostname}:3001`);
    } catch {
        return "";
    }
}

function rememberWorkingBase(base: string, ok: boolean) {
    if (!ok || typeof window === "undefined") return;
    try {
        const normalized = normalizeBase(base);
        if (normalized) window.localStorage.setItem(API_BASE_STORAGE_KEY, normalized);
        else window.localStorage.removeItem(API_BASE_STORAGE_KEY);
    } catch {
        // ignore storage errors
    }
}

function resolveApiBases(preferAbsolute = false): string[] {
    const envBases = parseEnvBases(ENV_BASES_RAW);
    const runtimeBase = readRuntimePreferredBase();
    const inferredHostBase = inferHostApiBase();
    const nonRelativeBases = [runtimeBase, inferredHostBase, ...envBases]
        .map(normalizeBase)
        .filter(Boolean)
        .filter((x, i, arr) => arr.indexOf(x) === i);
    if (preferAbsolute && nonRelativeBases.length) return nonRelativeBases;
    const bases = [...nonRelativeBases, ""].filter((x, i, arr) => arr.indexOf(x) === i);
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

function isJsonLikeResponse(res: Response): boolean {
    const ct = String(res.headers.get("content-type") || "").toLowerCase();
    return ct.includes("application/json");
}

function isSseLikeResponse(res: Response): boolean {
    const ct = String(res.headers.get("content-type") || "").toLowerCase();
    return ct.includes("text/event-stream");
}

function cleanErrorText(input: any, max = 320): string {
    return String(input ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max);
}

function isHtmlErrorPayload(text: string): boolean {
    const s = String(text || "").toLowerCase();
    if (!s) return false;
    return (
        s.includes("<!doctype html") ||
        s.includes("<html") ||
        s.includes("<head") ||
        s.includes("<body") ||
        s.includes("</html>")
    );
}

function extractJsonErrorMessage(rawText: string): string {
    const text = String(rawText || "").trim();
    if (!text) return "";
    try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === "object") {
            const msg = cleanErrorText((parsed as any).error || (parsed as any).message, 240);
            if (msg) return msg;
        }
    } catch {
        // noop
    }
    return "";
}

function formatHttpErrorMessage(res: Response, rawText: string): string {
    const status = Number(res.status || 0);
    const statusText = cleanErrorText(res.statusText, 80);
    const statusLine = `HTTP ${status}${statusText ? ` ${statusText}` : ""}`.trim();
    const text = String(rawText || "").trim();
    if (!text) return statusLine || "HTTP request failed";

    const jsonError = extractJsonErrorMessage(text);
    if (jsonError) return jsonError;

    if (isHtmlErrorPayload(text)) {
        if (status === 502 || status === 503 || status === 504) {
            return `${statusLine}: upstream service unavailable`;
        }
        return `${statusLine}: unexpected HTML error response`;
    }

    const oneLine = cleanErrorText(text, 280);
    if (!oneLine) return statusLine || "HTTP request failed";
    if (/^http\s+\d+/i.test(oneLine)) return oneLine;
    return `${statusLine}: ${oneLine}`;
}

export class ApiHttpError extends Error {
    status: number;
    code?: string;
    data?: any;

    constructor(message: string, status: number, data?: any, code?: string) {
        super(message);
        this.name = "ApiHttpError";
        this.status = status;
        this.code = code;
        this.data = data;
    }
}

function buildHttpError(res: Response, rawText: string): ApiHttpError {
    const text = String(rawText || "").trim();
    let parsed: any = null;
    try {
        parsed = text ? JSON.parse(text) : null;
    } catch {
        parsed = null;
    }
    const code =
        parsed && typeof parsed === "object"
            ? cleanErrorText((parsed as any).error || (parsed as any).code, 80) || undefined
            : undefined;
    return new ApiHttpError(
        formatHttpErrorMessage(res, rawText),
        Number(res.status || 0),
        parsed && typeof parsed === "object" ? parsed : undefined,
        code
    );
}

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
    token?: string,
    mode: "json" | "binary" = "json",
    options: { preferAbsoluteBase?: boolean } = {}
): Promise<{ res: Response; base: string }> {
    const bases = resolveApiBases(!!options.preferAbsoluteBase);
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
            // 防止误命中前端静态服务（返回 200 text/html）导致“看似连通，实际 API 不可用”。
            if (res.ok && (path.startsWith("/api/") || path === "/healthz")) {
                const ct = String(res.headers.get("content-type") || "").toLowerCase();
                const isHtmlLike = ct.includes("text/html");
                if (mode === "json" && !isJsonLikeResponse(res) && i < bases.length - 1) {
                    lastErr = new Error(`Non-JSON response from ${url}`);
                    continue;
                }
                if (mode === "binary" && isHtmlLike && i < bases.length - 1) {
                    lastErr = new Error(`Unexpected HTML response from ${url}`);
                    continue;
                }
                if (mode === "binary" && isHtmlLike && i >= bases.length - 1) {
                    throw new Error(`Export endpoint returned HTML instead of PDF: ${url}`);
                }
            }
            rememberWorkingBase(base, res.ok);
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
    const { res } = await fetchWithBaseFallback(path, opts, token, "json");

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw buildHttpError(res, text);
    }
    if (!isJsonLikeResponse(res)) {
        const text = await res.text().catch(() => "");
        throw buildHttpError(res, text || "unexpected non-json response");
    }
    try {
        return (await res.json()) as T;
    } catch {
        const text = await res.text().catch(() => "");
        throw buildHttpError(res, text || "malformed json response");
    }
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

export type MotifTransferDecisionResponse = TurnResponse & {
    ok: boolean;
    decision: {
        id: string;
        candidate_id: string;
        action: "adopt" | "modify" | "ignore";
        decision_status: "pending" | "adopted" | "modified_pending_confirmation" | "ignored" | "revised";
        decided_at: string;
        revised_text?: string;
        note?: string;
    };
    followupQuestion?: string;
    motifTransferState?: MotifTransferState;
};

export type MotifTransferFeedbackResponse = TurnResponse & {
    ok: boolean;
    event: {
        event_id: string;
        candidate_id?: string;
        motif_type_id?: string;
        signal: "thumbs_down" | "retry" | "manual_override" | "explicit_not_applicable";
        signal_text?: string;
        delta: number;
        created_at: string;
    };
    followupQuestion?: string;
    motifTransferState?: MotifTransferState;
};

export type MotifLibraryConfirmResponse = TurnResponse & {
    ok: boolean;
    stored_motif_type_ids: string[];
    motifTransferState?: MotifTransferState;
};

export type MotifLibraryReviseResponse = TurnResponse & {
    ok: boolean;
    revised_entry?: unknown;
    motifTransferState?: MotifTransferState;
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
    manualReferences?: ManualReferencePayload[];
    handlers: TurnStreamHandlers;
}) {
    const { token, cid, userText, manualReferences, handlers } = params;
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
                body: JSON.stringify({
                    userText,
                    manualReferences: Array.isArray(manualReferences) ? manualReferences : undefined,
                }),
                signal: handlers.signal,
            });
            if (!attempt.ok && RETRIABLE_STATUS.has(attempt.status) && i < bases.length - 1) {
                lastErr = new Error(`HTTP ${attempt.status} from ${url}`);
                continue;
            }
            if (attempt.ok && !isSseLikeResponse(attempt) && i < bases.length - 1) {
                lastErr = new Error(`Non-SSE response from ${url}`);
                continue;
            }
            rememberWorkingBase(base, attempt.ok);
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
        throw buildHttpError(res, text);
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

    createConversation: (
        token: string,
        title: string,
        locale: AppLocale,
        opts?: { planningBootstrap?: TravelPlanningBootstrapRequest }
    ) =>
        http<ConversationCreateResponse>(
            "/api/conversations",
            {
                method: "POST",
                body: JSON.stringify({
                    title,
                    locale,
                    planningBootstrap: opts?.planningBootstrap || undefined,
                }),
            },
            token
        ),

    getConversation: (token: string, cid: string) =>
        http<ConversationDetail>(`/api/conversations/${cid}`, {}, token),

    resumeTask: (token: string, cid: string) =>
        http<ConversationDetail>(
            `/api/conversations/${cid}/task/resume`,
            {
                method: "POST",
            },
            token
        ),

    saveGraph: (
        token: string,
        cid: string,
        graph: ConversationDetail["graph"],
        concepts?: ConceptItem[],
        motifs?: ConceptMotif[],
        motifLinks?: MotifLink[],
        contexts?: ContextItem[],
        opts?: {
            requestAdvice?: boolean;
            advicePrompt?: string;
            emitVirtualStructureMessage?: boolean;
            saveReason?: "manual" | "auto_before_turn";
        }
    ) =>
        http<GraphSaveResponse>(
            `/api/conversations/${cid}/graph`,
            {
                method: "PUT",
                body: JSON.stringify({
                    graph,
                    concepts: concepts || [],
                    motifs: motifs || [],
                    motifLinks: motifLinks || [],
                    contexts: contexts || [],
                    requestAdvice: !!opts?.requestAdvice,
                    advicePrompt: opts?.advicePrompt || "",
                    emitVirtualStructureMessage: !!opts?.emitVirtualStructureMessage,
                    saveReason: opts?.saveReason || "",
                }),
            },
            token
        ),

    saveConcepts: (token: string, cid: string, concepts: ConceptItem[]) =>
        http<ConceptSaveResponse>(
            `/api/conversations/${cid}/concepts`,
            {
                method: "PUT",
                body: JSON.stringify({ concepts }),
            },
            token
        ),

    getTurns: (token: string, cid: string, limit = 80) =>
        http<TurnItem[]>(`/api/conversations/${cid}/turns?limit=${limit}`, {}, token),

    // 非流式（保留）
    turn: (
        token: string,
        cid: string,
        userText: string,
        manualReferences?: ManualReferencePayload[]
    ) =>
        http<TurnResponse>(
            `/api/conversations/${cid}/turn`,
            {
                method: "POST",
                body: JSON.stringify({
                    userText,
                    manualReferences: Array.isArray(manualReferences) ? manualReferences : undefined,
                }),
            },
            token
        ),

    // ✅ 流式（SSE）
    turnStream: (
        token: string,
        cid: string,
        userText: string,
        handlers: TurnStreamHandlers,
        manualReferences?: ManualReferencePayload[]
    ) =>
        postTurnStream({ token, cid, userText, manualReferences, handlers }),

    motifTransferDecision: (
        token: string,
        cid: string,
        payload: {
            candidate_id: string;
            action: "adopt" | "modify" | "ignore";
            revised_text?: string;
            note?: string;
            mode_override?: "A" | "B" | "C";
            recommendation?: {
                motif_type_id: string;
                motif_type_title: string;
                dependency?: string;
                reusable_description?: string;
                source_task_id?: string;
                source_conversation_id?: string;
                status?: "active" | "uncertain" | "deprecated" | "cancelled";
                reason?: string;
                match_score?: number;
                recommended_mode?: "A" | "B" | "C";
            };
        }
    ) =>
        http<MotifTransferDecisionResponse>(
            `/api/conversations/${cid}/motif-transfer/decision`,
            {
                method: "POST",
                body: JSON.stringify(payload),
            },
            token
        ),

    motifTransferFeedback: (
        token: string,
        cid: string,
        payload: {
            signal: "thumbs_down" | "retry" | "manual_override" | "explicit_not_applicable";
            signal_text?: string;
            candidate_id?: string;
            motif_type_id?: string;
        }
    ) =>
        http<MotifTransferFeedbackResponse>(
            `/api/conversations/${cid}/motif-transfer/feedback`,
            {
                method: "POST",
                body: JSON.stringify(payload),
            },
            token
        ),

    confirmMotifLibrary: (
        token: string,
        cid: string,
        selections: Array<{
            motif_id?: string;
            motif_type_id?: string;
            store?: boolean;
            abstraction_levels?: Array<"L1" | "L2" | "L3">;
            abstraction_text?: { L1?: string; L2?: string; L3?: string };
        }>,
        opts?: {
            closeTask?: boolean;
        }
    ) =>
        http<MotifLibraryConfirmResponse>(
            `/api/conversations/${cid}/motif-library/confirm`,
            {
                method: "POST",
                body: JSON.stringify({
                    selections,
                    close_task: !!opts?.closeTask,
                }),
            },
            token
        ),

    reviseMotifLibrary: (
        token: string,
        cid: string,
        payload: {
            motif_type_id: string;
            choice: "overwrite" | "new_version";
            request_id?: string;
            title?: string;
            dependency?: string;
            reusable_description?: string;
            abstraction_text?: { L1?: string; L2?: string; L3?: string };
            status?: "active" | "uncertain" | "deprecated" | "cancelled";
        }
    ) =>
        http<MotifLibraryReviseResponse>(
            `/api/conversations/${cid}/motif-library/revise`,
            {
                method: "POST",
                body: JSON.stringify(payload),
            },
            token
        ),

    exportTravelPlanPdf: async (token: string, cid: string) => {
        const basePath = `/api/conversations/${cid}/travel-plan`;
        const attempts: Array<{ path: string; opts: RequestInit }> = [
            {
                path: `${basePath}/export`,
                opts: { method: "POST", body: "{}", headers: { Accept: "application/pdf" } },
            },
            {
                path: `${basePath}/export`,
                opts: { method: "GET", headers: { Accept: "application/pdf" } },
            },
        ];

        const errors: string[] = [];
        for (const attempt of attempts) {
            try {
                const { res } = await fetchWithBaseFallback(
                    attempt.path,
                    attempt.opts,
                    token,
                    "binary",
                    { preferAbsoluteBase: true }
                );
                if (!res.ok) {
                    const text = await res.text().catch(() => "");
                    throw new Error(formatHttpErrorMessage(res, text));
                }
                const ct = String(res.headers.get("content-type") || "").toLowerCase();
                if (ct.includes("text/html")) {
                    const text = await res.text().catch(() => "");
                    throw new Error(formatHttpErrorMessage(res, text || "unexpected html response"));
                }
                return res.blob();
            } catch (err: any) {
                const message = String(err?.message || err || "").trim();
                errors.push(`${attempt.opts.method || "GET"} ${attempt.path}: ${message}`);
                // If server returns a real backend error (not route-miss/html fallback), stop fallback and surface it.
                if (
                    message &&
                    !/Cannot (GET|POST)\s+\/api\/conversations\/.+\/travel-plan\/export/i.test(message) &&
                    !/Unexpected HTML response|returned HTML instead of PDF/i.test(message) &&
                    !/HTTP 404/i.test(message)
                ) {
                    throw err;
                }
            }
        }
        throw new Error(errors.join(" | "));
    },
};
