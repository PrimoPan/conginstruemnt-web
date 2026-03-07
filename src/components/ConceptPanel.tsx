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
import { causalOperatorFriendlyLabel, relationLabel } from "../core/relationLabels";

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

function conceptDisplayTitle(id: string, conceptById: Map<string, ConceptItem>) {
    const raw = cleanText(conceptById.get(id)?.title, 64) || cleanText(id, 64);
    return raw.replace(/^[^:：]{1,12}[:：]\s*/, "").trim() || raw;
}

function motifConceptRefs(
    motif: ConceptMotif,
    conceptNoById: Map<string, number>,
    conceptById: Map<string, ConceptItem>
) {
    const ids = uniq((motif.conceptIds || []).map((id) => cleanText(id, 100)).filter(Boolean), 8);
    const anchorId =
        cleanText(motif.anchorConceptId, 100) ||
        cleanText(motif.roles?.target, 100) ||
        ids[ids.length - 1] ||
        "";
    const sourceIds = uniq(
        ((motif.roles?.sources || []).length ? motif.roles.sources : ids.filter((id) => id !== anchorId))
            .map((id) => cleanText(id, 100))
            .filter((id) => id && id !== anchorId),
        7
    );
    const toRef = (id: string) => {
        const no = conceptNoById.get(id);
        const code = no ? `C${no}` : cleanText(id, 16);
        const title = conceptDisplayTitle(id, conceptById);
        return {
            id,
            code,
            title,
            codedTitle: `${code} ${title}`,
        };
    };
    return {
        sources: sourceIds.map(toRef),
        target: anchorId ? toRef(anchorId) : null,
    };
}

function motifHeadline(
    locale: AppLocale,
    motif: ConceptMotif,
    conceptNoById: Map<string, number>,
    conceptById: Map<string, ConceptItem>
) {
    const { sources, target } = motifConceptRefs(motif, conceptNoById, conceptById);
    if (!sources.length || !target) return cleanText(motif.title, 160) || tr(locale, "未命名思路", "Untitled motif");
    const sourceText = sources.map((x) => x.title).join(locale === "en-US" ? " + " : "、");
    const relation = motif.dependencyClass || motif.relation;
    if (relation === "constraint") return tr(locale, `${sourceText}会限制${target.title}`, `${sourceText} constrains ${target.title}`);
    if (relation === "determine") return tr(locale, `${sourceText}会直接决定${target.title}`, `${sourceText} directly determines ${target.title}`);
    if (relation === "conflicts_with") {
        if (sources.length === 1) return tr(locale, `${sourceText}和${target.title}互相冲突`, `${sourceText} conflicts with ${target.title}`);
        return tr(locale, `${sourceText}会和${target.title}产生冲突`, `${sourceText} conflicts with ${target.title}`);
    }
    return tr(locale, `${sourceText}会推动${target.title}`, `${sourceText} leads to ${target.title}`);
}

function motifNamedPattern(
    motif: ConceptMotif,
    conceptNoById: Map<string, number>,
    conceptById: Map<string, ConceptItem>
) {
    const { sources, target } = motifConceptRefs(motif, conceptNoById, conceptById);
    if (!sources.length || !target) return motifPattern(motif, conceptNoById);
    return `${sources.map((x) => x.codedTitle).join(" + ")} -> ${target.codedTitle}`;
}

function motifModeText(locale: AppLocale, motif: ConceptMotif) {
    const normalizeModeText = (raw: string) => {
        const text = cleanText(raw, 180);
        if (!text) return "";
        if (/^coverage repair:/i.test(text)) {
            const rest = cleanText(text.replace(/^coverage repair:\s*/i, ""), 160);
            return tr(locale, `补全关系：${rest}`, `Patched relationship: ${rest}`);
        }
        if (locale !== "en-US") {
            const simple = text.match(/^(.+?)\s+(支持|限制|决定)\s+目标$/);
            if (simple) {
                if (simple[2] === "限制") return `${simple[1]}优先过滤`;
                if (simple[2] === "决定") return `${simple[1]}直接锁定`;
                if (simple[2] === "支持") return `${simple[1]}驱动目标`;
            }
        }
        return text;
    };
    const motifTypeTitle = normalizeModeText(cleanText((motif as any).motif_type_title, 180));
    if (motifTypeTitle) return motifTypeTitle;
    const reusableDescription = normalizeModeText(cleanText((motif as any).motif_type_reusable_description, 180));
    if (reusableDescription) return reusableDescription;
    const description = normalizeModeText(cleanText(motif.description, 180));
    if (description && !/(direct|mediated|confounding|intervention|contradiction|constraint|determine|enable)/i.test(description)) {
        return description;
    }
    return dependencyLabel(locale, motif.dependencyClass || motif.relation);
}

function motifContextText(locale: AppLocale, motif: ConceptMotif, contextLabels: string[]) {
    if (contextLabels.length) return contextLabels.join(" / ");
    const raw = cleanText((motif as any).context, 160);
    if (!raw) return "";
    const normalized = raw
        .replace(/\|global\b/gi, "")
        .replace(/\s{2,}/g, " ")
        .replace(/^[a-z_]+\s*\/\s*/i, "")
        .trim();
    if (!normalized) return tr(locale, "当前任务", "Current task");
    if (normalized === raw) return normalized;
    return tr(locale, `当前任务 / ${normalized}`, `Current task / ${normalized}`);
}

