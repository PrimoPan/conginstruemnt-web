import React, { useEffect } from "react";
import { ReactFlow, Background, Controls, MiniMap, useEdgesState, useNodesState, Edge, Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { CDG, FlowNodeData, NodeEvidenceFocus } from "../core/type";
import { cdgToFlow } from "../core/graphToFlow";
import { CdgFlowNode } from "./CdgFlowNode";

const nodeTypes = { cdgNode: CdgFlowNode };
function miniMapNodeColor(node: Node<FlowNodeData>) {
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
}) {
    const { graph, onNodeEvidenceHover } = props;
    const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowNodeData>>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

    useEffect(() => {
        const next = cdgToFlow(graph);
        setNodes(next.nodes);
        setEdges(next.edges);
    }, [graph, setNodes, setEdges]);

    return (
        <div className="Panel">
            <div className="PanelHeader">意图流程图（自动更新）</div>

            <div className="FlowCanvas">
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
            </div>
        </div>
    );
}
