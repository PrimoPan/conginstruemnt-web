import type { Edge, Node } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";
import type { CDG, CDGEdge, CDGNode, FlowNodeData, Severity } from "./type";

const TYPE_LABEL: Record<string, string> = {
    goal: "目标",
    constraint: "约束",
    preference: "偏好",
    belief: "判断",
    fact: "事实",
    question: "待确认",
};

const TYPE_ORDER: Record<string, number> = {
    goal: 0,
    constraint: 1,
    preference: 2,
    fact: 3,
    belief: 4,
    question: 5,
};

function cleanStatement(input: string) {
    return String(input ?? "")
        .replace(/\s+/g, " ")
        .replace(/^(用户任务|任务|用户补充)[:：]\s*/i, "")
        .trim();
}

function shorten(input: string, max = 22) {
    if (input.length <= max) return input;
    return `${input.slice(0, max)}…`;
}

function severityScore(sev?: Severity) {
    if (sev === "critical") return 4;
    if (sev === "high") return 3;
    if (sev === "medium") return 2;
    if (sev === "low") return 1;
    return 0;
}

function nodeMeta(node: CDGNode) {
    const parts = [TYPE_LABEL[node.type] || node.type];
    if (node.strength) parts.push(node.strength);
    if (typeof node.confidence === "number") parts.push(`c=${node.confidence.toFixed(2)}`);
    if (typeof node.importance === "number") parts.push(`i=${node.importance.toFixed(2)}`);
    return parts.join(" · ");
}

function edgeColor(type: string) {
    if (type === "constraint") return "#b91c1c";
    if (type === "conflicts_with") return "#c2410c";
    if (type === "determine") return "#1d4ed8";
    return "#4b5563";
}

function pickRootGoalId(graph: CDG): string | null {
    const goals = (graph.nodes || []).filter((n) => n.type === "goal");
    if (!goals.length) return null;
    const locked = goals.find((n) => n.locked);
    if (locked) return locked.id;
    const confirmed = goals.find((n) => n.status === "confirmed");
    if (confirmed) return confirmed.id;
    const best = goals
        .slice()
        .sort(
            (a, b) =>
                (Number(b.importance) || 0) - (Number(a.importance) || 0) ||
                (Number(b.confidence) || 0) - (Number(a.confidence) || 0)
        )[0];
    return best.id;
}

function computeDepths(graph: CDG, rootId: string | null) {
    const depth = new Map<string, number>();
    if (!rootId) {
        graph.nodes.forEach((n, idx) => depth.set(n.id, idx === 0 ? 0 : 1));
        return depth;
    }

    // Weakly-connected BFS around root: tolerate occasional edge direction drift.
    const neighbors = new Map<string, Set<string>>();
    for (const e of graph.edges || []) {
        if (!neighbors.has(e.from)) neighbors.set(e.from, new Set());
        if (!neighbors.has(e.to)) neighbors.set(e.to, new Set());
        neighbors.get(e.from)!.add(e.to);
        neighbors.get(e.to)!.add(e.from);
    }

    const queue: string[] = [rootId];
    depth.set(rootId, 0);

    while (queue.length) {
        const cur = queue.shift()!;
        const curDepth = depth.get(cur) ?? 0;
        const nxtNodes = neighbors.get(cur) || new Set<string>();
        for (const nxt of Array.from(nxtNodes)) {
            const next = curDepth + 1;
            const old = depth.get(nxt);
            if (old == null || next < old) {
                depth.set(nxt, next);
                queue.push(nxt);
            }
        }
    }

    const maxDepth = Math.max(...Array.from(depth.values()), 0);
    const orphanBase = Math.min(maxDepth + 1, 5);
    for (const n of graph.nodes || []) {
        if (!depth.has(n.id)) {
            // Keep orphan nodes bounded to avoid huge canvas and over-zoom.
            const bucket = Math.min(TYPE_ORDER[n.type] ?? 5, 5);
            depth.set(n.id, Math.min(orphanBase + Math.floor(bucket / 2), 6));
        }
    }
    return depth;
}

