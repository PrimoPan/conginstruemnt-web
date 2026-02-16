import React, { useCallback, useEffect, useState } from "react";
import { ReactFlow, Background, Controls, MiniMap, useEdgesState, useNodesState, Edge, Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { CDG, FlowNodeData, NodeEvidenceFocus } from "../core/type";
import { cdgToFlow } from "../core/graphToFlow";
import { CdgFlowNode } from "./CdgFlowNode";

const nodeTypes = { cdgNode: CdgFlowNode };
function miniMapNodeColor(node: Node<FlowNodeData>) {
    if (node?.data?.toneBorder) return node.data.toneBorder;
    const sev = node?.data?.severity;
    if (sev === "critical") return "#b91c1c";
    if (sev === "high") return "#dc2626";
    if (sev === "medium") return "#d97706";
    if (sev === "low") return "#2563eb";
    if (node?.data?.nodeType === "goal") return "#111827";
    return "#9ca3af";
}

export function FlowPanel(props: {
    graph: CDG;
    onNodeEvidenceHover?: (focus: NodeEvidenceFocus | null) => void;
    onSaveGraph?: (graph: CDG) => Promise<void> | void;
    savingGraph?: boolean;
}) {
    const { graph, onNodeEvidenceHover, onSaveGraph, savingGraph } = props;
    const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowNodeData>>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const [importanceOverrides, setImportanceOverrides] = useState<Record<string, number>>({});
    const [saveError, setSaveError] = useState("");

    const onImportanceChange = useCallback((nodeId: string, value: number) => {
        setImportanceOverrides((prev) => ({ ...prev, [nodeId]: value }));
    }, []);

    useEffect(() => {
        const validIds = new Set((graph.nodes || []).map((n) => n.id));
        setImportanceOverrides((prev) => {
            const next: Record<string, number> = {};
            let changed = false;
            for (const [k, v] of Object.entries(prev)) {
                if (!validIds.has(k)) {
                    changed = true;
                    continue;
                }
                next[k] = v;
            }
            return changed ? next : prev;
        });
    }, [graph.nodes]);

    useEffect(() => {
        const next = cdgToFlow(graph, {
            importanceOverrides,
            onImportanceChange,
        });
        setNodes(next.nodes);
        setEdges(next.edges);
    }, [graph, importanceOverrides, onImportanceChange, setNodes, setEdges]);

    const hasDirtyImportance = (graph.nodes || []).some((n) => {
        const override = importanceOverrides[n.id];
        if (override == null) return false;
        const base = Number(n.importance ?? 0.68);
        return Math.abs(override - base) > 0.001;
    });

    function materializeGraphForSave(): CDG {
        return {
            ...graph,
            nodes: (graph.nodes || []).map((n) => {
                const override = importanceOverrides[n.id];
                if (override == null) return n;
                const v = Math.max(0, Math.min(1, Number(override)));
                return { ...n, importance: v };
            }),
        };
    }

    async function handleSaveClick() {
        if (!onSaveGraph || savingGraph) return;
        if (!hasDirtyImportance) return;
        setSaveError("");
        try {
            await Promise.resolve(onSaveGraph(materializeGraphForSave()));
            setImportanceOverrides({});
        } catch (e: any) {
            setSaveError(e?.message || "保存失败");
        }
    }

    return (
        <div className="Panel">
            <div className="PanelHeader">意图流程图（自动更新）</div>

            <div className="FlowCanvas">
                <div className="FlowToolbar">
                    <button
                        type="button"
                        className="Btn FlowToolbar__save"
                        onClick={handleSaveClick}
                        disabled={!onSaveGraph || !hasDirtyImportance || !!savingGraph}
                    >
                        {savingGraph ? "保存中..." : "保存图修改"}
                    </button>
                </div>
                <ReactFlow
                    key={`${graph.id || "graph"}:${graph.version ?? 0}`}
                    nodes={nodes}
                    edges={edges}
                    defaultEdgeOptions={{ type: "smoothstep" }}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onNodeMouseEnter={(_, node) => {
                        const terms = (node.data?.evidenceIds || [])
                            .map((x) => String(x || "").trim())
                            .filter(Boolean);
                        if (!terms.length) terms.push(String(node.data?.fullLabel || "").trim());
                        onNodeEvidenceHover?.({
                            nodeId: node.id,
                            evidenceTerms: terms.slice(0, 6),
                            sourceMsgIds: node.data?.sourceMsgIds,
                        });
                    }}
                    onNodeMouseLeave={() => onNodeEvidenceHover?.(null)}
                    nodeTypes={nodeTypes}
                    fitView
                    fitViewOptions={{ padding: 0.28, duration: 260 }}
                    nodesConnectable={false}
                    nodesDraggable
                    elementsSelectable={true}
                    panOnDrag={[1, 2]}
                    selectionOnDrag={false}
                    nodeDragThreshold={4}
                    proOptions={{ hideAttribution: true }}
                >
                    <MiniMap
                        pannable
                        zoomable
                        maskColor="rgba(17, 24, 39, 0.07)"
                        nodeColor={miniMapNodeColor}
                        nodeStrokeWidth={2}
                    />
                    <Background />
                    <Controls />
                </ReactFlow>
                {saveError ? <div className="FlowToolbar__error">{saveError}</div> : null}
            </div>
        </div>
    );
}
