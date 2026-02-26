// src/App.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

import { api } from "./api/client";
import type {
  AppLocale,
  CDG,
  ConceptItem,
  ConceptMotif,
  MotifLink,
  MotifReasoningView,
  ContextItem,
  NodeEvidenceFocus,
  TurnResponse,
  TurnStreamErrorData,
} from "./core/type";
import { TopBar } from "./components/TopBar";
import { ChatPanel, Msg } from "./components/ChatPanel";
import { FlowPanel } from "./components/FlowPanel";
import { normalizeGraphClient } from "./core/graphSafe";
import { ConceptPanel } from "./components/ConceptPanel";

const emptyGraph: CDG = { id: "", version: 0, nodes: [], edges: [] };
const emptyMotifReasoningView: MotifReasoningView = { nodes: [], edges: [] };
const LOCALE_STORAGE_KEY = "ci_locale";

function clamp01(v: any, fallback = 0.7) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function compactText(input: any, max = 80) {
  return String(input ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max);
}

function conceptDescFromNode(node: any, fallback: string) {
  const parts = [
    compactText(node?.type, 20),
    compactText(node?.layer, 20),
    compactText(node?.strength, 20),
  ].filter(Boolean);
  const c = Number(node?.confidence);
  if (Number.isFinite(c)) parts.push(`c=${c.toFixed(2)}`);
  const text = parts.join(" · ");
  return compactText(text || fallback, 120);
}

