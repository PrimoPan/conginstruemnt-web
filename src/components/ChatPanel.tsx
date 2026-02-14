import React, { useEffect, useRef, useState } from "react";

export type Msg = {
    id: string;
    role: "user" | "assistant";
    text: string;
    streaming?: boolean;
};

export function ChatPanel(props: {
    messages: Msg[];
    disabled: boolean;
    busy: boolean;
    onSend: (text: string) => void | Promise<void>;
}) {
    const [input, setInput] = useState("");
    const bodyRef = useRef<HTMLDivElement | null>(null);

    // 自动滚动：消息新增 or 最后一条文本变化（流式追加）都会触发
    useEffect(() => {
        const el = bodyRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [
        props.messages.length,
        props.messages.length ? props.messages[props.messages.length - 1].text : "",
    ]);

    return (
        <div className="Panel">
            <div className="PanelHeader">对话</div>

            <div className="ChatBody" ref={bodyRef}>
                {props.messages.map((m) => (
                    <div
                        key={m.id}
                        className={m.role === "user" ? "Bubble Bubble--user" : "Bubble Bubble--assistant"}
                    >
                        <span className="BubbleText">{m.text}</span>
                        {m.streaming ? <span className="Cursor">▍</span> : null}
                    </div>
                ))}
            </div>

            <div className="ChatComposer">
                <input
                    className="Input Input--grow"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={props.disabled ? "请先登录并新建对话…" : "输入一句话（Enter 发送）"}
                    disabled={props.disabled || props.busy}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            const t = input.trim();
                            if (!t) return;
                            props.onSend(t);
                            setInput("");
                        }
                    }}
                />
                <button
                    className="Btn"
                    disabled={props.disabled || props.busy}
                    onClick={() => {
                        const t = input.trim();
                        if (!t) return;
                        props.onSend(t);
                        setInput("");
                    }}
                >
                    发送
                </button>
            </div>
        </div>
    );
}
