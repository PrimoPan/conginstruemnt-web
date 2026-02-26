import React, { useMemo, useState } from "react";
import type { ConceptItem, ConceptMotif } from "../core/type";

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

function kindLabel(kind: ConceptItem["kind"]) {
    if (kind === "intent") return "Intent";
    if (kind === "requirement") return "Requirement";
    if (kind === "preference") return "Preference";
    if (kind === "risk") return "Risk";
    if (kind === "belief") return "Belief";
    if (kind === "fact") return "Fact";
    if (kind === "question") return "Question";
    return "Other";
}

function motifStatusLabel(status: ConceptMotif["status"]) {
    if (status === "active") return "active";
    if (status === "uncertain") return "uncertain";
    if (status === "deprecated") return "deprecated";
    if (status === "disabled") return "disabled";
    return "cancelled";
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

function motifPattern(motif: ConceptMotif, conceptTitles: string[]) {
    const ids = Array.isArray(motif.conceptIds) ? motif.conceptIds : [];
    if (!ids.length) return "C1 -> C2";
    const anchor = cleanText(motif.anchorConceptId, 96);
    const sources = ids.filter((id) => id !== anchor);
    const target = ids.find((id) => id === anchor) || ids[ids.length - 1];
    if (!sources.length) return "C1 -> C2";
    const sourceLabels = sources.map((_, i) => `C${i + 1}`);
    const targetLabel = `C${sourceLabels.length + 1}`;
    const targetTitle = conceptTitles[ids.indexOf(target)] || "target";
    return `${sourceLabels.join(" + ")} -> ${targetLabel} (${cleanText(targetTitle, 26)})`;
}

type TabKey = "concept" | "motif";

export function ConceptPanel(props: {
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
                {saving ? <span className="FlowStatusTag">保存中</span> : null}
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
                    <div className="ConceptPanel__empty">当前还没有可用 concept，继续对话后会自动生成。</div>
                ) : null}

                {tab === "concept"
                    ? concepts.map((c) => {
                        const active = c.id === activeConceptId;
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
                                        <div className="ConceptCard__kind">{kindLabel(c.kind)}</div>
                                    </div>
                                    <div className="ConceptCard__actions">
                                        <button
                                            type="button"
                                            className="ConceptCard__iconBtn"
                                            title={c.locked ? "解锁 Concept（允许关联节点自动更新）" : "锁定 Concept（保护关联节点）"}
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
                                            title={c.paused ? "启用 Concept（恢复关联节点）" : "暂停 Concept（临时停用并置灰关联节点）"}
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
                                            title="编辑对应节点（与右侧节点编辑逻辑一致）"
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

                                <div className="ConceptCard__desc">{c.description || "暂无描述"}</div>
                                <div className="ConceptCard__foot">
                                    <span>{scorePct}%</span>
                                    <span>
                                        {nodeCount} node · {motifCount} motif
                                    </span>
                                </div>
                            </div>
                        );
                    })
                    : null}

                {tab === "motif" && !motifList.length ? (
                    <div className="ConceptPanel__empty">当前还没有可用 motif。</div>
                ) : null}

                {tab === "motif"
                    ? motifList.map((m) => {
                        const active = m.id === activeMotifId;
                        const confidencePct = Math.round(clamp01(m.confidence, 0.72) * 100);
                        const barsOn = Math.max(1, Math.round((confidencePct / 100) * 4));
                        const conceptTitles = (m.conceptIds || []).map((id) => cleanText(conceptById.get(id)?.title, 60) || id);
                        const refs = uniq(
                            (m.conceptIds || []).flatMap((id) =>
                                (conceptById.get(id)?.sourceMsgIds || []).map(sourceRefToken).filter(Boolean)
                            ),
                            6
                        );
                        const pattern = motifPattern(m, conceptTitles);
                        const isEditing = editingMotifId === m.id;
                        return (
                            <div
                                key={m.id}
                                className={`ConceptCard ConceptCard--motifLite ${active ? "is-selected" : ""}`}
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
                                        <div className="ConceptCard__kind">{motifStatusLabel(m.status)}</div>
                                    </div>
                                    <div className="ConceptCard__actions">
                                        <button
                                            type="button"
                                            className="ConceptCard__iconBtn"
                                            title="查看该 motif 在右侧推理画布中的位置"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onSelectMotif(m.id);
                                            }}
                                        >
                                            👁
                                        </button>
                                        <button
                                            type="button"
                                            className="ConceptCard__iconBtn"
                                            title={m.resolved ? "解除锁定（允许系统继续重算该 motif）" : "锁定 motif（保持当前状态）"}
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
                                            title="编辑 motif 标题与说明"
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

                                <div className="ConceptCard__desc">{m.description || "暂无说明"}</div>
                                <div className="MotifCard__pattern">{pattern}</div>
                                <div className="MotifCard__concepts">
                                    {conceptTitles.slice(0, 4).map((title, idx) => (
                                        <span key={`${m.id}_c_${idx}`} className="MotifCard__conceptTag">
                                            C{idx + 1}:{cleanText(title, 14)}
                                        </span>
                                    ))}
                                    {conceptTitles.length > 4 ? (
                                        <span className="MotifCard__conceptTag">+{conceptTitles.length - 4}</span>
                                    ) : null}
                                </div>
                                <div className="MotifCard__progress">
                                    {[0, 1, 2, 3].map((i) => (
                                        <span key={`${m.id}_p_${i}`} className={`MotifCard__bar ${i < barsOn ? "is-on" : ""}`} />
                                    ))}
                                </div>
                                <div className="ConceptCard__foot">
                                    <span>{refs.length ? refs.join(" ") : "source: n/a"}</span>
                                    <span>{confidencePct}%</span>
                                </div>

                                {isEditing ? (
                                    <div
                                        className="ConceptEditor ConceptPanel__editorInline"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <div className="ConceptEditor__title">编辑 Motif</div>
                                        <label className="FlowInspector__fieldLabel">
                                            标题
                                            <input
                                                className="FlowInspector__input"
                                                value={editingMotifTitle}
                                                onChange={(e) => setEditingMotifTitle(e.target.value)}
                                            />
                                        </label>
                                        <label className="FlowInspector__fieldLabel">
                                            描述
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
                                                取消
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
                                                保存
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
                    <div className="ConceptPanel__footerTitle">已选中：{selectedConcept.title}</div>
                    <div className="ConceptPanel__footerActions">
                        <button type="button" className="Btn FlowToolbar__btn" onClick={() => onEditConceptNode?.(selectedConcept.id)}>
                            编辑对应节点
                        </button>
                        <button type="button" className="Btn FlowToolbar__btn" onClick={onClearSelect}>
                            清除高亮
                        </button>
                    </div>
                </div>
            ) : null}

            {tab === "motif" && selectedMotif ? (
                <div className="ConceptPanel__footer">
                    <div className="ConceptPanel__footerTitle">已选中 Motif：{selectedMotif.title}</div>
                    <div className="ConceptPanel__footerActions">
                        <button type="button" className="Btn FlowToolbar__btn" onClick={onClearMotifSelect}>
                            清除高亮
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
