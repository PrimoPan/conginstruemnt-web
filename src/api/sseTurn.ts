import type {
    TurnResponse,
    TurnStreamErrorData,
    TurnStreamPingData,
    TurnStreamStartData,
} from "../core/type";

export type SseEvent =
    | { event: "start"; data: TurnStreamStartData }
    | { event: "token"; data: { token: string } }
    | { event: "done"; data: TurnResponse }
    | { event: "ping"; data: TurnStreamPingData }
    | { event: "error"; data: TurnStreamErrorData }
    | { event: string; data: any };

function parseSseBlocks(buffer: string) {
    // SSE 事件以空行分隔
    const parts = buffer.split("\n\n");
    const rest = parts.pop() ?? "";
    return { blocks: parts, rest };
}

function parseOneBlock(block: string): SseEvent | null {
    // 典型：
    // event: token
    // data: {"token":"..."}
    let event = "message";
    const dataLines: string[] = [];

    for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }

    if (dataLines.length === 0) return null;

    // SSE 允许多行 data，这里合并
    const raw = dataLines.join("\n");
    let data: any = raw;

    // 你后端发的是 JSON.stringify，所以大多数都能 JSON.parse
    try {
        data = JSON.parse(raw);
    } catch {
        // token 也可能是纯字符串（兜底）
        data = raw;
    }

    return { event, data } as any;
}

/**
 * POST + SSE 读取器：把事件回调给你
 */
export async function postTurnStream(params: {
    baseUrl: string;            // 例如 http://43.138.212.17:3001
    token: string;              // sessionToken
    conversationId: string;
    userText: string;
    onStart?: (data: TurnStreamStartData) => void;
    onToken?: (token: string) => void;
    onDone?: (data: TurnResponse) => void;
    onError?: (err: TurnStreamErrorData) => void;
    signal?: AbortSignal;
}) {
    const url = `${params.baseUrl}/api/conversations/${params.conversationId}/turn/stream`;

    const resp = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${params.token}`,
        },
        body: JSON.stringify({ userText: params.userText }),
        signal: params.signal,
    });

    if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`HTTP ${resp.status}: ${text}`);
    }

    if (!resp.body) throw new Error("No response body (stream not supported?)");

    const reader = resp.body.getReader();
    const decoder = new TextDecoder("utf-8");

    let buf = "";

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const { blocks, rest } = parseSseBlocks(buf);
        buf = rest;

        for (const b of blocks) {
            const msg = parseOneBlock(b);
            if (!msg) continue;

            if (msg.event === "start") params.onStart?.(msg.data);
            else if (msg.event === "token") {
                const t = typeof msg.data === "string" ? msg.data : msg.data?.token;
                if (typeof t === "string" && t.length) params.onToken?.(t);
            } else if (msg.event === "done") {
                params.onDone?.(msg.data as TurnResponse);
            } else if (msg.event === "error") {
                const payload = msg.data;
                const errPayload: TurnStreamErrorData =
                    payload && typeof payload === "object" && typeof payload.message === "string"
                        ? (payload as TurnStreamErrorData)
                        : { message: typeof payload === "string" ? payload : "stream failed" };
                params.onError?.(errPayload);
            }
            // ping 直接忽略即可
        }
    }
}
