// src/App.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

import { api } from "./api/client";
import type {
  AppLocale,
  CDG,
  CognitiveState,
  ConceptItem,
  ConceptMotif,
  ConversationSummary,
  PortfolioDocumentState,
  MotifLink,
  MotifReasoningView,
  ContextItem,
  NodeEvidenceFocus,
  TaskDetection,
  TravelPlanState,
  TurnResponse,
  TurnStreamErrorData,
} from "./core/type";
import { TopBar } from "./components/TopBar";
import { ChatPanel, Msg } from "./components/ChatPanel";
import { FlowPanel, type ManualMotifDraft } from "./components/FlowPanel";
import { normalizeGraphClient } from "./core/graphSafe";
import { ConceptPanel } from "./components/ConceptPanel";
import { PlanStatePanel } from "./components/PlanStatePanel";
import { ConversationHistoryDrawer } from "./components/ConversationHistoryDrawer";
import {
  canonicalizeManualSemanticKey,
  findBestConceptForUpsert,
  normalizeSemanticTextKey,
} from "./core/conceptSemantic";

const emptyGraph: CDG = { id: "", version: 0, nodes: [], edges: [] };
const emptyMotifReasoningView: MotifReasoningView = { nodes: [], edges: [] };
const LOCALE_STORAGE_KEY = "ci_locale";
const CONCEPT_PANEL_COLLAPSED_STORAGE_KEY = "ci_concept_panel_collapsed";
const PLAN_STATE_PANEL_COLLAPSED_STORAGE_KEY = "ci_plan_state_panel_collapsed";

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

function normalizeTextKey(input: any) {
  return normalizeSemanticTextKey(input);
}

function uniqStrings(arr: string[], max = 40): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of arr || []) {
    const x = compactText(raw, 160);
    if (!x || seen.has(x)) continue;
    seen.add(x);
    out.push(x);
    if (out.length >= max) break;
  }
  return out;
}

