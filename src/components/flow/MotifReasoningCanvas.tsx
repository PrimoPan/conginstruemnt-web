import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import {
    Background,
    Controls,
    Edge,
    Handle,
    MarkerType,
    MiniMap,
    Node,
    NodeProps,
    Position,
    ReactFlow,
} from "@xyflow/react";
import type {
    AppLocale,
    ConceptItem,
    ConceptMotif,
    MotifLink,
    MotifReasoningStep,
    MotifReasoningStepRole,
    MotifReasoningEdge,
    MotifReasoningNode,
    MotifReasoningView,
} from "../../core/type";

type MotifFlowData = {
    motifId: string;
    locale?: AppLocale;
    title: string;
    status: ConceptMotif["status"];
    confidence: number;
    relation: ConceptMotif["relation"];
    dependencyClass?: ConceptMotif["dependencyClass"];
    causalOperator?: ConceptMotif["causalOperator"];
    causalFormula?: string;
    motifType: ConceptMotif["motifType"];
    pattern: string;
    conceptLabels: string[];
    sourceRefs: string[];
    stepOrder?: number;
    stepRole?: MotifReasoningStepRole;
    selected?: boolean;
};

function cleanText(input: any, max = 160): string {
    return String(input ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max);
}

function tr(locale: AppLocale | undefined, zh: string, en: string): string {
    return locale === "en-US" ? en : zh;
}

function clamp01(v: any, fallback = 0.7) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(1, n));
}

function uniq(arr: string[], max = 40): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const raw of arr || []) {
        const s = cleanText(raw, 96);
        if (!s || seen.has(s)) continue;
        seen.add(s);
        out.push(s);
        if (out.length >= max) break;
    }
    return out;
}

function extractSourceRef(source: string): string {
    const s = cleanText(source, 64);
    if (!s || s === "latest_user" || s === "latest_assistant") return "";
    const m = s.match(/(\d{1,4})/);
    if (m?.[1]) return `#${m[1]}`;
    return s.slice(0, 18);
}

function normalizeMotifLinkType(raw: string): MotifLink["type"] {
    const t = cleanText(raw, 32).toLowerCase();
    if (t === "precedes" || t === "supports" || t === "conflicts_with" || t === "refines") {
        return t as MotifLink["type"];
    }
    if (t === "depends_on" || t === "determine") return "precedes";
    if (t === "enable" || t === "support") return "supports";
    if (t === "constraint" || t === "conflicts") return "conflicts_with";
    return "supports";
}

function stepRoleLabel(role: MotifReasoningStepRole | undefined, locale?: AppLocale): string {
    if (role === "premise") return tr(locale, "前提", "Premise");
    if (role === "bridge") return tr(locale, "桥接", "Bridge");
    if (role === "decision") return tr(locale, "决策", "Decision");
    if (role === "isolated") return tr(locale, "独立", "Isolated");
    return tr(locale, "步骤", "Step");
}

