import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@xyflow/react/dist/style.css";
import type { CDG, CDGNode, EdgeType, NodeEvidenceFocus } from "../core/type";
import { cdgToFlow } from "../core/graphToFlow";
import { CdgFlowNode } from "./CdgFlowNode";
import { FlowCanvas, useFlowState } from "./flow/FlowCanvas";
import { FlowInspector } from "./flow/FlowInspector";
import { FlowToolbar } from "./flow/FlowToolbar";
import {
    EDITABLE_PARENT_EDGE_TYPES,
    collectSubtree,
    ensureNodeUi,
    findDropParent,
    hasPath,
    newEdgeId,
    newNodeId,
    normalize01,
    parseJsonValue,
    pickRootGoalId,
} from "./flow/graphDraftUtils";

const nodeTypes = { cdgNode: CdgFlowNode };

export function FlowPanel(props: {
    graph: CDG;
    generatingGraph?: boolean;
    onNodeEvidenceHover?: (focus: NodeEvidenceFocus | null) => void;
    onSaveGraph?: (
        graph: CDG,
        opts?: { requestAdvice?: boolean; advicePrompt?: string }
    ) => Promise<void> | void;
    savingGraph?: boolean;
}) {
    const { graph, generatingGraph, onNodeEvidenceHover, onSaveGraph, savingGraph } = props;
    const [draftGraph, setDraftGraph] = useState<CDG>(graph);
    const [dirty, setDirty] = useState(false);
    const [selectedNodeId, setSelectedNodeId] = useState<string>("");
    const [selectedEdgeId, setSelectedEdgeId] = useState<string>("");
    const [saveError, setSaveError] = useState("");
    const dragStartRef = useRef<Record<string, { x: number; y: number }>>({});

    const { nodes, edges, setNodes, setEdges, onNodesChange, onEdgesChange } = useFlowState();

    useEffect(() => {
        setDraftGraph(graph);
        setDirty(false);
        setSelectedNodeId("");
        setSelectedEdgeId("");
        setSaveError("");
    }, [graph]);

    const updateDraftGraph = useCallback((updater: (prev: CDG) => CDG) => {
        setDraftGraph((prev) => updater(prev));
        setDirty(true);
    }, []);

    const onNodePatch = useCallback(
        (nodeId: string, patch: Partial<CDGNode>) => {
            updateDraftGraph((prev) => ({
                ...prev,
                nodes: (prev.nodes || []).map((n) => {
                    if (n.id !== nodeId) return n;
                    const hasValuePatch = Object.prototype.hasOwnProperty.call(patch, "value");
                    return {
                        ...n,
                        ...patch,
                        confidence:
                            patch.confidence != null
                                ? normalize01(patch.confidence, n.confidence ?? 0.6)
                                : n.confidence,
                        importance:
                            patch.importance != null
                                ? normalize01(patch.importance, n.importance ?? 0.68)
                                : n.importance,
                        value: hasValuePatch ? parseJsonValue(patch.value) : n.value,
                    };
                }),
            }));
        },
        [updateDraftGraph]
    );

    const onImportanceChange = useCallback(
        (nodeId: string, value: number) => onNodePatch(nodeId, { importance: value }),
        [onNodePatch]
    );

    useEffect(() => {
        const flow = cdgToFlow(draftGraph, { onNodePatch, onImportanceChange });
        setNodes(flow.nodes);
        setEdges(flow.edges);
    }, [draftGraph, onImportanceChange, onNodePatch, setEdges, setNodes]);

    const selectedNode = useMemo(
        () => (draftGraph.nodes || []).find((n) => n.id === selectedNodeId) || null,
        [draftGraph.nodes, selectedNodeId]
    );
    const selectedEdge = useMemo(
        () => (draftGraph.edges || []).find((e) => e.id === selectedEdgeId) || null,
        [draftGraph.edges, selectedEdgeId]
    );

    const patchEdgeType = useCallback(
        (edgeId: string, edgeType: EdgeType) => {
            updateDraftGraph((prev) => ({
                ...prev,
                edges: (prev.edges || []).map((e) => (e.id === edgeId ? { ...e, type: edgeType } : e)),
            }));
        },
        [updateDraftGraph]
    );

    const deleteNodeSubtree = useCallback(
        (nodeId: string) => {
            if (!nodeId) return;
            updateDraftGraph((prev) => {
                const dropIds = collectSubtree(nodeId, prev.edges || []);
                return {
                    ...prev,
                    nodes: (prev.nodes || []).filter((n) => !dropIds.has(n.id)),
                    edges: (prev.edges || []).filter((e) => !dropIds.has(e.from) && !dropIds.has(e.to)),
                };
            });
            setSelectedNodeId("");
            setSelectedEdgeId("");
        },
        [updateDraftGraph]
    );

    const addNode = useCallback(() => {
        let createdId = "";
        updateDraftGraph((prev) => {
            const parentId = selectedNodeId || pickRootGoalId(prev) || "";
            const selectedPos = nodes.find((n) => n.id === selectedNodeId)?.position;
            const maxX = nodes.reduce((acc, n) => Math.max(acc, Number(n.position?.x) || 0), 120);
            const yBase = selectedPos?.y ?? 220;
            const xBase = selectedPos ? selectedPos.x + 340 : maxX + 300;
            const id = newNodeId();
            createdId = id;
            const node: CDGNode = {
                id,
                type: "fact",
                layer: "requirement",
                statement: "新节点：请编辑",
                status: "proposed",
                confidence: 0.72,
                importance: 0.66,
                value: { ui: { x: Math.round(xBase), y: Math.round(yBase) } },
            };
            const nextEdges = [...(prev.edges || [])];
            if (parentId && prev.nodes.some((n) => n.id === parentId)) {
                nextEdges.push({
                    id: newEdgeId(),
                    from: parentId,
                    to: id,
                    type: "enable",
                    confidence: 0.72,
                });
            }
            return { ...prev, nodes: [...(prev.nodes || []), node], edges: nextEdges };
        });
        if (createdId) setSelectedNodeId(createdId);
        setSelectedEdgeId("");
    }, [nodes, selectedNodeId, updateDraftGraph]);

    const onNodeDragStart = useCallback((_: any, node: any) => {
        dragStartRef.current[node.id] = { x: node.position.x, y: node.position.y };
    }, []);

    const onNodeDragStop = useCallback(
        (_: any, dragged: any) => {
            const start = dragStartRef.current[dragged.id];
            delete dragStartRef.current[dragged.id];
            const moveDist = start
                ? Math.hypot(dragged.position.x - start.x, dragged.position.y - start.y)
                : 999;
            if (moveDist < 6) return;

            const droppedParentId = moveDist > 24 ? findDropParent(dragged, nodes) : null;
            updateDraftGraph((prev) => {
                const nextNodes = (prev.nodes || []).map((n) =>
                    n.id === dragged.id ? ensureNodeUi(n, dragged.position.x, dragged.position.y) : n
                );

                if (!droppedParentId || droppedParentId === dragged.id) {
                    return { ...prev, nodes: nextNodes };
                }

                const incomingRemoved = (prev.edges || []).filter(
                    (e) => !(e.to === dragged.id && EDITABLE_PARENT_EDGE_TYPES.includes(e.type))
                );
                const already = incomingRemoved.some((e) => e.from === droppedParentId && e.to === dragged.id);
                if (!already) {
                    if (hasPath(dragged.id, droppedParentId, incomingRemoved)) {
                        return { ...prev, nodes: nextNodes };
                    }
                    incomingRemoved.push({
                        id: newEdgeId(),
                        from: droppedParentId,
                        to: dragged.id,
                        type: "enable",
                        confidence: 0.86,
                    });
                }
                return { ...prev, nodes: nextNodes, edges: incomingRemoved };
            });
        },
        [nodes, updateDraftGraph]
    );

    const saveGraph = useCallback(async () => {
        if (!onSaveGraph || savingGraph || !dirty) return;
        setSaveError("");
        try {
            await Promise.resolve(
                onSaveGraph(draftGraph, {
                    requestAdvice: true,
                    advicePrompt:
                        "用户已手动编辑意图流程图，请把该图视为最新真值，结合已有对话给出下一步可执行建议（先行动方案，再1-2个关键问题）。",
                })
            );
            setDirty(false);
        } catch (e: any) {
            setSaveError(e?.message || "保存失败");
        }
    }, [dirty, draftGraph, onSaveGraph, savingGraph]);

    return (
        <div className="Panel">
            <div className="PanelHeader">
                <span>{generatingGraph ? "意图分析图生成中" : "意图流程图（可编辑）"}</span>
            </div>
            <div className="FlowCanvas">
                <FlowToolbar
                    onAddNode={addNode}
                    onSave={saveGraph}
                    canSave={!!onSaveGraph && dirty}
                    saving={!!savingGraph}
                    dirty={dirty}
                    generating={!!generatingGraph}
                />

                <FlowInspector
                    node={selectedNode}
                    edge={selectedEdge}
                    onPatchNode={onNodePatch}
                    onPatchEdgeType={patchEdgeType}
                    onDeleteNodeSubtree={deleteNodeSubtree}
                />

                <FlowCanvas
                    graphKey={`${draftGraph.id || "graph"}:${draftGraph.version ?? 0}`}
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onNodeDragStart={onNodeDragStart}
                    onNodeDragStop={onNodeDragStop}
                    onNodeClick={(nodeId) => {
                        setSelectedNodeId(nodeId);
                        setSelectedEdgeId("");
                    }}
                    onNodeHover={(focus) => onNodeEvidenceHover?.(focus)}
                    onEdgeClick={(edgeId) => {
                        setSelectedEdgeId(edgeId);
                        setSelectedNodeId("");
                    }}
                    onPaneClick={() => {
                        setSelectedEdgeId("");
                        setSelectedNodeId("");
                        onNodeEvidenceHover?.(null);
                    }}
                />
                {saveError ? <div className="FlowToolbar__error">{saveError}</div> : null}
            </div>
        </div>
    );
}