function makeId(prefix = "m") {
  const uuid = (globalThis.crypto as any)?.randomUUID?.();
  if (uuid) return `${prefix}_${uuid}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export default function App() {
  const [username, setUsername] = useState("test");
  const [locale, setLocale] = useState<AppLocale>(() => {
    const raw = String(localStorage.getItem(LOCALE_STORAGE_KEY) || "").trim().toLowerCase();
    return raw.startsWith("en") ? "en-US" : "zh-CN";
  });

  const [token, setToken] = useState<string>(localStorage.getItem("ci_token") || "");
  const [cid, setCid] = useState<string>(localStorage.getItem("ci_cid") || "");

  const [messages, setMessages] = useState<Msg[]>([]);
  const [graph, setGraph] = useState<CDG>(emptyGraph);
  const [draftGraphPreview, setDraftGraphPreview] = useState<CDG>(emptyGraph);
  const [concepts, setConcepts] = useState<ConceptItem[]>([]);
  const [motifs, setMotifs] = useState<ConceptMotif[]>([]);
  const [motifLinks, setMotifLinks] = useState<MotifLink[]>([]);
  const [motifReasoningView, setMotifReasoningView] = useState<MotifReasoningView>(emptyMotifReasoningView);
  const [contexts, setContexts] = useState<ContextItem[]>([]);
  const [conceptsDirty, setConceptsDirty] = useState(false);
  const [activeConceptId, setActiveConceptId] = useState<string>("");
  const [activeMotifId, setActiveMotifId] = useState<string>("");
  const [focusNodeId, setFocusNodeId] = useState<string>("");
  const [nodeHoverFocus, setNodeHoverFocus] = useState<NodeEvidenceFocus | null>(null);

  const [busy, setBusy] = useState(false);
  const [savingGraph, setSavingGraph] = useState(false);
  const [graphGenerating, setGraphGenerating] = useState(false);
  const [exportingPlan, setExportingPlan] = useState(false);
  const loggedIn = !!token;
  const en = locale === "en-US";
  const tr = (zh: string, enText: string) => (en ? enText : zh);

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
        if (conv?.locale) {
          setLocale(conv.locale);
          localStorage.setItem(LOCALE_STORAGE_KEY, conv.locale);
        }
        const safeGraph = normalizeGraphClient(conv.graph);
        setGraph(safeGraph);
        setDraftGraphPreview(safeGraph);
        setConcepts(Array.isArray(conv.concepts) ? conv.concepts : []);
        setMotifs(Array.isArray(conv.motifs) ? conv.motifs : []);
        setMotifLinks(Array.isArray(conv.motifLinks) ? conv.motifLinks : []);
        setMotifReasoningView(conv.motifReasoningView || emptyMotifReasoningView);
        setContexts(Array.isArray(conv.contexts) ? conv.contexts : []);
        setConceptsDirty(false);
        setActiveConceptId("");
        setActiveMotifId("");
        setFocusNodeId("");

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
    setDraftGraphPreview(emptyGraph);
    setConcepts([]);
    setMotifs([]);
    setMotifLinks([]);
    setMotifReasoningView(emptyMotifReasoningView);
    setContexts([]);
    setConceptsDirty(false);
    setActiveConceptId("");
    setActiveMotifId("");
    setFocusNodeId("");
    setNodeHoverFocus(null);
    setGraphGenerating(false);

    setBusy(true);
    try {
      const r = await api.createConversation(token, tr("新对话", "New Conversation"), locale);
      setCid(r.conversationId);
      localStorage.setItem("ci_cid", r.conversationId);
      if (r?.locale) {
        setLocale(r.locale);
        localStorage.setItem(LOCALE_STORAGE_KEY, r.locale);
      }
      const safeGraph = normalizeGraphClient(r.graph);
      setGraph(safeGraph);
      setDraftGraphPreview(safeGraph);
      setConcepts(Array.isArray(r.concepts) ? r.concepts : []);
      setMotifs(Array.isArray(r.motifs) ? r.motifs : []);
      setMotifLinks(Array.isArray(r.motifLinks) ? r.motifLinks : []);
      setMotifReasoningView(r.motifReasoningView || emptyMotifReasoningView);
      setContexts(Array.isArray(r.contexts) ? r.contexts : []);
      setConceptsDirty(false);
    } finally {
      setBusy(false);
    }
  }

  async function onSend(text: string) {
    if (!token || !cid) return;

    const userText = text.trim();
    if (!userText) return;
    setNodeHoverFocus(null);

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

          if (out?.graph) {
            const safeGraph = normalizeGraphClient(out.graph);
            setGraph(safeGraph);
            setDraftGraphPreview(safeGraph);
          }
          if (Array.isArray(out?.concepts)) {
            setConcepts(out.concepts);
            setConceptsDirty(false);
          }
          if (Array.isArray(out?.motifs)) setMotifs(out.motifs);
          if (Array.isArray(out?.motifLinks)) setMotifLinks(out.motifLinks);
          setMotifReasoningView(out?.motifReasoningView || emptyMotifReasoningView);
          if (Array.isArray(out?.contexts)) setContexts(out.contexts);
        },

        onError: (err: TurnStreamErrorData) => {
          if (ac.signal.aborted) return;
          setMessages((prev) =>
              prev.map((msg) =>
                  msg.id === assistantId
                      ? { ...msg, text: `${tr("流式失败", "Stream error")}: ${err.message}` }
                      : msg
              )
          );
        },
      });
    } catch (e: any) {
      if (!ac.signal.aborted) {
        setMessages((prev) =>
            prev.map((msg) =>
                msg.id === assistantId
                    ? { ...msg, text: `${tr("请求失败", "Request failed")}: ${e?.message || String(e)}` }
                    : msg
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
      const out = await api.saveGraph(token, cid, nextGraph, concepts, motifs, motifLinks, contexts, opts);
      if (out?.graph) {
        const safeGraph = normalizeGraphClient(out.graph);
        setGraph(safeGraph);
        setDraftGraphPreview(safeGraph);
      }
      if (Array.isArray(out?.concepts)) {
        setConcepts(out.concepts);
      }
      if (Array.isArray(out?.motifs)) setMotifs(out.motifs);
      if (Array.isArray(out?.motifLinks)) setMotifLinks(out.motifLinks);
      setMotifReasoningView(out?.motifReasoningView || emptyMotifReasoningView);
      if (Array.isArray(out?.contexts)) setContexts(out.contexts);
      setConceptsDirty(false);
      if (out?.assistantText) {
        setMessages((prev) => [...prev, { id: makeId("ga"), role: "assistant", text: out.assistantText || "" }]);
      } else if (out?.adviceError) {
        setMessages((prev) => [
          ...prev,
          {
            id: makeId("gae"),
            role: "assistant",
            text: `${tr("图已保存，但建议生成失败", "Graph saved, but advice generation failed")}: ${out.adviceError}`,
          },
        ]);
      }
    } finally {
      setSavingGraph(false);
    }
  }

  async function onExportPlan() {
    if (!token || !cid) return;
    if (!messages.length) return;
    setExportingPlan(true);
    try {
      const blob = await api.exportTravelPlanPdf(token, cid);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `travel-plan-${cid.slice(-8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: makeId("exp"),
          role: "assistant",
          text: `${tr("导出失败", "Export failed")}: ${e?.message || String(e)}`,
        },
      ]);
    } finally {
      setExportingPlan(false);
    }
  }

  function onPatchConcept(conceptId: string, patch: Partial<ConceptItem>) {
    const next = (concepts || []).map((c) =>
        c.id === conceptId ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c
    );
    setConcepts(next);
    setConceptsDirty(true);
  }

  function onPatchMotif(motifId: string, patch: Partial<ConceptMotif>) {
    const next = (motifs || []).map((m) =>
        m.id === motifId ? { ...m, ...patch, updatedAt: new Date().toISOString() } : m
    );
    setMotifs(next);
    setConceptsDirty(true);
  }

  function onEditConceptNode(conceptId: string) {
    const c = (concepts || []).find((x) => x.id === conceptId);
    const nodeId = c?.primaryNodeId || c?.nodeIds?.[0] || "";
    if (!nodeId) return;
    setActiveConceptId(conceptId);
    setActiveMotifId("");
    setFocusNodeId(nodeId);
  }

  const conceptsView = useMemo(() => {
    const sourceGraph = draftGraphPreview?.nodes?.length ? draftGraphPreview : graph;
    const byId = new Map((sourceGraph.nodes || []).map((n) => [n.id, n]));
    return (concepts || []).map((c) => {
      const nodeId = c.primaryNodeId || c.nodeIds?.[0];
      const node = nodeId ? byId.get(nodeId) : null;
      if (!node) return c;
      return {
        ...c,
        title: compactText(node.statement, 80) || c.title,
        description: conceptDescFromNode(node, c.description),
        score: clamp01(node.importance, c.score),
      };
    });
  }, [concepts, draftGraphPreview, graph]);

  const conceptFocus = useMemo<NodeEvidenceFocus | null>(() => {
    if (!activeConceptId) return null;
    const c = concepts.find((x) => x.id === activeConceptId);
    if (!c) return null;
    return {
      nodeId: `concept:${c.id}`,
      evidenceTerms: (c.evidenceTerms || []).slice(0, 8),
      sourceMsgIds: c.sourceMsgIds || [],
    };
  }, [activeConceptId, concepts]);

  const mergedFocus = nodeHoverFocus || conceptFocus;

  const disabled = !token || !cid;
  const exportPlanDisabled = disabled || messages.length === 0 || graphGenerating;

  return (
      <div className="App">
        <TopBar
            locale={locale}
            onLocaleChange={(next) => {
              setLocale(next);
              localStorage.setItem(LOCALE_STORAGE_KEY, next);
            }}
            username={username}
            setUsername={setUsername}
            onLogin={onLogin}
            onNewConversation={onNewConversation}
            onExportPlan={onExportPlan}
            loggedIn={loggedIn}
            cid={cid}
            graphVersion={graph.version}
            busy={busy}
            exportingPlan={exportingPlan}
            exportPlanDisabled={exportPlanDisabled}
        />

        <div className="Main">
          <div className="Left">
            <ChatPanel
                locale={locale}
                messages={messages}
                disabled={disabled}
                busy={busy}
                onSend={onSend}
                evidenceFocus={mergedFocus}
            />
          </div>

          <div className="Center">
            <ConceptPanel
                locale={locale}
                concepts={conceptsView}
                motifs={motifs}
                activeConceptId={activeConceptId}
                activeMotifId={activeMotifId}
                saving={savingGraph}
                onSelect={(conceptId) => {
                  setActiveConceptId(conceptId);
                  setActiveMotifId("");
                }}
                onSelectMotif={(motifId) => {
                  setActiveMotifId(motifId);
                }}
                onClearSelect={() => setActiveConceptId("")}
                onClearMotifSelect={() => setActiveMotifId("")}
                onEditConceptNode={onEditConceptNode}
                onPatchConcept={onPatchConcept}
                onPatchMotif={onPatchMotif}
            />
          </div>

          <div className="Right">
            <FlowPanel
                locale={locale}
                graph={graph}
                concepts={concepts}
                motifs={motifs}
                motifLinks={motifLinks}
                motifReasoningView={motifReasoningView}
                activeConceptId={activeConceptId}
                activeMotifId={activeMotifId}
                generatingGraph={graphGenerating}
                onNodeEvidenceHover={setNodeHoverFocus}
                onSelectMotif={(motifId) => setActiveMotifId(motifId)}
                onSelectConcept={(conceptId) => {
                  setActiveConceptId(conceptId);
                }}
                onSaveGraph={onSaveGraph}
                savingGraph={savingGraph}
                extraDirty={conceptsDirty}
                focusNodeId={focusNodeId}
                onFocusNodeHandled={() => setFocusNodeId("")}
                onDraftGraphChange={setDraftGraphPreview}
            />
          </div>
        </div>
      </div>
  );
}
