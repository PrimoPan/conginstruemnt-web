import type { Node } from "@xyflow/react";
import type { CDG, CDGEdge, CDGNode, EdgeType, FlowNodeData } from "../../core/type";

export const EDITABLE_PARENT_EDGE_TYPES: EdgeType[] = ["enable", "determine", "constraint"];

export function newEdgeId() {
    const uuid = (globalThis.crypto as any)?.randomUUID?.();
    if (uuid) return `e_manual_${uuid}`;
    return `e_manual_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function newNodeId() {
    const uuid = (globalThis.crypto as any)?.randomUUID?.();
    if (uuid) return `n_manual_${uuid}`;
    return `n_manual_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function normalize01(x: any, fallback = 0.68) {
    const n = Number(x);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(1, n));
}

export function parseJsonValue(input: any): any {
    if (input == null) return undefined;
    if (typeof input === "string") {
        const s = input.trim();
        if (!s) return undefined;
        try {
            return JSON.parse(s);
        } catch {
            return input;
        }
    }
    return input;
}

export function splitCsv(input: string): string[] {
    return String(input || "")
        .split(/[,，;；\n]/)
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 32);
}

export function ensureNodeUi(node: CDGNode, x: number, y: number): CDGNode {
    const base =
        node.value && typeof node.value === "object" && !Array.isArray(node.value)
            ? ({ ...(node.value as Record<string, unknown>) } as Record<string, unknown>)
            : {};
    return {
        ...node,
        value: {
            ...base,
            ui: {
                x: Math.round(x),
                y: Math.round(y),
            },
        },
    };
}

export function hasPath(from: string, to: string, edges: CDGEdge[]): boolean {
    if (from === to) return true;
    const adj = new Map<string, string[]>();
    for (const e of edges) {
        if (!adj.has(e.from)) adj.set(e.from, []);
        adj.get(e.from)!.push(e.to);
    }
    const seen = new Set<string>();
    const stack = [from];
    while (stack.length) {
        const cur = stack.pop()!;
        if (cur === to) return true;
        if (seen.has(cur)) continue;
        seen.add(cur);
        const next = adj.get(cur) || [];
        for (const n of next) {
            if (!seen.has(n)) stack.push(n);
        }
    }
    return false;
}

export function pickRootGoalId(graph: CDG): string | null {
    const goals = (graph.nodes || []).filter((n) => n.type === "goal");
    if (!goals.length) return null;
    const locked = goals.find((n) => n.locked);
    if (locked) return locked.id;
    const confirmed = goals.find((n) => n.status === "confirmed");
    if (confirmed) return confirmed.id;
    return goals
        .slice()
        .sort(
            (a, b) =>
                (Number(b.importance) || 0) - (Number(a.importance) || 0) ||
                (Number(b.confidence) || 0) - (Number(a.confidence) || 0)
        )[0]?.id;
}

export function collectSubtree(startId: string, edges: CDGEdge[]): Set<string> {
    const out = new Set<string>();
    const stack = [startId];
    while (stack.length) {
        const cur = stack.pop()!;
        if (out.has(cur)) continue;
        out.add(cur);
        for (const e of edges) {
            if (e.from === cur && !out.has(e.to)) stack.push(e.to);
        }
    }
    return out;
}

function edgeSig(from: string, to: string, type: EdgeType) {
    return `${from}|${to}|${type}`;
}

function clampEdgeConfidence(x: any, fallback = 0.72) {
    const n = Number(x);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(1, n));
}

export function deleteNodeAndReconnect(graph: CDG, nodeId: string): CDG {
    const nodes = (graph.nodes || []).filter((n) => n.id !== nodeId);
    const edges = graph.edges || [];

    const incoming = edges.filter((e) => e.to === nodeId);
    const outgoing = edges.filter((e) => e.from === nodeId);
    const remained = edges.filter((e) => e.to !== nodeId && e.from !== nodeId);

    const bridgeParents = incoming.filter((e) => EDITABLE_PARENT_EDGE_TYPES.includes(e.type));
    const bridgeChildren = outgoing.filter((e) => EDITABLE_PARENT_EDGE_TYPES.includes(e.type));

    const existing = new Set(remained.map((e) => edgeSig(e.from, e.to, e.type)));
    const nextEdges = [...remained];

    // Delete-only behavior: reconnect parent -> child for structural edges.
    for (const p of bridgeParents) {
        for (const c of bridgeChildren) {
            if (!p.from || !c.to || p.from === c.to) continue;
            const type = c.type;
            const sig = edgeSig(p.from, c.to, type);
            if (existing.has(sig)) continue;
            if (hasPath(c.to, p.from, nextEdges)) continue;

            existing.add(sig);
            nextEdges.push({
                id: newEdgeId(),
                from: p.from,
                to: c.to,
                type,
                confidence: clampEdgeConfidence(
                    ((Number(p.confidence) || 0.72) + (Number(c.confidence) || 0.72)) / 2,
                    0.74
                ),
            });
        }
    }

    return {
        ...graph,
        nodes,
        edges: nextEdges,
    };
}

export function findDropParent(
    dragged: Node<FlowNodeData>,
    nodes: Node<FlowNodeData>[]
): string | null {
    const width = Number((dragged as any).width || (dragged as any).measured?.width || 280);
    const height = Number((dragged as any).height || (dragged as any).measured?.height || 120);
    const cx = dragged.position.x + width / 2;
    const cy = dragged.position.y + height / 2;

    let best: { id: string; score: number } | null = null;
    for (const c of nodes) {
        if (c.id === dragged.id) continue;
        const w = Number((c as any).width || (c as any).measured?.width || 280);
        const h = Number((c as any).height || (c as any).measured?.height || 120);
        const x0 = c.position.x - 18;
        const y0 = c.position.y - 18;
        const x1 = c.position.x + w + 18;
        const y1 = c.position.y + h + 18;
        const inside = cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;
        if (!inside) continue;
        const tcx = c.position.x + w / 2;
        const tcy = c.position.y + h / 2;
        const score = Math.hypot(tcx - cx, tcy - cy);
        if (!best || score < best.score) best = { id: c.id, score };
    }
    return best?.id || null;
}
