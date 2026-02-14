import type { Node, Edge } from "@xyflow/react";
import type { CDG } from "./type";

const colX: Record<string, number> = {
    constraint: 70,
    preference: 360,
    belief: 360,
    fact: 360,
    goal: 680,
    question: 980,
};

function nodeMeta(type: string, strength?: string, confidence?: number) {
    const parts = [type];
    if (strength) parts.push(strength);
    if (typeof confidence === "number") parts.push(`c=${confidence.toFixed(2)}`);
    return parts.join(" · ");
}

export function cdgToFlow(graph: CDG): { nodes: Node[]; edges: Edge[] } {
    const counts: Record<string, number> = {};

    const nodes: Node[] = (graph.nodes || []).map((n) => {
        const x = colX[n.type] ?? 680;
        counts[n.type] = (counts[n.type] ?? 0) + 1;

        const y = counts[n.type] * 96;

        return {
            id: n.id,
            position: { x, y },
            data: {
                label: n.statement || n.id,
                meta: nodeMeta(n.type, n.strength, n.confidence),
            },
            style: {
                borderRadius: 14,
                border: "1px solid rgba(0,0,0,0.10)",
                padding: 12,
                width: 290,
                background: "white",
                boxShadow: "0 1px 10px rgba(0,0,0,0.04)",
                fontSize: 13,
                lineHeight: 1.35,
            },
        };
    });

    const edges: Edge[] = (graph.edges || []).map((e) => ({
        id: e.id,
        source: e.from,
        target: e.to,
        label: e.type,
        animated: false,
        style: { strokeWidth: 1.2 },
    }));

    return { nodes, edges };
}
