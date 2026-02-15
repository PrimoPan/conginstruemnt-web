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

const PRIMARY_SLOT_KEYS = new Set<string>([
    "slot:people",
    "slot:destination",
    "slot:duration",
    "slot:budget",
]);

type SemanticLane =
    | "goal"
    | "health"
    | "people"
    | "destination"
    | "duration"
    | "budget"
    | "lodging"
    | "preference_slot"
    | "constraint_high"
    | "constraint"
    | "preference"
    | "fact"
    | "belief"
    | "question"
    | "other";

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

function slotKeyOfNode(node: CDGNode): string | null {
    const s = cleanStatement(node.statement || "");
    if (!s) return null;

    if (node.type === "goal") return "slot:goal";
    if (node.type === "constraint" && /^预算(?:上限)?[:：]\s*[0-9]{2,}\s*元?$/.test(s)) return "slot:budget";
    if (node.type === "constraint" && /^行程时长[:：]\s*[0-9]{1,3}\s*天$/.test(s)) return "slot:duration";
    if (node.type === "fact" && /^同行人数[:：]\s*[0-9]{1,3}\s*人$/.test(s)) return "slot:people";
    if (node.type === "fact" && /^目的地[:：]\s*.+$/.test(s)) return "slot:destination";
    if ((node.type === "preference" || node.type === "constraint") && /^景点偏好[:：]\s*.+$/.test(s)) return "slot:scenic_preference";
    if (
        (node.type === "preference" || node.type === "constraint") &&
        (/^(住宿偏好|酒店偏好|住宿标准|酒店标准)[:：]/.test(s) ||
            /(全程|尽量|优先).{0,8}(住|入住).{0,8}(酒店|民宿|星级)/.test(s) ||
            /(五星|四星|三星).{0,6}(酒店)/.test(s))
    ) {
        return "slot:lodging";
    }
    if (node.type === "constraint" && /心脏|心肺|冠心|心血管|高血压|糖尿病|哮喘|慢性病|老人|不能爬山|不能久走|急救|cardiac|heart|health/i.test(s)) {
        return "slot:health";
    }
    return null;
}

function laneForSlot(slot: string | null): SemanticLane {
    if (slot === "slot:people") return "people";
    if (slot === "slot:destination") return "destination";
    if (slot === "slot:duration") return "duration";
    if (slot === "slot:budget") return "budget";
    if (slot === "slot:lodging") return "lodging";
    if (slot === "slot:scenic_preference") return "preference_slot";
    if (slot === "slot:health") return "health";
    return "other";
}

function laneForNode(node: CDGNode, slot: string | null): SemanticLane {
    if (slot) return laneForSlot(slot);
    if (node.type === "constraint") {
        if (severityScore(node.severity) >= 3) return "constraint_high";
        return "constraint";
    }
    if (node.type === "preference") return "preference";
    if (node.type === "fact") return "fact";
    if (node.type === "belief") return "belief";
    if (node.type === "question") return "question";
    return "other";
}

function laneOrder(level: number): SemanticLane[] {
    if (level === 0) return ["goal"];
    if (level === 1) {
        return ["people", "destination", "duration", "budget"];
    }
    return [
        "health",
        "constraint_high",
        "constraint",
        "lodging",
        "preference_slot",
        "preference",
        "fact",
        "belief",
        "question",
        "other",
    ];
}

function relationMaps(edges: CDGEdge[]) {
    const outgoing = new Map<string, CDGEdge[]>();
    const incoming = new Map<string, CDGEdge[]>();

    for (const e of edges || []) {
        if (!outgoing.has(e.from)) outgoing.set(e.from, []);
        if (!incoming.has(e.to)) incoming.set(e.to, []);
        outgoing.get(e.from)!.push(e);
        incoming.get(e.to)!.push(e);
    }

    return { outgoing, incoming };
}

