import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@xyflow/react/dist/style.css";
import type { CDG, CDGNode, EdgeType, NodeEvidenceFocus } from "../core/type";
import { cdgToFlow } from "../core/graphToFlow";
import { normalizeGraphClient } from "../core/graphSafe";
import { CdgFlowNode } from "./CdgFlowNode";
import { FlowCanvas, useFlowState } from "./flow/FlowCanvas";
import { FlowInspector } from "./flow/FlowInspector";
import { FlowToolbar } from "./flow/FlowToolbar";
import {
    EDITABLE_PARENT_EDGE_TYPES,
    deleteNodeAndReconnect,
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

function readUiPosition(node: CDGNode | null | undefined): { x: number; y: number } | null {
    const raw = (node as any)?.value?.ui;
    const x = Number(raw?.x);
    const y = Number(raw?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x: Math.round(x), y: Math.round(y) };
}

function mergeIncomingGraphWithLocalUi(incoming: CDG, local: CDG): CDG {
    const uiById = new Map<string, { x: number; y: number }>();
    for (const n of local.nodes || []) {
        const pos = readUiPosition(n);
        if (pos) uiById.set(n.id, pos);
    }
    if (!uiById.size) return incoming;

    let changed = false;
    const nodes = (incoming.nodes || []).map((n) => {
        if (readUiPosition(n)) return n;
        const pos = uiById.get(n.id);
        if (!pos) return n;
        changed = true;
        const baseValue =
            n.value && typeof n.value === "object" && !Array.isArray(n.value)
                ? (n.value as Record<string, any>)
                : {};
        return {
            ...n,
            value: {
                ...baseValue,
                ui: pos,
            },
        };
    });
    if (!changed) return incoming;
    return {
        ...incoming,
        nodes,
    };
}

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
    const [draftGraph, setDraftGraph] = useState<CDG>(normalizeGraphClient(graph));
    const [dirty, setDirty] = useState(false);
    const [selectedNodeId, setSelectedNodeId] = useState<string>("");
    const [selectedEdgeId, setSelectedEdgeId] = useState<string>("");
    const [saveError, setSaveError] = useState("");
    const dragStartRef = useRef<Record<string, { x: number; y: number }>>({});
    const draftGraphRef = useRef<CDG>(normalizeGraphClient(graph));
    const draftRevisionRef = useRef(0);
    const autoPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const { nodes, edges, setNodes, setEdges, onNodesChange, onEdgesChange } = useFlowState();

    useEffect(() => {
        const normalized = normalizeGraphClient(graph);
        const merged = mergeIncomingGraphWithLocalUi(normalized, draftGraphRef.current);
        setDraftGraph(merged);
        draftGraphRef.current = merged;
        draftRevisionRef.current = 0;
        setDirty(false);
        setSelectedNodeId("");
        setSelectedEdgeId("");
        setSaveError("");
    }, [graph]);

    useEffect(() => {
        draftGraphRef.current = draftGraph;
    }, [draftGraph]);

    useEffect(() => {
        return () => {
            if (autoPersistTimerRef.current) {
                clearTimeout(autoPersistTimerRef.current);
                autoPersistTimerRef.current = null;
            }
        };
    }, []);

    const updateDraftGraph = useCallback((updater: (prev: CDG) => CDG) => {
        setDraftGraph((prev) => {
            const next = updater(prev);
            draftGraphRef.current = next;
            draftRevisionRef.current += 1;
            return next;
        });
        setDirty(true);
    }, []);

    const scheduleAutoPersist = useCallback(
        (nextGraph: CDG, revision: number) => {
            if (!onSaveGraph) return;
            if (autoPersistTimerRef.current) clearTimeout(autoPersistTimerRef.current);
            autoPersistTimerRef.current = setTimeout(async () => {
                try {
                    await Promise.resolve(onSaveGraph(nextGraph, { requestAdvice: false }));
                    if (draftRevisionRef.current === revision) {
                        setDirty(false);
                    }
                } catch {
                    // Keep dirty=true and let user manually retry save.
                }
            }, 700);
        },
        [onSaveGraph]
    );

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

    const deleteNode = useCallback(
        (nodeId: string) => {
            if (!nodeId) return;
            updateDraftGraph((prev) => {
                return deleteNodeAndReconnect(prev, nodeId);
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

    const onNodeDragStart = useCallback((evt: any, node: any) => {
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
            const prev = draftGraphRef.current;
            const nextNodes = (prev.nodes || []).map((n) =>
                    n.id === dragged.id ? ensureNodeUi(n, dragged.position.x, dragged.position.y) : n
                );

            let nextGraph: CDG = { ...prev, nodes: nextNodes };
            if (droppedParentId && droppedParentId !== dragged.id) {
                const incomingRemoved = (prev.edges || []).filter(
                    (e) => !(e.to === dragged.id && EDITABLE_PARENT_EDGE_TYPES.includes(e.type))
                );
                const already = incomingRemoved.some((e) => e.from === droppedParentId && e.to === dragged.id);
                if (!already) {
                    if (!hasPath(dragged.id, droppedParentId, incomingRemoved)) {
                        incomingRemoved.push({
                            id: newEdgeId(),
                            from: droppedParentId,
                            to: dragged.id,
                            type: "enable",
                            confidence: 0.86,
                        });
                    }
                }
                nextGraph = { ...prev, nodes: nextNodes, edges: incomingRemoved };
            }

            const nextRevision = draftRevisionRef.current + 1;
            draftRevisionRef.current = nextRevision;
            draftGraphRef.current = nextGraph;
            setDraftGraph(nextGraph);
            setDirty(true);
            scheduleAutoPersist(nextGraph, nextRevision);
        },
        [nodes, scheduleAutoPersist]
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
                    onDeleteNode={deleteNode}
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
