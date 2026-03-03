import type { CDG, CDGEdge, CDGNode, EdgeType } from "./type";

function clamp01(x: any, fallback = 0.6) {
    const n = Number(x);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(1, n));
}

const EDGE_TYPES = new Set<EdgeType>(["enable", "constraint", "determine", "conflicts_with"]);

function normalizeConceptTypeClient(input: any): CDGNode["type"] {
    const t = String(input ?? "").trim().toLowerCase();
    if (t === "belief" || t === "constraint" || t === "preference" || t === "factual_assertion") {
        return t;
    }
    if (t === "goal") return "belief";
    if (t === "fact") return "factual_assertion";
    if (t === "question") return "belief";
    return "factual_assertion";
}

function normalizeValidationStatusClient(raw: any): "unasked" | "pending" | "resolved" {
    const s = String(raw ?? "").trim().toLowerCase();
    if (s === "pending" || s === "resolved" || s === "unasked") return s;
    return "unasked";
}

export function normalizeGraphClient(input: any): CDG {
    const usedNodeIds = new Set<string>();
    const rawNodes = Array.isArray(input?.nodes) ? input.nodes : [];
    const nodes: CDGNode[] = rawNodes.map((raw: any, idx: number) => {
        const rawId = typeof raw?.id === "string" ? raw.id.trim() : "";
        let id = rawId || `n_${idx + 1}`;
        while (usedNodeIds.has(id)) id = `${id}_dup`;
        usedNodeIds.add(id);
        return {
            ...(raw || {}),
            id,
            type: normalizeConceptTypeClient(raw?.type),
            statement: typeof raw?.statement === "string" ? raw.statement : "",
            status: raw?.status || "proposed",
            confidence: clamp01(raw?.confidence, 0.6),
            importance: raw?.importance == null ? undefined : clamp01(raw.importance, 0.68),
            validation_status: normalizeValidationStatusClient(
                raw?.validation_status || raw?.value?.validation_status || raw?.value?.conceptState?.validation_status
            ),
        };
    });

    const rawEdges = Array.isArray(input?.edges) ? input.edges : [];
    const edges: CDGEdge[] = [];
    for (let i = 0; i < rawEdges.length; i += 1) {
        const raw = rawEdges[i] || {};
        const from = typeof raw.from === "string" ? raw.from : "";
        const to = typeof raw.to === "string" ? raw.to : "";
        if (!from || !to || !usedNodeIds.has(from) || !usedNodeIds.has(to)) continue;
        const id = typeof raw.id === "string" && raw.id ? raw.id : `e_${i + 1}`;
        const type: EdgeType = EDGE_TYPES.has(raw.type) ? raw.type : "enable";
        edges.push({
            ...(raw || {}),
            id,
            from,
            to,
            type,
            confidence: clamp01(raw.confidence, 0.7),
        });
    }

    const id = typeof input?.id === "string" ? input.id : "";
    const version = Number.isFinite(Number(input?.version)) ? Number(input.version) : 0;
    return {
        id,
        version,
        nodes,
        edges,
    };
}