function stableConceptIdFromManual(semanticKey: string, kind: ConceptItem["kind"], polarity = "positive", scope = "global") {
  const raw = `semantic:${String(semanticKey || "").toLowerCase()}|${kind}|${polarity}|${scope}`;
  const safe = raw
      .toLowerCase()
      .replace(/[^a-z0-9_\-:]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
  return `c_${(safe || "other").slice(0, 90)}`;
}

function semanticMotifTypeFromRelation(relation: ConceptMotif["relation"]): ConceptMotif["motif_type"] {
  if (relation === "constraint") return "constraint";
  if (relation === "determine") return "determine";
  return "enable";
}

function relationToLinkType(relation: ConceptMotif["relation"]): MotifLink["type"] {
  if (relation === "conflicts_with") return "conflicts_with";
  if (relation === "determine") return "precedes";
  return "supports";
}

function kindFromNodeType(nodeType: ManualMotifDraft["sourceNodeType"]): ConceptItem["kind"] {
  if (nodeType === "constraint") return "constraint";
  if (nodeType === "preference") return "preference";
  if (nodeType === "belief") return "belief";
  return "factual_assertion";
}

function normalizeReasoningViewPayload(
    view: MotifReasoningView | undefined,
    reasoningSteps: any
): MotifReasoningView {
  const base: MotifReasoningView = view && typeof view === "object"
      ? {
        nodes: Array.isArray(view.nodes) ? view.nodes : [],
        edges: Array.isArray(view.edges) ? view.edges : [],
        steps: Array.isArray((view as any).steps) ? (view as any).steps : [],
      }
      : { nodes: [], edges: [], steps: [] };

  if (Array.isArray(base.steps) && base.steps.length) return base;
  if (!Array.isArray(reasoningSteps) || !reasoningSteps.length) return base;

  return {
    ...base,
    steps: reasoningSteps.map((s: any, idx: number) => ({
      step_id: String(s?.step_id || `S${idx + 1}`),
      summary: String(s?.summary || "").trim(),
      motif_ids: Array.isArray(s?.motif_ids) ? s.motif_ids : [],
      concept_ids: Array.isArray(s?.concept_ids) ? s.concept_ids : [],
      depends_on: Array.isArray(s?.depends_on) ? s.depends_on : [],
      id: String(s?.step_id || `S${idx + 1}`),
      order: idx + 1,
      motifId: String(Array.isArray(s?.motif_ids) ? s.motif_ids[0] || "" : ""),
      motifNodeId: "",
      role: "isolated",
      status: "active",
      dependsOnMotifIds: Array.isArray(s?.depends_on) ? s.depends_on : [],
      usedConceptIds: Array.isArray(s?.concept_ids) ? s.concept_ids : [],
      usedConceptTitles: [],
      explanation: String(s?.summary || "").trim(),
    })),
  };
}

function payloadMotifs(payload: any): ConceptMotif[] {
  if (Array.isArray(payload?.motifs)) return payload.motifs;
  if (Array.isArray(payload?.motif_graph?.motifs)) return payload.motif_graph.motifs;
  return [];
}

function payloadMotifLinks(payload: any): MotifLink[] {
  const rawLinks = Array.isArray(payload?.motifLinks)
      ? payload.motifLinks
      : Array.isArray(payload?.motif_graph?.motif_links)
          ? payload.motif_graph.motif_links
          : [];
  return rawLinks.map((link: any) => {
    const rawType = String(link?.type || "").trim().toLowerCase();
    const type: MotifLink["type"] =
        rawType === "precedes" || rawType === "supports" || rawType === "conflicts_with" || rawType === "refines"
            ? rawType
            : rawType === "depends_on" || rawType === "determine"
                ? "precedes"
                : rawType === "enable" || rawType === "support"
                    ? "supports"
                    : rawType === "constraint" || rawType === "conflicts"
                        ? "conflicts_with"
                        : "supports";
    return { ...link, type };
  });
}

function payloadTaskDetection(payload: any): TaskDetection | null {
  const x = payload?.taskDetection;
  if (!x || typeof x !== "object") return null;
  return x as TaskDetection;
}

function payloadCognitiveState(payload: any): CognitiveState | null {
  const x = payload?.cognitiveState;
  if (!x || typeof x !== "object") return null;
  return x as CognitiveState;
}

function payloadPortfolioState(payload: any): PortfolioDocumentState | null {
  const x = payload?.portfolioDocumentState;
  if (!x || typeof x !== "object") return null;
  return x as PortfolioDocumentState;
}

function payloadTravelPlanState(payload: any): TravelPlanState | null {
  const x = payload?.travelPlanState;
  if (!x || typeof x !== "object") return null;
  return x as TravelPlanState;
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
  const [travelPlanState, setTravelPlanState] = useState<TravelPlanState | null>(null);
  const [taskDetection, setTaskDetection] = useState<TaskDetection | null>(null);
  const [cognitiveState, setCognitiveState] = useState<CognitiveState | null>(null);
  const [portfolioDocumentState, setPortfolioDocumentState] = useState<PortfolioDocumentState | null>(null);
  const [conceptsDirty, setConceptsDirty] = useState(false);
  const [activeConceptId, setActiveConceptId] = useState<string>("");
  const [activeMotifId, setActiveMotifId] = useState<string>("");
  const [focusNodeId, setFocusNodeId] = useState<string>("");
  const [nodeHoverFocus, setNodeHoverFocus] = useState<NodeEvidenceFocus | null>(null);

  const [busy, setBusy] = useState(false);
  const [savingGraph, setSavingGraph] = useState(false);
  const [graphGenerating, setGraphGenerating] = useState(false);
  const [exportingPlan, setExportingPlan] = useState(false);
  const [conceptPanelCollapsed, setConceptPanelCollapsed] = useState<boolean>(() => {
    return localStorage.getItem(CONCEPT_PANEL_COLLAPSED_STORAGE_KEY) === "1";
  });
  const [planStateCollapsed, setPlanStateCollapsed] = useState<boolean>(() => {
    const raw = localStorage.getItem(PLAN_STATE_PANEL_COLLAPSED_STORAGE_KEY);
    if (raw == null) return true;
    return raw === "1";
  });
  const [flowHasUnsaved, setFlowHasUnsaved] = useState(false);
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<ConversationSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const loggedIn = !!token;
  const en = locale === "en-US";
  const tr = (zh: string, enText: string) => (en ? enText : zh);
  const historyLoadErrLabel = en ? "Failed to load conversation history" : "加载历史对话失败";

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
        setMotifs(payloadMotifs(conv));
        setMotifLinks(payloadMotifLinks(conv));
        setMotifReasoningView(
            normalizeReasoningViewPayload(conv.motifReasoningView || emptyMotifReasoningView, (conv as any)?.reasoning_steps)
        );
        setContexts(Array.isArray(conv.contexts) ? conv.contexts : []);
        setTravelPlanState(payloadTravelPlanState(conv));
        setTaskDetection(payloadTaskDetection(conv));
        setCognitiveState(payloadCognitiveState(conv));
        setPortfolioDocumentState(payloadPortfolioState(conv));
        setConceptsDirty(false);
        setFlowHasUnsaved(false);
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

  useEffect(() => {
    if (!historyPanelOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHistoryPanelOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [historyPanelOpen]);

  const refreshConversationHistory = useCallback(async (opts?: { silent?: boolean }) => {
    if (!token) {
      setConversationHistory([]);
      setHistoryError("");
      setHistoryLoading(false);
      return;
    }
    if (!opts?.silent) setHistoryLoading(true);
    setHistoryError("");
    try {
      const list = await api.listConversations(token);
      setConversationHistory(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setHistoryError(`${historyLoadErrLabel}: ${e?.message || String(e)}`);
    } finally {
      setHistoryLoading(false);
    }
  }, [token, historyLoadErrLabel]);

  useEffect(() => {
    if (!token) {
      setConversationHistory([]);
      setHistoryError("");
      setHistoryPanelOpen(false);
      return;
    }
    refreshConversationHistory({ silent: true });
  }, [token, refreshConversationHistory]);

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
    setTravelPlanState(null);
    setTaskDetection(null);
    setCognitiveState(null);
    setPortfolioDocumentState(null);
    setConceptsDirty(false);
    setFlowHasUnsaved(false);
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
      setMotifs(payloadMotifs(r));
      setMotifLinks(payloadMotifLinks(r));
      setMotifReasoningView(
          normalizeReasoningViewPayload(r.motifReasoningView || emptyMotifReasoningView, (r as any)?.reasoning_steps)
      );
      setContexts(Array.isArray(r.contexts) ? r.contexts : []);
      setTravelPlanState(payloadTravelPlanState(r));
      setTaskDetection(payloadTaskDetection(r));
      setCognitiveState(payloadCognitiveState(r));
      setPortfolioDocumentState(payloadPortfolioState(r));
      setConceptsDirty(false);
      setFlowHasUnsaved(false);
      setHistoryPanelOpen(false);
      refreshConversationHistory({ silent: true });
    } finally {
      setBusy(false);
    }
  }

  async function onSelectConversation(nextConversationId: string) {
    if (!token || !nextConversationId) return;
    if (nextConversationId === cid) {
      setHistoryPanelOpen(false);
      return;
    }

    const hasUnsavedChanges = flowHasUnsaved || conceptsDirty;
    if (hasUnsavedChanges && cid) {
      try {
        await onSaveGraph(
          draftGraphPreview?.nodes?.length ? draftGraphPreview : graph,
          {
            requestAdvice: false,
            emitVirtualStructureMessage: false,
            saveReason: "auto_before_turn",
          }
        );
      } catch (e: any) {
        setMessages((prev) => [
          ...prev,
          {
            id: makeId("switch_autosave_err"),
            role: "assistant",
            text: `${tr(
              "切换历史会话前自动保存失败，已阻止切换",
              "Auto-save before switching chat failed; switching is blocked"
            )}: ${e?.message || String(e)}`,
          },
        ]);
        return;
      }
    }

    abortRef.current?.abort();
    abortRef.current = null;
    localStorage.setItem("ci_cid", nextConversationId);
    setCid(nextConversationId);
    setHistoryPanelOpen(false);
  }

  async function onSend(text: string) {
    if (!token || !cid) return;

    const userText = text.trim();
    if (!userText) return;
    setNodeHoverFocus(null);

    // 中断上一次
    abortRef.current?.abort();

    const hasUnsavedChanges = flowHasUnsaved || conceptsDirty;
    if (hasUnsavedChanges) {
      try {
        await onSaveGraph(
            (draftGraphPreview?.nodes?.length ? draftGraphPreview : graph),
            {
              requestAdvice: false,
              emitVirtualStructureMessage: false,
              saveReason: "auto_before_turn",
            }
        );
      } catch (e: any) {
        setMessages((prev) => [
          ...prev,
          {
            id: makeId("autosave_err"),
            role: "assistant",
            text: `${tr("自动保存失败，已阻止本次发送", "Auto-save failed; sending is blocked")}: ${e?.message || String(e)}`,
          },
        ]);
        return;
      }
    }

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
            setFlowHasUnsaved(false);
          }
          setMotifs(payloadMotifs(out));
          setMotifLinks(payloadMotifLinks(out));
          setMotifReasoningView(
              normalizeReasoningViewPayload(out?.motifReasoningView || emptyMotifReasoningView, (out as any)?.reasoning_steps)
          );
          if (Array.isArray(out?.contexts)) setContexts(out.contexts);
          setTravelPlanState(payloadTravelPlanState(out));
          setTaskDetection(payloadTaskDetection(out));
          setCognitiveState(payloadCognitiveState(out));
          setPortfolioDocumentState(payloadPortfolioState(out));
          refreshConversationHistory({ silent: true });
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
      opts?: {
        requestAdvice?: boolean;
        advicePrompt?: string;
        emitVirtualStructureMessage?: boolean;
        saveReason?: "manual" | "auto_before_turn";
      }
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
      setMotifs(payloadMotifs(out));
      setMotifLinks(payloadMotifLinks(out));
      setMotifReasoningView(
          normalizeReasoningViewPayload(out?.motifReasoningView || emptyMotifReasoningView, (out as any)?.reasoning_steps)
      );
      if (Array.isArray(out?.contexts)) setContexts(out.contexts);
      setTravelPlanState(payloadTravelPlanState(out));
      setTaskDetection(payloadTaskDetection(out));
      setCognitiveState(payloadCognitiveState(out));
      setPortfolioDocumentState(payloadPortfolioState(out));
      refreshConversationHistory({ silent: true });
      setConceptsDirty(false);
      setFlowHasUnsaved(false);
      const emitVirtualStructureMessage =
        opts?.saveReason === "auto_before_turn" ? false : !!opts?.emitVirtualStructureMessage;
      if (emitVirtualStructureMessage) {
        setMessages((prev) => [
          ...prev,
          { id: makeId("virtual_save"), role: "user", text: "已更改coginstrument结构" },
        ]);
      }
      if (out?.conflictGate?.blocked) {
        setMessages((prev) => [
          ...prev,
          {
            id: makeId("gcg"),
            role: "assistant",
            text: out.conflictGate?.message || tr("检测到冲突 motif，请先确认后再生成建议。", "Conflicting motifs detected. Resolve them before generating advice."),
          },
        ]);
      } else if (out?.assistantText) {
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
    const prevMotifs = motifs || [];
    const nextMotifs = prevMotifs.map((m) =>
        m.id === motifId ? { ...m, ...patch, updatedAt: new Date().toISOString() } : m
    );
    setMotifs(nextMotifs);
    const hasStructureMutation =
      Object.prototype.hasOwnProperty.call(patch, "conceptIds") ||
      Object.prototype.hasOwnProperty.call(patch, "concept_bindings") ||
      Object.prototype.hasOwnProperty.call(patch, "anchorConceptId") ||
      Object.prototype.hasOwnProperty.call(patch, "roles") ||
      Object.prototype.hasOwnProperty.call(patch, "relation") ||
      Object.prototype.hasOwnProperty.call(patch, "dependencyClass") ||
      Object.prototype.hasOwnProperty.call(patch, "causalOperator");
    if (hasStructureMutation) {
      setMotifReasoningView(emptyMotifReasoningView);
    }

    setConceptsDirty(true);
  }

  function onCreateMotifDraft(draft: ManualMotifDraft) {
    const now = new Date().toISOString();
    const sourceKey = canonicalizeManualSemanticKey(draft.sourceNodeKey, draft.sourceStatement, draft.sourceNodeType);
    const targetKey = canonicalizeManualSemanticKey(draft.targetNodeKey, draft.targetStatement, draft.targetNodeType);

    setConcepts((prev) => {
      const current = (prev || []).slice();

      const upsertConcept = (params: {
        statement: string;
        semanticKey: string;
        nodeId: string;
        nodeType: ManualMotifDraft["sourceNodeType"];
        hintId?: string;
      }) => {
        const semanticKey = canonicalizeManualSemanticKey(params.semanticKey, params.statement, params.nodeType);
        const matchedHint = current.find((c) => c.id === params.hintId);
        const matchedSemantic =
          findBestConceptForUpsert({
            statement: params.statement,
            semanticKey,
            nodeType: params.nodeType,
            concepts: current,
            minScore: 0.58,
          }) ||
          current.find((c) => {
            const statementKey = normalizeTextKey(params.statement);
            return !!statementKey && statementKey === normalizeTextKey(c.title);
          });
        const matched = matchedHint || matchedSemantic;
        if (matched) {
          matched.nodeIds = uniqStrings([...(matched.nodeIds || []), params.nodeId], 48);
          matched.primaryNodeId = matched.primaryNodeId || params.nodeId;
          matched.sourceMsgIds = uniqStrings([...(matched.sourceMsgIds || []), "manual_motif_input"], 80);
          matched.updatedAt = now;
          return matched;
        }

        const kind = kindFromNodeType(params.nodeType);
        const concept: ConceptItem = {
          id: stableConceptIdFromManual(semanticKey || params.statement, kind, "positive", "global"),
          kind,
          validationStatus: "resolved",
          extractionStage: "disambiguation",
          polarity: "positive",
          scope: "global",
          family: "other",
          semanticKey,
          title: compactText(params.statement, 80) || "Concept",
          description: tr("由 Motif 画布手动创建", "Manually created from motif canvas"),
          score: 0.72,
          nodeIds: [params.nodeId],
          primaryNodeId: params.nodeId,
          evidenceTerms: uniqStrings([compactText(params.statement, 30)], 8),
          sourceMsgIds: ["manual_motif_input"],
          motifIds: [],
          migrationHistory: ["manual_created:motif_canvas"],
          locked: false,
          paused: false,
          updatedAt: now,
        };
        current.push(concept);
        return concept;
      };

      const sourceConcept = upsertConcept({
        statement: draft.sourceStatement,
        semanticKey: sourceKey,
        nodeId: draft.sourceNodeId,
        nodeType: draft.sourceNodeType,
        hintId: draft.sourceConceptHintId,
      });
      const targetConcept = upsertConcept({
        statement: draft.targetStatement,
        semanticKey: targetKey,
        nodeId: draft.targetNodeId,
        nodeType: draft.targetNodeType,
        hintId: draft.targetConceptHintId,
      });

      const motifId = makeId("m_manual");
      const conceptIds = [sourceConcept.id, targetConcept.id];
      const newMotif: ConceptMotif = {
        id: motifId,
        motif_id: motifId,
        motif_type: semanticMotifTypeFromRelation(draft.relation),
        templateKey: `manual:${draft.relation}`,
        motifType: "pair",
        relation: draft.relation,
        roles: { sources: [sourceConcept.id], target: targetConcept.id },
        scope: "global",
        aliases: uniqStrings([motifId, "manual_motif"], 24),
        concept_bindings: conceptIds,
        conceptIds,
        anchorConceptId: targetConcept.id,
        title: compactText(`${sourceConcept.title} → ${targetConcept.title}`, 160),
        description: compactText(draft.sentence, 320),
        confidence: 0.82,
        supportEdgeIds: [draft.edgeId],
        supportNodeIds: [draft.sourceNodeId, draft.targetNodeId],
        status: "active",
        statusReason: "user_created_in_motif_canvas",
        resolved: false,
        causalOperator: draft.causalOperator,
        causalFormula: `${compactText(sourceConcept.title, 60)} -> ${compactText(targetConcept.title, 60)}`,
        dependencyClass: draft.relation,
        novelty: "new",
        updatedAt: now,
      };

      setMotifs((prevMotifs) => {
        const all = [...(prevMotifs || []), newMotif];
        setActiveMotifId(newMotif.id);

        setMotifLinks((prevLinks) => {
          const currentLinks = (prevLinks || []).slice();
          const existing = (prevMotifs || []).slice();
          const pending: MotifLink[] = [];
          for (const m of existing) {
            if (!m || m.status === "cancelled") continue;
            const mSources = (m.conceptIds || []).filter((id) => id !== m.anchorConceptId);
            const mTarget = m.anchorConceptId;
            const shareConcept = (m.conceptIds || []).some((id) => conceptIds.includes(id));
            if (!shareConcept) continue;

            let from = "";
            let to = "";
            if (mTarget && mTarget === sourceConcept.id) {
              from = m.id;
              to = newMotif.id;
            } else if (targetConcept.id && mSources.includes(targetConcept.id)) {
              from = newMotif.id;
              to = m.id;
            } else if (m.relation !== newMotif.relation) {
              from = m.id;
              to = newMotif.id;
            } else {
              from = m.id;
              to = newMotif.id;
            }
            if (!from || !to || from === to) continue;
            const type =
                m.relation === "conflicts_with" || newMotif.relation === "conflicts_with"
                    ? "conflicts_with"
                    : relationToLinkType(newMotif.relation);
            const existsLink = currentLinks.some((x) => x.fromMotifId === from && x.toMotifId === to && x.type === type);
            if (existsLink) continue;
            pending.push({
              id: makeId("ml_manual"),
              fromMotifId: from,
              toMotifId: to,
              type,
              confidence: 0.74,
              source: "user",
              updatedAt: now,
            });
            if (pending.length >= 3) break;
          }
          return [...currentLinks, ...pending];
        });

        return all;
      });

      return current;
    });

    setMotifReasoningView(emptyMotifReasoningView);
    setActiveConceptId("");
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
  const mainCls = conceptPanelCollapsed ? "Main Main--conceptCollapsed" : "Main";

  function toggleConceptPanelCollapsed() {
    setConceptPanelCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(CONCEPT_PANEL_COLLAPSED_STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  function togglePlanStateCollapsed() {
    setPlanStateCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(PLAN_STATE_PANEL_COLLAPSED_STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
      <div className="App">
        <button
          type="button"
          className={`HistoryDrawerToggle ${historyPanelOpen ? "is-open" : ""}`}
          title={tr("切换历史会话面板", "Toggle conversation history")}
          onClick={() => {
            const next = !historyPanelOpen;
            setHistoryPanelOpen(next);
            if (next) refreshConversationHistory({ silent: true });
          }}
        >
          {historyPanelOpen ? tr("收起对话", "Hide Chats") : tr("历史对话", "Chats")}
        </button>
        <ConversationHistoryDrawer
          locale={locale}
          open={historyPanelOpen}
          loading={historyLoading}
          errorText={historyError}
          items={conversationHistory}
          activeConversationId={cid}
          onClose={() => setHistoryPanelOpen(false)}
          onRefresh={() => refreshConversationHistory()}
          onSelectConversation={onSelectConversation}
          onNewConversation={onNewConversation}
        />
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

        <div className={mainCls}>
          <div className="Left">
            <div className={`LeftStack ${planStateCollapsed ? "LeftStack--planCollapsed" : ""}`}>
              <div className="LeftStack__chat">
                <ChatPanel
                    locale={locale}
                    messages={messages}
                    disabled={disabled}
                    busy={busy}
                    onSend={onSend}
                    evidenceFocus={mergedFocus}
                />
              </div>
              <div className="LeftStack__plan">
                <PlanStatePanel
                    locale={locale}
                    taskDetection={taskDetection}
                    cognitiveState={cognitiveState}
                    portfolioDocumentState={portfolioDocumentState}
                    travelPlanState={travelPlanState}
                    collapsed={planStateCollapsed}
                    onToggleCollapsed={togglePlanStateCollapsed}
                />
              </div>
            </div>
          </div>

          {!conceptPanelCollapsed ? (
            <div className="Center">
              <ConceptPanel
                  locale={locale}
                  concepts={conceptsView}
                  motifs={motifs}
                  contexts={contexts}
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
              <button
                  type="button"
                  className="ConceptPanelEdgeToggle is-expanded"
                  title={tr("收起 Concept/Motif 列表", "Collapse Concept/Motif panel")}
                  onClick={toggleConceptPanelCollapsed}
              >
                {tr("收起", "Collapse")}
              </button>
            </div>
          ) : null}

          <div className="Right">
            {conceptPanelCollapsed ? (
              <button
                  type="button"
                  className="ConceptPanelEdgeToggle is-collapsed"
                  title={tr("展开 Concept/Motif 列表", "Expand Concept/Motif panel")}
                  onClick={toggleConceptPanelCollapsed}
              >
                {tr("展开", "Expand")}
              </button>
            ) : null}
            <FlowPanel
                conversationId={cid}
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
                onCreateMotifDraft={onCreateMotifDraft}
                onSaveGraph={onSaveGraph}
                savingGraph={savingGraph}
                extraDirty={conceptsDirty}
                focusNodeId={focusNodeId}
                onFocusNodeHandled={() => setFocusNodeId("")}
                onDraftGraphChange={setDraftGraphPreview}
                conceptPanelCollapsed={conceptPanelCollapsed}
                onToggleConceptPanel={toggleConceptPanelCollapsed}
                onUnsavedStateChange={({ hasUnsaved }) => setFlowHasUnsaved(hasUnsaved)}
            />
          </div>
        </div>
      </div>
  );
}
