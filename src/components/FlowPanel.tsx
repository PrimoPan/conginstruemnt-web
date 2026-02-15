import React, { useEffect } from "react";
import { ReactFlow, Background, Controls, useEdgesState, useNodesState, Edge, Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { CDG, FlowNodeData, NodeEvidenceFocus } from "../core/type";
import { cdgToFlow } from "../core/graphToFlow";
import { CdgFlowNode } from "./CdgFlowNode";

const nodeTypes = { cdgNode: CdgFlowNode };

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

            <div style={{ height: "calc(100% - 44px)" }}>
                <ReactFlow
                    key={`${graph.id || "graph"}:${graph.version ?? 0}`}
                    nodes={nodes}
                    edges={edges}
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
                    fitViewOptions={{ padding: 0.2, duration: 240 }}
                    nodesConnectable={false}
                    nodesDraggable
                    elementsSelectable={true}
                >
                    <Background />
                    <Controls />
                </ReactFlow>
            </div>
        </div>
    );
}
