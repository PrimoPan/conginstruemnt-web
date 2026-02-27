import React, { useMemo, useState } from "react";
import type { AppLocale, ConceptItem, ConceptMotif } from "../core/type";

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
    if (status === "disabled") return tr(locale, "disabled", "disabled");
    return tr(locale, "cancelled", "cancelled");
}

function motifStatusIcon(status: ConceptMotif["status"]) {
    if (status === "active") return "✅";
    if (status === "uncertain") return "⚠";
    if (status === "deprecated") return "❌";
    if (status === "disabled") return "⏸";
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

export function ConceptPanel(props: {
    locale: AppLocale;
    concepts: ConceptItem[];
    motifs: ConceptMotif[];
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
}) {
    const {
        locale,
        concepts,
        motifs,
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
    } = props;
    const [tab, setTab] = useState<TabKey>("concept");
    const [editingMotifId, setEditingMotifId] = useState("");
    const [editingMotifTitle, setEditingMotifTitle] = useState("");
    const [editingMotifDesc, setEditingMotifDesc] = useState("");

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
                .filter((m) => m.status !== "cancelled")
                .slice()
                .sort((a, b) => {
                    const rank = (s: ConceptMotif["status"]) =>
                        s === "deprecated" ? 5 : s === "uncertain" ? 4 : s === "active" ? 3 : s === "disabled" ? 2 : 1;
                    return rank(b.status) - rank(a.status) || b.confidence - a.confidence || a.id.localeCompare(b.id);
                }),
        [motifs]
    );

    const selectedMotif = useMemo(
        () => (activeMotifId ? motifList.find((m) => m.id === activeMotifId) || null : null),
        [activeMotifId, motifList]
    );

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

                {tab === "motif"
                    ? motifList.map((m) => {
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
                        return (
                            <div
                                key={m.id}
                                className={`ConceptCard ConceptCard--motifLite status-${m.status} ${
                                    active ? "is-selected" : ""
                                } ${isUpdatedThisTurn ? "is-updated" : ""}`}
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
                                            title={m.status === "disabled"
                                                ? tr(locale, "启用 motif（恢复参与推理）", "Enable motif (resume reasoning)")
                                                : tr(locale, "停用 motif（仅暂停，不删除）", "Disable motif (pause only, do not delete)")}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const disabling = m.status !== "disabled";
                                                onPatchMotif(m.id, {
                                                    status: disabling ? "disabled" : "active",
                                                    statusReason: disabling ? "user_disabled" : "user_reenabled",
                                                    resolved: disabling ? true : false,
                                                    resolvedBy: disabling ? "user" : undefined,
                                                    resolvedAt: disabling ? new Date().toISOString() : undefined,
                                                    novelty: "updated",
                                                    updatedAt: new Date().toISOString(),
                                                });
                                            }}
                                        >
                                            {m.status === "disabled" ? "▶" : "⏸"}
                                        </button>
                                        <button
                                            type="button"
                                            className="ConceptCard__iconBtn"
                                            title={tr(locale, "编辑 motif 标题与说明", "Edit motif title and description")}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setEditingMotifId(m.id);
                                                setEditingMotifTitle(m.title);
                                                setEditingMotifDesc(m.description || "");
                                            }}
                                        >
                                            ✍️
                                        </button>
                                    </div>
                                </div>

                                <div className="ConceptCard__desc">{m.description || tr(locale, "暂无说明", "No description")}</div>
                                <div className="MotifCard__pattern">
                                    {dependencyLabel(locale, m.dependencyClass || m.relation)} · {causalOperatorLabel(locale, m.causalOperator)}
                                </div>
                                <div className="MotifCard__pattern">{causalFormula}</div>
                                <div className="ConceptCard__metaId">
                                    {tr(locale, "关联Concept", "Linked concepts")}:
                                    {" "}
                                    {(conceptRefs.slice(0, 6).map((x) => x.code).join(", ")) || tr(locale, "无", "none")}
                                </div>
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

                                {isEditing ? (
                                    <div
                                        className="ConceptEditor ConceptPanel__editorInline"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <div className="ConceptEditor__title">{tr(locale, "编辑 Motif", "Edit Motif")}</div>
                                        <label className="FlowInspector__fieldLabel">
                                            {tr(locale, "标题", "Title")}
                                            <input
                                                className="FlowInspector__input"
                                                value={editingMotifTitle}
                                                onChange={(e) => setEditingMotifTitle(e.target.value)}
                                            />
                                        </label>
                                        <label className="FlowInspector__fieldLabel">
                                            {tr(locale, "描述", "Description")}
                                            <textarea
                                                className="FlowInspector__editor"
                                                value={editingMotifDesc}
                                                onChange={(e) => setEditingMotifDesc(e.target.value)}
                                            />
                                        </label>
                                        <div className="ConceptEditor__actions">
                                            <button
                                                type="button"
                                                className="Btn FlowToolbar__btn"
                                                onClick={() => {
                                                    setEditingMotifId("");
                                                    setEditingMotifTitle("");
                                                    setEditingMotifDesc("");
                                                }}
                                            >
                                                {tr(locale, "取消", "Cancel")}
                                            </button>
                                            <button
                                                type="button"
                                                className="Btn FlowToolbar__btn"
                                                onClick={() => {
                                                    onPatchMotif(m.id, {
                                                        title: cleanText(editingMotifTitle, 160) || m.title,
                                                        description: cleanText(editingMotifDesc, 320),
                                                        novelty: "updated",
                                                        updatedAt: new Date().toISOString(),
                                                    });
                                                    setEditingMotifId("");
                                                    setEditingMotifTitle("");
                                                    setEditingMotifDesc("");
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
