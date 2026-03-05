import React, { useMemo, useState } from "react";
import type {
    AppLocale,
    CognitiveState,
    ConceptItem,
    ConceptMotif,
    ContextItem,
    EdgeType,
    MotifCausalOperator,
    MotifLifecycleStatus,
    MotifTransferState,
} from "../core/type";

function clamp01(v: any, fallback = 0.7) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(1, n));
}

function cleanText(input: any, max = 120) {
    return String(input ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max);
}

function tr(locale: AppLocale, zh: string, en: string) {
    return locale === "en-US" ? en : zh;
}

function uniq(arr: string[], max = 24): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of arr || []) {
        const x = cleanText(item, 96);
        if (!x || seen.has(x)) continue;
        seen.add(x);
        out.push(x);
        if (out.length >= max) break;
    }
    return out;
}

function kindLabel(locale: AppLocale, kind: ConceptItem["kind"]) {
    if (kind === "constraint") return tr(locale, "约束", "Constraint");
    if (kind === "preference") return tr(locale, "偏好", "Preference");
    if (kind === "belief") return tr(locale, "信念", "Belief");
    return tr(locale, "事实陈述", "Factual assertion");
}

function motifStatusLabel(locale: AppLocale, status: ConceptMotif["status"]) {
    if (status === "active") return tr(locale, "active", "active");
    if (status === "uncertain") return tr(locale, "uncertain", "uncertain");
    if (status === "deprecated") return tr(locale, "deprecated", "deprecated");
    if (status === "disabled") return tr(locale, "cancelled", "cancelled");
    return tr(locale, "cancelled", "cancelled");
}

function motifStatusIcon(status: ConceptMotif["status"]) {
    if (status === "active") return "✅";
    if (status === "uncertain") return "⚠";
    if (status === "deprecated") return "❌";
    if (status === "disabled") return "•";
    return "•";
}

function sourceRefToken(source: string) {
    const s = cleanText(source, 64);
    if (!s || s === "latest_user" || s === "latest_assistant") return "";
    const m = s.match(/(\d{1,4})/);
    if (m?.[1]) return `#${m[1]}`;
    return s.slice(0, 18);
}

function motifPattern(
    motif: ConceptMotif,
    conceptNoById: Map<string, number>
) {
    const ids = Array.isArray(motif.conceptIds) ? motif.conceptIds : [];
    if (!ids.length) return "concept_a -> concept_b";
    const anchor = cleanText(motif.anchorConceptId, 96);
    const sources = ids.filter((id) => id !== anchor);
    const target = ids.find((id) => id === anchor) || ids[ids.length - 1];
    if (!sources.length) return "concept_a -> concept_b";
    const ref = (id: string) => {
        const no = conceptNoById.get(id);
        return no ? `C${no}` : cleanText(id, 16);
    };
    return `${sources.map(ref).join(" + ")} -> ${ref(target)}`;
}

function dependencyLabel(locale: AppLocale, relation: ConceptMotif["relation"]) {
    if (relation === "enable") return tr(locale, "Enable（直接/中介因果）", "Enable (Direct/Mediated)");
    if (relation === "constraint") return tr(locale, "Constraint（混杂）", "Constraint (Confounding)");
    if (relation === "determine") return tr(locale, "Determine（干预）", "Determine (Intervention)");
    return tr(locale, "Conflict（矛盾）", "Conflict (Contradiction)");
}

function causalOperatorLabel(locale: AppLocale, op?: ConceptMotif["causalOperator"]) {
    if (op === "direct_causation") return tr(locale, "直接因果", "Direct causation");
    if (op === "mediated_causation") return tr(locale, "中介因果", "Mediated causation");
    if (op === "confounding") return tr(locale, "混杂", "Confounding");
    if (op === "intervention") return tr(locale, "干预（do-operator）", "Intervention (do-operator)");
    if (op === "contradiction") return tr(locale, "矛盾", "Contradiction");
    return tr(locale, "未指定", "Unspecified");
}

type TabKey = "concept" | "motif";
type MotifLibraryEntry = CognitiveState["motif_library"][number];
type MotifEditDraft = {
    title: string;
    description: string;
    status: MotifLifecycleStatus;
    sourceConceptIds: string[];
    targetConceptId: string;
    causalOperator: MotifCausalOperator;
};

const USER_MOTIF_STATUS_OPTIONS: MotifLifecycleStatus[] = ["active", "cancelled"];
const CAUSAL_OPERATOR_OPTIONS: MotifCausalOperator[] = [
    "direct_causation",
    "mediated_causation",
    "confounding",
    "intervention",
    "contradiction",
];

function motifPatternFromIds(sourceIds: string[], targetId: string, conceptNoById: Map<string, number>) {
    if (!sourceIds.length || !targetId) return "concept_a -> concept_b";
    const ref = (id: string) => {
        const no = conceptNoById.get(id);
        return no ? `C${no}` : cleanText(id, 16);
    };
    return `${sourceIds.map(ref).join(" + ")} -> ${ref(targetId)}`;
}

function relationFromCausalOperator(op: MotifCausalOperator): EdgeType {
    if (op === "confounding") return "constraint";
    if (op === "intervention") return "determine";
    if (op === "contradiction") return "conflicts_with";
    return "enable";
}

function semanticMotifTypeFromRelation(relation: EdgeType): ConceptMotif["motif_type"] {
    if (relation === "constraint") return "constraint";
    if (relation === "determine") return "determine";
    return "enable";
}

function defaultCausalOperator(m: ConceptMotif): MotifCausalOperator {
    const dep = m.dependencyClass || m.relation;
    if (dep === "constraint") return "confounding";
    if (dep === "determine") return "intervention";
    if (dep === "conflicts_with") return "contradiction";
    return m.motifType === "triad" ? "mediated_causation" : "direct_causation";
}

