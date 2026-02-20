import type { Edge, Node } from "@xyflow/react";
import { MarkerType } from "@xyflow/react";
import type { CDG, CDGEdge, CDGNode, FlowNodeData, NodeLayer, Severity } from "./type";

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

const LAYER_LABEL: Record<NodeLayer, string> = {
    intent: "Intent",
    requirement: "Requirement",
    preference: "Preference",
    risk: "Risk",
};

function slotFamily(slot: string | null): string {
    if (!slot) return "none";
    if (slot.startsWith("slot:destination:")) return "destination";
    if (slot.startsWith("slot:duration_city:")) return "duration_city";
    if (slot.startsWith("slot:meeting_critical:")) return "meeting_critical";
    if (slot.startsWith("slot:constraint:")) return "generic_constraint";
    if (slot === "slot:duration" || slot === "slot:duration_total") return "duration";
    if (slot === "slot:people") return "people";
    if (slot === "slot:budget") return "budget";
    if (slot === "slot:lodging") return "lodging";
    if (slot === "slot:scenic_preference") return "preference_slot";
    if (slot === "slot:health") return "health";
    if (slot === "slot:language") return "language";
    return slot;
}

function isPrimarySlot(slot: string | null) {
    const f = slotFamily(slot);
    return f === "people" || f === "destination" || f === "duration" || f === "budget";
}

type SemanticLane =
    | "goal"
    | "health"
    | "meeting_critical"
    | "language"
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

