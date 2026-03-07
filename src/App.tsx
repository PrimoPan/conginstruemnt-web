// src/App.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

import { api, ApiHttpError } from "./api/client";
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
  TravelPlanningBootstrapRequest,
  MotifTransferState,
  TaskLifecycleState,
} from "./core/type";
import { TopBar } from "./components/TopBar";
import { ChatPanel, Msg, type ModeCReferenceItem } from "./components/ChatPanel";
import { FlowPanel, type ManualMotifDraft } from "./components/FlowPanel";
import { normalizeGraphClient } from "./core/graphSafe";
import { ConceptPanel } from "./components/ConceptPanel";
import { PlanStatePanel } from "./components/PlanStatePanel";
import { ConversationHistoryDrawer } from "./components/ConversationHistoryDrawer";
import { CognitiveSummaryModal } from "./components/CognitiveSummaryModal";
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
const USERNAME_STORAGE_KEY = "ci_username";

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

function isStableCarryHintConcept(c: ConceptItem): boolean {
  const semantic = String(c?.semanticKey || "").toLowerCase();
  if (semantic.startsWith("slot:constraint:limiting:health")) return true;
  if (semantic.startsWith("slot:constraint:limiting:religion")) return true;
  if (semantic.startsWith("slot:constraint:limiting:language")) return true;
  if (semantic.startsWith("slot:constraint:limiting:mobility")) return true;
  if (semantic.startsWith("slot:constraint:limiting:diet")) return true;
  if (semantic.startsWith("slot:constraint:limiting:safety")) return true;
  if (semantic === "slot:people" || semantic === "slot:lodging") return true;
  const text = `${c?.title || ""} ${c?.description || ""}`.toLowerCase();
  return /冠心病|心脏|健康|医疗|health|cardiac|medical|宗教|信仰|礼拜|religion|faith|prayer|halal|kosher|语言|language|无障碍|mobility|低盐|低脂|diet|安全|safety|同行|family|traveler|住宿|lodging/i.test(
    text
  );
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

type TaskActionPrompt = {
  endedAt?: string;
  endedTaskId?: string;
  resumable: boolean;
};

type TransferReviewStage = "ready" | "fresh_task" | "awaiting_first_turn_review" | "no_transfer_match";

function mergeSummarySelectionsByMotifType(
  selections: Array<{
    motif_id?: string;
    motif_type_id?: string;
    store?: boolean;
    abstraction_levels?: Array<"L1" | "L2" | "L3">;
    abstraction_text?: { L1?: string; L2?: string; L3?: string };
  }>
) {
  const merged = new Map<
    string,
    {
      motif_id?: string;
      motif_type_id?: string;
      store?: boolean;
      abstraction_levels?: Array<"L1" | "L2" | "L3">;
      abstraction_text?: { L1?: string; L2?: string; L3?: string };
    }
  >();
  for (const row of selections || []) {
    const motifTypeId = compactText(row?.motif_type_id, 180);
    if (!motifTypeId || row?.store === false) continue;
    const base = merged.get(motifTypeId);
    const nextLevels = uniqStrings([...(base?.abstraction_levels || []), ...((row?.abstraction_levels || []) as string[])], 3)
      .filter((x): x is "L1" | "L2" | "L3" => x === "L1" || x === "L2" || x === "L3");
    merged.set(motifTypeId, {
      motif_id: row?.motif_id || base?.motif_id,
      motif_type_id: motifTypeId,
      store: true,
      abstraction_levels: nextLevels,
      abstraction_text: {
        L1: compactText(row?.abstraction_text?.L1 || base?.abstraction_text?.L1, 180) || undefined,
        L2: compactText(row?.abstraction_text?.L2 || base?.abstraction_text?.L2, 180) || undefined,
        L3: compactText(row?.abstraction_text?.L3 || base?.abstraction_text?.L3, 220) || undefined,
      },
    });
  }
  return Array.from(merged.values());
}

function parseTaskClosedPrompt(err: any): TaskActionPrompt | null {
  if (!(err instanceof ApiHttpError)) return null;
  if (err.status !== 409) return null;
  const code = String(err.code || err.data?.error || "").trim().toLowerCase();
  if (code !== "task_closed") return null;
  return {
    endedAt: compactText(err.data?.ended_at, 48) || undefined,
    endedTaskId: compactText(err.data?.ended_task_id, 120) || undefined,
    resumable: err.data?.resumable !== false,
  };
}

function shouldClearConversationOnLoadError(err: any) {
  if (!(err instanceof ApiHttpError)) return false;
  return err.status === 400 || err.status === 401 || err.status === 404;
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

function payloadMotifTransferState(payload: any): MotifTransferState | null {
  const x = payload?.motifTransferState;
  if (!x || typeof x !== "object") return null;
  return x as MotifTransferState;
}

function payloadTravelPlanState(payload: any): TravelPlanState | null {
  const x = payload?.travelPlanState;
  if (!x || typeof x !== "object") return null;
  return x as TravelPlanState;
}

function payloadTransferRecommendationsEnabled(payload: any, fallback = false): boolean {
  if (typeof payload?.transferRecommendationsEnabled === "boolean") {
    return payload.transferRecommendationsEnabled;
  }
  return fallback;
}

function payloadTaskLifecycle(payload: any): TaskLifecycleState | null {
  const x = payload?.taskLifecycle;
  if (!x || typeof x !== "object") return null;
  const status = String((x as any)?.status || "").trim().toLowerCase();
  return {
    status: status === "closed" ? "closed" : "active",
    endedAt: compactText((x as any)?.endedAt, 48) || undefined,
    endedTaskId: compactText((x as any)?.endedTaskId, 120) || undefined,
    reopenedAt: compactText((x as any)?.reopenedAt, 48) || undefined,
    updatedAt: compactText((x as any)?.updatedAt, 48) || undefined,
    resumable: (x as any)?.resumable !== false,
    resume_required: !!(x as any)?.resume_required,
  };
}

function taskActionPromptFromLifecycle(
  lifecycle: TaskLifecycleState | null
): TaskActionPrompt | null {
  if (lifecycle?.status !== "closed") return null;
  return {
    endedAt: lifecycle.endedAt,
    endedTaskId: lifecycle.endedTaskId,
    resumable: lifecycle.resumable !== false,
  };
}

function cleanUiError(input: any, max = 220): string {
  return String(input ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export default function App() {
  const [username, setUsername] = useState("test");
  const [preferredLocale, setPreferredLocale] = useState<AppLocale>(() => {
    const raw = String(localStorage.getItem(LOCALE_STORAGE_KEY) || "").trim().toLowerCase();
    return raw.startsWith("en") ? "en-US" : "zh-CN";
  });
  const [conversationLocale, setConversationLocale] = useState<AppLocale | null>(null);

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
  const [motifTransferState, setMotifTransferState] = useState<MotifTransferState | null>(null);
  const [portfolioDocumentState, setPortfolioDocumentState] = useState<PortfolioDocumentState | null>(null);
  const [taskLifecycle, setTaskLifecycle] = useState<TaskLifecycleState | null>(null);
  const [transferRecommendationsEnabled, setTransferRecommendationsEnabled] = useState(false);
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
  const [newTripModalOpen, setNewTripModalOpen] = useState(false);
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [pendingTaskEndAction, setPendingTaskEndAction] = useState<"export" | "new_trip" | "end_task" | null>(null);
  const [modeCReferences, setModeCReferences] = useState<ModeCReferenceItem[]>([]);
  const [taskActionPrompt, setTaskActionPrompt] = useState<TaskActionPrompt | null>(null);
  const [awaitingFirstTurnReview, setAwaitingFirstTurnReview] = useState(false);
  const [newTripDestination, setNewTripDestination] = useState("");
  const [newTripKeepConsistentText, setNewTripKeepConsistentText] = useState("");
  const [newTripCarryStableProfile, setNewTripCarryStableProfile] = useState(true);
  const loggedIn = !!token;
  const locale = conversationLocale || preferredLocale;
  const en = locale === "en-US";
  const tr = (zh: string, enText: string) => (en ? enText : zh);
  const userFacingError = (err: any, zhFallback: string, enFallback: string) => {
    const raw = cleanUiError(err?.message || String(err || ""), 260);
    if (!raw) return tr(zhFallback, enFallback);
    const lower = raw.toLowerCase();
    if (
      /http\s*(502|503|504)\b/.test(lower) ||
      /bad gateway|gateway timeout|upstream service unavailable|service unavailable/.test(lower)
    ) {
      return tr("服务暂时不可用，请稍后重试。", "Service temporarily unavailable. Please retry later.");
    }
    return raw;
  };
  const historyLoadErrLabel = en ? "Failed to load conversation history" : "加载历史对话失败";
  const autoCarryHints = useMemo(
    () =>
      uniqStrings(
        (concepts || [])
          .filter((c) => isStableCarryHintConcept(c))
          .map((c) => compactText(c.title, 80)),
        6
      ),
    [concepts]
  );
  const transferReviewStage = useMemo<TransferReviewStage | null>(() => {
    if (!transferRecommendationsEnabled) return null;
    const turnCount = Number((travelPlanState as any)?.source?.turnCount || 0);
    const recommendationCount = motifTransferState?.recommendations?.length || 0;
    if (recommendationCount > 0) return "ready";
    if (awaitingFirstTurnReview) return "awaiting_first_turn_review";
    if (turnCount <= 0) return "fresh_task";
    if (turnCount === 1 && motifTransferState?.lastEvaluatedAt) return "no_transfer_match";
    return "ready";
  }, [awaitingFirstTurnReview, motifTransferState, transferRecommendationsEnabled, travelPlanState]);

  // 中断上一次流（避免串台）
  const abortRef = useRef<AbortController | null>(null);
  const conversationLoadSeqRef = useRef(0);
  const historyLoadSeqRef = useRef(0);

  // 卸载时中断
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // 恢复会话：拉 graph + turns
  useEffect(() => {
    if (!token || !cid) {
      conversationLoadSeqRef.current += 1;
      return;
    }

    const requestedConversationId = cid;
    const loadSeq = conversationLoadSeqRef.current + 1;
    conversationLoadSeqRef.current = loadSeq;
    let cancelled = false;
    const isStale = () => cancelled || conversationLoadSeqRef.current !== loadSeq;

    (async () => {
      try {
        const conv = await api.getConversation(token, requestedConversationId);
        if (isStale()) return;
        if (conv?.locale) {
          setConversationLocale(conv.locale);
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
        setMotifTransferState(payloadMotifTransferState(conv));
        setPortfolioDocumentState(payloadPortfolioState(conv));
        const nextLifecycle = payloadTaskLifecycle(conv);
        setTaskLifecycle(nextLifecycle);
        setTransferRecommendationsEnabled(payloadTransferRecommendationsEnabled(conv));
        setTaskActionPrompt(taskActionPromptFromLifecycle(nextLifecycle));
        setConceptsDirty(false);
        setFlowHasUnsaved(false);
        setActiveConceptId("");
        setActiveMotifId("");
        setFocusNodeId("");

        const turns = await api.getTurns(token, requestedConversationId, 120);
        if (isStale()) return;
        const ms: Msg[] = [];

        for (const t of turns) {
          const tid = t.id || makeId("turn");
          ms.push({ id: `${tid}_u`, role: "user", text: t.userText });
          ms.push({ id: `${tid}_a`, role: "assistant", text: t.assistantText });
        }

        setMessages(ms);
      } catch (e: any) {
        if (isStale()) return;
        if (!shouldClearConversationOnLoadError(e)) return;

        if (localStorage.getItem("ci_cid") === requestedConversationId) {
          localStorage.removeItem("ci_cid");
        }
        resetConversationState();
        setCid((current) => (current === requestedConversationId ? "" : current));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, cid]);

  useEffect(() => {
    if (!historyPanelOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHistoryPanelOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [historyPanelOpen]);

  useEffect(() => {
    if (!newTripModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNewTripModalOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [newTripModalOpen]);

  useEffect(() => {
    setModeCReferences([]);
  }, [cid]);

  const refreshConversationHistory = useCallback(async (opts?: { silent?: boolean }) => {
    if (!token) {
      historyLoadSeqRef.current += 1;
      setConversationHistory([]);
      setHistoryError("");
      setHistoryLoading(false);
      return;
    }
    const loadSeq = historyLoadSeqRef.current + 1;
    historyLoadSeqRef.current = loadSeq;
    const isStale = () => historyLoadSeqRef.current !== loadSeq;
    if (!opts?.silent) setHistoryLoading(true);
    setHistoryError("");
    try {
      const list = await api.listConversations(token, locale);
      if (isStale()) return;
      setConversationHistory(Array.isArray(list) ? list : []);
    } catch (e: any) {
      if (isStale()) return;
      setHistoryError(`${historyLoadErrLabel}: ${e?.message || String(e)}`);
    } finally {
      if (isStale()) return;
      setHistoryLoading(false);
    }
  }, [token, historyLoadErrLabel, locale]);

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
      const previousUsername = compactText(localStorage.getItem(USERNAME_STORAGE_KEY), 64);
      const hasSavedConversation = !!compactText(localStorage.getItem("ci_cid"), 120);
      const shouldDropSavedConversation = hasSavedConversation && previousUsername !== u;
      if (shouldDropSavedConversation) {
        conversationLoadSeqRef.current += 1;
        localStorage.removeItem("ci_cid");
        setCid("");
        resetConversationState();
      }
      setToken(r.sessionToken);
      localStorage.setItem("ci_token", r.sessionToken);
      localStorage.setItem(USERNAME_STORAGE_KEY, u);
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: makeId("login_err"),
          role: "assistant",
          text: `${tr("登录失败", "Login failed")}: ${userFacingError(
            e,
            "请求失败，请稍后重试。",
            "Request failed. Please retry later."
          )}`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function resetConversationState() {
    setConversationLocale(null);
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
    setMotifTransferState(null);
    setPortfolioDocumentState(null);
    setTaskLifecycle(null);
    setTransferRecommendationsEnabled(false);
    setConceptsDirty(false);
    setFlowHasUnsaved(false);
    setActiveConceptId("");
    setActiveMotifId("");
    setFocusNodeId("");
    setNodeHoverFocus(null);
    setGraphGenerating(false);
    setModeCReferences([]);
    setTaskActionPrompt(null);
    setAwaitingFirstTurnReview(false);
  }

  function applyConversationPayload(payload: any) {
    if (payload?.locale === "zh-CN" || payload?.locale === "en-US") {
      setConversationLocale(payload.locale);
    }
    const safeGraph = normalizeGraphClient(payload?.graph || emptyGraph);
    setGraph(safeGraph);
    setDraftGraphPreview(safeGraph);
    setConcepts(Array.isArray(payload?.concepts) ? payload.concepts : []);
    setMotifs(payloadMotifs(payload));
    setMotifLinks(payloadMotifLinks(payload));
    setMotifReasoningView(
      normalizeReasoningViewPayload(
        payload?.motifReasoningView || emptyMotifReasoningView,
        payload?.reasoning_steps
      )
    );
    setContexts(Array.isArray(payload?.contexts) ? payload.contexts : []);
    setTravelPlanState(payloadTravelPlanState(payload));
    setTaskDetection(payloadTaskDetection(payload));
    setCognitiveState(payloadCognitiveState(payload));
    setMotifTransferState(payloadMotifTransferState(payload));
    setPortfolioDocumentState(payloadPortfolioState(payload));
    const nextLifecycle = payloadTaskLifecycle(payload);
    setTaskLifecycle(nextLifecycle);
    setTransferRecommendationsEnabled((current) => payloadTransferRecommendationsEnabled(payload, current));
    setTaskActionPrompt(taskActionPromptFromLifecycle(nextLifecycle));
    setAwaitingFirstTurnReview(false);
    setConceptsDirty(false);
    setFlowHasUnsaved(false);
  }

  async function onNewConversation() {
    if (!token) return;

    // 强制新会话：中断旧流并清空当前上下文
    abortRef.current?.abort();
    abortRef.current = null;
    resetConversationState();

    setBusy(true);
    try {
      const title = preferredLocale === "en-US" ? "New Conversation" : "新对话";
      const r = await api.createConversation(token, title, preferredLocale);
      setCid(r.conversationId);
      localStorage.setItem("ci_cid", r.conversationId);
      if (r?.locale) {
        setConversationLocale(r.locale);
      }
      applyConversationPayload(r);
      setTransferRecommendationsEnabled(false);
      setHistoryPanelOpen(false);
      refreshConversationHistory({ silent: true });
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: makeId("new_conv_err"),
          role: "assistant",
          text: `${tr("新建对话失败", "Failed to create conversation")}: ${userFacingError(
            e,
            "请求失败，请稍后重试。",
            "Request failed. Please retry later."
          )}`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function openNewTravelPlanningModalDirect() {
    if (!token) return;
    setHistoryPanelOpen(false);
    setNewTripDestination("");
    setNewTripKeepConsistentText("");
    setNewTripCarryStableProfile(true);
    setTaskActionPrompt(null);
    setNewTripModalOpen(true);
  }

  function beginTaskEndFlow(next: "export" | "new_trip" | "end_task") {
    if (!token || !cid) {
      if (next === "new_trip") openNewTravelPlanningModalDirect();
      return;
    }
    if (next === "end_task" && taskLifecycle?.status === "closed") {
      setMessages((prev) => [
        ...prev,
        {
          id: makeId("task_end_already_closed"),
          role: "assistant",
          text: tr(
            "当前任务已是结束状态。你可以恢复当前任务，或开启一个新任务。",
            "The current task is already closed. Resume it or start a new task."
          ),
        },
      ]);
      setTaskActionPrompt({
        endedAt: taskLifecycle.endedAt,
        endedTaskId: taskLifecycle.endedTaskId,
        resumable: taskLifecycle.resumable !== false,
      });
      return;
    }
    const hasMotifs = (motifs || []).length > 0;
    if (!hasMotifs) {
      if (next === "export") {
        onExportPlanDirect();
      } else if (next === "new_trip") {
        openNewTravelPlanningModalDirect();
      } else {
        void (async () => {
          if (!token || !cid) return;
          setBusy(true);
          try {
            const out = await api.confirmMotifLibrary(token, cid, [], { closeTask: true });
            applyConversationPayload(out);
            setModeCReferences([]);
            setTaskActionPrompt({
              endedAt: payloadTaskLifecycle(out)?.endedAt,
              endedTaskId: payloadTaskLifecycle(out)?.endedTaskId,
              resumable: payloadTaskLifecycle(out)?.resumable !== false,
            });
            setMessages((prev) => [
              ...prev,
              {
                id: makeId("task_end"),
                role: "assistant",
                text: tr(
                  "当前任务已结束。你可以继续对话，或新建一个任务。",
                  "Current task is now closed. You can keep chatting or start a new task."
                ),
              },
            ]);
          } catch (e: any) {
            setMessages((prev) => [
              ...prev,
              {
                id: makeId("task_end_err"),
                role: "assistant",
                text: `${tr("结束任务失败", "End task failed")}: ${e?.message || String(e)}`,
              },
            ]);
          } finally {
            setBusy(false);
          }
        })();
      }
      return;
    }
    setPendingTaskEndAction(next);
    setSummaryModalOpen(true);
  }

  function onOpenNewTravelPlanningModal() {
    beginTaskEndFlow("new_trip");
  }

  function onEndTask() {
    beginTaskEndFlow("end_task");
  }

  async function onCreateNewTravelPlanning() {
    if (!token) return;
    const destination = newTripDestination.trim();
    if (!destination) return;

    abortRef.current?.abort();
    abortRef.current = null;

    const planningBootstrap: TravelPlanningBootstrapRequest = {
      sourceTaskId: (travelPlanState as any)?.task_id || undefined,
      sourceConversationId: cid || undefined,
      destination,
      keepConsistentText: newTripKeepConsistentText.trim() || undefined,
      carryHealthReligion: newTripCarryStableProfile,
      carryStableProfile: newTripCarryStableProfile,
    };

    setBusy(true);
    try {
      const title = preferredLocale === "en-US" ? `Trip Plan · ${destination}` : `旅行规划·${destination}`;
      const nextPlanningBootstrap: TravelPlanningBootstrapRequest = {
        ...planningBootstrap,
        sourceTaskId: conversationLocale === preferredLocale ? planningBootstrap.sourceTaskId : undefined,
        sourceConversationId: conversationLocale === preferredLocale ? planningBootstrap.sourceConversationId : undefined,
      };
      const r = await api.createConversation(token, title, preferredLocale, { planningBootstrap: nextPlanningBootstrap });
      setCid(r.conversationId);
      localStorage.setItem("ci_cid", r.conversationId);
      if (r?.locale) {
        setConversationLocale(r.locale);
      }
      applyConversationPayload(r);
      setTransferRecommendationsEnabled(true);
      setNewTripModalOpen(false);
      setHistoryPanelOpen(false);
      setTaskActionPrompt(null);
      refreshConversationHistory({ silent: true });
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: makeId("new_trip_err"),
          role: "assistant",
          text: `${tr("创建旅行规划失败", "Failed to create trip plan")}: ${userFacingError(
            e,
            "请求失败，请稍后重试。",
            "Request failed. Please retry later."
          )}`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function onResumeTask() {
    if (!token || !cid) return;
    setBusy(true);
    try {
      const out = await api.resumeTask(token, cid);
      applyConversationPayload(out);
      setTaskActionPrompt(null);
      setMessages((prev) => [
        ...prev,
        {
          id: makeId("task_resumed"),
          role: "assistant",
          text: tr("已恢复当前任务。你可以继续对话。", "Current task resumed. You can continue chatting."),
        },
      ]);
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: makeId("task_resume_err"),
          role: "assistant",
          text: `${tr("恢复任务失败", "Resume task failed")}: ${userFacingError(e, "恢复任务失败", "Resume task failed")}`,
        },
      ]);
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
    if (taskLifecycle?.status === "closed") {
      setTaskActionPrompt({
        endedAt: taskLifecycle.endedAt,
        endedTaskId: taskLifecycle.endedTaskId,
        resumable: taskLifecycle.resumable !== false,
      });
      setMessages((prev) => [
        ...prev,
        {
          id: makeId("task_closed_guard"),
          role: "assistant",
          text: tr(
            "当前任务已结束。请先恢复当前任务，或新建一个任务。",
            "The current task is closed. Resume it first or start a new task."
          ),
        },
      ]);
      return;
    }
    const manualReferences = modeCReferences.length
      ? modeCReferences.slice(0, 6).map((x) => ({
          motif_type_id: x.motifTypeId,
          title: compactText(x.title, 120),
          text: compactText(x.text || x.title, 240),
        }))
      : undefined;
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
    if (Number((travelPlanState as any)?.source?.turnCount || 0) === 0) {
      setAwaitingFirstTurnReview(true);
    }

    setBusy(true);
    setGraphGenerating(true);

    try {
      await api.turnStream(token, cid, userText, {
        signal: ac.signal,

        onStart: (_d) => {
          if (abortRef.current !== ac || ac.signal.aborted) return;
          // 可选：你可以在这里做 UI 状态提示
        },

        onToken: (tk: string) => {
          if (abortRef.current !== ac || ac.signal.aborted) return;
          setMessages((prev) =>
              prev.map((msg) =>
                  msg.id === assistantId ? { ...msg, text: (msg.text || "") + tk } : msg
              )
          );
        },

        onDone: (out: TurnResponse) => {
          if (abortRef.current !== ac || ac.signal.aborted) return;
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
          setMotifTransferState(payloadMotifTransferState(out));
          setPortfolioDocumentState(payloadPortfolioState(out));
          setTaskLifecycle(payloadTaskLifecycle(out));
          setTaskActionPrompt(null);
          setAwaitingFirstTurnReview(false);
          refreshConversationHistory({ silent: true });
        },

        onError: (err: TurnStreamErrorData) => {
          if (abortRef.current !== ac || ac.signal.aborted) return;
          setAwaitingFirstTurnReview(false);
          setMessages((prev) =>
              prev.map((msg) =>
                  msg.id === assistantId
                      ? { ...msg, text: `${tr("流式失败", "Stream error")}: ${err.message}` }
                      : msg
              )
          );
        },
      }, manualReferences);
    } catch (e: any) {
      if (!ac.signal.aborted) {
        const closedPrompt = parseTaskClosedPrompt(e);
        if (closedPrompt) {
          setTaskActionPrompt(closedPrompt);
        }
        setAwaitingFirstTurnReview(false);
        setMessages((prev) =>
            prev.map((msg) =>
                msg.id === assistantId
                    ? {
                        ...msg,
                        text: closedPrompt
                            ? tr(
                                "当前任务已结束。请选择恢复当前任务，或新建一个任务。",
                                "The current task is closed. Resume it or start a new task."
                              )
                            : `${tr("请求失败", "Request failed")}: ${e?.message || String(e)}`,
                      }
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
      setMotifTransferState(payloadMotifTransferState(out));
      setPortfolioDocumentState(payloadPortfolioState(out));
      setTaskLifecycle(payloadTaskLifecycle(out));
      refreshConversationHistory({ silent: true });
      setConceptsDirty(false);
      setFlowHasUnsaved(false);
      const emitVirtualStructureMessage =
        opts?.saveReason === "auto_before_turn" ? false : !!opts?.emitVirtualStructureMessage;
      if (emitVirtualStructureMessage) {
        setMessages((prev) => [
          ...prev,
          { id: makeId("virtual_save"), role: "user", text: tr("已更改coginstrument结构", "Updated the CogInstrument structure") },
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

  async function onExportPlanDirect() {
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

  function onExportPlan() {
    beginTaskEndFlow("export");
  }

  async function onSubmitCognitiveSummary(
    selections: Array<{
      motif_id?: string;
      motif_type_id?: string;
      store?: boolean;
      abstraction_levels?: Array<"L1" | "L2" | "L3">;
      abstraction_text?: { L1?: string; L2?: string; L3?: string };
    }>
  ) {
    if (!token || !cid) return;
    const normalizedSelections = mergeSummarySelectionsByMotifType(selections);
    setBusy(true);
    try {
      const out = await api.confirmMotifLibrary(token, cid, normalizedSelections, {
        closeTask: pendingTaskEndAction === "end_task",
      });
      applyConversationPayload(out);
      setSummaryModalOpen(false);
      const next = pendingTaskEndAction;
      setPendingTaskEndAction(null);
      if (next === "export") {
        await onExportPlanDirect();
      } else if (next === "new_trip") {
        openNewTravelPlanningModalDirect();
      } else if (next === "end_task") {
        setModeCReferences([]);
        setTaskActionPrompt({
          endedAt: payloadTaskLifecycle(out)?.endedAt,
          endedTaskId: payloadTaskLifecycle(out)?.endedTaskId,
          resumable: payloadTaskLifecycle(out)?.resumable !== false,
        });
        setMessages((prev) => [
          ...prev,
          {
            id: makeId("task_end_confirmed"),
            role: "assistant",
            text: tr(
              "已结束当前任务并完成认知摘要存储。你可以继续对话，或新建下一任务。",
              "Current task has been closed and cognitive summary is stored. You can continue chatting or start the next task."
            ),
          },
        ]);
      }
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: makeId("summary_err"),
          role: "assistant",
          text: `${tr("认知摘要保存失败", "Cognitive summary save failed")}: ${e?.message || String(e)}`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function onTransferDecision(params: {
    candidateId: string;
    action: "adopt" | "modify" | "ignore" | "confirm";
    revisedText?: string;
    note?: string;
    modeOverride?: "A" | "B" | "C";
    applicationScope?: "trip" | "local";
    recommendation?: {
      motif_type_id: string;
      motif_type_title: string;
      dependency?: string;
      reusable_description?: string;
      source_task_id?: string;
      source_conversation_id?: string;
      status?: "active" | "uncertain" | "deprecated" | "cancelled";
      reason?: string;
      match_score?: number;
      recommended_mode?: "A" | "B" | "C";
    };
  }) {
    if (!token || !cid) return;
    try {
      const out = await api.motifTransferDecision(token, cid, {
        candidate_id: params.candidateId,
        action: params.action,
        revised_text: params.revisedText,
        note: params.note,
        mode_override: params.modeOverride,
        application_scope: params.applicationScope,
        recommendation: params.recommendation,
      });
      applyConversationPayload(out);
      if (out.followupQuestion) {
        setMessages((prev) => [...prev, { id: makeId("transfer_q"), role: "assistant", text: out.followupQuestion || "" }]);
      }
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: makeId("transfer_decision_err"),
          role: "assistant",
          text: `${tr("迁移决策失败", "Transfer decision failed")}: ${userFacingError(
            e,
            "请求失败，请稍后重试。",
            "Request failed. Please retry later."
          )}`,
        },
      ]);
    }
  }

  async function onTransferBatchDecision(params: {
    items: Array<{
      candidateId: string;
      action: "adopt" | "modify" | "ignore" | "confirm";
      revisedText?: string;
      note?: string;
      modeOverride?: "A" | "B" | "C";
      applicationScope?: "trip" | "local";
      recommendation?: {
        motif_type_id: string;
        motif_type_title: string;
        dependency?: string;
        reusable_description?: string;
        source_task_id?: string;
        source_conversation_id?: string;
        status?: "active" | "uncertain" | "deprecated" | "cancelled";
        reason?: string;
        match_score?: number;
        recommended_mode?: "A" | "B" | "C";
      };
    }>;
  }) {
    if (!token || !cid || !params.items.length) return;
    try {
      const out = await api.motifTransferBatchDecision(token, cid, {
        items: params.items.map((item) => ({
          candidate_id: item.candidateId,
          action: item.action,
          revised_text: item.revisedText,
          note: item.note,
          mode_override: item.modeOverride,
          application_scope: item.applicationScope,
          recommendation: item.recommendation,
        })),
      });
      applyConversationPayload(out);
      const followups = Array.from(new Set((out.followupQuestions || []).filter(Boolean)));
      if (followups.length === 1) {
        setMessages((prev) => [...prev, { id: makeId("transfer_batch_q"), role: "assistant", text: followups[0] || "" }]);
      } else if (followups.length > 1) {
        setMessages((prev) => [
          ...prev,
          {
            id: makeId("transfer_batch_qs"),
            role: "assistant",
            text:
              locale === "en-US"
                ? `Queued ${followups.length} historical patterns for review. Confirm them one by one in the motif panel.`
                : `已把 ${followups.length} 条历史思路加入待确认区。请在 motif 面板里逐条确认。`,
          },
        ]);
      }
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: makeId("transfer_batch_err"),
          role: "assistant",
          text: `${tr("批量迁移决策失败", "Batch transfer decision failed")}: ${userFacingError(
            e,
            "请求失败，请稍后重试。",
            "Request failed. Please retry later."
          )}`,
        },
      ]);
    }
  }

  async function onTransferFeedback(params: {
    signal: "thumbs_down" | "retry" | "manual_override" | "explicit_not_applicable";
    signalText?: string;
    candidateId?: string;
    motifTypeId?: string;
  }) {
    if (!token || !cid) return;
    try {
      const out = await api.motifTransferFeedback(token, cid, {
        signal: params.signal,
        signal_text: params.signalText,
        candidate_id: params.candidateId,
        motif_type_id: params.motifTypeId,
      });
      applyConversationPayload(out);
      if (out.followupQuestion) {
        setMessages((prev) => [...prev, { id: makeId("transfer_fb"), role: "assistant", text: out.followupQuestion || "" }]);
      }
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: makeId("transfer_feedback_err"),
          role: "assistant",
          text: `${tr("迁移反馈提交失败", "Transfer feedback failed")}: ${userFacingError(
            e,
            "请求失败，请稍后重试。",
            "Request failed. Please retry later."
          )}`,
        },
      ]);
    }
  }

  async function onReviseMotifLibrary(params: {
    motifTypeId: string;
    choice: "overwrite" | "new_version";
    requestId?: string;
    title?: string;
    dependency?: string;
    reusableDescription?: string;
    abstractionText?: { L1?: string; L2?: string; L3?: string };
    targetCandidateIds?: string[];
  }) {
    if (!token || !cid) return;
    try {
      const out = await api.reviseMotifLibrary(token, cid, {
        motif_type_id: params.motifTypeId,
        choice: params.choice,
        request_id: params.requestId,
        title: params.title,
        dependency: params.dependency,
        reusable_description: params.reusableDescription,
        abstraction_text: params.abstractionText,
        target_candidate_ids: params.targetCandidateIds,
      });
      applyConversationPayload(out);
      const summary = out.revision_summary;
      if (summary) {
        const changedFields = (summary.changed_fields || []).map((x) => x.field).join(", ");
        setMessages((prev) => [
          ...prev,
          {
            id: makeId("transfer_revise_done"),
            role: "assistant",
            text:
              locale === "en-US"
                ? `${summary.choice === "overwrite" ? "Overwrote" : "Created a new version for"} motif "${params.motifTypeId}". Changed: ${changedFields || "no fields"}.`
                : `${summary.choice === "overwrite" ? "已覆盖更新" : "已新建版本"} motif「${params.motifTypeId}」。变更字段：${changedFields || "无"}`,
          },
        ]);
      }
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: makeId("transfer_revise_err"),
          role: "assistant",
          text: `${tr("版本修订失败", "Revision failed")}: ${e?.message || String(e)}`,
        },
      ]);
    }
  }

  function onModeCReference(params: {
    motifTypeId: string;
    motifTypeTitle: string;
    reusableDescription: string;
  }) {
    const referenceId = `modec_ref_${params.motifTypeId}`;
    setModeCReferences((prev) => {
      const next = prev.filter((x) => x.id !== referenceId);
      return [
        ...next,
        {
          id: referenceId,
          motifTypeId: params.motifTypeId,
          title: compactText(params.motifTypeTitle, 90),
          text: compactText(params.reusableDescription || params.motifTypeTitle, 220),
        },
      ].slice(-6);
    });
  }

  async function onModeCConstraint(params: {
    motifTypeId: string;
    motifTypeTitle: string;
    reusableDescription: string;
    dependency: string;
    sourceTaskId?: string;
    sourceConversationId?: string;
    status: "active" | "uncertain" | "deprecated" | "cancelled";
    matchScore: number;
  }) {
    setModeCReferences((prev) => prev.filter((x) => x.motifTypeId !== params.motifTypeId));
    await onTransferDecision({
      candidateId: `modec_${params.motifTypeId}`,
      action: "adopt",
      modeOverride: "C",
      note: "mode_c_manual_constraint",
      recommendation: {
        motif_type_id: params.motifTypeId,
        motif_type_title: params.motifTypeTitle,
        dependency: params.dependency || "enable",
        reusable_description: params.reusableDescription,
        source_task_id: params.sourceTaskId,
        source_conversation_id: params.sourceConversationId,
        status: params.status,
        reason: "manual_mode_c_selection",
        match_score: params.matchScore,
        recommended_mode: "C",
      },
    });
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
            if (!m || m.status === "cancelled" || m.status === "disabled") continue;
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
          onNewTravelPlanning={onOpenNewTravelPlanningModal}
        />
        <TopBar
            locale={locale}
            preferredLocale={preferredLocale}
            onPreferredLocaleChange={(next) => {
              setPreferredLocale(next);
              localStorage.setItem(LOCALE_STORAGE_KEY, next);
            }}
            username={username}
            setUsername={setUsername}
            onLogin={onLogin}
            onNewConversation={onNewConversation}
            onNewTravelPlanning={onOpenNewTravelPlanningModal}
            onExportPlan={onExportPlan}
            onEndTask={onEndTask}
            loggedIn={loggedIn}
            cid={cid}
            graphVersion={graph.version}
            busy={busy}
            exportingPlan={exportingPlan}
            exportPlanDisabled={exportPlanDisabled}
        />

        {newTripModalOpen ? (
          <div className="TripBootstrapModal" role="dialog" aria-modal="true">
            <div className="TripBootstrapModal__mask" onClick={() => setNewTripModalOpen(false)} />
            <div className="TripBootstrapModal__panel">
              <div className="TripBootstrapModal__title">
                {tr("新增旅游规划", "Create New Trip Plan")}
              </div>
              <div className="TripBootstrapModal__hint">
                {tr(
                  "先告诉系统这次想去哪里。等首轮 assistant 回复完成后，右侧会静默出现 2-4 条“上次可能还能沿用的思路”，由你决定是否继续沿用。",
                  "Start by saying where you want to go this time. After the first assistant reply, the right panel will quietly show 2-4 past trip patterns that may still fit, and you decide whether to reuse them."
                )}
              </div>
              <label className="TripBootstrapModal__label">
                {tr("这次想去哪里？", "Where do you want to go this time?")}
              </label>
              <input
                className="Input TripBootstrapModal__input"
                value={newTripDestination}
                onChange={(e) => setNewTripDestination(e.target.value)}
                placeholder={tr("例如：京都", "e.g. Kyoto")}
              />
              <label className="TripBootstrapModal__label">
                {tr(
                  "如果你已经知道这次有几条底线必须和上次一样，可以先写在这里（可选）",
                  "If you already know a few things that must stay the same from last time, write them here (optional)"
                )}
              </label>
              <textarea
                className="TripBootstrapModal__textarea"
                value={newTripKeepConsistentText}
                onChange={(e) => setNewTripKeepConsistentText(e.target.value)}
                placeholder={tr(
                  "例如：预算别超过2万、还是想轻松一点、继续优先安全住宿",
                  "e.g. keep budget under 20k, still want a lighter pace, keep safe lodging first"
                )}
              />
              <label className="TripBootstrapModal__check">
                <input
                  type="checkbox"
                  checked={newTripCarryStableProfile}
                  onChange={(e) => setNewTripCarryStableProfile(e.target.checked)}
                />
                <span>
                  {tr(
                    "继续保留长期稳定的个人情况（身体/饮食/语言/安全等）",
                    "Keep long-term personal needs (health/diet/language/safety, etc.)"
                  )}
                </span>
              </label>
              <div className="TripBootstrapModal__hint">
                {tr(
                  "这里不会自动套用旧行程，只会继续保留长期有效的个人限制。",
                  "This will not auto-apply the old itinerary. It only keeps long-term personal constraints."
                )}
              </div>
              {newTripCarryStableProfile && autoCarryHints.length ? (
                <div className="TripBootstrapModal__hint">
                  {tr("将自动带入：", "Auto-carry: ")}
                  {autoCarryHints.join("、")}
                </div>
              ) : null}
              <div className="TripBootstrapModal__actions">
                <button
                  className="Btn"
                  type="button"
                  onClick={() => setNewTripModalOpen(false)}
                  disabled={busy}
                >
                  {tr("取消", "Cancel")}
                </button>
                <button
                  className="Btn Btn--active"
                  type="button"
                  onClick={onCreateNewTravelPlanning}
                  disabled={busy || !newTripDestination.trim()}
                >
                  {tr("创建并开始", "Create & Start")}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <CognitiveSummaryModal
          locale={locale}
          open={summaryModalOpen}
          scenario={pendingTaskEndAction}
          motifs={motifs}
          busy={busy}
          onClose={() => {
            setSummaryModalOpen(false);
            setPendingTaskEndAction(null);
          }}
          onConfirm={onSubmitCognitiveSummary}
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
                    motifTransferState={motifTransferState}
                    modeCReferences={modeCReferences}
                    onRemoveModeCReference={(referenceId) =>
                      setModeCReferences((prev) => prev.filter((x) => x.id !== referenceId))
                    }
                    onFeedbackNotApplicable={(payload) =>
                      onTransferFeedback({
                        signal: "explicit_not_applicable",
                        signalText: payload.text,
                      })
                    }
                    onMotifNotApplicable={(candidateId, motifTypeId) =>
                      onTransferFeedback({
                        signal: "explicit_not_applicable",
                        candidateId,
                        motifTypeId,
                      })
                    }
                    taskActionPrompt={taskActionPrompt}
                    onResumeTask={onResumeTask}
                    onStartNewTask={() => openNewTravelPlanningModalDirect()}
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
                  motifTransferState={motifTransferState}
                  transferRecommendationsEnabled={transferRecommendationsEnabled}
                  transferReviewStage={transferReviewStage}
                  motifLibrary={cognitiveState?.motif_library || []}
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
                  onTransferDecision={onTransferDecision}
                  onTransferBatchDecision={onTransferBatchDecision}
                  onTransferFeedback={onTransferFeedback}
                  onReviseMotifLibrary={onReviseMotifLibrary}
                  onModeCReference={onModeCReference}
                  onModeCConstraint={onModeCConstraint}
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
                onMotifLinksChange={(nextLinks) => {
                  setMotifLinks(nextLinks);
                  setMotifReasoningView(emptyMotifReasoningView);
                  setFlowHasUnsaved(true);
                }}
                onCreateMotifDraft={onCreateMotifDraft}
                onSaveGraph={onSaveGraph}
                savingGraph={savingGraph}
                extraDirty={flowHasUnsaved || conceptsDirty}
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