function deriveSemanticMeta(graph: CDG) {
    const rootId = pickRootGoalId(graph);
    const slotByNodeId = new Map<string, string | null>();
    const slotNodeId = new Map<string, string>();

    for (const n of graph.nodes || []) {
        const slot = slotKeyOfNode(n);
        slotByNodeId.set(n.id, slot);
        if (slot && !slotNodeId.has(slot)) slotNodeId.set(slot, n.id);
    }

    const { outgoing, incoming } = relationMaps(graph.edges || []);
    const levelById = new Map<string, number>();
    const laneById = new Map<string, SemanticLane>();

    const healthId = slotNodeId.get("slot:health") || null;

    for (const n of graph.nodes || []) {
        const slot = slotByNodeId.get(n.id) || null;

        if (rootId && n.id === rootId) {
            levelById.set(n.id, 0);
            laneById.set(n.id, "goal");
            continue;
        }

        if (slot && PRIMARY_SLOT_KEYS.has(slot)) {
            levelById.set(n.id, 1);
            laneById.set(n.id, laneForSlot(slot));
            continue;
        }

        if (slot === "slot:health") {
            levelById.set(n.id, 2);
            laneById.set(n.id, "health");
            continue;
        }

        const out = outgoing.get(n.id) || [];
        const inn = incoming.get(n.id) || [];

        const toHealth = healthId ? out.some((e) => e.to === healthId) : false;
        const toPrimary = out.some((e) => {
            const toSlot = slotByNodeId.get(e.to) || null;
            return !!toSlot && PRIMARY_SLOT_KEYS.has(toSlot);
        });
        const toRoot = !!rootId && out.some((e) => e.to === rootId);
        const fromPrimary = inn.some((e) => {
            const fromSlot = slotByNodeId.get(e.from) || null;
            return !!fromSlot && PRIMARY_SLOT_KEYS.has(fromSlot);
        });

        let level = 3;
        if (!rootId) {
            level = slot ? 1 : 2;
        } else if (toPrimary || toRoot || fromPrimary) {
            level = 2;
        } else if (toHealth) {
            level = 3;
        }

        levelById.set(n.id, level);
        laneById.set(n.id, laneForNode(n, slot));
    }

    return { rootId, levelById, laneById };
}

function computePositions(graph: CDG) {
    const positions = new Map<string, { x: number; y: number }>();
    const { rootId, levelById, laneById } = deriveSemanticMeta(graph);

    const rootX = 90;
    const rootY = 340;
    const levelGap = 370;
    const laneGap = 225;
    const rowGap = 146;
    const maxRowsPerColumn = 4;

    if (rootId) positions.set(rootId, { x: rootX, y: rootY });

    const maxLevel = Math.max(...Array.from(levelById.values()), rootId ? 0 : 1);

    for (let level = rootId ? 1 : 0; level <= maxLevel; level += 1) {
        const levelNodes = (graph.nodes || []).filter((n) => {
            const lv = levelById.get(n.id);
            if (lv == null) return false;
            if (rootId && n.id === rootId) return false;
            return lv === level;
        });
        if (!levelNodes.length) continue;

        const byLane = new Map<SemanticLane, CDGNode[]>();
        for (const n of levelNodes) {
            const lane = laneById.get(n.id) || "other";
            if (!byLane.has(lane)) byLane.set(lane, []);
            byLane.get(lane)!.push(n);
        }

        const orderedLanes = laneOrder(level).filter((lane) => byLane.has(lane));
        for (const lane of Array.from(byLane.keys())) {
            if (!orderedLanes.includes(lane)) orderedLanes.push(lane);
        }

        let laneCursor = 0;
        for (const lane of orderedLanes) {
            const laneNodes = (byLane.get(lane) || []).slice().sort((a, b) => {
                const bySeverity = severityScore(b.severity) - severityScore(a.severity);
                if (bySeverity !== 0) return bySeverity;
                const byImportance = (Number(b.importance) || 0) - (Number(a.importance) || 0);
                if (byImportance !== 0) return byImportance;
                const byType = (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9);
                if (byType !== 0) return byType;
                return cleanStatement(a.statement).localeCompare(cleanStatement(b.statement));
            });

            const cols = Math.max(1, Math.ceil(laneNodes.length / maxRowsPerColumn));
            for (let col = 0; col < cols; col += 1) {
                const chunk = laneNodes.slice(col * maxRowsPerColumn, (col + 1) * maxRowsPerColumn);
                const x = rootX + level * levelGap + (laneCursor + col) * laneGap;
                const yStart = rootY - ((chunk.length - 1) * rowGap) / 2;
                for (let row = 0; row < chunk.length; row += 1) {
                    const n = chunk[row];
                    positions.set(n.id, {
                        x,
                        y: yStart + row * rowGap,
                    });
                }
            }
            laneCursor += cols;
        }
    }

    for (const n of graph.nodes || []) {
        if (!positions.has(n.id)) {
            positions.set(n.id, { x: rootX + levelGap * 2, y: rootY });
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
        const showLabel = e.type === "constraint" || e.type === "conflicts_with";
        return {
            id: e.id,
            source: e.from,
            target: e.to,
            label: showLabel ? e.type : undefined,
            type: "smoothstep",
            pathOptions: { borderRadius: 16, offset: 14 },
            style: {
                strokeWidth: e.type === "constraint" ? 2.05 : 1.4,
                stroke,
                opacity: e.type === "determine" ? 0.72 : 0.9,
            },
            markerEnd: {
                type: MarkerType.ArrowClosed,
                color: stroke,
                width: 15,
                height: 15,
            },
            labelStyle: { fill: "#374151", fontSize: 11 },
            labelBgPadding: [5, 3],
            labelBgBorderRadius: 6,
            labelBgStyle: { fill: "rgba(255,255,255,0.88)", fillOpacity: 0.88 },
            animated: false,
        };
    });

    return { nodes, edges };
}