function readManualPosition(node: CDGNode): { x: number; y: number } | null {
    const ui =
        (node as any)?.value && typeof (node as any).value === "object"
            ? (node as any).value.ui
            : (node as any)?.ui;
    const x = Number(ui?.x);
    const y = Number(ui?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
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

function clamp01(x: any, fallback = 0.68) {
    const n = Number(x);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(1, n));
}

function nodeMeta(node: CDGNode) {
    const parts = [TYPE_LABEL[node.type] || node.type];
    if (node.layer) parts.push(LAYER_LABEL[node.layer] || node.layer);
    if (node.strength) parts.push(node.strength);
    if (typeof node.confidence === "number") parts.push(`c=${node.confidence.toFixed(2)}`);
    if (typeof node.importance === "number") parts.push(`i=${node.importance.toFixed(2)}`);
    return parts.join(" · ");
}

type NodePalette = {
    hue: number;
    sat: number;
};

function paletteForNode(node: CDGNode): NodePalette {
    if (node.layer === "risk" || node.severity === "critical" || node.severity === "high") {
        return { hue: 7, sat: 68 };
    }
    if (node.layer === "intent" || node.type === "goal") {
        return { hue: 214, sat: 52 };
    }
    if (node.layer === "preference" || node.type === "preference") {
        return { hue: 35, sat: 62 };
    }
    if (node.layer === "requirement" || node.type === "constraint") {
        return { hue: 204, sat: 46 };
    }
    if (node.type === "question") {
        return { hue: 266, sat: 38 };
    }
    if (node.type === "belief") {
        return { hue: 188, sat: 40 };
    }
    return { hue: 218, sat: 22 };
}

function paletteToTone(
    palette: NodePalette,
    severity: Severity | undefined,
    importance: number
) {
    const imp = clamp01(importance, 0.68);
    const sevBoost = severity === "critical" ? 0.11 : severity === "high" ? 0.07 : severity === "medium" ? 0.04 : 0;
    const depth = Math.min(1, imp + sevBoost);

    const bgL = 98 - depth * 12;
    const borderL = 84 - depth * 28;
    const badgeL = 96 - depth * 9;
    const shadowAlpha = 0.05 + depth * 0.08;

    const bg = `hsl(${palette.hue} ${palette.sat}% ${bgL}%)`;
    const border = `hsl(${palette.hue} ${palette.sat + 6}% ${borderL}%)`;
    const badgeBg = `hsl(${palette.hue} ${Math.max(16, palette.sat - 14)}% ${badgeL}%)`;
    const badgeBorder = `hsl(${palette.hue} ${Math.max(14, palette.sat - 10)}% ${Math.max(56, borderL - 6)}%)`;
    const handle = `hsl(${palette.hue} ${Math.min(82, palette.sat + 14)}% ${Math.max(34, borderL - 16)}%)`;
    const shadow = `0 1px 10px rgba(17, 24, 39, ${shadowAlpha.toFixed(3)})`;
    return { bg, border, badgeBg, badgeBorder, handle, shadow };
}

function edgeColor(type: string, importance: number) {
    const imp = clamp01(importance, 0.7);
    const alpha = 0.45 + imp * 0.42;
    if (type === "constraint") return `rgba(185, 28, 28, ${alpha.toFixed(3)})`;
    if (type === "conflicts_with") return `rgba(194, 65, 12, ${alpha.toFixed(3)})`;
    if (type === "determine") return `rgba(29, 78, 216, ${(alpha - 0.05).toFixed(3)})`;
    return `rgba(75, 85, 99, ${(alpha - 0.08).toFixed(3)})`;
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
    if (node.type === "constraint" && /^(?:总)?行程时长[:：]\s*[0-9]{1,3}\s*天$/.test(s)) return "slot:duration";
    if (node.type === "constraint" && /^会议时长[:：]\s*[0-9]{1,3}\s*天$/.test(s)) return "slot:duration";
    if ((node.type === "fact" || node.type === "constraint") && /^(?:城市时长|停留时长)[:：]\s*.+\s+[0-9]{1,3}\s*天$/.test(s)) {
        const m = s.match(/^(?:城市时长|停留时长)[:：]\s*(.+?)\s+[0-9]{1,3}\s*天$/);
        const city = cleanStatement(m?.[1] || "");
        if (city) return `slot:duration_city:${city}`;
        return "slot:duration_city:unknown";
    }
    if (node.type === "fact" && /^同行人数[:：]\s*[0-9]{1,3}\s*人$/.test(s)) return "slot:people";
    if (node.type === "fact" && /^目的地[:：]\s*.+$/.test(s)) {
        const m = s.match(/^目的地[:：]\s*(.+)$/);
        const city = cleanStatement(m?.[1] || "");
        if (city) return `slot:destination:${city}`;
        return "slot:destination:unknown";
    }
    if (node.type === "constraint" && /^(?:会议关键日|关键会议日|论文汇报日|关键日)[:：]\s*.+$/.test(s)) {
        const m = s.match(/^(?:会议关键日|关键会议日|论文汇报日|关键日)[:：]\s*(.+)$/);
        const detail = cleanStatement(m?.[1] || "critical");
        return `slot:meeting_critical:${detail || "critical"}`;
    }
    if ((node.type === "preference" || node.type === "constraint") && /^景点偏好[:：]\s*.+$/.test(s)) return "slot:scenic_preference";
    if (
        (node.type === "preference" || node.type === "constraint") &&
        (/^(住宿偏好|酒店偏好|住宿标准|酒店标准)[:：]/.test(s) ||
            /(全程|尽量|优先).{0,8}(住|入住).{0,8}(酒店|民宿|星级)/.test(s) ||
            /(五星|四星|三星).{0,6}(酒店)/.test(s))
    ) {
        return "slot:lodging";
    }
    if (
        node.type === "constraint" &&
        (/^语言约束[:：]\s*.+$/.test(s) ||
            /不会英语|不会英文|英语不好|英文不好|语言不通|语言障碍|翻译|口译|同传|不懂西语|不懂法语|不会当地语言|沟通困难|language barrier|translation|speak english/i.test(s))
    ) {
        return "slot:language";
    }
    if (node.type === "constraint" && /^(关键约束|法律约束|安全约束|出行约束|行程约束)[:：]\s*.+$/.test(s)) {
        const m = s.match(/^(?:关键约束|法律约束|安全约束|出行约束|行程约束)[:：]\s*(.+)$/);
        const detail = cleanStatement(m?.[1] || "constraint");
        return `slot:constraint:${detail || "constraint"}`;
    }
    if (node.type === "constraint" && /心脏|心肺|冠心|心血管|高血压|糖尿病|哮喘|慢性病|老人|不能爬山|不能久走|急救|cardiac|heart|health/i.test(s)) {
        return "slot:health";
    }
    return null;
}

function laneForSlot(slot: string | null): SemanticLane {
    const family = slotFamily(slot);
    if (family === "people") return "people";
    if (family === "destination") return "destination";
    if (family === "duration" || family === "duration_city") return "duration";
    if (family === "budget") return "budget";
    if (family === "lodging") return "lodging";
    if (family === "preference_slot") return "preference_slot";
    if (family === "health") return "health";
    if (family === "meeting_critical") return "meeting_critical";
    if (family === "language") return "language";
    if (family === "generic_constraint") return "constraint_high";
    return "other";
}

function laneForNode(node: CDGNode, slot: string | null): SemanticLane {
    if (slot) return laneForSlot(slot);
    if (node.layer === "risk") return "constraint_high";
    if (node.layer === "preference") return "preference";
    if (node.layer === "intent") return "goal";
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
        "meeting_critical",
        "language",
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

function averageNeighborY(
    nodeId: string,
    adjacency: Map<string, string[]>,
    positions: Map<string, { x: number; y: number }>,
    fallbackY: number
) {
    const neighbors = adjacency.get(nodeId) || [];
    let sum = 0;
    let count = 0;
    for (const nid of neighbors) {
        const p = positions.get(nid);
        if (!p) continue;
        sum += p.y;
        count += 1;
    }
    if (!count) return fallbackY;
    return sum / count;
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
    const meetingNodeIds = Array.from(slotNodeId.entries())
        .filter(([slot]) => slot.startsWith("slot:meeting_critical:"))
        .map(([, id]) => id);
    const riskAnchorIds = [healthId, ...meetingNodeIds].filter(Boolean) as string[];

    for (const n of graph.nodes || []) {
        const slot = slotByNodeId.get(n.id) || null;

        if (rootId && n.id === rootId) {
            levelById.set(n.id, 0);
            laneById.set(n.id, "goal");
            continue;
        }

        if (slot && isPrimarySlot(slot)) {
            levelById.set(n.id, 1);
            laneById.set(n.id, laneForSlot(slot));
            continue;
        }

        if (slot === "slot:health") {
            levelById.set(n.id, 2);
            laneById.set(n.id, "health");
            continue;
        }
        if (slotFamily(slot) === "meeting_critical") {
            levelById.set(n.id, 2);
            laneById.set(n.id, "meeting_critical");
            continue;
        }

        const out = outgoing.get(n.id) || [];
        const inn = incoming.get(n.id) || [];

        const toHealth = riskAnchorIds.length ? out.some((e) => riskAnchorIds.includes(e.to)) : false;
        const toPrimary = out.some((e) => {
            const toSlot = slotByNodeId.get(e.to) || null;
            return !!toSlot && isPrimarySlot(toSlot);
        });
        const toRoot = !!rootId && out.some((e) => e.to === rootId);
        const fromPrimary = inn.some((e) => {
            const fromSlot = slotByNodeId.get(e.from) || null;
            return !!fromSlot && isPrimarySlot(fromSlot);
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
    const edges = graph.edges || [];
    const adjacency = new Map<string, string[]>();
    for (const e of edges) {
        if (!adjacency.has(e.from)) adjacency.set(e.from, []);
        if (!adjacency.has(e.to)) adjacency.set(e.to, []);
        adjacency.get(e.from)!.push(e.to);
        adjacency.get(e.to)!.push(e.from);
    }

    const rootX = 90;
    const rootY = 340;
    const levelGap = 360;
    const laneBandGap = 210;
    const rowGap = 122;
    const columnGap = 205;
    const maxRowsPerColumn = 5;

    for (const n of graph.nodes || []) {
        const pinned = readManualPosition(n);
        if (pinned) positions.set(n.id, pinned);
    }

    if (rootId && !positions.has(rootId)) positions.set(rootId, { x: rootX, y: rootY });

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

        const laneCenterOffset = (orderedLanes.length - 1) / 2;
        for (let laneIdx = 0; laneIdx < orderedLanes.length; laneIdx += 1) {
            const lane = orderedLanes[laneIdx];
            const laneNodes = (byLane.get(lane) || []).slice().sort((a, b) => {
                const ay = averageNeighborY(a.id, adjacency, positions, rootY);
                const by = averageNeighborY(b.id, adjacency, positions, rootY);
                if (ay !== by) return ay - by;
                const bySeverity = severityScore(b.severity) - severityScore(a.severity);
                if (bySeverity !== 0) return bySeverity;
                const byImportance = (Number(b.importance) || 0) - (Number(a.importance) || 0);
                if (byImportance !== 0) return byImportance;
                const byType = (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9);
                if (byType !== 0) return byType;
                return cleanStatement(a.statement).localeCompare(cleanStatement(b.statement));
            });

            const freeNodes = laneNodes.filter((n) => !positions.has(n.id));
            if (!freeNodes.length) continue;

            const cols = Math.max(1, Math.ceil(freeNodes.length / maxRowsPerColumn));
            const laneCenterY = rootY + (laneIdx - laneCenterOffset) * laneBandGap;
            for (let col = 0; col < cols; col += 1) {
                const chunk = freeNodes.slice(col * maxRowsPerColumn, (col + 1) * maxRowsPerColumn);
                const x = rootX + level * levelGap + col * columnGap;
                const yStart = laneCenterY - ((chunk.length - 1) * rowGap) / 2;
                for (let row = 0; row < chunk.length; row += 1) {
                    const n = chunk[row];
                    positions.set(n.id, {
                        x,
                        y: yStart + row * rowGap,
                    });
                }
            }
        }
    }

    for (const n of graph.nodes || []) {
        if (!positions.has(n.id)) {
            positions.set(n.id, { x: rootX + levelGap * 2, y: rootY });
        }
    }

    return positions;
}

export function cdgToFlow(
    graph: CDG,
    opts?: {
        importanceOverrides?: Record<string, number>;
        onImportanceChange?: (nodeId: string, value: number) => void;
        onNodePatch?: (nodeId: string, patch: Partial<CDGNode>) => void;
    }
): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
    const safeNodes = (graph.nodes || []).filter((n): n is CDGNode => {
        if (!n || typeof n.id !== "string" || !n.id.trim()) return false;
        // Hide low-importance rejected slots by default to keep the graph readable.
        if (n.status === "rejected" && !n.locked && clamp01(n.importance, 0.3) <= 0.35) return false;
        return true;
    });
    const safeNodeIdSet = new Set(safeNodes.map((n) => n.id));
    const safeEdges = (graph.edges || []).filter(
        (e): e is CDGEdge =>
            !!e &&
            typeof e.id === "string" &&
            !!e.id &&
            typeof e.from === "string" &&
            typeof e.to === "string" &&
            safeNodeIdSet.has(e.from) &&
            safeNodeIdSet.has(e.to)
    );
    const safeGraph: CDG = { ...graph, nodes: safeNodes, edges: safeEdges };
    const positions = computePositions(safeGraph);
    const nodeById = new Map(safeNodes.map((n) => [n.id, n]));
    const overrides = opts?.importanceOverrides || {};

    const nodes: Node<FlowNodeData>[] = safeNodes.map((n) => {
        const statement = cleanStatement(n.statement || n.id);
        const fullLabel = statement || n.id;
        const shortLabel = shorten(fullLabel);
        const baseImportance = clamp01(n.importance, 0.68);
        const effectiveImportance = clamp01(overrides[n.id], baseImportance);
        const tone = paletteToTone(paletteForNode(n), n.severity, effectiveImportance);
        return {
            id: n.id,
            type: "cdgNode",
            position: positions.get(n.id) || { x: 120, y: 120 },
            data: {
                shortLabel,
                fullLabel,
                meta: nodeMeta(n),
                rawNode: n,
                nodeType: n.type,
                layer: n.layer,
                severity: n.severity,
                importance: effectiveImportance,
                confidence: n.confidence,
                status: n.status,
                strength: n.strength,
                locked: n.locked,
                key: n.key,
                value: n.value,
                baseImportance,
                tags: n.tags,
                evidenceIds: n.evidenceIds,
                sourceMsgIds: n.sourceMsgIds,
                toneBg: tone.bg,
                toneBorder: tone.border,
                toneBadgeBg: tone.badgeBg,
                toneBadgeBorder: tone.badgeBorder,
                toneHandle: tone.handle,
                toneShadow: tone.shadow,
                onImportanceChange: opts?.onImportanceChange,
                onNodePatch: opts?.onNodePatch,
            },
        };
    });

    const edges: Edge[] = safeEdges.map((e) => {
        const fromNode = nodeById.get(e.from);
        const toNode = nodeById.get(e.to);
        const fromImportance = clamp01(overrides[e.from], clamp01(fromNode?.importance, 0.68));
        const toImportance = clamp01(overrides[e.to], clamp01(toNode?.importance, 0.68));
        const edgeImportance = Math.max(fromImportance, toImportance, 0.58);
        const stroke = edgeColor(e.type, edgeImportance);
        const showLabel = e.type === "constraint" || e.type === "conflicts_with";
        return {
            id: e.id,
            source: e.from,
            target: e.to,
            label: showLabel ? e.type : undefined,
            type: "smoothstep",
            pathOptions: { borderRadius: 16, offset: 14 },
            style: {
                strokeWidth: (e.type === "constraint" ? 1.95 : 1.35) + edgeImportance * 0.7,
                stroke,
                opacity: e.type === "determine" ? 0.74 : 0.92,
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