function motifPattern(
    motif: ConceptMotif,
    conceptNoById: Map<string, number>
): string {
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

function buildFallbackView(params: {
    motifs: ConceptMotif[];
    motifLinks: MotifLink[];
    concepts: ConceptItem[];
    locale?: AppLocale;
}): MotifReasoningView {
    const conceptById = new Map((params.concepts || []).map((c) => [c.id, c]));
    const conceptNoById = new Map<string, number>();
    (params.concepts || []).forEach((c, idx) => conceptNoById.set(c.id, idx + 1));
    const motifs = (params.motifs || []).slice();
    const nodes: MotifReasoningNode[] = motifs.map((m) => {
        const conceptIds = uniq(m.conceptIds || [], 8);
        const conceptTitles = conceptIds.map((id) => {
            const no = conceptNoById.get(id);
            const code = no ? `C${no}` : cleanText(id, 16);
            const title = cleanText(conceptById.get(id)?.title, 48) || id;
            return `${code}:${title}`;
        });
        const sourceRefs = uniq(
            conceptIds.flatMap((id) =>
                (conceptById.get(id)?.sourceMsgIds || []).map(extractSourceRef).filter(Boolean)
            ),
            8
        );
        return {
            id: `rm_${m.id}`,
            motifId: m.id,
            title: cleanText(m.title, 160) || cleanText(m.templateKey, 120) || "motif",
            relation: m.relation,
            dependencyClass: m.dependencyClass || m.relation,
            causalOperator: m.causalOperator,
            causalFormula: cleanText(m.causalFormula, 120) || motifPattern(m, conceptNoById),
            motifType: m.motifType,
            status: m.status,
            confidence: clamp01(m.confidence, 0.72),
            pattern: motifPattern(m, conceptNoById),
            conceptIds,
            conceptTitles,
            sourceRefs,
        };
    });
    const motifIdToNodeId = new Map(nodes.map((n) => [n.motifId, n.id]));
    const validNodeId = new Set(nodes.map((n) => n.id));
    const edgeByKey = new Map<string, MotifReasoningEdge>();
    for (const x of params.motifLinks || []) {
        const from = motifIdToNodeId.get(cleanText((x as any)?.fromMotifId, 120)) || "";
        const to = motifIdToNodeId.get(cleanText((x as any)?.toMotifId, 120)) || "";
        if (!validNodeId.has(from) || !validNodeId.has(to) || from === to) continue;
        const type = normalizeMotifLinkType(cleanText((x as any)?.type, 32));
        const confidence = clamp01((x as any)?.confidence, 0.72);
        const key = `${from}=>${to}::${type}`;
        const prev = edgeByKey.get(key);
        if (!prev || confidence > prev.confidence) {
            edgeByKey.set(key, {
                id: cleanText((x as any)?.id, 120) || `me_${cleanText((x as any)?.fromMotifId, 32)}_${cleanText((x as any)?.toMotifId, 32)}_${type}`,
                from,
                to,
                type,
                confidence,
            });
        }
    }
    const edges: MotifReasoningEdge[] = Array.from(edgeByKey.values()).sort(
        (a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id)
    );

    const indeg = new Map<string, number>();
    const outdeg = new Map<string, number>();
    const outgoing = new Map<string, string[]>();
    for (const n of nodes) {
        indeg.set(n.id, 0);
        outdeg.set(n.id, 0);
        outgoing.set(n.id, []);
    }
    for (const e of edges) {
        indeg.set(e.to, (indeg.get(e.to) || 0) + 1);
        outdeg.set(e.from, (outdeg.get(e.from) || 0) + 1);
        outgoing.get(e.from)?.push(e.to);
    }
    const orderedNodeIds: string[] = [];
    if (edges.length) {
        const remainingIn = new Map(indeg);
        const queue = nodes
            .filter((n) => (remainingIn.get(n.id) || 0) <= 0)
            .sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id))
            .map((n) => n.id);
        const visited = new Set<string>();
        while (queue.length) {
            const cur = queue.shift() as string;
            if (visited.has(cur)) continue;
            visited.add(cur);
            orderedNodeIds.push(cur);
            for (const nxt of outgoing.get(cur) || []) {
                remainingIn.set(nxt, (remainingIn.get(nxt) || 0) - 1);
                if ((remainingIn.get(nxt) || 0) <= 0) queue.push(nxt);
            }
            queue.sort((a, b) => {
                const na = nodes.find((x) => x.id === a);
                const nb = nodes.find((x) => x.id === b);
                return (nb?.confidence || 0) - (na?.confidence || 0) || a.localeCompare(b);
            });
        }
        for (const n of nodes) {
            if (!visited.has(n.id)) orderedNodeIds.push(n.id);
        }
    } else {
        orderedNodeIds.push(
            ...nodes
                .slice()
                .sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id))
                .map((n) => n.id)
        );
    }
    const stepMap = new Map<string, { order: number; role: MotifReasoningStepRole }>();
    orderedNodeIds.forEach((nodeId, idx) => {
        const motifId = nodes.find((n) => n.id === nodeId)?.motifId;
        if (!motifId) return;
        const inCount = indeg.get(nodeId) || 0;
        const outCount = outdeg.get(nodeId) || 0;
        const role: MotifReasoningStepRole =
            edges.length === 0
                ? "isolated"
                : inCount <= 0 && outCount <= 0
                  ? "isolated"
                  : inCount <= 0
                    ? "premise"
                    : outCount <= 0
                      ? "decision"
                      : "bridge";
        stepMap.set(motifId, { order: idx + 1, role });
    });
    const steps = nodes.map((n) => {
        const slot = stepMap.get(n.motifId);
        return {
            step_id: `S${slot?.order || 0}`,
            summary: cleanText(n.title, 180),
            motif_ids: [n.motifId],
            concept_ids: (n.conceptIds || []).slice(0, 8),
            depends_on: edges.filter((e) => e.to === n.id).map((e) => nodes.find((x) => x.id === e.from)?.motifId || "").filter(Boolean),
            id: `step_${n.motifId}`,
            order: slot?.order || 0,
            motifId: n.motifId,
            motifNodeId: n.id,
            role: slot?.role || "isolated",
            status: n.status,
            dependencyClass: n.dependencyClass || n.relation,
            causalOperator: n.causalOperator,
            dependsOnMotifIds: edges.filter((e) => e.to === n.id).map((e) => nodes.find((x) => x.id === e.from)?.motifId || "").filter(Boolean),
            usedConceptIds: (n.conceptIds || []).slice(0, 8),
            usedConceptTitles: (n.conceptTitles || []).slice(0, 8),
            explanation: tr(
                params.locale,
                `第${slot?.order || 0}步：${n.title}（${stepRoleLabel(slot?.role, params.locale)}）`,
                `Step ${slot?.order || 0}: ${n.title} (${stepRoleLabel(slot?.role, params.locale)})`
            ),
        };
    });
    return { nodes, edges, steps };
}

