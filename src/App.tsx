import React, { useEffect, useRef, useState } from "react";
import "./App.css";

import { api } from "./api/client";
import type { CDG } from "./core/type";
import { TopBar } from "./components/TopBar";
import { ChatPanel, Msg } from "./components/ChatPanel";
import { FlowPanel } from "./components/FlowPanel";

const emptyGraph: CDG = { id: "", version: 0, nodes: [], edges: [] };

function makeId(prefix = "m") {
  // 浏览器一般都有 crypto.randomUUID；没有就 fallback
  const uuid = (globalThis.crypto as any)?.randomUUID?.();
  if (uuid) return `${prefix}_${uuid}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export default function App() {
  const [username, setUsername] = useState("test");

  const [token, setToken] = useState<string>(localStorage.getItem("ci_token") || "");
  const [cid, setCid] = useState<string>(localStorage.getItem("ci_cid") || "");

  const [messages, setMessages] = useState<Msg[]>([]);
  const [graph, setGraph] = useState<CDG>(emptyGraph);

  const [busy, setBusy] = useState(false);

  const loggedIn = !!token;

  // 可选：如果你希望新请求能中断旧请求（避免串台）
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!token || !cid) return;

    (async () => {
      try {
        const conv = await api.getConversation(token, cid);
        setGraph(conv.graph);

        const turns = await api.getTurns(token, cid, 120);

        const ms: Msg[] = [];
        for (const t of turns) {
          // 后端 turns 返回里有 t.id（你接口就是这么写的）
          const tid = (t as any).id || makeId("turn");
          ms.push({ id: `${tid}_u`, role: "user", text: t.userText });
          ms.push({ id: `${tid}_a`, role: "assistant", text: t.assistantText });
        }
        setMessages(ms);
      } catch {
        localStorage.removeItem("ci_cid");
        setCid("");
      }
    })();
  }, [token, cid]);

  async function onLogin() {
    const u = username.trim();
    if (!u) return;

    setBusy(true);
    try {
      const r = await api.login(u);
      setToken(r.sessionToken);
      localStorage.setItem("ci_token", r.sessionToken);
    } finally {
      setBusy(false);
    }
  }

  async function onNewConversation() {
    if (!token) return;

    setBusy(true);
    try {
      const r = await api.createConversation(token, "新对话");
      setCid(r.conversationId);
      localStorage.setItem("ci_cid", r.conversationId);
      setGraph(r.graph);
      setMessages([]);
    } finally {
      setBusy(false);
    }
  }

  async function onSend(text: string) {
    if (!token || !cid) return;
    if (!text.trim()) return;

    // 如果你允许连发，这个中断很有用；你现在 busy 会挡住，但留着也不亏
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const userId = makeId("u");
    const assistantId = makeId("a");

    // 先把 user 消息 push 进去，再放一个空 assistant 用于流式追加
    setMessages((m) => [
      ...m,
      { id: userId, role: "user", text },
      { id: assistantId, role: "assistant", text: "" },
    ]);
    setBusy(true);

    try {
      await api.turnStream(token, cid, text, {
        signal: ac.signal,

        onToken: (tk) => {
          setMessages((prev) =>
              prev.map((msg) =>
                  msg.id === assistantId
                      ? { ...msg, text: (msg.text || "") + tk }
                      : msg
              )
          );
        },

        onDone: (out) => {
          // done 的 assistantText 最终覆盖一次，避免丢 token/换行
          setMessages((prev) =>
              prev.map((msg) =>
                  msg.id === assistantId
                      ? { ...msg, text: out.assistantText || msg.text }
                      : msg
              )
          );

          setGraph(out.graph);
        },

        onError: (err) => {
          setMessages((prev) =>
              prev.map((msg) =>
                  msg.id === assistantId
                      ? { ...msg, text: `流式失败：${err?.message || JSON.stringify(err)}` }
                      : msg
              )
          );
        },
      });
    } catch (e: any) {
      setMessages((prev) =>
          prev.map((msg) =>
              msg.id === assistantId
                  ? { ...msg, text: `请求失败：${e?.message || String(e)}` }
                  : msg
          )
      );
    } finally {
      setBusy(false);
    }
  }

  const disabled = !token || !cid;

  return (
      <div className="App">
        <TopBar
            username={username}
            setUsername={setUsername}
            onLogin={onLogin}
            onNewConversation={onNewConversation}
            loggedIn={loggedIn}
            cid={cid}
            graphVersion={graph.version}
            busy={busy}
        />

        <div className="Main">
          <div className="Left">
            <ChatPanel messages={messages} disabled={disabled} busy={busy} onSend={onSend} />
          </div>

          <div className="Right">
            <FlowPanel graph={graph} />
          </div>
        </div>
      </div>
  );
}
