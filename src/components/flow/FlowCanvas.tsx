import React from "react";
import {
    Background,
    Connection,
    Controls,
    Edge,
    MiniMap,
    Node,
    ReactFlow,
    useEdgesState,
    useNodesState,
} from "@xyflow/react";
import type { FlowNodeData, NodeEvidenceFocus } from "../../core/type";

function miniMapNodeColor(node: Node<FlowNodeData>) {
    if (node?.data?.toneBorder) return node.data.toneBorder;
    const sev = node?.data?.severity;
    if (sev === "critical") return "#b91c1c";
    if (sev === "high") return "#dc2626";
    if (sev === "medium") return "#d97706";
    if (sev === "low") return "#2563eb";
    if (node?.data?.nodeType === "belief" && node?.data?.layer === "intent") return "#111827";
    return "#9ca3af";
}

export function useFlowState() {
    const [nodes, setNodes, onNodesChange] = useNodesState<Node<FlowNodeData>>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    return { nodes, edges, setNodes, setEdges, onNodesChange, onEdgesChange };
}

export function FlowCanvas(props: {
    graphKey: string;
    canvasMode: "view" | "edit";
    nodes: Node<FlowNodeData>[];
    edges: Edge[];
    nodeTypes: any;
    onNodesChange: ReturnType<typeof useNodesState<Node<FlowNodeData>>>[2];
    onEdgesChange: ReturnType<typeof useEdgesState<Edge>>[2];
    onNodeDragStart: (e: any, node: Node<FlowNodeData>) => void;
    onNodeDragStop: (e: any, node: Node<FlowNodeData>) => void;
    onSelectionDragStart: (e: any, nodes: Node<FlowNodeData>[]) => void;
    onSelectionDragStop: (e: any, nodes: Node<FlowNodeData>[]) => void;
    onConnect: (connection: Connection) => void;
    onNodeClick: (nodeId: string) => void;
    onNodeHover: (focus: NodeEvidenceFocus | null) => void;
    onEdgeClick: (edgeId: string) => void;
    onPaneClick: () => void;
}) {
    return (
        <ReactFlow
            key={props.graphKey}
            nodes={props.nodes}
            edges={props.edges}
            defaultEdgeOptions={{ type: "smoothstep" }}
            onNodesChange={props.onNodesChange}
            onEdgesChange={props.onEdgesChange}
            onNodeDragStart={props.onNodeDragStart}
            onNodeDragStop={props.onNodeDragStop}
            onSelectionDragStart={props.onSelectionDragStart}
            onSelectionDragStop={props.onSelectionDragStop}
            onConnect={props.onConnect}
            onNodeClick={(_, node) => props.onNodeClick(node.id)}
            onNodeMouseEnter={(_, node) => {
                const terms = (node.data?.evidenceIds || [])
                    .map((x) => String(x || "").trim())
                    .filter(Boolean);
                if (!terms.length) terms.push(String(node.data?.fullLabel || "").trim());
                props.onNodeHover({
                    nodeId: node.id,
                    evidenceTerms: terms.slice(0, 6),
                    sourceMsgIds: node.data?.sourceMsgIds,
                });
            }}
            onNodeMouseLeave={() => props.onNodeHover(null)}
            onEdgeClick={(_, edge) => props.onEdgeClick(edge.id)}
            onPaneClick={props.onPaneClick}
            nodeTypes={props.nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.28, duration: 260 }}
            nodesConnectable={props.canvasMode === "edit"}
            nodesDraggable={props.canvasMode === "edit"}
            elementsSelectable
            panOnDrag
            selectionOnDrag={false}
            nodeDragThreshold={12}
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
    );
}