function structuredStepExplanation(params: {
    step: MotifReasoningStep;
    node?: MotifReasoningNode;
    locale?: AppLocale;
}): string {
    const { step, node, locale } = params;
    const depCount = (step.dependsOnMotifIds || []).length;
    const depText =
        depCount > 0
            ? tr(locale, `依赖 ${depCount} 个前置 motif`, `depends on ${depCount} prior motif(s)`)
            : tr(locale, "无前置依赖", "no prior dependency");
    const relation = dependencyLabel(step.dependencyClass || node?.relation, locale);
    const operator = causalOperatorLabel(step.causalOperator || node?.causalOperator, locale);
    const role = stepRoleLabel(step.role, locale);
    return tr(
        locale,
        `第${step.order}步 · ${role} · ${relation} / ${operator}；${depText}。`,
        `Step ${step.order} · ${role} · ${relation} / ${operator}; ${depText}.`
    );
}

function statusRank(s: ConceptMotif["status"]): number {
    if (s === "deprecated") return 5;
    if (s === "uncertain") return 4;
    if (s === "active") return 3;
    if (s === "disabled") return 2;
    return 1;
}

function edgeColor(type: MotifLink["type"], confidence: number) {
    const c = clamp01(confidence, 0.72);
    const alpha = (0.35 + c * 0.45).toFixed(3);
    if (type === "conflicts_with") return `rgba(185, 28, 28, ${alpha})`;
    if (type === "precedes") return `rgba(202, 138, 4, ${alpha})`;
    if (type === "refines") return `rgba(71, 85, 105, ${alpha})`;
    return `rgba(37, 99, 235, ${alpha})`;
}

function nodeColor(status: ConceptMotif["status"]) {
    if (status === "deprecated") return "#ef4444";
    if (status === "uncertain") return "#f59e0b";
    if (status === "disabled") return "#9ca3af";
    if (status === "cancelled") return "#d1d5db";
    return "#2563eb";
}

function statusLabel(status: ConceptMotif["status"], locale?: AppLocale) {
    if (status === "active") return tr(locale, "active", "active");
    if (status === "uncertain") return tr(locale, "uncertain", "uncertain");
    if (status === "deprecated") return tr(locale, "deprecated", "deprecated");
    if (status === "disabled") return tr(locale, "disabled", "disabled");
    return tr(locale, "cancelled", "cancelled");
}

function statusIcon(status: ConceptMotif["status"]) {
    if (status === "active") return "✓";
    if (status === "uncertain") return "!";
    if (status === "deprecated") return "✕";
    if (status === "disabled") return "⏸";
    return "•";
}

