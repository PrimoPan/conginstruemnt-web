// src/api/turnStream.ts
export type TurnStreamDone = {
    assistantText: string;
    graphPatch: any;
    graph: any;
};

function takeBlocks(buf: string) {
    const parts = buf.split("\n\n");
    const rest = parts.pop() ?? "";
    return { blocks: parts, rest };
}

function parseBlock(block: string): { event: string; data: string } | null {
    let event = "message";
    const dataLines: string[] = [];

    for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (!dataLines.length) return null;
    return { event, data: dataLines.join("\n") };
}

/**
 * 发送 turn（流式 SSE），收到 token 逐步回调，done 回调最终 graph
 *
 * baseUrl:
 * - 如果你 CRA 配了 proxy，传 ""（推荐）
 * - 如果你直连腾讯云，传 "http://43.138.212.17:3001"
 */
export async function postTurnStream(params: {
    baseUrl: string;
    token: string;
    conversationId: string;
    userText: string;
    onStart?: (data: any) => void;
    onToken?: (token: string) => void;
    onDone?: (data: TurnStreamDone) => void;
    onError?: (data: any) => void;
    signal?: AbortSignal;
}) {
    const url =
        `${params.baseUrl}` +
        `/api/conversations/${params.conversationId}/turn/stream`;

    const resp = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${params.token}`,
        },
        body: JSON.stringify({ userText: params.userText }),
        signal: params.signal,
    });

    if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`HTTP ${resp.status}: ${text}`);
    }
    if (!resp.body) throw new Error("No response body (stream unsupported?)");

    const reader = resp.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buf = "";

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const { blocks, rest } = takeBlocks(buf);
        buf = rest;

        for (const b of blocks) {
            const msg = parseBlock(b);
            if (!msg) continue;

            let payload: any = msg.data;
            try {
                payload = JSON.parse(msg.data);
            } catch {
                // data 不是 JSON 就算了（兜底）
            }

            if (msg.event === "start") {
                params.onStart?.(payload);
            } else if (msg.event === "token") {
                // 兼容后端：token 通常是 {token:"..."}
                const tk = typeof payload === "string" ? payload : payload?.token;
                if (typeof tk === "string" && tk.length) params.onToken?.(tk);
            } else if (msg.event === "done") {
                params.onDone?.(payload as TurnStreamDone);
            } else if (msg.event === "error") {
                params.onError?.(payload);
            }
            // ping 直接忽略
        }
    }
}
