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
    compactSemanticText,
    findBestConceptMatch,
    makeCanonicalFreeformSemanticKey,
} from "../core/conceptSemantic";
import {
    dedupeDirectedEdges,
    deleteNodeAndReconnect,
    findDirectedEdge,
    newEdgeId,
    newNodeId,
    normalize01,
    parseJsonValue,
    pickRootGoalId,
} from "./flow/graphDraftUtils";
import { makeDragStartSnapshot, persistDraggedNodePositions, pickMovedNodes } from "./flow/dragPersistence";
import { useCanvasDraftStore } from "../stores/canvasDraftStore";

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

function cleanText(input: any, max = 220): string {
    return compactSemanticText(input, max);
}

function inferRelation(sentence: string): { relation: EdgeType; causalOperator: ConceptMotif["causalOperator"] } {
    const text = cleanText(sentence, 280);
    const lower = text.toLowerCase();
    if (/矛盾|冲突|相反|冲突于|but\b|however|conflict|contradict/i.test(text)) {
        return { relation: "conflicts_with", causalOperator: "contradiction" };
    }
    if (/决定|决定了|必须|只能|唯一|直接决定|determine|decide|must|only/i.test(text)) {
        return { relation: "determine", causalOperator: "intervention" };
    }
    if (/限制|约束|受限|受制于|无法|不能|不可|limit|restrict|constraint|bounded|cannot/i.test(text)) {
        return { relation: "constraint", causalOperator: "confounding" };
    }
    if (/通过|借由|经由|via|through|mediated/i.test(lower)) {
        return { relation: "enable", causalOperator: "mediated_causation" };
    }
    return { relation: "enable", causalOperator: "direct_causation" };
}

function splitCausalSentence(raw: string): { source: string; target: string } | null {
    const text = cleanText(raw, 280);
    if (!text) return null;

    const arrow = text.match(/^(.+?)(?:->|→|=>|⇒)(.+)$/);
    if (arrow?.[1] && arrow?.[2]) {
        return {
            source: cleanText(arrow[1], 120),
            target: cleanText(arrow[2], 120),
        };
    }

    const patterns: RegExp[] = [
        /(?:因为|由于|因|because|since)\s*(.+?)(?:,|，|。|;|；|\s)+(?:所以|因此|故|因而|so|thus|therefore|hence)\s*(.+)$/i,
        /^(.+?)(?:,|，|。|;|；)\s*(?:所以|因此|于是|因而|so|thus|therefore|hence|as a result)\s*(.+)$/i,
        /^(.+?)(?:导致|使得|造成|促使|驱动|leads to|results in|drives|causes|affects)\s*(.+)$/i,
    ];
    for (const re of patterns) {
        const m = text.match(re);
        const source = cleanText(m?.[1], 120);
        const target = cleanText(m?.[2], 120);
        if (source && target) return { source, target };
    }

    const connectors = ["因此", "所以", "于是", "因而", "so", "thus", "therefore", "hence", "as a result"];
    for (const token of connectors) {
        const idx = text.toLowerCase().indexOf(token.toLowerCase());
        if (idx > 0 && idx < text.length - token.length) {
            const source = cleanText(text.slice(0, idx), 120);
            const target = cleanText(text.slice(idx + token.length), 120);
            if (source && target) return { source, target };
        }
    }

    const parts = text
        .split(/[，,。;；]/g)
        .map((x) => cleanText(x, 120))
        .filter(Boolean);
    if (parts.length >= 2) {
        return { source: parts[0], target: parts[parts.length - 1] };
    }
    return null;
}

function resolveNodeTypeForRelation(relation: EdgeType, role: "source" | "target"): CDGNode["type"] {
    if (role === "source" && relation === "constraint") return "constraint";
    if (role === "target" && relation === "constraint") return "preference";
    return "belief";
}

export type ManualMotifDraft = {
    sentence: string;
    sourceStatement: string;
    targetStatement: string;
    relation: EdgeType;
    causalOperator: ConceptMotif["causalOperator"];
    sourceNodeId: string;
    targetNodeId: string;
    sourceNodeKey: string;
    targetNodeKey: string;
    sourceNodeType: CDGNode["type"];
    targetNodeType: CDGNode["type"];
    edgeId: string;
    sourceConceptHintId?: string;
    targetConceptHintId?: string;
};