function dependencyLabel(locale: AppLocale, relation: ConceptMotif["relation"]) {
    return relationLabel(locale, relation);
}

function causalOperatorLabel(locale: AppLocale, op?: ConceptMotif["causalOperator"]) {
    return causalOperatorFriendlyLabel(locale, op);
}

function transferModeHint(locale: AppLocale, mode?: "A" | "B" | "C") {
    if (mode === "A") return tr(locale, "建议直接沿用", "Suggested: keep it");
    if (mode === "B") return tr(locale, "建议先改一下", "Suggested: revise first");
    return tr(locale, "建议谨慎沿用", "Suggested: use carefully");
}

function transferDecisionStatusLabel(locale: AppLocale, status: string) {
    if (status === "adopted") return tr(locale, "已沿用", "In use");
    if (status === "modified_pending_confirmation") return tr(locale, "待你确认", "Awaiting confirmation");
    if (status === "ignored") return tr(locale, "这次不用", "Skipped this trip");
    if (status === "revised") return tr(locale, "已更新", "Updated");
    return tr(locale, "待处理", "Pending");
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
    transferRecommendationsEnabled?: boolean;
    transferReviewStage?: "ready" | "fresh_task" | "awaiting_first_turn_review" | "no_transfer_match" | null;
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
        transferRecommendationsEnabled,
        transferReviewStage,
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
                .filter(
                    (entry) =>
                        !transferRecommendations.some(
                            (rec) => cleanText(rec.motif_type_id, 180) === cleanText(entry.motifTypeId, 180)
                        )
                )
                .sort((a, b) => b.matchScore - a.matchScore || a.motifTypeTitle.localeCompare(b.motifTypeTitle))
                .slice(0, 8),
        [motifLibrary, transferRecommendations]
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

                {transferRecommendationsEnabled &&
                tab === "motif" &&
                !transferRecommendations.length &&
                transferReviewStage &&
                transferReviewStage !== "ready" &&
                transferReviewStage !== "fresh_task" ? (
                    <div className="TransferSuggestions">
                        <div className="TransferSuggestions__title">
                            {tr(locale, "这次可能可以沿用的思路", "Ideas you may want to carry into this trip")}
                        </div>
                        <div className="ConceptPanel__empty">
                            {transferReviewStage === "awaiting_first_turn_review"
                                ? tr(
                                    locale,
                                    "正在根据这次的首轮需求检索历史思路，请稍候。",
                                    "Looking through your past trip patterns based on this first turn. Please wait."
                                )
                                : tr(
                                    locale,
                                    "这次没有找到适合直接沿用的旧思路。需要的话，你也可以在下方历史思路库里自己挑。",
                                    "No strong past trip pattern is ready to reuse directly. If needed, you can still pick one manually from the library below."
                                )}
                        </div>
                    </div>
                ) : null}

                {transferRecommendationsEnabled && tab === "motif" && transferRecommendations.length ? (
                    <div className="TransferSuggestions">
                        <div className="TransferSuggestions__title">
                            {tr(locale, "这次可能可以沿用的思路", "Ideas you may want to carry into this trip")}
                        </div>
                        {pendingRecommendations.slice(0, 4).map((rec) => {
                            const score = Math.round(Math.max(0, Math.min(1, Number(rec.match_score || 0))) * 100);
                            const isEditing = editingCandidateId === rec.candidate_id;
                            const isInjected = injectedCandidateSet.has(cleanText(rec.candidate_id, 220));
                            return (
                                <div key={rec.candidate_id} className="TransferSuggestions__item">
                                    <div className="TransferSuggestions__head">
                                        <span className="TransferSuggestions__badge">📚 {tr(locale, "历史", "Past")}</span>
                                        <span className="TransferSuggestions__name">{rec.motif_type_title}</span>
                                        <span className="TransferSuggestions__meta">
                                            {score}% · {transferModeHint(locale, rec.recommended_mode)}
                                        </span>
                                    </div>
                                    <div className="TransferSuggestions__desc">{rec.reusable_description || rec.reason}</div>
                                    {isInjected ? (
                                        <div className="TransferSuggestions__status">{tr(locale, "已沿用到当前任务", "Already in use")}</div>
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
                                                {tr(locale, "直接沿用", "Keep it")}
                                            </button>
                                            <button
                                                type="button"
                                                className="Btn FlowToolbar__btn"
                                                onClick={() => {
                                                    setEditingCandidateId(rec.candidate_id);
                                                    setEditingCandidateText(rec.reusable_description || rec.motif_type_title);
                                                }}
                                            >
                                                {tr(locale, "先改一下", "Revise first")}
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
                                                {tr(locale, "这次不用", "Skip this trip")}
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="TransferSuggestions__edit">
                                            <textarea
                                                className="FlowInspector__editor"
                                                value={editingCandidateText}
                                                onChange={(e) => setEditingCandidateText(e.target.value)}
                                                placeholder={tr(
                                                    locale,
                                                    "把这条旧思路改成更适合这次的说法",
                                                    "Rewrite this past pattern so it fits this trip"
                                                )}
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
                                                    {tr(locale, "按修改后的版本沿用", "Use revised version")}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {handledRecommendations.length ? (
                            <details className="TransferSuggestions__handled">
                                <summary>{tr(locale, "已处理的历史思路", "Handled past patterns")}</summary>
                                <div className="TransferSuggestions__handledList">
                                    {handledRecommendations.map((rec) => (
                                        <div key={`${rec.candidate_id}_handled`} className="TransferSuggestions__handledItem">
                                            <span>{rec.motif_type_title}</span>
                                            <span>{transferDecisionStatusLabel(locale, rec.decision_status)}</span>
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
                                                    {tr(locale, "这条现在不适合", "This no longer fits")}
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
                                    {tr(locale, "这条旧思路可能需要更新", "This past pattern may need updating")}
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
                                                {tr(locale, "直接更新旧思路", "Update old pattern")}
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
                                                {tr(locale, "另存为新思路", "Save as new pattern")}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : null}
                    </div>
                ) : null}

                {transferRecommendationsEnabled &&
                tab === "motif" &&
                transferReviewStage &&
                transferReviewStage !== "fresh_task" &&
                transferReviewStage !== "awaiting_first_turn_review" &&
                modeCLibraryEntries.length ? (
                    <details className="ModeCPanel">
                        <summary className="ModeCPanel__title">
                            {tr(locale, "历史思路库", "Past Trip Pattern Library")}
                        </summary>
                        <div className="ModeCPanel__hint">
                            {tr(
                                locale,
                                "如果上面的建议都不合适，你也可以自己从过去的任务里挑一条带到这次规划里。",
                                "If the suggestions above do not fit, you can still bring in a past pattern manually."
                            )}
                        </div>
                        <div className="ModeCPanel__list">
                            {modeCLibraryEntries.map((entry) => {
                                const scorePct = Math.round(entry.matchScore * 100);
                                return (
                                    <div key={`modec_${entry.motifTypeId}`} className="ModeCPanel__item">
                                        <div className="ModeCPanel__head">
                                            <span className="ModeCPanel__badge">📚 {tr(locale, "历史", "Past")}</span>
                                            <span className="ModeCPanel__name">{entry.motifTypeTitle}</span>
                                            <span className="ModeCPanel__meta">{scorePct}%</span>
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
                                                {tr(locale, "先放进本次参考", "Add as reference")}
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
                                                {tr(locale, "按这条继续规划", "Plan with this")}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </details>
                ) : null}

                {tab === "motif"
                    ? motifList.map((m, motifIdx) => {
                        const active = m.id === activeMotifId;
                        const isUpdatedThisTurn = m.novelty === "new" || m.novelty === "updated";
                        const confidencePct = Math.round(clamp01(m.confidence, 0.72) * 100);
                        const barsOn = Math.max(1, Math.round((confidencePct / 100) * 4));
                        const pattern = motifPattern(m, conceptNoById);
                        const namedPattern = motifNamedPattern(m, conceptNoById, conceptById);
                        const naturalTitle = motifHeadline(locale, m, conceptNoById, conceptById);
                        const modeText = motifModeText(locale, m);
                        const isEditing = editingMotifId === m.id;
                        const draft = isEditing ? editingMotifDraft : null;
                        const contextLabels = contextTitlesByMotifId.get(m.id) || [];
                        const changeSource =
                            cleanText((m as any).change_source, 24) ||
                            (m.novelty === "new" || m.novelty === "updated" ? m.novelty : "");
                        const contextLabel = motifContextText(locale, m, contextLabels);
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
                                        <div className="ConceptCard__title" title={m.title || naturalTitle}>
                                            {naturalTitle}
                                        </div>
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
                                        <div className="MotifCard__detail">
                                            <span className="MotifCard__detailLabel">{tr(locale, "模式", "Pattern")}:</span>
                                            <span className="MotifCard__detailText">{modeText}</span>
                                        </div>
                                        <div className="MotifCard__relation">{namedPattern}</div>
                                        {contextLabel ? (
                                            <div className="MotifCard__detail">
                                                <span className="MotifCard__detailLabel">Context:</span>
                                                <span className="MotifCard__detailText">{contextLabel}</span>
                                            </div>
                                        ) : null}
                                        <div className="MotifCard__progressHead">
                                            <span>{tr(locale, "这条思路有多靠谱", "How reliable this pattern feels")}</span>
                                            <span>{confidencePct}%</span>
                                        </div>
                                        <div className="MotifCard__progress">
                                            {[0, 1, 2, 3].map((i) => (
                                                <span key={`${m.id}_p_${i}`} className={`MotifCard__bar ${i < barsOn ? "is-on" : ""}`} />
                                            ))}
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
                                            {tr(locale, "关系方式", "Relation style")}
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
