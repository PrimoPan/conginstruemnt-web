import React, { useMemo, useState } from "react";
import type { ConceptItem, ConceptMotif, ContextItem, MotifLink, MotifLinkType } from "../core/type";

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

function motifStatusLabel(status: ConceptMotif["status"]) {
  if (status === "active") return "active";
  if (status === "uncertain") return "uncertain";
  if (status === "deprecated") return "deprecated";
  if (status === "disabled") return "disabled";
  return "cancelled";
}

function contextStatusLabel(status: ContextItem["status"]) {
  if (status === "active") return "active";
  if (status === "uncertain") return "uncertain";
  if (status === "conflicted") return "conflicted";
  return "disabled";
}

type TabKey = "concept" | "motif" | "context" | "link";

function motifLinkTypeLabel(t: MotifLinkType) {
  if (t === "depends_on") return "depends_on";
  if (t === "conflicts") return "conflicts";
  if (t === "refines") return "refines";
  return "supports";
}

export function ConceptPanel(props: {
  concepts: ConceptItem[];
  motifs: ConceptMotif[];
  motifLinks: MotifLink[];
  contexts: ContextItem[];
  activeConceptId?: string;
  saving?: boolean;
  onSelect: (conceptId: string) => void;
  onClearSelect: () => void;
  onEditConceptNode?: (conceptId: string) => void;
  onPatchConcept: (conceptId: string, patch: Partial<ConceptItem>) => void;
  onPatchMotif: (motifId: string, patch: Partial<ConceptMotif>) => void;
  onPatchMotifLink: (motifLinkId: string, patch: Partial<MotifLink>) => void;
}) {
  const {
    concepts,
    motifs,
    motifLinks,
    contexts,
    activeConceptId,
    saving,
    onSelect,
    onClearSelect,
    onEditConceptNode,
    onPatchConcept,
    onPatchMotif,
    onPatchMotifLink,
  } = props;
  const [tab, setTab] = useState<TabKey>("concept");

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

  const contextList = useMemo(
    () =>
      (contexts || [])
        .slice()
        .sort((a, b) => {
          const rank = (s: ContextItem["status"]) => (s === "conflicted" ? 4 : s === "uncertain" ? 3 : s === "active" ? 2 : 1);
          return rank(b.status) - rank(a.status) || b.confidence - a.confidence || a.id.localeCompare(b.id);
        }),
    [contexts]
  );

  const motifById = useMemo(() => new Map((motifList || []).map((m) => [m.id, m])), [motifList]);
  const motifLinkList = useMemo(
    () =>
      (motifLinks || [])
        .filter((x) => motifById.has(x.fromMotifId) && motifById.has(x.toMotifId))
        .slice()
        .sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id)),
    [motifById, motifLinks]
  );

  return (
    <div className="Panel ConceptPanel">
      <div className="PanelHeader ConceptPanel__header">
        <div className="ConceptPanel__title">Concept · Motif · Context</div>
        {saving ? <span className="FlowStatusTag">保存中</span> : null}
      </div>

      <div className="ConceptPanel__tabs" role="tablist" aria-label="cognitive model tabs">
        <button
          type="button"
          className={`ConceptPanel__tab ${tab === "concept" ? "is-active" : ""}`}
          onClick={() => setTab("concept")}
        >
          Concept ({concepts.length})
        </button>
        <button
          type="button"
          className={`ConceptPanel__tab ${tab === "motif" ? "is-active" : ""}`}
          onClick={() => setTab("motif")}
        >
          Motif ({motifList.length})
        </button>
        <button
          type="button"
          className={`ConceptPanel__tab ${tab === "context" ? "is-active" : ""}`}
          onClick={() => setTab("context")}
        >
          Context ({contextList.length})
        </button>
        <button
          type="button"
          className={`ConceptPanel__tab ${tab === "link" ? "is-active" : ""}`}
          onClick={() => setTab("link")}
        >
          Link ({motifLinkList.length})
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
              const confidencePct = Math.round(clamp01(m.confidence, 0.7) * 100);
              const clickableConceptId = (m.conceptIds || []).find((cid) => conceptById.has(cid)) || "";
              const unresolvedDeprecated = m.status === "deprecated" && !m.resolved;
              return (
                <div
                  key={m.id}
                  className={`ConceptCard ConceptCard--motif status-${m.status}`}
                  role={clickableConceptId ? "button" : undefined}
                  tabIndex={clickableConceptId ? 0 : -1}
                  onClick={() => {
                    if (clickableConceptId) onSelect(clickableConceptId);
                  }}
                  onKeyDown={(e) => {
                    if (!clickableConceptId) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(clickableConceptId);
                    }
                  }}
                >
                  <div className="ConceptCard__head">
                    <div className="ConceptCard__titleWrap">
                      <div className="ConceptCard__title">{m.title}</div>
                      <div className="ConceptCard__kind">{m.templateKey}</div>
                    </div>
                    <div className="ConceptCard__actions">
                      <button
                        type="button"
                        className="ConceptCard__iconBtn"
                        title={m.status === "disabled" ? "启用 motif" : "暂停 motif"}
                        onClick={(e) => {
                          e.stopPropagation();
                          const nextStatus =
                            m.status === "disabled" ? (m.confidence < 0.7 ? "uncertain" : "active") : "disabled";
                          onPatchMotif(m.id, {
                            status: nextStatus,
                            statusReason: nextStatus === "disabled" ? "user_disabled" : "user_enabled",
                            novelty: "updated",
                          });
                        }}
                      >
                        {m.status === "disabled" ? "▶" : "⏸"}
                      </button>
                      {unresolvedDeprecated ? (
                        <>
                          <button
                            type="button"
                            className="ConceptCard__iconBtn ConceptCard__iconBtn--ok"
                            title="确认保留该 motif（解除冲突门控）"
                            onClick={(e) => {
                              e.stopPropagation();
                              onPatchMotif(m.id, {
                                status: "active",
                                statusReason: "user_resolved_keep",
                                resolved: true,
                                resolvedBy: "user",
                                resolvedAt: new Date().toISOString(),
                                novelty: "updated",
                              });
                            }}
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            className="ConceptCard__iconBtn ConceptCard__iconBtn--warn"
                            title="确认停用该 motif（解除冲突门控）"
                            onClick={(e) => {
                              e.stopPropagation();
                              onPatchMotif(m.id, {
                                status: "cancelled",
                                statusReason: "user_resolved_drop",
                                resolved: true,
                                resolvedBy: "user",
                                resolvedAt: new Date().toISOString(),
                                novelty: "updated",
                              });
                            }}
                          >
                            ✕
                          </button>
                        </>
                      ) : null}
                      <div className={`MotifStatusBadge status-${m.status}`}>{motifStatusLabel(m.status)}</div>
                    </div>
                  </div>
                  <div className="ConceptCard__desc">{m.description || "暂无说明"}</div>
                  <div className="ConceptCard__foot">
                    <span>{confidencePct}%</span>
                    <span>
                      {m.motifType} · {m.novelty}
                    </span>
                  </div>
                </div>
              );
            })
          : null}

        {tab === "link" && !motifLinkList.length ? (
          <div className="ConceptPanel__empty">当前还没有可用 motif link。</div>
        ) : null}
        {tab === "link"
          ? motifLinkList.map((x) => {
              const from = motifById.get(x.fromMotifId);
              const to = motifById.get(x.toMotifId);
              if (!from || !to) return null;
              const scorePct = Math.round(clamp01(x.confidence, 0.72) * 100);
              return (
                <div key={x.id} className="ConceptCard ConceptCard--link">
                  <div className="ConceptCard__head">
                    <div className="ConceptCard__titleWrap">
                      <div className="ConceptCard__title">{from.title}</div>
                      <div className="ConceptCard__kind">→ {to.title}</div>
                    </div>
                    <div className={`MotifStatusBadge status-${x.source === "user" ? "active" : "uncertain"}`}>
                      {x.source}
                    </div>
                  </div>
                  <div className="ConceptLinkRow">
                    <label>关系</label>
                    <select
                      value={x.type}
                      onChange={(e) =>
                        onPatchMotifLink(x.id, {
                          type: e.target.value as MotifLinkType,
                          source: "user",
                        })
                      }
                    >
                      <option value="supports">{motifLinkTypeLabel("supports")}</option>
                      <option value="depends_on">{motifLinkTypeLabel("depends_on")}</option>
                      <option value="conflicts">{motifLinkTypeLabel("conflicts")}</option>
                      <option value="refines">{motifLinkTypeLabel("refines")}</option>
                    </select>
                  </div>
                  <div className="ConceptLinkRow">
                    <label>置信度 {scorePct}%</label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={scorePct}
                      onChange={(e) =>
                        onPatchMotifLink(x.id, {
                          confidence: Number(e.target.value) / 100,
                          source: "user",
                        })
                      }
                    />
                  </div>
                </div>
              );
            })
          : null}

        {tab === "context" && !contextList.length ? (
          <div className="ConceptPanel__empty">当前还没有可用 context。</div>
        ) : null}
        {tab === "context"
          ? contextList.map((ctx) => {
              const confidencePct = Math.round(clamp01(ctx.confidence, 0.68) * 100);
              return (
                <div key={ctx.id} className={`ConceptCard ConceptCard--context status-${ctx.status}`}>
                  <div className="ConceptCard__head">
                    <div className="ConceptCard__titleWrap">
                      <div className="ConceptCard__title">{ctx.title}</div>
                      <div className="ConceptCard__kind">{ctx.tags.slice(0, 3).join(" · ") || "context"}</div>
                    </div>
                    <div className={`MotifStatusBadge status-${ctx.status}`}>{contextStatusLabel(ctx.status)}</div>
                  </div>
                  <div className="ConceptCard__desc">{ctx.summary || "暂无摘要"}</div>
                  <div className="ConceptCard__foot">
                    <span>{confidencePct}%</span>
                    <span>
                      {ctx.conceptIds.length} concept · {ctx.motifIds.length} motif
                    </span>
                  </div>
                  {ctx.openQuestions?.length ? (
                    <div className="ContextQuestions">
                      {ctx.openQuestions.slice(0, 2).map((q, idx) => (
                        <div key={`${ctx.id}_q_${idx}`} className="ContextQuestionItem">
                          {q}
                        </div>
                      ))}
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
    </div>
  );
}
