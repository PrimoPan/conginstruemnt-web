// src/components/ChatPanel.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { NodeEvidenceFocus } from "../core/type";
import type { AppLocale, MotifTransferState } from "../core/type";

export type Msg = {
    id: string;
    role: "user" | "assistant";
    text: string;
};

export type ModeCReferenceItem = {
    id: string;
    motifTypeId: string;
    title: string;
    text: string;
};

export function ChatPanel(props: {
    locale: AppLocale;
    messages: Msg[];
    disabled: boolean;
    busy: boolean;
    onSend: (text: string) => void;
    evidenceFocus?: NodeEvidenceFocus | null;
    motifTransferState?: MotifTransferState | null;
    modeCReferences?: ModeCReferenceItem[];
    onRemoveModeCReference?: (referenceId: string) => void;
    onFeedbackNotApplicable?: (payload: { messageId: string; text: string }) => void;
    onMotifNotApplicable?: (candidateId?: string, motifTypeId?: string) => void;
}) {
    const en = props.locale === "en-US";
    const tr = (zh: string, enText: string) => (en ? enText : zh);
    const [input, setInput] = useState("");
    const [copiedMessageId, setCopiedMessageId] = useState("");
    const [copyFailedMessageId, setCopyFailedMessageId] = useState("");
    const bodyRef = useRef<HTMLDivElement | null>(null);
    const lastMessageText = useMemo(
        () => (props.messages.length ? props.messages[props.messages.length - 1].text : ""),
        [props.messages]
    );

    const canSend = useMemo(() => !props.disabled && !props.busy, [props.disabled, props.busy]);
    const injectedMotifs = useMemo(
        () =>
            (props.motifTransferState?.activeInjections || []).filter(
                (x) => x.injection_state === "injected" && Number(x.transfer_confidence || 0) > 0.2
            ),
        [props.motifTransferState]
    );
    const modeCReferences = props.modeCReferences || [];

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

    function legacyCopyWithTextarea(text: string) {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "true");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        ta.style.pointerEvents = "none";
        ta.style.top = "-9999px";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        ta.setSelectionRange(0, text.length);
        let ok = false;
        try {
            ok = document.execCommand("copy");
        } finally {
            document.body.removeChild(ta);
        }
        return ok;
    }

    async function copyText(text: string) {
        if (navigator?.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch {
                // fallback below
            }
        }
        return legacyCopyWithTextarea(text);
    }

    async function copyMessage(msg: Msg) {
        const t = String(msg.text || "").trim();
        if (!t) return;
        const ok = await copyText(msg.text);
        if (ok) {
            setCopiedMessageId(msg.id);
            setCopyFailedMessageId("");
        } else {
            setCopyFailedMessageId(msg.id);
            setCopiedMessageId("");
        }
    }

    useEffect(() => {
        if (!copiedMessageId && !copyFailedMessageId) return;
        const timer = window.setTimeout(() => {
            setCopiedMessageId("");
            setCopyFailedMessageId("");
        }, 1200);
        return () => window.clearTimeout(timer);
    }, [copiedMessageId, copyFailedMessageId]);

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
                    >
                        <div className="Bubble__head">
                            <button
                                className="BubbleCopyBtn"
                                type="button"
                                onClick={() => copyMessage(m)}
                                disabled={!String(m.text || "").trim()}
                                title={tr("复制本条消息", "Copy this message")}
                            >
                                {copiedMessageId === m.id
                                    ? tr("已复制", "Copied")
                                    : copyFailedMessageId === m.id
                                        ? tr("复制失败", "Copy failed")
                                        : tr("复制", "Copy")}
                            </button>
                            {m.role === "assistant" ? (
                                <button
                                    className="BubbleCopyBtn"
                                    type="button"
                                    onClick={() =>
                                        props.onFeedbackNotApplicable?.({
                                            messageId: m.id,
                                            text: m.text,
                                        })
                                    }
                                    title={tr("这条回复不适用", "This reply is not applicable")}
                                >
                                    {tr("反馈不适用", "Not applicable")}
                                </button>
                            ) : null}
                        </div>
                        <div className="BubbleText">{renderMessageText(m)}</div>
                    </div>
                ))}

                {props.busy && (
                    <div className="ChatHint" aria-live="polite">
                        {tr("正在生成…", "Generating...")}
                    </div>
                )}
            </div>

            <div className="ChatComposer">
                {modeCReferences.length ? (
                    <div className="ChatComposer__references">
                        <div className="ChatComposer__referencesTitle">
                            {tr("Mode C 手动参考", "Mode C Manual References")}
                        </div>
                        <div className="ChatComposer__referencesList">
                            {modeCReferences.slice(0, 5).map((ref) => (
                                <span key={ref.id} className="ChatComposer__referenceChip" title={ref.text}>
                                    <span className="ChatComposer__referenceChipText">{ref.title}</span>
                                    <button
                                        type="button"
                                        className="ChatComposer__referenceChipRemove"
                                        onClick={() => props.onRemoveModeCReference?.(ref.id)}
                                        title={tr("移除参考", "Remove reference")}
                                    >
                                        x
                                    </button>
                                </span>
                            ))}
                        </div>
                    </div>
                ) : null}
                {injectedMotifs.length ? (
                    <div className="ChatComposer__injections">
                        <div className="ChatComposer__injectionsTitle">
                            {tr("已注入规则", "Injected Rules")}
                        </div>
                        <div className="ChatComposer__injectionsList">
                            {injectedMotifs.slice(0, 4).map((inj) => (
                                <button
                                    key={`${inj.candidate_id}_${inj.motif_type_id}`}
                                    type="button"
                                    className="Btn FlowToolbar__btn"
                                    onClick={() => props.onMotifNotApplicable?.(inj.candidate_id, inj.motif_type_id)}
                                    title={inj.constraint_text}
                                >
                                    {tr("这条不适用", "Rule not applicable")}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : null}
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
