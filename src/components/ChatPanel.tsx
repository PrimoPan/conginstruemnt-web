// src/components/ChatPanel.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { NodeEvidenceFocus } from "../core/type";
import type { AppLocale } from "../core/type";

export type Msg = {
    id: string;
    role: "user" | "assistant";
    text: string;
};

export function ChatPanel(props: {
    locale: AppLocale;
    messages: Msg[];
    disabled: boolean;
    busy: boolean;
    onSend: (text: string) => void;
    evidenceFocus?: NodeEvidenceFocus | null;
}) {
    const en = props.locale === "en-US";
    const tr = (zh: string, enText: string) => (en ? enText : zh);
    const [input, setInput] = useState("");
    const bodyRef = useRef<HTMLDivElement | null>(null);
    const lastMessageText = useMemo(
        () => (props.messages.length ? props.messages[props.messages.length - 1].text : ""),
        [props.messages]
    );

    const canSend = useMemo(() => !props.disabled && !props.busy, [props.disabled, props.busy]);

    // 自动滚动到底部（流式刷字时很关键）
    useEffect(() => {
        const el = bodyRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [props.messages.length, lastMessageText]);

    const send = () => {
        const t = input.trim();
        if (!t) return;
        props.onSend(t);
        setInput("");
    };

    function escapeRegExp(s: string) {
        return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function mergeRanges(ranges: Array<{ start: number; end: number }>) {
        if (!ranges.length) return ranges;
        const sorted = ranges.slice().sort((a, b) => a.start - b.start);
        const out = [sorted[0]];
        for (let i = 1; i < sorted.length; i += 1) {
            const cur = sorted[i];
            const last = out[out.length - 1];
            if (cur.start <= last.end) {
                last.end = Math.max(last.end, cur.end);
            } else {
                out.push({ ...cur });
            }
        }
        return out;
    }

    function getHighlightRanges(text: string, terms: string[]) {
        const ranges: Array<{ start: number; end: number }> = [];
        const uniqueTerms = Array.from(
            new Set(
                terms
                    .map((t) => String(t || "").trim())
                    .filter((t) => t.length >= 2)
            )
        );

        for (const t of uniqueTerms) {
            const re = new RegExp(escapeRegExp(t), "g");
            let m: RegExpExecArray | null;
            while ((m = re.exec(text))) {
                const start = m.index;
                const end = start + m[0].length;
                ranges.push({ start, end });
            }
        }
        return mergeRanges(ranges);
    }

    function shouldApplyToMessage(msg: Msg) {
        const src = props.evidenceFocus?.sourceMsgIds;
        if (!src || !src.length) return true;
        if (src.includes("latest_user")) return msg.role === "user";
        return src.some((id) => msg.id === id || msg.id.startsWith(id));
    }

    function renderMessageText(msg: Msg) {
        const focus = props.evidenceFocus;
        if (!focus || !focus.evidenceTerms.length || !shouldApplyToMessage(msg)) {
            return msg.text;
        }

        const ranges = getHighlightRanges(msg.text, focus.evidenceTerms);
        if (!ranges.length) return msg.text;

        const parts: React.ReactNode[] = [];
        let cursor = 0;
        for (const r of ranges) {
            if (r.start > cursor) {
                parts.push(msg.text.slice(cursor, r.start));
            }
            parts.push(
                <mark key={`${msg.id}_${r.start}_${r.end}`} className="EvidenceMark">
                    {msg.text.slice(r.start, r.end)}
                </mark>
            );
            cursor = r.end;
        }
        if (cursor < msg.text.length) {
            parts.push(msg.text.slice(cursor));
        }
        return parts;
    }

    return (
        <div className="Panel">
            <div className="PanelHeader">{tr("对话", "Chat")}</div>

            <div className="ChatBody" ref={bodyRef}>
                {props.messages.map((m) => (
                    <div
                        key={m.id}
                        className={m.role === "user" ? "Bubble Bubble--user" : "Bubble Bubble--assistant"}
                        style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                    >
                        {renderMessageText(m)}
                    </div>
                ))}

                {props.busy && (
                    <div className="ChatHint" aria-live="polite">
                        {tr("正在生成…", "Generating...")}
                    </div>
                )}
            </div>

            <div className="ChatComposer">
                <input
                    className="Input Input--grow"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={
                        props.disabled
                            ? tr("请先登录并新建对话…", "Log in and create a new conversation first...")
                            : tr("输入一句话（Enter 发送）", "Type a message (Enter to send)")
                    }
                    disabled={!canSend}
                    onKeyDown={(e) => {
                        // 中文输入法合成期间不要发送
                        // @ts-ignore
                        if ((e as any).isComposing) return;

                        if (e.key === "Enter") {
                            e.preventDefault();
                            if (!canSend) return;
                            send();
                        }
                    }}
                />

                <button className="Btn" disabled={!canSend || input.trim().length === 0} onClick={send}>
                    {tr("发送", "Send")}
                </button>
            </div>
        </div>
    );
}
