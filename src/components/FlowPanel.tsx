import React from "react";
import { ReactFlow, Background, Controls } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { CDG } from "../core/type";
import { cdgToFlow } from "../core/graphToFlow";

export function FlowPanel({ graph }: { graph: CDG }) {
    const { nodes, edges } = cdgToFlow(graph);

    return (
        <div className="Panel">
            <div className="PanelHeader">意图流程图（自动更新）</div>

            <div style={{ height: "calc(100% - 44px)" }}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    fitView
                    nodesConnectable={false}
                    elementsSelectable={true}
                >
                    <Background />
                    <Controls />
                </ReactFlow>
            </div>
        </div>
    );
}