export function ConceptPanel(props: {
    locale: AppLocale;
    concepts: ConceptItem[];
    motifs: ConceptMotif[];
    motifTransferState?: MotifTransferState | null;
    motifLibrary?: MotifLibraryEntry[];
    contexts?: ContextItem[];
    activeConceptId?: string;
    activeMotifId?: string;
    saving?: boolean;
    onSelect: (conceptId: string) => void;
    onSelectMotif: (motifId: string) => void;
    onClearSelect: () => void;
    onClearMotifSelect: () => void;
    onEditConceptNode?: (conceptId: string) => void;
    onPatchConcept: (conceptId: string, patch: Partial<ConceptItem>) => void;
    onPatchMotif: (motifId: string, patch: Partial<ConceptMotif>) => void;
    onTransferDecision?: (params: {
        candidateId: string;
        action: "adopt" | "modify" | "ignore";
        revisedText?: string;
        note?: string;
        modeOverride?: "A" | "B" | "C";
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
    }) => void;
    onTransferFeedback?: (params: {
        signal: "thumbs_down" | "retry" | "manual_override" | "explicit_not_applicable";
        signalText?: string;
        candidateId?: string;
        motifTypeId?: string;
    }) => void;
    onReviseMotifLibrary?: (params: {
        motifTypeId: string;
        choice: "overwrite" | "new_version";
        requestId?: string;
    }) => void;
    onModeCReference?: (params: {
        motifTypeId: string;
        motifTypeTitle: string;
        reusableDescription: string;
        dependency: string;
        sourceTaskId?: string;
        sourceConversationId?: string;
        status: "active" | "uncertain" | "deprecated" | "cancelled";
        matchScore: number;
    }) => void;
    onModeCConstraint?: (params: {
        motifTypeId: string;
        motifTypeTitle: string;
        reusableDescription: string;
        dependency: string;
        sourceTaskId?: string;
        sourceConversationId?: string;
        status: "active" | "uncertain" | "deprecated" | "cancelled";
        matchScore: number;
    }) => void;
}) {
    const {
        locale,
        concepts,
        motifs,
        motifTransferState,
        motifLibrary,
        contexts,
        activeConceptId,
        activeMotifId,
        saving,
        onSelect,
        onSelectMotif,
        onClearSelect,
        onClearMotifSelect,
        onEditConceptNode,
        onPatchConcept,
        onPatchMotif,
        onTransferDecision,
        onTransferFeedback,
        onReviseMotifLibrary,
        onModeCReference,
        onModeCConstraint,
    } = props;
    const [tab, setTab] = useState<TabKey>("concept");
    const [editingMotifId, setEditingMotifId] = useState("");
    const [editingMotifDraft, setEditingMotifDraft] = useState<MotifEditDraft | null>(null);
    const [editingCandidateId, setEditingCandidateId] = useState("");
    const [editingCandidateText, setEditingCandidateText] = useState("");

    const conceptById = useMemo(() => new Map((concepts || []).map((c) => [c.id, c])), [concepts]);
    const conceptNoById = useMemo(() => {
        const m = new Map<string, number>();
        (concepts || []).forEach((c, idx) => m.set(c.id, idx + 1));
        return m;
    }, [concepts]);
    const selectedConcept = useMemo(
        () => (activeConceptId ? concepts.find((c) => c.id === activeConceptId) || null : null),
        [activeConceptId, concepts]
    );

    const motifList = useMemo(
        () =>
            (motifs || [])
                .slice()
                .sort((a, b) => {
                    const rank = (s: ConceptMotif["status"]) =>
                        s === "deprecated" ? 5 : s === "uncertain" ? 4 : s === "active" ? 3 : s === "cancelled" ? 2 : 1;
                    return rank(b.status) - rank(a.status) || b.confidence - a.confidence || a.id.localeCompare(b.id);
                }),
        [motifs]
    );

    const selectedMotif = useMemo(
        () => (activeMotifId ? motifList.find((m) => m.id === activeMotifId) || null : null),
        [activeMotifId, motifList]
    );

    const contextTitlesByMotifId = useMemo(() => {
        const out = new Map<string, string[]>();
        for (const ctx of contexts || []) {
            const label = cleanText(ctx?.title, 72) || cleanText(ctx?.summary, 96) || cleanText(ctx?.key, 72);
            if (!label) continue;
            for (const rawMotifId of ctx?.motifIds || []) {
                const motifId = cleanText(rawMotifId, 120);
                if (!motifId) continue;
                if (!out.has(motifId)) out.set(motifId, []);
                const arr = out.get(motifId)!;
                if (!arr.includes(label)) arr.push(label);
            }
        }
        return out;
    }, [contexts]);

    const transferRecommendations = useMemo(
        () =>
            (motifTransferState?.recommendations || [])
                .slice()
                .sort((a, b) => {
                    const pa = a.decision_status === "pending" ? 1 : 0;
                    const pb = b.decision_status === "pending" ? 1 : 0;
                    return pb - pa || b.match_score - a.match_score || a.candidate_id.localeCompare(b.candidate_id);
                }),
        [motifTransferState]
    );
    const pendingRecommendations = transferRecommendations.filter((x) => x.decision_status === "pending");
    const handledRecommendations = transferRecommendations.filter((x) => x.decision_status !== "pending");
    const pendingRevisionRequests = useMemo(
        () => (motifTransferState?.revisionRequests || []).filter((x) => x.status === "pending_user_choice"),
        [motifTransferState]
    );
    const injectedCandidateSet = useMemo(
        () =>
            new Set(
                (motifTransferState?.activeInjections || [])
                    .filter((x) => x.injection_state === "injected")
                    .map((x) => cleanText(x.candidate_id, 220))
            ),
        [motifTransferState]
    );
    const modeCLibraryEntries = useMemo(
        () =>
            (motifLibrary || [])
                .map((entry) => {
                    const versions = Array.isArray(entry?.versions) ? entry.versions : [];
                    const current =
                        versions.find((v) => cleanText(v?.version_id, 180) === cleanText(entry?.current_version_id, 180)) ||
                        versions[versions.length - 1];
                    const description = cleanText(
                        current?.reusable_description || entry?.reusable_description || current?.title || entry?.motif_type_title,
                        240
                    );
                    const matchScore = clamp01(entry?.usage_stats?.transfer_confidence, 0.68);
                    return {
                        motifTypeId: cleanText(entry?.motif_type_id, 180),
                        motifTypeTitle: cleanText(entry?.motif_type_title, 180) || cleanText(current?.title, 180),
                        dependency: cleanText(current?.dependency || entry?.dependency, 40) || "enable",
                        reusableDescription: description,
                        sourceTaskId: cleanText(current?.source_task_id, 80) || undefined,
                        sourceConversationId: cleanText(current?.source_conversation_id, 80) || undefined,
                        status:
                            entry?.status === "active" ||
                            entry?.status === "deprecated" ||
                            entry?.status === "cancelled" ||
                            entry?.status === "uncertain"
                                ? entry.status
                                : "uncertain",
                        matchScore,
                    };
                })
                .filter((entry) => entry.motifTypeId && entry.motifTypeTitle && entry.reusableDescription)
                .sort((a, b) => b.matchScore - a.matchScore || a.motifTypeTitle.localeCompare(b.motifTypeTitle))
                .slice(0, 8),
        [motifLibrary]
    );

    const conceptSelectOptions = useMemo(
        () =>
            (concepts || []).map((c) => ({
                id: c.id,
                label: `${conceptNoById.get(c.id) ? `C${conceptNoById.get(c.id)}` : cleanText(c.id, 14)} · ${cleanText(c.title, 56)}`,
            })),
        [concepts, conceptNoById]
    );

    const resetMotifEditor = () => {
        setEditingMotifId("");
        setEditingMotifDraft(null);
    };

    const startMotifEdit = (m: ConceptMotif) => {
        const ids = uniq((m.conceptIds || []).map((id) => cleanText(id, 100)), 8);
        let targetId = cleanText(m.anchorConceptId, 100) || ids[ids.length - 1] || "";
        if (!targetId || !conceptById.has(targetId)) {
            targetId = ids.find((id) => conceptById.has(id)) || concepts[0]?.id || "";
        }
        let sourceIds = ids.filter((id) => id && id !== targetId);
        if (!sourceIds.length) {
            const fallback = concepts.find((c) => c.id !== targetId)?.id || "";
            if (fallback) sourceIds = [fallback];
        }
        if (!sourceIds.length && targetId) {
            sourceIds = [targetId];
        }

        setEditingMotifId(m.id);
        setEditingMotifDraft({
            title: m.title,
            description: m.description || "",
            status: m.status === "cancelled" || m.status === "disabled" ? "cancelled" : "active",
            sourceConceptIds: sourceIds,
            targetConceptId: targetId,
            causalOperator: m.causalOperator || defaultCausalOperator(m),
        });
    };

    const pickUnusedConceptId = (exclude: string[]) => {
        const used = new Set(exclude.filter(Boolean));
        return concepts.find((c) => !used.has(c.id))?.id || "";
    };

    return (
        <div className="Panel ConceptPanel">
            <div className="PanelHeader ConceptPanel__header">
                <div className="ConceptPanel__title">Concept · Motif</div>
                {saving ? <span className="FlowStatusTag">{tr(locale, "保存中", "Saving")}</span> : null}
            </div>

            <div className="ConceptPanel__tabs ConceptPanel__tabs--compact" role="tablist" aria-label="concept motif tabs">
                <button
                    type="button"
                    className={`ConceptPanel__tab ConceptPanel__tab--large ${tab === "concept" ? "is-active" : ""}`}
                    onClick={() => setTab("concept")}
                >
                    Concept ({concepts.length})
                </button>
                <button
                    type="button"
                    className={`ConceptPanel__tab ConceptPanel__tab--large ${tab === "motif" ? "is-active" : ""}`}
                    onClick={() => setTab("motif")}
                >
                    Motif ({motifList.length})
                </button>
            </div>

            <div className="ConceptPanel__list">
                {tab === "concept" && !concepts.length ? (
                    <div className="ConceptPanel__empty">
                        {tr(locale, "当前还没有可用 concept，继续对话后会自动生成。", "No concepts yet. Continue chatting to generate them.")}
                    </div>
                ) : null}

                {tab === "concept"
                    ? concepts.map((c) => {
                        const active = c.id === activeConceptId;
                        const cNo = conceptNoById.get(c.id);
                        const scorePct = Math.round(clamp01(c.score, 0.72) * 100);
                        const nodeCount = Array.isArray(c.nodeIds) ? c.nodeIds.length : 0;
                        const motifCount = Array.isArray(c.motifIds) ? c.motifIds.length : 0;
                        return (
                            <div
                                key={c.id}
                                className={`ConceptCard ${active ? "is-selected" : ""} ${c.paused ? "is-paused" : ""}`}
                                onClick={() => {
                                    onSelect(c.id);
                                    onClearMotifSelect();
                                }}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        onSelect(c.id);
                                        onClearMotifSelect();
                                    }
                                }}
                            >
                                <div className="ConceptCard__head">
                                    <div className="ConceptCard__titleWrap">
                                        <div className="ConceptCard__title">{c.title}</div>
                                        <div className="ConceptCard__kind">{kindLabel(locale, c.kind)}</div>
                                    </div>
                                    <div className="ConceptCard__actions">
                                        <button
                                            type="button"
                                            className="ConceptCard__iconBtn"
                                            title={c.locked
                                                ? tr(locale, "解锁 Concept（允许关联节点自动更新）", "Unlock concept (allow auto updates)")
                                                : tr(locale, "锁定 Concept（保护关联节点）", "Lock concept (protect linked nodes)")}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onPatchConcept(c.id, { locked: !c.locked, updatedAt: new Date().toISOString() });
                                            }}
                                        >
                                            {c.locked ? "🔓" : "🔒"}
                                        </button>
                                        <button
                                            type="button"
                                            className="ConceptCard__iconBtn"
                                            title={c.paused
                                                ? tr(locale, "启用 Concept（恢复关联节点）", "Enable concept (restore linked nodes)")
                                                : tr(locale, "暂停 Concept（临时停用并置灰关联节点）", "Pause concept (temporarily mute linked nodes)")}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onPatchConcept(c.id, { paused: !c.paused, updatedAt: new Date().toISOString() });
                                            }}
                                        >
                                            {c.paused ? "▶" : "⏸"}
                                        </button>
                                        <button
                                            type="button"
                                            className="ConceptCard__iconBtn"
                                            title={tr(locale, "编辑对应节点（与右侧节点编辑逻辑一致）", "Edit linked node (same logic as right editor)")}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onSelect(c.id);
                                                onClearMotifSelect();
                                                onEditConceptNode?.(c.id);
                                            }}
                                        >
                                            ✍️
                                        </button>
                                    </div>
                                </div>

                                <div className="ConceptCard__desc">{c.description || tr(locale, "暂无描述", "No description")}</div>
                                <div className="ConceptCard__metaId">
                                    {tr(locale, "编号", "Code")}: <code>{cNo ? `C${cNo}` : c.id}</code>
                                </div>
                                <div className="ConceptCard__foot">
                                    <span>{scorePct}%</span>
                                    <span>
                                        {nodeCount}
                                        {tr(locale, " 个节点", " node")}
                                        {" · "}
                                        {motifCount}
                                        {tr(locale, " 个motif", " motif")}
                                    </span>
                                </div>
                            </div>
                        );
                    })
                    : null}

                {tab === "motif" && !motifList.length ? (
                    <div className="ConceptPanel__empty">{tr(locale, "当前还没有可用 motif。", "No motifs yet.")}</div>
                ) : null}

                {tab === "motif" && transferRecommendations.length ? (
                    <div className="TransferSuggestions">
                        <div className="TransferSuggestions__title">
                            {tr(locale, "来自上次任务的建议", "Suggested from previous tasks")}
                        </div>
                        {pendingRecommendations.slice(0, 4).map((rec) => {
                            const score = Math.round(Math.max(0, Math.min(1, Number(rec.match_score || 0))) * 100);
                            const isEditing = editingCandidateId === rec.candidate_id;
                            const isInjected = injectedCandidateSet.has(cleanText(rec.candidate_id, 220));
                            return (
                                <div key={rec.candidate_id} className="TransferSuggestions__item">
                                    <div className="TransferSuggestions__head">
                                        <span className="TransferSuggestions__badge">📚 {tr(locale, "已有", "Library")}</span>
                                        <span className="TransferSuggestions__name">{rec.motif_type_title}</span>
                                        <span className="TransferSuggestions__meta">{score}% · {rec.recommended_mode}</span>
                                    </div>
                                    <div className="TransferSuggestions__desc">{rec.reusable_description || rec.reason}</div>
                                    {isInjected ? (
                                        <div className="TransferSuggestions__status">{tr(locale, "已注入", "Injected")}</div>
                                    ) : null}
                                    {!isEditing ? (
                                        <div className="TransferSuggestions__actions">
                                            <button
                                                type="button"
                                                className="Btn FlowToolbar__btn"
                                                onClick={() =>
                                                    onTransferDecision?.({
                                                        candidateId: rec.candidate_id,
                                                        action: "adopt",
                                                    })
                                                }
                                            >
                                                {tr(locale, "直接采用", "Adopt")}
                                            </button>
                                            <button
                                                type="button"
                                                className="Btn FlowToolbar__btn"
                                                onClick={() => {
                                                    setEditingCandidateId(rec.candidate_id);
                                                    setEditingCandidateText(rec.reusable_description || rec.motif_type_title);
                                                }}
                                            >
                                                {tr(locale, "修改后采用", "Modify + Adopt")}
                                            </button>
                                            <button
                                                type="button"
                                                className="Btn FlowToolbar__btn"
                                                onClick={() =>
                                                    onTransferDecision?.({
                                                        candidateId: rec.candidate_id,
                                                        action: "ignore",
                                                    })
                                                }
                                            >
                                                {tr(locale, "不适用", "Ignore")}
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="TransferSuggestions__edit">
                                            <textarea
                                                className="FlowInspector__editor"
                                                value={editingCandidateText}
                                                onChange={(e) => setEditingCandidateText(e.target.value)}
                                            />
                                            <div className="TransferSuggestions__actions">
                                                <button
                                                    type="button"
                                                    className="Btn FlowToolbar__btn"
                                                    onClick={() => {
                                                        setEditingCandidateId("");
                                                        setEditingCandidateText("");
                                                    }}
                                                >
                                                    {tr(locale, "取消", "Cancel")}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="Btn FlowToolbar__btn"
                                                    onClick={() => {
                                                        onTransferDecision?.({
                                                            candidateId: rec.candidate_id,
                                                            action: "modify",
                                                            revisedText: editingCandidateText,
                                                        });
                                                        setEditingCandidateId("");
                                                        setEditingCandidateText("");
                                                    }}
                                                >
                                                    {tr(locale, "保存并采用", "Save + Adopt")}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {handledRecommendations.length ? (
                            <details className="TransferSuggestions__handled">
                                <summary>{tr(locale, "已处理建议", "Handled suggestions")}</summary>
                                <div className="TransferSuggestions__handledList">
                                    {handledRecommendations.map((rec) => (
                                        <div key={`${rec.candidate_id}_handled`} className="TransferSuggestions__handledItem">
                                            <span>{rec.motif_type_title}</span>
                                            <span>{rec.decision_status}</span>
                                            {rec.decision_status !== "ignored" ? (
                                                <button
                                                    type="button"
                                                    className="Btn FlowToolbar__btn"
                                                    onClick={() =>
                                                        onTransferFeedback?.({
                                                            signal: "explicit_not_applicable",
                                                            candidateId: rec.candidate_id,
                                                            motifTypeId: rec.motif_type_id,
                                                        })
                                                    }
                                                >
                                                    {tr(locale, "这条不适用", "Not applicable")}
                                                </button>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            </details>
                        ) : null}
                        {pendingRevisionRequests.length ? (
                            <div className="TransferSuggestions__revision">
                                <div className="TransferSuggestions__title">
                                    {tr(locale, "信念修订协商", "Belief Revision Negotiation")}
                                </div>
                                {pendingRevisionRequests.map((req) => (
                                    <div key={req.request_id} className="TransferSuggestions__revisionItem">
                                        <div>{req.detected_text || req.reason}</div>
                                        <div className="TransferSuggestions__actions">
                                            <button
                                                type="button"
                                                className="Btn FlowToolbar__btn"
                                                onClick={() =>
                                                    onReviseMotifLibrary?.({
                                                        motifTypeId: req.motif_type_id,
                                                        requestId: req.request_id,
                                                        choice: "overwrite",
                                                    })
                                                }
                                            >
                                                {tr(locale, "覆盖原规则", "Overwrite")}
                                            </button>
                                            <button
                                                type="button"
                                                className="Btn FlowToolbar__btn"
                                                onClick={() =>
                                                    onReviseMotifLibrary?.({
                                                        motifTypeId: req.motif_type_id,
                                                        requestId: req.request_id,
                                                        choice: "new_version",
                                                    })
                                                }
                                            >
                                                {tr(locale, "新建版本", "New Version")}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : null}
                    </div>
                ) : null}

                {tab === "motif" && modeCLibraryEntries.length ? (
                    <div className="ModeCPanel">
                        <div className="ModeCPanel__title">
                            {tr(locale, "Mode C · 手动参考库", "Mode C · Manual Reference Library")}
                        </div>
                        <div className="ModeCPanel__hint">
                            {tr(
                                locale,
                                "用户主导选择：作为参考（不自动注入）或作为约束（注入为 C 模式）。",
                                "User-driven selection: use as reference (no auto-injection) or as constraint (inject in mode C)."
                            )}
                        </div>
                        <div className="ModeCPanel__list">
                            {modeCLibraryEntries.map((entry) => {
                                const scorePct = Math.round(entry.matchScore * 100);
                                return (
                                    <div key={`modec_${entry.motifTypeId}`} className="ModeCPanel__item">
                                        <div className="ModeCPanel__head">
                                            <span className="ModeCPanel__badge">📚 {tr(locale, "已有", "Library")}</span>
                                            <span className="ModeCPanel__name">{entry.motifTypeTitle}</span>
                                            <span className="ModeCPanel__meta">{scorePct}% · Mode C</span>
                                        </div>
                                        <div className="ModeCPanel__desc">{entry.reusableDescription}</div>
                                        <div className="ModeCPanel__actions">
                                            <button
                                                type="button"
                                                className="Btn FlowToolbar__btn"
                                                onClick={() =>
                                                    onModeCReference?.({
                                                        motifTypeId: entry.motifTypeId,
                                                        motifTypeTitle: entry.motifTypeTitle,
                                                        reusableDescription: entry.reusableDescription,
                                                        dependency: entry.dependency,
                                                        sourceTaskId: entry.sourceTaskId,
                                                        sourceConversationId: entry.sourceConversationId,
                                                        status: entry.status,
                                                        matchScore: entry.matchScore,
                                                    })
                                                }
                                            >
                                                {tr(locale, "作为参考", "Use as Reference")}
                                            </button>
                                            <button
                                                type="button"
                                                className="Btn FlowToolbar__btn"
                                                onClick={() =>
                                                    onModeCConstraint?.({
                                                        motifTypeId: entry.motifTypeId,
                                                        motifTypeTitle: entry.motifTypeTitle,
                                                        reusableDescription: entry.reusableDescription,
                                                        dependency: entry.dependency,
                                                        sourceTaskId: entry.sourceTaskId,
                                                        sourceConversationId: entry.sourceConversationId,
                                                        status: entry.status,
                                                        matchScore: entry.matchScore,
                                                    })
                                                }
                                            >
                                                {tr(locale, "作为约束", "Use as Constraint")}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : null}

                {tab === "motif"
                    ? motifList.map((m, motifIdx) => {
                        const active = m.id === activeMotifId;
                        const isUpdatedThisTurn = m.novelty === "new" || m.novelty === "updated";
                        const confidencePct = Math.round(clamp01(m.confidence, 0.72) * 100);
                        const barsOn = Math.max(1, Math.round((confidencePct / 100) * 4));
                        const conceptRefs = (m.conceptIds || []).map((id) => ({
                            id,
                            no: conceptNoById.get(id),
                            code: conceptNoById.get(id) ? `C${conceptNoById.get(id)}` : cleanText(id, 16),
                        }));
                        const refs = uniq(
                            (m.conceptIds || []).flatMap((id) =>
                                (conceptById.get(id)?.sourceMsgIds || []).map(sourceRefToken).filter(Boolean)
                            ),
                            6
                        );
                        const pattern = motifPattern(m, conceptNoById);
                        const causalFormula = pattern;
                        const isEditing = editingMotifId === m.id;
                        const draft = isEditing ? editingMotifDraft : null;
                        const contextLabels = contextTitlesByMotifId.get(m.id) || [];
                        const changeSource =
                            cleanText((m as any).change_source, 24) ||
                            (m.novelty === "new" || m.novelty === "updated" ? m.novelty : "");
                        const contextLabel = contextLabels.length
                            ? contextLabels.join(" / ")
                            : tr(locale, "当前无关联 Context", "No linked context");
                        const draftPattern = draft
                            ? motifPatternFromIds(
                                uniq(
                                    (draft.sourceConceptIds || [])
                                        .map((id) => cleanText(id, 100))
                                        .filter((id) => id && id !== cleanText(draft.targetConceptId, 100)),
                                    7
                                ),
                                cleanText(draft.targetConceptId, 100),
                                conceptNoById
                            )
                            : pattern;
                        return (
                            <div
                                key={m.id}
                                className={`ConceptCard ConceptCard--motifLite status-${m.status} ${
                                    active ? "is-selected" : ""
                                } ${isUpdatedThisTurn ? "is-updated" : ""} ${isEditing ? "is-editing" : ""}`}
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                    onSelectMotif(m.id);
                                    onClearSelect();
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        onSelectMotif(m.id);
                                        onClearSelect();
                                    }
                                }}
                            >
                                <div className="MotifCard__head">
                                    <span className="MotifCard__status">{motifStatusIcon(m.status)}</span>
                                    <div className="MotifCard__titleWrap">
                                        <div className="ConceptCard__title">{m.title}</div>
                                        <div className="ConceptCard__kind">
                                            <span className={`MotifStatusBadge status-${m.status}`}>{motifStatusLabel(locale, m.status)}</span>
                                            {changeSource ? (
                                                <span className={`MotifStatusBadge status-change-${changeSource}`}>
                                                    {changeSource}
                                                </span>
                                            ) : null}
                                        </div>
                                    </div>
                                    <div className="ConceptCard__actions">
                                        <button
                                            type="button"
                                            className="ConceptCard__iconBtn"
                                            title={m.resolved
                                                ? tr(locale, "解除锁定（允许系统继续重算该 motif）", "Unlock motif (allow recalculation)")
                                                : tr(locale, "锁定 motif（保持当前状态）", "Lock motif (keep current state)")}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onPatchMotif(m.id, {
                                                    resolved: !m.resolved,
                                                    resolvedBy: !m.resolved ? "user" : undefined,
                                                    resolvedAt: !m.resolved ? new Date().toISOString() : undefined,
                                                    statusReason: !m.resolved ? "user_locked" : "user_unlocked",
                                                    novelty: "updated",
                                                    updatedAt: new Date().toISOString(),
                                                });
                                            }}
                                        >
                                            {m.resolved ? "🔓" : "🔒"}
                                        </button>
                                        <button
                                            type="button"
                                            className="ConceptCard__iconBtn"
                                            title={m.status === "cancelled" || m.status === "disabled"
                                                ? tr(locale, "启用 motif（恢复参与推理）", "Enable motif (resume reasoning)")
                                                : tr(locale, "取消 motif（本轮不参与推理）", "Cancel motif (exclude from current reasoning)")}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const disabling = m.status !== "cancelled" && m.status !== "disabled";
                                                onPatchMotif(m.id, {
                                                    status: disabling ? "cancelled" : "active",
                                                    statusReason: disabling ? "user_cancelled" : "user_reenabled",
                                                    resolved: true,
                                                    resolvedBy: "user",
                                                    resolvedAt: new Date().toISOString(),
                                                    novelty: "updated",
                                                    updatedAt: new Date().toISOString(),
                                                });
                                            }}
                                        >
                                            {m.status === "cancelled" || m.status === "disabled" ? "▶" : "⏸"}
                                        </button>
                                        <button
                                            type="button"
                                            className="ConceptCard__iconBtn"
                                            title={tr(locale, "编辑 motif（标题/状态/结构）", "Edit motif (title/status/structure)")}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                startMotifEdit(m);
                                            }}
                                        >
                                            ✍️
                                        </button>
                                    </div>
                                </div>

                                {!isEditing ? (
                                    <>
                                        <div className="ConceptCard__desc">{m.description || tr(locale, "暂无说明", "No description")}</div>
                                        <div className="MotifCard__pattern">
                                            {dependencyLabel(locale, m.dependencyClass || m.relation)} · {causalOperatorLabel(locale, m.causalOperator)}
                                        </div>
                                        <div className="MotifCard__pattern">{causalFormula}</div>
                                        <div className="MotifCard__concepts">
                                            {conceptRefs.slice(0, 4).map((ref) => (
                                                <span key={`${m.id}_c_${ref.id}`} className="MotifCard__conceptTag">
                                                    {ref.code}
                                                </span>
                                            ))}
                                            {conceptRefs.length > 4 ? (
                                                <span className="MotifCard__conceptTag">+{conceptRefs.length - 4}</span>
                                            ) : null}
                                        </div>
                                        <div className="MotifCard__progress">
                                            {[0, 1, 2, 3].map((i) => (
                                                <span key={`${m.id}_p_${i}`} className={`MotifCard__bar ${i < barsOn ? "is-on" : ""}`} />
                                            ))}
                                        </div>
                                        <div className="ConceptCard__foot">
                                            <span>{refs.length ? refs.join(" ") : tr(locale, "来源: n/a", "source: n/a")}</span>
                                            <span>{confidencePct}%</span>
                                        </div>
                                    </>
                                ) : null}

                                {isEditing && draft ? (
                                    <div
                                        className="ConceptEditor ConceptPanel__editorInline"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <div className="ConceptEditor__title">{tr(locale, "编辑 Motif 实例", "Edit Motif Instance")}</div>
                                        <label className="FlowInspector__fieldLabel">
                                            {tr(locale, "标题", "Title")}
                                            <input
                                                className="FlowInspector__input"
                                                value={draft.title}
                                                onChange={(e) =>
                                                    setEditingMotifDraft((prev) => (prev ? { ...prev, title: e.target.value } : prev))
                                                }
                                            />
                                        </label>
                                        <label className="FlowInspector__fieldLabel">
                                            {tr(locale, "描述", "Description")}
                                            <textarea
                                                className="FlowInspector__editor"
                                                value={draft.description}
                                                onChange={(e) =>
                                                    setEditingMotifDraft((prev) => (prev ? { ...prev, description: e.target.value } : prev))
                                                }
                                            />
                                        </label>
                                        <label className="FlowInspector__fieldLabel">
                                            {tr(locale, "状态（用户可控）", "Status (user-controlled)")}
                                            <select
                                                className="FlowInspector__select"
                                                value={draft.status}
                                                onChange={(e) =>
                                                    setEditingMotifDraft((prev) =>
                                                        prev ? { ...prev, status: e.target.value as MotifLifecycleStatus } : prev
                                                    )
                                                }
                                            >
                                                {USER_MOTIF_STATUS_OPTIONS.map((status) => (
                                                    <option key={`${m.id}_status_${status}`} value={status}>
                                                        {motifStatusLabel(locale, status)}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                        <div className="MotifEditor__sectionTitle">
                                            {tr(locale, "Structure（概念依赖结构）", "Structure (concept dependency)")}
                                        </div>
                                        <div className="MotifEditor__sectionTitle">{`Motif ${motifIdx + 1} (${draftPattern})`}</div>
                                        <div className="MotifCard__pattern">
                                            {tr(locale, "Pattern：", "Pattern: ")}
                                            {draftPattern}
                                        </div>
                                        {(draft.sourceConceptIds || []).map((sourceId, idx) => (
                                            <div key={`${m.id}_src_${idx}`} className="MotifEditor__conceptRow">
                                                <label className="FlowInspector__fieldLabel">
                                                    {`Concept ${idx + 1}`}
                                                    <select
                                                        className="FlowInspector__select"
                                                        value={sourceId}
                                                        onChange={(e) =>
                                                            setEditingMotifDraft((prev) => {
                                                                if (!prev) return prev;
                                                                const nextSources = prev.sourceConceptIds.slice();
                                                                nextSources[idx] = e.target.value;
                                                                return { ...prev, sourceConceptIds: nextSources };
                                                            })
                                                        }
                                                    >
                                                        <option value="">{tr(locale, "请选择 concept", "Select concept")}</option>
                                                        {conceptSelectOptions.map((opt) => (
                                                            <option key={`${m.id}_srcopt_${idx}_${opt.id}`} value={opt.id}>
                                                                {opt.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>
                                                <button
                                                    type="button"
                                                    className="Btn FlowToolbar__btn"
                                                    disabled={(draft.sourceConceptIds || []).length <= 1}
                                                    onClick={() =>
                                                        setEditingMotifDraft((prev) => {
                                                            if (!prev) return prev;
                                                            if ((prev.sourceConceptIds || []).length <= 1) return prev;
                                                            const nextSources = prev.sourceConceptIds.slice();
                                                            nextSources.splice(idx, 1);
                                                            return { ...prev, sourceConceptIds: nextSources };
                                                        })
                                                    }
                                                >
                                                    {tr(locale, "移除", "Remove")}
                                                </button>
                                            </div>
                                        ))}
                                        <button
                                            type="button"
                                            className="Btn FlowToolbar__btn"
                                            onClick={() =>
                                                setEditingMotifDraft((prev) => {
                                                    if (!prev) return prev;
                                                    const nextSource = pickUnusedConceptId([
                                                        ...prev.sourceConceptIds,
                                                        prev.targetConceptId,
                                                    ]);
                                                    return {
                                                        ...prev,
                                                        sourceConceptIds: [...prev.sourceConceptIds, nextSource],
                                                    };
                                                })
                                            }
                                        >
                                            {tr(locale, "+ 添加 Concept（前置）", "+ Add source concept")}
                                        </button>
                                        <label className="FlowInspector__fieldLabel">
                                            {`Concept ${(draft.sourceConceptIds || []).length + 1} ${tr(locale, "（目标）", "(target)")}`}
                                            <select
                                                className="FlowInspector__select"
                                                value={draft.targetConceptId}
                                                onChange={(e) =>
                                                    setEditingMotifDraft((prev) =>
                                                        prev ? { ...prev, targetConceptId: e.target.value } : prev
                                                    )
                                                }
                                            >
                                                <option value="">{tr(locale, "请选择 concept", "Select concept")}</option>
                                                {conceptSelectOptions.map((opt) => (
                                                    <option key={`${m.id}_target_${opt.id}`} value={opt.id}>
                                                        {opt.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                        <label className="FlowInspector__fieldLabel">
                                            {tr(locale, "Causal Type", "Causal Type")}
                                            <select
                                                className="FlowInspector__select"
                                                value={draft.causalOperator}
                                                onChange={(e) =>
                                                    setEditingMotifDraft((prev) =>
                                                        prev ? { ...prev, causalOperator: e.target.value as MotifCausalOperator } : prev
                                                    )
                                                }
                                            >
                                                {CAUSAL_OPERATOR_OPTIONS.map((op) => (
                                                    <option key={`${m.id}_op_${op}`} value={op}>
                                                        {causalOperatorLabel(locale, op)}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                        <div className="MotifEditor__sectionTitle">
                                            {tr(locale, "Context（只读）", "Context (read-only)")}
                                        </div>
                                        <div className="MotifEditor__readonly">{contextLabel}</div>
                                        <div className="ConceptEditor__actions">
                                            <button
                                                type="button"
                                                className="Btn FlowToolbar__btn"
                                                onClick={resetMotifEditor}
                                            >
                                                {tr(locale, "取消", "Cancel")}
                                            </button>
                                            <button
                                                type="button"
                                                className="Btn FlowToolbar__btn"
                                                onClick={() => {
                                                    const nextTargetRaw = cleanText(draft.targetConceptId, 100);
                                                    const nextSourceRaw = uniq(
                                                        (draft.sourceConceptIds || [])
                                                            .map((id) => cleanText(id, 100))
                                                            .filter(Boolean),
                                                        7
                                                    ).filter((id) => id !== nextTargetRaw);

                                                    let targetId = nextTargetRaw;
                                                    let sourceIds = nextSourceRaw.slice();
                                                    if (!targetId) {
                                                        targetId =
                                                            cleanText(m.anchorConceptId, 100) ||
                                                            sourceIds[sourceIds.length - 1] ||
                                                            "";
                                                    }
                                                    sourceIds = sourceIds.filter((id) => id !== targetId);
                                                    if (!sourceIds.length) {
                                                        const fallback =
                                                            (m.conceptIds || [])
                                                                .map((id) => cleanText(id, 100))
                                                                .find((id) => id && id !== targetId) ||
                                                            pickUnusedConceptId([targetId]);
                                                        if (fallback) sourceIds = [fallback];
                                                    }

                                                    const combined = uniq([...sourceIds, targetId].filter(Boolean), 8);
                                                    const finalTarget = cleanText(targetId, 100) || combined[combined.length - 1] || "";
                                                    const finalSources = combined.filter((id) => id !== finalTarget);
                                                    if (!finalTarget || !finalSources.length) {
                                                        resetMotifEditor();
                                                        return;
                                                    }

                                                    const conceptIds = uniq([...finalSources, finalTarget], 8);
                                                    const relation = relationFromCausalOperator(draft.causalOperator);
                                                    const nextMotifType: ConceptMotif["motifType"] =
                                                        draft.causalOperator === "mediated_causation" || conceptIds.length >= 3
                                                            ? "triad"
                                                            : "pair";
                                                    const now = new Date().toISOString();
                                                    const patch: Partial<ConceptMotif> = {
                                                        title: cleanText(draft.title, 160) || m.title,
                                                        description: cleanText(draft.description, 320),
                                                        relation,
                                                        dependencyClass: relation,
                                                        causalOperator: draft.causalOperator,
                                                        motifType: nextMotifType,
                                                        motif_type: semanticMotifTypeFromRelation(relation),
                                                        conceptIds,
                                                        concept_bindings: conceptIds,
                                                        anchorConceptId: finalTarget,
                                                        roles: {
                                                            sources: finalSources,
                                                            target: finalTarget,
                                                        },
                                                        novelty: "updated",
                                                        updatedAt: now,
                                                    };

                                                    if (draft.status !== m.status) {
                                                        patch.status = draft.status;
                                                        patch.statusReason = `user_status_${draft.status}`;
                                                        patch.resolved = true;
                                                        patch.resolvedBy = "user";
                                                        patch.resolvedAt = now;
                                                    }

                                                    onPatchMotif(m.id, patch);
                                                    resetMotifEditor();
                                                }}
                                            >
                                                {tr(locale, "保存", "Save")}
                                            </button>
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        );
                    })
                    : null}
            </div>

            {tab === "concept" && selectedConcept ? (
                <div className="ConceptPanel__footer">
                    <div className="ConceptPanel__footerTitle">{tr(locale, "已选中：", "Selected: ")}{selectedConcept.title}</div>
                    <div className="ConceptPanel__footerActions">
                        <button type="button" className="Btn FlowToolbar__btn" onClick={() => onEditConceptNode?.(selectedConcept.id)}>
                            {tr(locale, "编辑对应节点", "Edit linked node")}
                        </button>
                        <button type="button" className="Btn FlowToolbar__btn" onClick={onClearSelect}>
                            {tr(locale, "清除高亮", "Clear highlight")}
                        </button>
                    </div>
                </div>
            ) : null}

            {tab === "motif" && selectedMotif ? (
                <div className="ConceptPanel__footer">
                    <div className="ConceptPanel__footerTitle">{tr(locale, "已选中 Motif：", "Selected motif: ")}{selectedMotif.title}</div>
                    <div className="ConceptPanel__footerActions">
                        <button type="button" className="Btn FlowToolbar__btn" onClick={onClearMotifSelect}>
                            {tr(locale, "清除高亮", "Clear highlight")}
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