function relationBucket(node: CDGNode, rootId: string | null, edges: CDGEdge[]) {
    if (node.type === "goal") return 0;
    if (!rootId) return TYPE_ORDER[node.type] ?? 9;

    const toRoot = (edges || []).find((e) => e.from === node.id && e.to === rootId);
    if (toRoot?.type === "constraint") return 0;
    if (toRoot?.type === "determine") return 1;
    if (node.type === "preference") return 2;
    if (toRoot?.type === "enable") return 3;
    if (node.type === "question") return 5;
    return TYPE_ORDER[node.type] ?? 9;
}

function computePositions(graph: CDG) {
    const rootId = pickRootGoalId(graph);
    const depths = computeDepths(graph, rootId);
    const byDepth = new Map<number, CDGNode[]>();

    for (const n of graph.nodes || []) {
        const d = depths.get(n.id) ?? 1;
        if (!byDepth.has(d)) byDepth.set(d, []);
        byDepth.get(d)!.push(n);
    }

    const sortedDepths = Array.from(byDepth.keys()).sort((a, b) => a - b);
    const positions = new Map<string, { x: number; y: number }>();
    const startX = 90;
    const xGap = 340;
    const itemH = 132;
    const itemGap = 30;
    const groupGap = 22;
    const rootY = 280;

    for (const d of sortedDepths) {
        const items = byDepth.get(d)!;
        items.sort((a, b) => {
            const byBucket = relationBucket(a, rootId, graph.edges) - relationBucket(b, rootId, graph.edges);
            if (byBucket !== 0) return byBucket;
            const bySeverity = severityScore(b.severity) - severityScore(a.severity);
            if (bySeverity !== 0) return bySeverity;
            const byImportance = (Number(b.importance) || 0) - (Number(a.importance) || 0);
            if (byImportance !== 0) return byImportance;
            const byType = (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9);
            if (byType !== 0) return byType;
            return cleanStatement(a.statement).localeCompare(cleanStatement(b.statement));
        });

        let total = 0;
        let prevBucket = -1;
        for (let i = 0; i < items.length; i += 1) {
            const n = items[i];
            const bucket = relationBucket(n, rootId, graph.edges);
            if (i > 0) total += itemGap;
            if (i > 0 && bucket !== prevBucket) total += groupGap;
            total += itemH;
            prevBucket = bucket;
        }

        let y = Math.max(56, rootY - total / 2);
        prevBucket = -1;
        for (const n of items) {
            const bucket = relationBucket(n, rootId, graph.edges);
            if (prevBucket !== -1 && bucket !== prevBucket) y += groupGap;
            positions.set(n.id, {
                x: startX + d * xGap,
                y,
            });
            y += itemH + itemGap;
            prevBucket = bucket;
        }
    }

    return positions;
}

export function cdgToFlow(graph: CDG): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
    const positions = computePositions(graph);

    const nodes: Node<FlowNodeData>[] = (graph.nodes || []).map((n) => {
        const statement = cleanStatement(n.statement || n.id);
        const fullLabel = statement || n.id;
        const shortLabel = shorten(fullLabel);
        return {
            id: n.id,
            type: "cdgNode",
            position: positions.get(n.id) || { x: 120, y: 120 },
            data: {
                shortLabel,
                fullLabel,
                meta: nodeMeta(n),
                nodeType: n.type,
                severity: n.severity,
                importance: n.importance,
                tags: n.tags,
                evidenceIds: n.evidenceIds,
                sourceMsgIds: n.sourceMsgIds,
            },
        };
    });

    const edges: Edge[] = (graph.edges || []).map((e) => {
        const stroke = edgeColor(e.type);
        const showLabel = e.type !== "enable";
        return {
            id: e.id,
            source: e.from,
            target: e.to,
            label: showLabel ? e.type : undefined,
            type: "default",
            style: {
                strokeWidth: e.type === "constraint" ? 1.9 : 1.45,
                stroke,
            },
            markerEnd: {
                type: MarkerType.ArrowClosed,
                color: stroke,
                width: 15,
                height: 15,
            },
            labelStyle: { fill: "#374151", fontSize: 11 },
            animated: false,
        };
    });

    return { nodes, edges };
}
