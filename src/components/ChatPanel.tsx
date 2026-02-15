// src/components/ChatPanel.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";

export type Msg = {
    id: string;
    role: "user" | "assistant";
    text: string;
};

export function ChatPanel(props: {
    messages: Msg[];
    disabled: boolean;
    busy: boolean;
    onSend: (text: string) => void;
}) {
    const [input, setInput] = useState("");
    const bodyRef = useRef<HTMLDivElement | null>(null);

    const canSend = useMemo(() => !props.disabled && !props.busy, [props.disabled, props.busy]);

    // 自动滚动到底部（流式刷字时很关键）
    useEffect(() => {
        const el = bodyRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [
        props.messages.length,
        props.messages.length ? props.messages[props.messages.length - 1].text : "",
    ]);

    const send = () => {
        const t = input.trim();
        if (!t) return;
        props.onSend(t);
        setInput("");
    };

    return (
        <div className="Panel">
            <div className="PanelHeader">对话</div>

            <div className="ChatBody" ref={bodyRef}>
                {props.messages.map((m) => (
                    <div
                        key={m.id}
                        className={m.role === "user" ? "Bubble Bubble--user" : "Bubble Bubble--assistant"}
                        style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                    >
                        {m.text}
                    </div>
                ))}

                {props.busy && (
                    <div className="ChatHint" aria-live="polite">
                        正在生成…
                    </div>
                )}
            </div>

            <div className="ChatComposer">
                <input
                    className="Input Input--grow"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={props.disabled ? "请先登录并新建对话…" : "输入一句话（Enter 发送）"}
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
                    发送
                </button>
            </div>
        </div>
    );
}
