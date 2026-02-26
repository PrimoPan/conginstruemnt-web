import React, { memo, useMemo } from "react";
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
    ConceptItem,
    ConceptMotif,
    MotifLink,
    MotifReasoningEdge,
    MotifReasoningNode,
    MotifReasoningView,
} from "../../core/type";

type MotifFlowData = {
    motifId: string;
    title: string;
    status: ConceptMotif["status"];
    confidence: number;
    relation: ConceptMotif["relation"];
    motifType: ConceptMotif["motifType"];
    pattern: string;
    conceptLabels: string[];
    sourceRefs: string[];
    selected?: boolean;
};

function cleanText(input: any, max = 160): string {
    return String(input ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max);
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

function motifPattern(motif: ConceptMotif): string {
    const ids = Array.isArray(motif.conceptIds) ? motif.conceptIds : [];
    if (!ids.length) return "C1 -> C2";
    const anchor = cleanText(motif.anchorConceptId, 96);
    const sources = ids.filter((id) => id !== anchor);
    const target = ids.find((id) => id === anchor) || ids[ids.length - 1];
    if (!sources.length) return "C1 -> C2";
    const sourceTags = sources.map((_, i) => `C${i + 1}`);
    return `${sourceTags.join(" + ")} -> C${sourceTags.length + 1} (${cleanText(target, 18)})`;
}

function buildFallbackView(params: {
    motifs: ConceptMotif[];
    motifLinks: MotifLink[];
    concepts: ConceptItem[];
}): MotifReasoningView {
    const conceptById = new Map((params.concepts || []).map((c) => [c.id, c]));
    const motifs = (params.motifs || []).filter((m) => m.status !== "cancelled");
    const nodes: MotifReasoningNode[] = motifs.map((m) => {
        const conceptIds = uniq(m.conceptIds || [], 8);
        const conceptTitles = conceptIds.map((id) => cleanText(conceptById.get(id)?.title, 48) || id);
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
            motifType: m.motifType,
            status: m.status,
            confidence: clamp01(m.confidence, 0.72),
            pattern: motifPattern(m),
            conceptIds,
            conceptTitles,
            sourceRefs,
        };
    });
    const motifIdToNodeId = new Map(nodes.map((n) => [n.motifId, n.id]));
    const validNodeId = new Set(nodes.map((n) => n.id));
    const edges: MotifReasoningEdge[] = uniq(
        (params.motifLinks || []).map((x) => `${x.id}::${x.fromMotifId}::${x.toMotifId}::${x.type}`),
        420
    )
        .map((packed) => {
            const [id, fromMotifId, toMotifId, typeRaw] = packed.split("::");
            const type =
                typeRaw === "depends_on" || typeRaw === "conflicts" || typeRaw === "refines"
                    ? typeRaw
                    : "supports";
            return {
                id,
                from: motifIdToNodeId.get(fromMotifId) || "",
                to: motifIdToNodeId.get(toMotifId) || "",
                type,
                confidence: 0.72,
            } as MotifReasoningEdge;
        })
        .filter((e) => validNodeId.has(e.from) && validNodeId.has(e.to) && e.from !== e.to);
    return { nodes, edges };
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
    if (type === "conflicts") return `rgba(185, 28, 28, ${alpha})`;
    if (type === "depends_on") return `rgba(71, 85, 105, ${alpha})`;
    if (type === "refines") return `rgba(202, 138, 4, ${alpha})`;
    return `rgba(37, 99, 235, ${alpha})`;
}

function nodeColor(status: ConceptMotif["status"]) {
    if (status === "deprecated") return "#ef4444";
    if (status === "uncertain") return "#f59e0b";
    if (status === "disabled") return "#9ca3af";
    if (status === "cancelled") return "#d1d5db";
    return "#2563eb";
}

function statusLabel(status: ConceptMotif["status"]) {
    if (status === "active") return "active";
    if (status === "uncertain") return "uncertain";
    if (status === "deprecated") return "deprecated";
    if (status === "disabled") return "disabled";
    return "cancelled";
}

function statusIcon(status: ConceptMotif["status"]) {
    if (status === "active") return "✓";
    if (status === "uncertain") return "!";
    if (status === "deprecated") return "✕";
    if (status === "disabled") return "⏸";
    return "•";
}

function relationHint(relation: ConceptMotif["relation"]) {
    if (relation === "constraint") return "constraint";
    if (relation === "determine") return "determine";
    if (relation === "conflicts_with") return "conflict";
    return "enable";
}

function layoutReasoningGraph(view: MotifReasoningView): {
    nodes: Node<MotifFlowData>[];
    edges: Edge[];
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
            const conceptLabels = (n.conceptTitles || []).slice(0, 3).map((title, idx) => `C${idx + 1}:${title}`);
            nodes.push({
                id: n.id,
                type: "motifNode",
                position: {
                    x: 90 + l * 380,
                    y: 80 + i * 220,
                },
                data: {
                    motifId: n.motifId,
                    title: n.title,
                    status: n.status,
                    confidence,
                    relation: n.relation,
                    motifType: n.motifType,
                    pattern: n.pattern,
                    conceptLabels,
                    sourceRefs: (n.sourceRefs || []).slice(0, 6),
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
                label: e.type,
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

    return { nodes, edges };
}

const MotifNode = memo(function MotifNode({ data, selected }: NodeProps<Node<MotifFlowData>>) {
    const confidencePct = Math.round(clamp01(data.confidence, 0.72) * 100);
    const activeBars = Math.max(1, Math.round((confidencePct / 100) * 4));
    return (
        <div
            className={`MotifReasoningNode ${selected ? "is-selected" : ""} status-${data.status}`}
            style={{ borderColor: nodeColor(data.status) }}
        >
            <Handle type="target" position={Position.Left} className="MotifReasoningNode__handle" />
            <Handle type="source" position={Position.Right} className="MotifReasoningNode__handle" />

            <div className="MotifReasoningNode__head">
                <span className="MotifReasoningNode__status">{statusIcon(data.status)}</span>
                <div className="MotifReasoningNode__title" title={data.title}>
                    {data.title}
                </div>
                <div className="MotifReasoningNode__badge">{confidencePct}%</div>
            </div>

            <div className="MotifReasoningNode__meta">
                {statusLabel(data.status)} · {data.motifType} · {relationHint(data.relation)}
            </div>
            <div className="MotifReasoningNode__pattern">{data.pattern}</div>

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
                {data.sourceRefs.length ? data.sourceRefs.join(" ") : "source: n/a"}
            </div>
        </div>
    );
});

const nodeTypes = { motifNode: MotifNode };

export function MotifReasoningCanvas(props: {
    motifs: ConceptMotif[];
    motifLinks: MotifLink[];
    concepts: ConceptItem[];
    reasoningView?: MotifReasoningView;
    activeMotifId?: string;
    onSelectMotif?: (motifId: string) => void;
    onSelectConcept?: (conceptId: string) => void;
}) {
    const resolvedView = useMemo(() => {
        const serverView = props.reasoningView;
        const hasServerView = Array.isArray(serverView?.nodes) && (serverView?.nodes?.length || 0) > 0;
        if (hasServerView && serverView) return serverView as MotifReasoningView;
        return buildFallbackView({
            motifs: props.motifs || [],
            motifLinks: props.motifLinks || [],
            concepts: props.concepts || [],
        });
    }, [props.reasoningView, props.motifs, props.motifLinks, props.concepts]);

    const { nodes, edges } = useMemo(() => layoutReasoningGraph(resolvedView), [resolvedView]);
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
                    当前还没有可用 motif 推理结构，继续对话后会自动生成。
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
        </div>
    );
}