function dependencyLabel(relation: ConceptMotif["relation"] | undefined, locale?: AppLocale) {
    if (relation === "enable") return tr(locale, "Enable（直接/中介因果）", "Enable (Direct/Mediated)");
    if (relation === "constraint") return tr(locale, "Constraint（混杂）", "Constraint (Confounding)");
    if (relation === "determine") return tr(locale, "Determine（干预）", "Determine (Intervention)");
    return tr(locale, "Conflict（矛盾）", "Conflict (Contradiction)");
}

function causalOperatorLabel(op: ConceptMotif["causalOperator"] | undefined, locale?: AppLocale) {
    if (op === "direct_causation") return tr(locale, "直接因果", "Direct causation");
    if (op === "mediated_causation") return tr(locale, "中介因果", "Mediated causation");
    if (op === "confounding") return tr(locale, "混杂", "Confounding");
    if (op === "intervention") return tr(locale, "干预（do-operator）", "Intervention (do-operator)");
    if (op === "contradiction") return tr(locale, "矛盾", "Contradiction");
    return tr(locale, "未指定", "Unspecified");
}

function edgeTypeLabel(type: MotifLink["type"], locale?: AppLocale) {
    if (type === "supports") return tr(locale, "支持", "supports");
    if (type === "precedes") return tr(locale, "前置", "precedes");
    if (type === "refines") return tr(locale, "细化", "refines");
    if (type === "conflicts_with") return tr(locale, "冲突", "conflicts_with");
    return type;
}

