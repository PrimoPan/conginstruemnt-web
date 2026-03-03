import type { Node } from "@xyflow/react";
import type { CDG, FlowNodeData } from "../../core/type";
import { ensureNodeUi } from "./graphDraftUtils";

export type DragStartSnapshot = Record<string, { x: number; y: number }>;

export function makeDragStartSnapshot(nodes: Array<Node<FlowNodeData>>): DragStartSnapshot {
    const snapshot: DragStartSnapshot = {};
    for (const node of nodes || []) {
        snapshot[node.id] = { x: node.position.x, y: node.position.y };
    }
    return snapshot;
}

export function pickMovedNodes(
    nodes: Array<Node<FlowNodeData>>,
    dragStart: DragStartSnapshot,
    moveThreshold = 6
): Array<Node<FlowNodeData>> {
    const moved: Array<Node<FlowNodeData>> = [];
    for (const node of nodes || []) {
        const start = dragStart[node.id];
        const distance = start ? Math.hypot(node.position.x - start.x, node.position.y - start.y) : Infinity;
        if (distance >= moveThreshold) moved.push(node);
    }
    return moved;
}

export function persistDraggedNodePositions(graph: CDG, movedNodes: Array<Node<FlowNodeData>>): CDG {
    if (!movedNodes.length) return graph;
    const byId = new Map<string, { x: number; y: number }>();
    for (const node of movedNodes) byId.set(node.id, node.position);
    let changed = false;
    const nextNodes = (graph.nodes || []).map((node) => {
        const pos = byId.get(node.id);
        if (!pos) return node;
        changed = true;
        return ensureNodeUi(node, pos.x, pos.y);
    });
    if (!changed) return graph;
    return {
        ...graph,
        nodes: nextNodes,
    };
}