export function FlowPanel(props: {
    conversationId: string;
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
    onCreateMotifDraft?: (draft: ManualMotifDraft) => void;
    onSaveGraph?: (
        graph: CDG,
        opts?: {
            requestAdvice?: boolean;
            advicePrompt?: string;
            emitVirtualStructureMessage?: boolean;
            saveReason?: "manual" | "auto_before_turn";
        }
    ) => Promise<void> | void;
    savingGraph?: boolean;
    conceptPanelCollapsed: boolean;
    onToggleConceptPanel: () => void;
    onUnsavedStateChange?: (state: { hasUnsaved: boolean }) => void;
}) {
    const {
        conversationId,
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
        onCreateMotifDraft,
        onSaveGraph,
        savingGraph,
        conceptPanelCollapsed,
        onToggleConceptPanel,
        onUnsavedStateChange,
    } = props;
    const en = locale === "en-US";
    const tr = (zh: string, enText: string) => (en ? enText : zh);
    const setConversationDraft = useCanvasDraftStore((state) => state.setConversationDraft);
    const [canvasView, setCanvasView] = useState<"concept" | "motif">("concept");
    const [draftGraph, setDraftGraph] = useState<CDG>(() => {
        const normalized = normalizeGraphClient(graph);
        const stored = useCanvasDraftStore.getState().getConversationDraft(conversationId);
        const localDraft = stored?.draftGraph ? normalizeGraphClient(stored.draftGraph) : normalized;
        return mergeIncomingGraphWithLocalUi(normalized, localDraft);
    });
    const [dirty, setDirty] = useState<boolean>(() => {
        const stored = useCanvasDraftStore.getState().getConversationDraft(conversationId);
        return !!stored?.dirty;
    });
    const [selectedNodeId, setSelectedNodeId] = useState<string>("");
    const [selectedEdgeId, setSelectedEdgeId] = useState<string>("");
    const [saveError, setSaveError] = useState("");
    const [motifComposerOpen, setMotifComposerOpen] = useState(false);
    const [motifSentence, setMotifSentence] = useState("");
    const [motifComposerError, setMotifComposerError] = useState("");
    const dragStartRef = useRef<Record<string, { x: number; y: number }>>({});
    const selectionDragNodeIdsRef = useRef<string[]>([]);
    const draftGraphRef = useRef<CDG>(draftGraph);

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
        if (conversationId && normalized.id && normalized.id !== conversationId) return;
        const stored = useCanvasDraftStore.getState().getConversationDraft(conversationId);
        const localDraft = stored?.draftGraph ? normalizeGraphClient(stored.draftGraph) : draftGraphRef.current;
        const merged = mergeIncomingGraphWithLocalUi(normalized, localDraft);
        const nextDirty = !!stored?.dirty;
        setDraftGraph(merged);
        draftGraphRef.current = merged;
        setConversationDraft(conversationId, merged, nextDirty);
        dragStartRef.current = {};
        selectionDragNodeIdsRef.current = [];
        setDirty(nextDirty);
        setSelectedNodeId("");
        setSelectedEdgeId("");
        setSaveError("");
        setMotifComposerOpen(false);
        setMotifSentence("");
        setMotifComposerError("");
    }, [conversationId, graph, setConversationDraft]);

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
            setConversationDraft(conversationId, next, true);
            return next;
        });
        setDirty(true);
    }, [conversationId, setConversationDraft]);

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

    const deleteEdge = useCallback(
        (edgeId: string) => {
            if (!edgeId) return;
            updateDraftGraph((prev) => ({
                ...prev,
                edges: (prev.edges || []).filter((edge) => edge.id !== edgeId),
            }));
            setSelectedEdgeId("");
            setSelectedNodeId("");
        },
        [updateDraftGraph]
    );

    const createEdge = useCallback(
        (fromId: string, toId: string) => {
            if (!fromId || !toId || fromId === toId) return;
            const existing = findDirectedEdge(draftGraphRef.current.edges || [], fromId, toId);
            if (existing) {
                setSelectedEdgeId(existing.id);
                setSelectedNodeId("");
                return;
            }

            const edgeId = newEdgeId();
            updateDraftGraph((prev) => ({
                ...prev,
                edges: dedupeDirectedEdges([
                    ...(prev.edges || []),
                    {
                        id: edgeId,
                        from: fromId,
                        to: toId,
                        type: "enable",
                        confidence: 0.72,
                    },
                ]),
            }));
            setSelectedEdgeId(edgeId);
            setSelectedNodeId("");
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

    const createMotifFromSentence = useCallback(() => {
        const text = cleanText(motifSentence, 280);
        if (!text) {
            setMotifComposerError(en ? "Please enter a causal sentence." : "请输入一句因果关系描述。");
            return;
        }
        const split = splitCausalSentence(text);
        if (!split || !split.source || !split.target) {
            setMotifComposerError(
                en
                    ? "Unable to parse cause/effect. Use “cause, therefore effect” or “A -> B”."
                    : "无法解析因果两端，请改成“原因，因此结果”或“A -> B”的格式。"
            );
            return;
        }

        const sourceMatch = findBestConceptMatch(split.source, concepts || [], { minScore: 0.5 });
        const targetMatch = findBestConceptMatch(split.target, concepts || [], { minScore: 0.5 });
        if (sourceMatch?.id && targetMatch?.id && sourceMatch.id === targetMatch.id) {
            setMotifComposerError(
                en
                    ? "Cause and effect map to the same concept. Please make each side more specific."
                    : "原因和结果被识别为同一概念，请把两端描述得更具体。"
            );
            return;
        }
        const sourceStatement = cleanText(sourceMatch?.title || split.source, 120);
        const targetStatement = cleanText(targetMatch?.title || split.target, 120);
        if (!sourceStatement || !targetStatement || sourceStatement === targetStatement) {
            setMotifComposerError(en ? "Cause and effect must be different concepts." : "原因和结果需要是两个不同的概念。");
            return;
        }

        const inferred = inferRelation(text);
        const sourceNodeType = resolveNodeTypeForRelation(inferred.relation, "source");
        const targetNodeType = resolveNodeTypeForRelation(inferred.relation, "target");
        const sourceNodeKey = cleanText(
            sourceMatch?.semanticKey || makeCanonicalFreeformSemanticKey(sourceStatement, sourceNodeType),
            180
        );
        const targetNodeKey = cleanText(
            targetMatch?.semanticKey || makeCanonicalFreeformSemanticKey(targetStatement, targetNodeType),
            180
        );

        const maxX = nodes.reduce((acc, n) => Math.max(acc, Number(n.position?.x) || 0), 120);
        const yBase = nodes.length ? Number(nodes[nodes.length - 1]?.position?.y || 220) : 220;
        const sourceNodeId = newNodeId();
        const targetNodeId = newNodeId();
        const edgeId = newEdgeId();

        const sourceNode: CDGNode = {
            id: sourceNodeId,
            type: sourceNodeType,
            layer: sourceNodeType === "preference" ? "preference" : "requirement",
            statement: sourceStatement,
            status: "confirmed",
            confidence: 0.78,
            importance: 0.72,
            key: sourceNodeKey,
            sourceMsgIds: ["manual_motif_input"],
            value: { ui: { x: Math.round(maxX + 240), y: Math.round(yBase) } },
        };
        const targetNode: CDGNode = {
            id: targetNodeId,
            type: targetNodeType,
            layer: targetNodeType === "preference" ? "preference" : "requirement",
            statement: targetStatement,
            status: "confirmed",
            confidence: 0.78,
            importance: 0.72,
            key: targetNodeKey,
            sourceMsgIds: ["manual_motif_input"],
            value: { ui: { x: Math.round(maxX + 560), y: Math.round(yBase + 24) } },
        };
        const edge = {
            id: edgeId,
            from: sourceNodeId,
            to: targetNodeId,
            type: inferred.relation,
            confidence: 0.82,
        };
        const draft: ManualMotifDraft = {
            sentence: text,
            sourceStatement,
            targetStatement,
            relation: inferred.relation,
            causalOperator: inferred.causalOperator,
            sourceNodeId,
            targetNodeId,
            sourceNodeKey,
            targetNodeKey,
            sourceNodeType,
            targetNodeType,
            edgeId,
            sourceConceptHintId: sourceMatch?.id || undefined,
            targetConceptHintId: targetMatch?.id || undefined,
        };

        updateDraftGraph((prev) => ({
            ...prev,
            nodes: [...(prev.nodes || []), sourceNode, targetNode],
            edges: [...(prev.edges || []), edge],
        }));

        setMotifComposerError("");
        setMotifComposerOpen(false);
        setMotifSentence("");
        setSelectedNodeId(draft.targetNodeId);
        setSelectedEdgeId("");
        onCreateMotifDraft?.(draft);
    }, [concepts, en, motifSentence, nodes, onCreateMotifDraft, updateDraftGraph]);

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
        setConversationDraft(conversationId, nextGraph, true);
    }, [conversationId, setConversationDraft]);

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
            const nextGraph = persistDraggedNodePositions(prev, movedNodes);

            if (nextGraph === prev) return;
            draftGraphRef.current = nextGraph;
            setDraftGraph(nextGraph);
            setDirty(true);
            setConversationDraft(conversationId, nextGraph, true);
        },
        [conversationId, setConversationDraft]
    );

    const hasUnsavedChanges = dirty || !!extraDirty;

    useEffect(() => {
        onUnsavedStateChange?.({ hasUnsaved: hasUnsavedChanges });
    }, [hasUnsavedChanges, onUnsavedStateChange]);

    const saveGraph = useCallback(async () => {
        if (!onSaveGraph || savingGraph || !hasUnsavedChanges) return;
        setSaveError("");
        const latestDraft = draftGraphRef.current;
        try {
            await Promise.resolve(
                onSaveGraph(latestDraft, {
                    requestAdvice: true,
                    advicePrompt: en
                        ? "The user manually edited the intent graph. Treat this graph as the latest source of truth and provide executable next-step advice from existing dialogue. Give an action plan first, then ask 1-2 focused follow-up questions."
                        : "用户已手动编辑意图流程图，请把该图视为最新真值，结合已有对话给出下一步可执行建议（先行动方案，再1-2个关键问题）。",
                    emitVirtualStructureMessage: true,
                    saveReason: "manual",
                })
            );
            setDirty(false);
            setConversationDraft(conversationId, latestDraft, false);
        } catch (e: any) {
            setSaveError(e?.message || (en ? "Save failed" : "保存失败"));
        }
    }, [conversationId, en, hasUnsavedChanges, onSaveGraph, savingGraph, setConversationDraft]);

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
                            onDeleteEdge={deleteEdge}
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
                            onConnect={(connection) => {
                                createEdge(String(connection.source || ""), String(connection.target || ""));
                            }}
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
                    <>
                        <div className="FlowToolbar">
                            <div className="FlowToolbar__group">
                                <button
                                    type="button"
                                    className="Btn FlowToolbar__btn"
                                    onClick={() => {
                                        setMotifComposerOpen((v) => !v);
                                        setMotifComposerError("");
                                    }}
                                    title={tr("创建主题（Motif 实例）", "Create motif instance")}
                                >
                                    {tr("+ 创建主题", "+ Create Motif")}
                                </button>
                            </div>
                            <div className="FlowToolbar__group">
                                <button
                                    type="button"
                                    className="Btn FlowToolbar__save"
                                    onClick={saveGraph}
                                    disabled={!onSaveGraph || !hasUnsavedChanges || !!savingGraph}
                                >
                                    {savingGraph ? tr("保存中...", "Saving...") : tr("保存并生成建议", "Save and Generate Advice")}
                                </button>
                                {hasUnsavedChanges ? <span className="FlowToolbar__dirty">{tr("未保存", "Unsaved")}</span> : null}
                            </div>
                        </div>
                        {motifComposerOpen ? (
                            <div className="MotifComposer" onClick={(e) => e.stopPropagation()}>
                                <div className="FlowInspector__title">
                                    {tr("创建 Motif 实例", "Create Motif Instance")}
                                </div>
                                <label className="FlowInspector__fieldLabel">
                                    {tr("自然语言输入", "Natural language input")}
                                    <textarea
                                        className="FlowInspector__editor"
                                        value={motifSentence}
                                        onChange={(e) => {
                                            setMotifSentence(e.target.value);
                                            if (motifComposerError) setMotifComposerError("");
                                        }}
                                        placeholder={tr(
                                            "写下一个决策或行为背后的原因关系，例如：“担心拥挤，因此避开热门景点”。",
                                            'Describe a causal relation, e.g. "Worried about crowds, so avoid popular attractions."'
                                        )}
                                    />
                                </label>
                                <div className="ConceptEditor__actions">
                                    <button
                                        type="button"
                                        className="Btn FlowToolbar__btn"
                                        onClick={() => {
                                            setMotifComposerOpen(false);
                                            setMotifSentence("");
                                            setMotifComposerError("");
                                        }}
                                    >
                                        {tr("取消", "Cancel")}
                                    </button>
                                    <button type="button" className="Btn FlowToolbar__btn" onClick={createMotifFromSentence}>
                                        {tr("生成 Motif", "Generate Motif")}
                                    </button>
                                </div>
                                {motifComposerError ? <div className="FlowInspector__error">{motifComposerError}</div> : null}
                            </div>
                        ) : null}
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
                        {saveError ? <div className="FlowToolbar__error">{saveError}</div> : null}
                    </>
                )}
            </div>
        </div>
    );
}