function layoutReasoningGraph(
    view: MotifReasoningView,
    locale?: AppLocale,
    conceptById?: Map<string, ConceptItem>,
    conceptNoById?: Map<string, number>
): {
    nodes: Node<MotifFlowData>[];
    edges: Edge[];
    steps: NonNullable<MotifReasoningView["steps"]>;
} {
    const rawNodes = (view?.nodes || []).slice();
    const rawEdges = (view?.edges || []).slice();
    const nodeById = new Map(rawNodes.map((n) => [n.id, n]));
    const outgoing = new Map<string, string[]>();
    const indeg = new Map<string, number>();
    for (const n of rawNodes) {
        outgoing.set(n.id, []);
        indeg.set(n.id, 0);
    }
    for (const e of rawEdges) {
        if (!nodeById.has(e.from) || !nodeById.has(e.to) || e.from === e.to) continue;
        outgoing.get(e.from)!.push(e.to);
        indeg.set(e.to, (indeg.get(e.to) || 0) + 1);
    }

    const level = new Map<string, number>();
    const visited = new Set<string>();
    const queue = rawNodes
        .filter((n) => (indeg.get(n.id) || 0) === 0)
        .sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id))
        .map((n) => n.id);

    for (const id of queue) level.set(id, 0);
    while (queue.length) {
        const cur = queue.shift() as string;
        if (visited.has(cur)) continue;
        visited.add(cur);
        const baseLevel = level.get(cur) || 0;
        for (const nxt of outgoing.get(cur) || []) {
            const nextLevel = Math.max(level.get(nxt) || 0, baseLevel + 1);
            level.set(nxt, nextLevel);
            indeg.set(nxt, (indeg.get(nxt) || 0) - 1);
            if ((indeg.get(nxt) || 0) <= 0) queue.push(nxt);
        }
        queue.sort((a, b) => {
            const na = nodeById.get(a)!;
            const nb = nodeById.get(b)!;
            return (level.get(a) || 0) - (level.get(b) || 0) || nb.confidence - na.confidence || a.localeCompare(b);
        });
    }

    let maxLevel = 0;
    const existingLevels = Array.from(level.values());
    for (let i = 0; i < existingLevels.length; i += 1) {
        maxLevel = Math.max(maxLevel, existingLevels[i]);
    }
    for (const n of rawNodes) {
        if (!level.has(n.id)) {
            maxLevel += 1;
            level.set(n.id, maxLevel);
        }
    }

    const byLevel = new Map<number, MotifReasoningNode[]>();
    for (const n of rawNodes) {
        const l = level.get(n.id) || 0;
        if (!byLevel.has(l)) byLevel.set(l, []);
        byLevel.get(l)!.push(n);
    }

    const stepByMotifId = new Map(
        ((view?.steps || []) as NonNullable<MotifReasoningView["steps"]>).map((s) => [s.motifId, s])
    );
    const nodes: Node<MotifFlowData>[] = [];
    const levelKeys = Array.from(byLevel.keys()).sort((a, b) => a - b);
    for (const l of levelKeys) {
        const group = byLevel
            .get(l)!
            .slice()
            .sort((a, b) => statusRank(b.status) - statusRank(a.status) || b.confidence - a.confidence || a.id.localeCompare(b.id));
        for (let i = 0; i < group.length; i += 1) {
            const n = group[i];
            const confidence = clamp01(n.confidence, 0.7);
            const conceptIds = (n.conceptIds || []).slice(0, 3);
            const conceptLabels = conceptIds.map((id) => {
                const no = conceptNoById?.get(id);
                return no ? `C${no}` : cleanText(id, 16);
            });
            const src = conceptIds.slice(0, Math.max(0, conceptIds.length - 1));
            const tgt = conceptIds[conceptIds.length - 1];
            const rebuiltPattern =
                src.length && tgt
                    ? `${src
                          .map((id) => {
                              const no = conceptNoById?.get(id);
                              return no ? `C${no}` : cleanText(id, 16);
                          })
                          .join(" + ")} -> ${(() => {
                              const no = conceptNoById?.get(tgt);
                              return no ? `C${no}` : cleanText(tgt, 16);
                          })()}`
                    : n.pattern;
            nodes.push({
                id: n.id,
                type: "motifNode",
                position: {
                    x: 90 + l * 380,
                    y: 80 + i * 220,
                },
                data: {
                    motifId: n.motifId,
                    locale,
                    title: n.title,
                    status: n.status,
                    confidence,
                    relation: n.relation,
                    dependencyClass: n.dependencyClass || n.relation,
                    causalOperator: n.causalOperator,
                    causalFormula: rebuiltPattern,
                    motifType: n.motifType,
                    pattern: rebuiltPattern,
                    conceptLabels,
                    sourceRefs: (n.sourceRefs || []).slice(0, 6),
                    stepOrder: stepByMotifId.get(n.motifId)?.order,
                    stepRole: stepByMotifId.get(n.motifId)?.role,
                },
            });
        }
    }

    const edges: Edge[] = rawEdges
        .filter((e) => nodeById.has(e.from) && nodeById.has(e.to) && e.from !== e.to)
        .map((e) => {
            const conf = clamp01(e.confidence, 0.72);
            return {
                id: e.id,
                source: e.from,
                target: e.to,
                type: "smoothstep",
                label: edgeTypeLabel(e.type, locale),
                style: {
                    stroke: edgeColor(e.type, conf),
                    strokeWidth: 1.1 + conf * 1.8,
                },
                markerEnd: {
                    type: MarkerType.ArrowClosed,
                    color: edgeColor(e.type, conf),
                    width: 16,
                    height: 16,
                },
                labelStyle: {
                    fill: "rgba(30, 41, 59, 0.7)",
                    fontSize: 11,
                    fontWeight: 500,
                },
            };
        });

    return { nodes, edges, steps: (view?.steps || []) as NonNullable<MotifReasoningView["steps"]> };
}

