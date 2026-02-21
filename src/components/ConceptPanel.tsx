import React, { useMemo } from "react";
import type { ConceptItem } from "../core/type";

function clamp01(v: any, fallback = 0.7) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(1, n));
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

export function ConceptPanel(props: {
    concepts: ConceptItem[];
    activeConceptId?: string;
    saving?: boolean;
    onSelect: (conceptId: string) => void;
    onClearSelect: () => void;
    onEditConceptNode?: (conceptId: string) => void;
    onPatchConcept: (conceptId: string, patch: Partial<ConceptItem>) => void;
}) {
    const { concepts, activeConceptId, saving, onSelect, onClearSelect, onEditConceptNode, onPatchConcept } = props;

    const selectedConcept = useMemo(
        () => (activeConceptId ? concepts.find((c) => c.id === activeConceptId) || null : null),
        [activeConceptId, concepts]
    );

    return (
        <div className="Panel ConceptPanel">
            <div className="PanelHeader">
                <div className="ConceptPanel__title">Concept</div>
                {saving ? <span className="FlowStatusTag">保存中</span> : null}
            </div>

            <div className="ConceptPanel__list">
                {!concepts.length ? (
                    <div className="ConceptPanel__empty">当前还没有可用 concept，继续对话后会自动生成。</div>
                ) : null}
                {concepts.map((c) => {
                    const active = c.id === activeConceptId;
                    const scorePct = Math.round(clamp01(c.score, 0.72) * 100);
                    const nodeCount = Array.isArray(c.nodeIds) ? c.nodeIds.length : 0;
                    const motifCount = Array.isArray(c.motifIds) ? c.motifIds.length : 0;
                    return (
                        <div
                            key={c.id}
                            className={`ConceptCard ${active ? "is-selected" : ""} ${c.paused ? "is-paused" : ""}`}
                            onClick={() => onSelect(c.id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    onSelect(c.id);
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
                                <span>{nodeCount} node · {motifCount} motif</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {selectedConcept ? (
                <div className="ConceptPanel__footer">
                    <div className="ConceptPanel__footerTitle">已选中：{selectedConcept.title}</div>
                    <div className="ConceptPanel__footerActions">
                        <button
                            type="button"
                            className="Btn FlowToolbar__btn"
                            onClick={() => onEditConceptNode?.(selectedConcept.id)}
                        >
                            编辑对应节点
                        </button>
                        <button type="button" className="Btn FlowToolbar__btn" onClick={onClearSelect}>
                            清除高亮
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
