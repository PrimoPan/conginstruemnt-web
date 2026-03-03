import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@xyflow/react/dist/style.css";
import type {
    AppLocale,
    CDG,
    CDGNode,
    ConceptItem,
    ConceptMotif,
    EdgeType,
    MotifLink,
    MotifReasoningView,
    NodeEvidenceFocus,
} from "../core/type";
import { cdgToFlow } from "../core/graphToFlow";
import { normalizeGraphClient } from "../core/graphSafe";
import { CdgFlowNode } from "./CdgFlowNode";
import { FlowCanvas, useFlowState } from "./flow/FlowCanvas";
import { FlowInspector } from "./flow/FlowInspector";
import { FlowToolbar } from "./flow/FlowToolbar";
import { MotifReasoningCanvas } from "./flow/MotifReasoningCanvas";
import {
    EDITABLE_PARENT_EDGE_TYPES,
    deleteNodeAndReconnect,
    findDropParent,
    hasPath,
    newEdgeId,
    newNodeId,
    normalize01,
    parseJsonValue,
    pickRootGoalId,
} from "./flow/graphDraftUtils";
import { makeDragStartSnapshot, persistDraggedNodePositions, pickMovedNodes } from "./flow/dragPersistence";

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
    locale: AppLocale;
    graph: CDG;
    concepts?: ConceptItem[];
    motifs?: ConceptMotif[];
    motifLinks?: MotifLink[];
    motifReasoningView?: MotifReasoningView;
    activeConceptId?: string;
    activeMotifId?: string;
    extraDirty?: boolean;
    focusNodeId?: string;
    onFocusNodeHandled?: () => void;
    onDraftGraphChange?: (graph: CDG) => void;
    generatingGraph?: boolean;
    onNodeEvidenceHover?: (focus: NodeEvidenceFocus | null) => void;
    onSelectMotif?: (motifId: string) => void;
    onSelectConcept?: (conceptId: string) => void;
    onSaveGraph?: (
        graph: CDG,
        opts?: { requestAdvice?: boolean; advicePrompt?: string }
    ) => Promise<void> | void;
    savingGraph?: boolean;
    conceptPanelCollapsed: boolean;
    onToggleConceptPanel: () => void;
}) {
    const {
        locale,
        graph,
        concepts,
        motifs,
        motifLinks,
        motifReasoningView,
        activeConceptId,
        activeMotifId,
        extraDirty,
        focusNodeId,
        onFocusNodeHandled,
        onDraftGraphChange,
        generatingGraph,
        onNodeEvidenceHover,
        onSelectMotif,
        onSelectConcept,
        onSaveGraph,
        savingGraph,
        conceptPanelCollapsed,
        onToggleConceptPanel,
    } = props;
    const en = locale === "en-US";
    const tr = (zh: string, enText: string) => (en ? enText : zh);
    const [canvasView, setCanvasView] = useState<"concept" | "motif">("concept");
    const [draftGraph, setDraftGraph] = useState<CDG>(normalizeGraphClient(graph));
    const [dirty, setDirty] = useState(false);
    const [selectedNodeId, setSelectedNodeId] = useState<string>("");
    const [selectedEdgeId, setSelectedEdgeId] = useState<string>("");
    const [saveError, setSaveError] = useState("");
    const dragStartRef = useRef<Record<string, { x: number; y: number }>>({});
    const selectionDragNodeIdsRef = useRef<string[]>([]);
    const draftGraphRef = useRef<CDG>(normalizeGraphClient(graph));

    const { nodes, edges, setNodes, setEdges, onNodesChange, onEdgesChange } = useFlowState();

    const conceptIdsByNodeId = useMemo(() => {
        const m = new Map<string, string[]>();
        for (const c of concepts || []) {
            for (const nid of c.nodeIds || []) {
                if (!m.has(nid)) m.set(nid, []);
                m.get(nid)!.push(c.id);
            }
        }
        return m;
    }, [concepts]);

    const activeNodeIds = useMemo(() => {
        if (!activeConceptId) return new Set<string>();
        const c = (concepts || []).find((x) => x.id === activeConceptId);
        return new Set(c?.nodeIds || []);
    }, [activeConceptId, concepts]);

    const pausedNodeIds = useMemo(() => {
        const s = new Set<string>();
        for (const c of concepts || []) {
            if (!c.paused) continue;
            for (const nid of c.nodeIds || []) s.add(nid);
        }
        return s;
    }, [concepts]);

    useEffect(() => {
        const normalized = normalizeGraphClient(graph);
        const merged = mergeIncomingGraphWithLocalUi(normalized, draftGraphRef.current);
        setDraftGraph(merged);
        draftGraphRef.current = merged;
        dragStartRef.current = {};
        selectionDragNodeIdsRef.current = [];
        setDirty(false);
        setSelectedNodeId("");
        setSelectedEdgeId("");
        setSaveError("");
    }, [graph]);

    useEffect(() => {
        draftGraphRef.current = draftGraph;
    }, [draftGraph]);

    useEffect(() => {
        onDraftGraphChange?.(draftGraph);
    }, [draftGraph, onDraftGraphChange]);

    useEffect(() => {
        if (!focusNodeId) return;
        const exists = (draftGraph.nodes || []).some((n) => n.id === focusNodeId);
        if (!exists) return;
        setCanvasView("concept");
        setSelectedNodeId(focusNodeId);
        setSelectedEdgeId("");
        onFocusNodeHandled?.();
    }, [focusNodeId, draftGraph.nodes, onFocusNodeHandled]);

    useEffect(() => {
        if (activeMotifId) setCanvasView("motif");
    }, [activeMotifId]);

    useEffect(() => {
        if (activeConceptId && !activeMotifId) setCanvasView("concept");
    }, [activeConceptId, activeMotifId]);

    const updateDraftGraph = useCallback((updater: (prev: CDG) => CDG) => {
        setDraftGraph((prev) => {
            const next = updater(prev);
            draftGraphRef.current = next;
            return next;
        });
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
        const flow = cdgToFlow(draftGraph, {
            locale,
            onNodePatch,
            onImportanceChange,
            activeNodeIds,
            pausedNodeIds,
            conceptIdsByNodeId,
        });
        setNodes(flow.nodes);
        setEdges(flow.edges);
    }, [draftGraph, locale, onImportanceChange, onNodePatch, setEdges, setNodes, activeNodeIds, pausedNodeIds, conceptIdsByNodeId]);

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
                type: "factual_assertion",
                layer: "requirement",
                statement: en ? "New node: edit me" : "新节点：请编辑",
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
    }, [en, nodes, selectedNodeId, updateDraftGraph]);

    const onNodeDragStart = useCallback((_: any, node: any) => {
        dragStartRef.current = {
            ...dragStartRef.current,
            ...makeDragStartSnapshot([node]),
        };
    }, []);

    const onSelectionDragStart = useCallback((_: any, draggedNodes: any[]) => {
        selectionDragNodeIdsRef.current = (draggedNodes || []).map((node) => node.id);
        dragStartRef.current = {
            ...dragStartRef.current,
            ...makeDragStartSnapshot(draggedNodes || []),
        };
    }, []);

    const onSelectionDragStop = useCallback((_: any, draggedNodes: any[]) => {
        const movedNodes = pickMovedNodes(draggedNodes || [], dragStartRef.current, 6);
        for (const node of draggedNodes || []) delete dragStartRef.current[node.id];
        selectionDragNodeIdsRef.current = [];
        if (!movedNodes.length) return;
        const prev = draftGraphRef.current;
        const nextGraph = persistDraggedNodePositions(prev, movedNodes);
        if (nextGraph === prev) return;
        draftGraphRef.current = nextGraph;
        setDraftGraph(nextGraph);
        setDirty(true);
    }, []);

    const onNodeDragStop = useCallback(
        (_: any, dragged: any) => {
            const selectionIds = selectionDragNodeIdsRef.current;
            const isMultiSelectionDrag = selectionIds.length > 1 && selectionIds.includes(dragged.id);
            if (isMultiSelectionDrag) return;

            const start = dragStartRef.current[dragged.id];
            delete dragStartRef.current[dragged.id];
            selectionDragNodeIdsRef.current = [];

            const moveDist = start
                ? Math.hypot(dragged.position.x - start.x, dragged.position.y - start.y)
                : 999;
            if (moveDist < 6) return;

            const prev = draftGraphRef.current;
            const movedNodes = pickMovedNodes([dragged], start ? { [dragged.id]: start } : {}, 6);
            let nextGraph = persistDraggedNodePositions(prev, movedNodes);
            const droppedParentId = moveDist > 24 ? findDropParent(dragged, nodes) : null;

            if (droppedParentId && droppedParentId !== dragged.id) {
                const incomingRemoved = (nextGraph.edges || []).filter(
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
                nextGraph = { ...nextGraph, edges: incomingRemoved };
            }

            if (nextGraph === prev) return;
            draftGraphRef.current = nextGraph;
            setDraftGraph(nextGraph);
            setDirty(true);
        },
        [nodes]
    );

    const hasUnsavedChanges = dirty || !!extraDirty;

    const saveGraph = useCallback(async () => {
        if (!onSaveGraph || savingGraph || !hasUnsavedChanges) return;
        setSaveError("");
        try {
            await Promise.resolve(
                onSaveGraph(draftGraph, {
                    requestAdvice: true,
                    advicePrompt: en
                        ? "The user manually edited the intent graph. Treat this graph as the latest source of truth and provide executable next-step advice from existing dialogue. Give an action plan first, then ask 1-2 focused follow-up questions."
                        : "用户已手动编辑意图流程图，请把该图视为最新真值，结合已有对话给出下一步可执行建议（先行动方案，再1-2个关键问题）。",
                })
            );
            setDirty(false);
        } catch (e: any) {
            setSaveError(e?.message || (en ? "Save failed" : "保存失败"));
        }
    }, [draftGraph, en, hasUnsavedChanges, onSaveGraph, savingGraph]);

    return (
        <div className="Panel">
            <div className="PanelHeader FlowPanel__header">
                <div className="FlowPanel__headerTabs">
                    <button
                        type="button"
                        className={`FlowPanel__headerTab ${canvasView === "concept" ? "is-active" : ""}`}
                        onClick={() => setCanvasView("concept")}
                    >
                        {tr("Concept 画布", "Concept Graph")}
                    </button>
                    <button
                        type="button"
                        className={`FlowPanel__headerTab ${canvasView === "motif" ? "is-active" : ""}`}
                        onClick={() => setCanvasView("motif")}
                    >
                        {tr("Motif 推理", "Motif Reasoning")}
                    </button>
                </div>
                <div className="FlowPanel__headerActions">
                    <button type="button" className="FlowPanel__panelToggle" onClick={onToggleConceptPanel}>
                        {conceptPanelCollapsed
                            ? tr("展开 Concept 列表", "Expand Concept Panel")
                            : tr("收起 Concept 列表", "Collapse Concept Panel")}
                    </button>
                    {canvasView === "concept" && generatingGraph ? (
                        <span className="FlowStatusTag">{tr("意图分析图生成中", "Generating intent graph")}</span>
                    ) : null}
                </div>
            </div>
            <div className="FlowCanvas">
                {canvasView === "concept" ? (
                    <>
                        <FlowToolbar
                            locale={locale}
                            onAddNode={addNode}
                            onSave={saveGraph}
                            canSave={!!onSaveGraph && hasUnsavedChanges}
                            saving={!!savingGraph}
                            dirty={hasUnsavedChanges}
                            generating={!!generatingGraph}
                        />

                        <FlowInspector
                            locale={locale}
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
                            onSelectionDragStart={onSelectionDragStart}
                            onSelectionDragStop={onSelectionDragStop}
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
                    </>
                ) : (
                    <MotifReasoningCanvas
                        locale={locale}
                        motifs={motifs || []}
                        motifLinks={motifLinks || []}
                        concepts={concepts || []}
                        reasoningView={motifReasoningView}
                        activeMotifId={activeMotifId}
                        onSelectMotif={onSelectMotif}
                        onSelectConcept={onSelectConcept}
                    />
                )}
            </div>
        </div>
    );
}