const MotifNode = memo(function MotifNode({ data, selected }: NodeProps<Node<MotifFlowData>>) {
    const confidencePct = Math.round(clamp01(data.confidence, 0.72) * 100);
    const activeBars = Math.max(1, Math.round((confidencePct / 100) * 4));
    const locale = data.locale;
    return (
        <div
            className={`MotifReasoningNode ${selected ? "is-selected" : ""} status-${data.status}`}
            style={{ borderColor: nodeColor(data.status) }}
        >
            <Handle type="target" position={Position.Left} className="MotifReasoningNode__handle" />
            <Handle type="source" position={Position.Right} className="MotifReasoningNode__handle" />

            <div className="MotifReasoningNode__head">
                <span className="MotifReasoningNode__status">{statusIcon(data.status)}</span>
                {data.stepOrder ? (
                    <span className="MotifReasoningNode__conceptTag" title={stepRoleLabel(data.stepRole, locale)}>
                        {tr(locale, "步骤", "Step")} {data.stepOrder}
                    </span>
                ) : null}
                <div className="MotifReasoningNode__title" title={data.title}>
                    {data.title}
                </div>
                <div className="MotifReasoningNode__badge">{confidencePct}%</div>
            </div>

            <div className="MotifReasoningNode__meta">
                {statusLabel(data.status, locale)} · {dependencyLabel(data.dependencyClass || data.relation, locale)} ·{" "}
                {causalOperatorLabel(data.causalOperator, locale)}
            </div>
            <div className="MotifReasoningNode__pattern">{data.causalFormula || data.pattern}</div>

            <div className="MotifReasoningNode__concepts">
                {data.conceptLabels.slice(0, 4).map((x) => (
                    <span key={`${data.motifId}_${x}`} className="MotifReasoningNode__conceptTag">
                        {x}
                    </span>
                ))}
                {data.conceptLabels.length > 4 ? (
                    <span className="MotifReasoningNode__conceptTag">+{data.conceptLabels.length - 4}</span>
                ) : null}
            </div>

            <div className="MotifReasoningNode__progress">
                {[0, 1, 2, 3].map((i) => (
                    <span
                        key={`${data.motifId}_bar_${i}`}
                        className={`MotifReasoningNode__bar ${i < activeBars ? "is-on" : ""}`}
                    />
                ))}
            </div>
            <div className="MotifReasoningNode__refs">
                {data.sourceRefs.length ? data.sourceRefs.join(" ") : tr(locale, "来源: n/a", "source: n/a")}
            </div>
        </div>
    );
});

const nodeTypes = { motifNode: MotifNode };

