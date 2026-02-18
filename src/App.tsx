// src/App.tsx
import React, { useEffect, useRef, useState } from "react";
import "./App.css";

import { api } from "./api/client";
import type { CDG, NodeEvidenceFocus, TurnResponse, TurnStreamErrorData } from "./core/type";
import { TopBar } from "./components/TopBar";
import { ChatPanel, Msg } from "./components/ChatPanel";
import { FlowPanel } from "./components/FlowPanel";

const emptyGraph: CDG = { id: "", version: 0, nodes: [], edges: [] };

function makeId(prefix = "m") {
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
  const [hoverFocus, setHoverFocus] = useState<NodeEvidenceFocus | null>(null);

  const [busy, setBusy] = useState(false);
  const [savingGraph, setSavingGraph] = useState(false);
  const [graphGenerating, setGraphGenerating] = useState(false);
  const loggedIn = !!token;

  // 中断上一次流（避免串台）
  const abortRef = useRef<AbortController | null>(null);

  // 卸载时中断
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // 恢复会话：拉 graph + turns
  useEffect(() => {
    if (!token || !cid) return;

    (async () => {
      try {
        const conv = await api.getConversation(token, cid);
        setGraph(conv.graph);

        const turns = await api.getTurns(token, cid, 120);
        const ms: Msg[] = [];

        for (const t of turns) {
          const tid = t.id || makeId("turn");
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

    // 强制新会话：中断旧流并清空当前上下文
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setGraph(emptyGraph);
    setHoverFocus(null);
    setGraphGenerating(false);

    setBusy(true);
    try {
      const r = await api.createConversation(token, "新对话");
      setCid(r.conversationId);
      localStorage.setItem("ci_cid", r.conversationId);
      setGraph(r.graph);
    } finally {
      setBusy(false);
    }
  }

  async function onSend(text: string) {
    if (!token || !cid) return;

    const userText = text.trim();
    if (!userText) return;
    setHoverFocus(null);

    // 中断上一次
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const userId = makeId("u");
    const assistantId = makeId("a");

    // 先写入 user + 空 assistant
    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", text: userText },
      { id: assistantId, role: "assistant", text: "" },
    ]);

    setBusy(true);
    setGraphGenerating(true);

    try {
      await api.turnStream(token, cid, userText, {
        signal: ac.signal,

        onStart: (_d) => {
          // 可选：你可以在这里做 UI 状态提示
        },

        onToken: (tk: string) => {
          setMessages((prev) =>
              prev.map((msg) =>
                  msg.id === assistantId ? { ...msg, text: (msg.text || "") + tk } : msg
              )
          );
        },

        onDone: (out: TurnResponse) => {
          // 最终覆盖一次，避免丢 token/换行
          setMessages((prev) =>
              prev.map((msg) =>
                  msg.id === assistantId ? { ...msg, text: out.assistantText || msg.text } : msg
              )
          );

          if (out?.graph) setGraph(out.graph);
        },

        onError: (err: TurnStreamErrorData) => {
          if (ac.signal.aborted) return;
          setMessages((prev) =>
              prev.map((msg) =>
                  msg.id === assistantId
                      ? { ...msg, text: `流式失败：${err.message}` }
                      : msg
              )
          );
        },
      });
    } catch (e: any) {
      if (!ac.signal.aborted) {
        setMessages((prev) =>
            prev.map((msg) =>
                msg.id === assistantId ? { ...msg, text: `请求失败：${e?.message || String(e)}` } : msg
            )
        );
      }
    } finally {
      // 只有当前这次还挂着才收尾
      if (abortRef.current === ac) {
        setBusy(false);
        setGraphGenerating(false);
        abortRef.current = null;
      }
    }
  }

  async function onSaveGraph(
      nextGraph: CDG,
      opts?: { requestAdvice?: boolean; advicePrompt?: string }
  ) {
    if (!token || !cid) return;
    setSavingGraph(true);
    try {
      const out = await api.saveGraph(token, cid, nextGraph, opts);
      if (out?.graph) setGraph(out.graph);
      if (out?.assistantText) {
        setMessages((prev) => [...prev, { id: makeId("ga"), role: "assistant", text: out.assistantText || "" }]);
      } else if (out?.adviceError) {
        setMessages((prev) => [
          ...prev,
          { id: makeId("gae"), role: "assistant", text: `图已保存，但建议生成失败：${out.adviceError}` },
        ]);
      }
    } finally {
      setSavingGraph(false);
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
            <ChatPanel
                messages={messages}
                disabled={disabled}
                busy={busy}
                onSend={onSend}
                evidenceFocus={hoverFocus}
            />
          </div>

          <div className="Right">
            <FlowPanel
                graph={graph}
                generatingGraph={graphGenerating}
                onNodeEvidenceHover={setHoverFocus}
                onSaveGraph={onSaveGraph}
                savingGraph={savingGraph}
            />
          </div>
        </div>
      </div>
  );
}
