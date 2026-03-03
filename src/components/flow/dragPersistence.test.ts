import type { Node } from "@xyflow/react";
import type { CDG, FlowNodeData } from "../../core/type";
import { makeDragStartSnapshot, persistDraggedNodePositions, pickMovedNodes } from "./dragPersistence";

function flowNode(id: string, x: number, y: number): Node<FlowNodeData> {
    return {
        id,
        type: "cdgNode",
        position: { x, y },
        data: {
            shortLabel: id,
            fullLabel: id,
            meta: "",
            rawNode: {
                id,
                type: "factual_assertion",
                statement: id,
                status: "proposed",
                confidence: 0.7,
            },
            nodeType: "factual_assertion",
        },
    };
}

function baseGraph(): CDG {
    return {
        id: "g",
        version: 1,
        nodes: [
            {
                id: "n1",
                type: "factual_assertion",
                statement: "n1",
                status: "proposed",
                confidence: 0.7,
                value: { ui: { x: 10, y: 20 } },
            },
            {
                id: "n2",
                type: "factual_assertion",
                statement: "n2",
                status: "proposed",
                confidence: 0.7,
                value: { ui: { x: 30, y: 40 } },
            },
            {
                id: "n3",
                type: "factual_assertion",
                statement: "n3",
                status: "proposed",
                confidence: 0.7,
                value: { ui: { x: 50, y: 60 } },
            },
        ],
        edges: [
            {
                id: "e1",
                from: "n1",
                to: "n2",
                type: "enable",
                confidence: 0.8,
            },
        ],
    };
}

test("pickMovedNodes returns only nodes that exceed movement threshold", () => {
    const snapshot = makeDragStartSnapshot([flowNode("n1", 10, 20), flowNode("n2", 30, 40)]);
    const moved = pickMovedNodes([flowNode("n1", 16, 20), flowNode("n2", 34, 42)], snapshot, 6);
    expect(moved.map((node) => node.id)).toEqual(["n1"]);
});

test("persistDraggedNodePositions persists all moved nodes and keeps edges unchanged", () => {
    const graph = baseGraph();
    const moved = [flowNode("n1", 110, 120), flowNode("n2", 130, 140)];
    const next = persistDraggedNodePositions(graph, moved);
    const uiById = new Map(
        next.nodes.map((node) => [node.id, (node.value as any)?.ui] as const)
    );
    expect(uiById.get("n1")).toEqual({ x: 110, y: 120 });
    expect(uiById.get("n2")).toEqual({ x: 130, y: 140 });
    expect(uiById.get("n3")).toEqual({ x: 50, y: 60 });
    expect(next.edges).toEqual(graph.edges);
});