export function MotifReasoningCanvas(props: {
    locale?: AppLocale;
    motifs: ConceptMotif[];
    motifLinks: MotifLink[];
    concepts: ConceptItem[];
    reasoningView?: MotifReasoningView;
    activeMotifId?: string;
    onSelectMotif?: (motifId: string) => void;
    onSelectConcept?: (conceptId: string) => void;
}) {
    const AUTO_COLLAPSE_MS = 20000;
    const en = props.locale === "en-US";
    const [stepsCollapsed, setStepsCollapsed] = useState(true);
    const [stepsPinned, setStepsPinned] = useState(false);
    const lastStepActivityAtRef = useRef<number>(Date.now());
    const conceptById = useMemo(
        () => new Map((props.concepts || []).map((c) => [c.id, c])),
        [props.concepts]
    );
    const conceptNoById = useMemo(() => {
        const m = new Map<string, number>();
        (props.concepts || []).forEach((c, idx) => m.set(c.id, idx + 1));
        return m;
    }, [props.concepts]);
    const resolvedView = useMemo(() => {
        const serverView = props.reasoningView;
        const hasServerView = Array.isArray(serverView?.nodes) && (serverView?.nodes?.length || 0) > 0;
        if (hasServerView && serverView) return serverView as MotifReasoningView;
        return buildFallbackView({
            motifs: props.motifs || [],
            motifLinks: props.motifLinks || [],
            concepts: props.concepts || [],
            locale: props.locale,
        });
    }, [props.reasoningView, props.motifs, props.motifLinks, props.concepts, props.locale]);

    const { nodes, edges, steps } = useMemo(
        () => layoutReasoningGraph(resolvedView, props.locale, conceptById, conceptNoById),
        [resolvedView, props.locale, conceptById, conceptNoById]
    );

    const markStepActivity = () => {
        lastStepActivityAtRef.current = Date.now();
    };

    useEffect(() => {
        if (!steps.length) {
            setStepsCollapsed(true);
            setStepsPinned(false);
        }
    }, [steps.length]);

    useEffect(() => {
        if (stepsCollapsed || stepsPinned || !steps.length) return;
        const timer = window.setInterval(() => {
            if (Date.now() - lastStepActivityAtRef.current >= AUTO_COLLAPSE_MS) {
                setStepsCollapsed(true);
            }
        }, 1000);
        return () => window.clearInterval(timer);
    }, [stepsCollapsed, stepsPinned, steps.length]);
    const nodeByMotifId = useMemo(
        () => new Map((resolvedView?.nodes || []).map((n) => [n.motifId, n])),
        [resolvedView]
    );
    const renderedNodes = useMemo(
        () =>
            nodes.map((n) => ({
                ...n,
                selected: !!props.activeMotifId && n.data.motifId === props.activeMotifId,
            })),
        [nodes, props.activeMotifId]
    );

    return (
        <div className="MotifReasoningCanvas">
            {!nodes.length ? (
                <div className="MotifReasoningCanvas__empty">
                    {en
                        ? "No motif reasoning structure yet. Continue the conversation to generate one."
                        : "当前还没有可用 motif 推理结构，继续对话后会自动生成。"}
                </div>
            ) : null}
            <ReactFlow
                nodes={renderedNodes}
                edges={edges}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.22, duration: 260 }}
                panOnDrag
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable
                onNodeClick={(_, node) => {
                    const motifId = node.data?.motifId || "";
                    if (motifId) props.onSelectMotif?.(motifId);
                }}
                proOptions={{ hideAttribution: true }}
            >
                <MiniMap
                    pannable
                    zoomable
                    maskColor="rgba(17, 24, 39, 0.07)"
                    nodeColor={(n) => nodeColor((n?.data as any)?.status || "active")}
                />
                <Background />
                <Controls />
            </ReactFlow>
            {steps.length ? (
                <div
                    className={`MotifReasoningCanvas__steps ${stepsCollapsed ? "is-collapsed" : ""}`}
                    onMouseMove={markStepActivity}
                    onMouseEnter={markStepActivity}
                    onFocusCapture={markStepActivity}
                >
                    <div className="MotifReasoningCanvas__stepsHead">
                        <div className="MotifReasoningCanvas__stepsTitle">
                            {tr(props.locale, "结构化推理步骤（Explanation）", "Structured reasoning steps (explanation)")}
                        </div>
                        <div className="MotifReasoningCanvas__stepsActions">
                            <button
                                type="button"
                                className="MotifReasoningCanvas__stepsBtn"
                                onClick={() => {
                                    markStepActivity();
                                    setStepsCollapsed((v) => !v);
                                }}
                            >
                                {stepsCollapsed ? tr(props.locale, "展开", "Expand") : tr(props.locale, "收起", "Collapse")}
                            </button>
                            <button
                                type="button"
                                className={`MotifReasoningCanvas__stepsBtn ${stepsPinned ? "is-active" : ""}`}
                                onClick={() => {
                                    markStepActivity();
                                    setStepsPinned((v) => !v);
                                }}
                            >
                                {stepsPinned ? tr(props.locale, "取消固定", "Unpin") : tr(props.locale, "固定", "Pin")}
                            </button>
                        </div>
                    </div>
                    {!stepsCollapsed ? (
                        <div className="MotifReasoningCanvas__stepsList">
                            {steps
                                .slice()
                                .sort((a, b) => a.order - b.order)
                                .slice(0, 24)
                                .map((s) => (
                                    <div key={s.id} className={`MotifReasoningCanvas__step status-${s.status}`}>
                                        <div className="MotifReasoningCanvas__stepHead">
                                            <span className="MotifReasoningCanvas__stepNo">#{s.order}</span>
                                            <span className="MotifReasoningCanvas__stepRole">
                                                {stepRoleLabel(s.role, props.locale)}
                                            </span>
                                            <span className="MotifReasoningCanvas__stepMotif">{s.motifId}</span>
                                        </div>
                                        <div className="MotifReasoningCanvas__stepText">
                                            {structuredStepExplanation({
                                                step: s,
                                                node: nodeByMotifId.get(s.motifId),
                                                locale: props.locale,
                                            })}
                                        </div>
                                    </div>
                                ))}
                        </div>
                    ) : (
                        <div className="MotifReasoningCanvas__stepsSummary">
                            {tr(
                                props.locale,
                                `默认折叠。共 ${steps.length} 条可查看；空闲 ${Math.round(AUTO_COLLAPSE_MS / 1000)} 秒后自动收起。`,
                                `Collapsed by default. ${steps.length} step(s); auto-collapses after ${Math.round(
                                    AUTO_COLLAPSE_MS / 1000
                                )}s of inactivity.`
                            )}
                        </div>
                    )}
                </div>
            ) : null}
        </div>
    );
}
