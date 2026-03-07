import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CDG } from "../core/type";
import { useCanvasDraftStore } from "../stores/canvasDraftStore";
import { FlowPanel } from "./FlowPanel";

const mockSetNodes = jest.fn();
const mockSetEdges = jest.fn();
const mockOnNodesChange = jest.fn();
const mockOnEdgesChange = jest.fn();
let latestCanvasProps: any = null;
let latestInspectorProps: any = null;
let latestMotifCanvasProps: any = null;

jest.mock("./flow/FlowCanvas", () => ({
    FlowCanvas: (props: any) => {
        latestCanvasProps = props;
        return (
            <div data-testid="mock-flow-canvas">
                <button
                    type="button"
                    data-testid="mock-connect-edge"
                    onClick={() => props.onConnect({ source: "n1", target: "n2" })}
                >
                    connect
                </button>
                <button
                    type="button"
                    data-testid="mock-select-edge"
                    onClick={() => props.onEdgeClick("e_existing")}
                >
                    select-edge
                </button>
                <button
                    type="button"
                    data-testid="mock-drag-node"
                    onClick={() => {
                        props.onNodeDragStart({}, { id: "n2", position: { x: 20, y: 30 } });
                        props.onNodeDragStop({}, { id: "n2", position: { x: 140, y: 96 } });
                    }}
                >
                    drag-node
                </button>
            </div>
        );
    },
    useFlowState: () => ({
        nodes: [],
        edges: [],
        setNodes: mockSetNodes,
        setEdges: mockSetEdges,
        onNodesChange: mockOnNodesChange,
        onEdgesChange: mockOnEdgesChange,
    }),
}));

jest.mock("./flow/FlowInspector", () => ({
    FlowInspector: (props: any) => {
        latestInspectorProps = props;
        return (
            <div data-testid="mock-flow-inspector">
                <div data-testid="mock-selected-edge">{props.edge?.id || ""}</div>
                {props.edge ? (
                    <button type="button" data-testid="mock-delete-edge" onClick={() => props.onDeleteEdge(props.edge.id)}>
                        delete-edge
                    </button>
                ) : null}
            </div>
        );
    },
}));

jest.mock("./flow/MotifReasoningCanvas", () => ({
    MotifReasoningCanvas: (props: any) => {
        latestMotifCanvasProps = props;
        return (
            <div data-testid="mock-motif-canvas">
                <button
                    type="button"
                    data-testid="mock-connect-motif-link"
                    onClick={() => props.onConnectLink?.("m1", "m2")}
                >
                    connect-motif
                </button>
                <button
                    type="button"
                    data-testid="mock-select-motif-link"
                    onClick={() => props.onSelectLink?.("ml_existing")}
                >
                    select-motif-link
                </button>
            </div>
        );
    },
}));

function baseGraph(): CDG {
    return {
        id: "cid_save",
        version: 1,
        nodes: [
            {
                id: "n1",
                type: "belief",
                statement: "预算影响酒店选择",
                status: "confirmed",
                confidence: 0.86,
            },
        ],
        edges: [],
    };
}

function graphWithTwoNodes(edges: CDG["edges"] = []): CDG {
    return {
        id: "cid_flow",
        version: 1,
        nodes: [
            {
                id: "n1",
                type: "belief",
                layer: "intent",
                statement: "意图：制定旅行计划",
                status: "confirmed",
                confidence: 0.9,
                importance: 0.88,
                key: "slot:goal",
            },
            {
                id: "n2",
                type: "preference",
                statement: "活动偏好：野生动物体验优先",
                status: "confirmed",
                confidence: 0.78,
                importance: 0.7,
                key: "slot:activity_preference",
            },
            {
                id: "n3",
                type: "factual_assertion",
                statement: "子地点：邦迪海滩（澳大利亚）",
                status: "confirmed",
                confidence: 0.76,
                importance: 0.68,
                key: "slot:sub_location:australia:bondi_beach",
            },
        ],
        edges,
    };
}

function baseMotifs() {
    return [
        {
            id: "m1",
            motif_id: "m1",
            motif_type: "enable",
            motifType: "pair",
            templateKey: "pair",
            relation: "enable",
            dependencyClass: "enable",
            conceptIds: ["c1", "c2"],
            anchorConceptId: "c2",
            title: "携家出游 supports 儿童友好选项",
            display_title: "携家出游会优先考虑儿童友好选项",
            description: "",
            confidence: 0.82,
            supportEdgeIds: [],
            supportNodeIds: [],
            status: "active",
            novelty: "new",
            updatedAt: "2026-03-07T00:00:00.000Z",
            aliases: [],
            concept_bindings: ["c1", "c2"],
            scope: "global",
            roles: { sources: ["c1"], target: "c2" },
        },
        {
            id: "m2",
            motif_id: "m2",
            motif_type: "constraint",
            motifType: "pair",
            templateKey: "pair",
            relation: "constraint",
            dependencyClass: "constraint",
            conceptIds: ["c2", "c3"],
            anchorConceptId: "c3",
            title: "儿童友好选项 constrains 住宿筛选",
            display_title: "儿童友好诉求会限制住宿筛选",
            description: "",
            confidence: 0.78,
            supportEdgeIds: [],
            supportNodeIds: [],
            status: "active",
            novelty: "new",
            updatedAt: "2026-03-07T00:00:00.000Z",
            aliases: [],
            concept_bindings: ["c2", "c3"],
            scope: "global",
            roles: { sources: ["c2"], target: "c3" },
        },
    ] as any[];
}

beforeEach(() => {
    localStorage.clear();
    useCanvasDraftStore.getState().clearAllDrafts();
    mockSetNodes.mockClear();
    mockSetEdges.mockClear();
    mockOnNodesChange.mockClear();
    mockOnEdgesChange.mockClear();
    latestCanvasProps = null;
    latestInspectorProps = null;
    latestMotifCanvasProps = null;
});

function enterEditMode() {
    fireEvent.click(screen.getByRole("button", { name: "编辑模式" }));
}

test("save should use latest draft graph from zustand store and keep backend callback contract", async () => {
    const incoming = baseGraph();
    const storedDraft: CDG = {
        ...incoming,
        nodes: [
            {
                ...incoming.nodes[0],
                value: { ui: { x: 432, y: 278 } },
            },
        ],
    };
    useCanvasDraftStore.getState().setConversationDraft("cid_save", storedDraft, true);

    const onSaveGraph = jest.fn().mockResolvedValue(undefined);

    render(
        <FlowPanel
            conversationId="cid_save"
            locale="zh-CN"
            graph={incoming}
            concepts={[]}
            motifs={[]}
            motifLinks={[]}
            motifReasoningView={{ nodes: [], edges: [], steps: [] }}
            activeConceptId=""
            activeMotifId=""
            generatingGraph={false}
            onNodeEvidenceHover={() => {}}
            onSelectMotif={() => {}}
            onSelectConcept={() => {}}
            onSaveGraph={onSaveGraph}
            savingGraph={false}
            extraDirty={false}
            focusNodeId=""
            onFocusNodeHandled={() => {}}
            onDraftGraphChange={() => {}}
            conceptPanelCollapsed={false}
            onToggleConceptPanel={() => {}}
        />
    );

    const saveButton = screen.getByRole("button", { name: "保存并生成建议" });
    expect(saveButton).toBeDisabled();

    enterEditMode();
    await waitFor(() => expect(saveButton).toBeEnabled());

    fireEvent.click(saveButton);

    await waitFor(() => expect(onSaveGraph).toHaveBeenCalledTimes(1));
    const savedGraph = onSaveGraph.mock.calls[0][0] as CDG;
    const savedOpts = onSaveGraph.mock.calls[0][1] as { requestAdvice?: boolean };
    expect((savedGraph.nodes[0].value as any)?.ui).toEqual({ x: 432, y: 278 });
    expect(savedOpts?.requestAdvice).toBe(true);

    await waitFor(() =>
        expect(useCanvasDraftStore.getState().getConversationDraft("cid_save")?.dirty).toBe(false)
    );
});

test("connect should create one directed edge and dedupe repeated connects", async () => {
    const onDraftGraphChange = jest.fn();

    render(
        <FlowPanel
            conversationId="cid_flow"
            locale="zh-CN"
            graph={graphWithTwoNodes()}
            concepts={[]}
            motifs={[]}
            motifLinks={[]}
            motifReasoningView={{ nodes: [], edges: [], steps: [] }}
            activeConceptId=""
            activeMotifId=""
            generatingGraph={false}
            onNodeEvidenceHover={() => {}}
            onSelectMotif={() => {}}
            onSelectConcept={() => {}}
            onSaveGraph={jest.fn()}
            savingGraph={false}
            extraDirty={false}
            focusNodeId=""
            onFocusNodeHandled={() => {}}
            onDraftGraphChange={onDraftGraphChange}
            conceptPanelCollapsed={false}
            onToggleConceptPanel={() => {}}
        />
    );

    expect(latestCanvasProps?.canvasMode).toBe("view");
    enterEditMode();
    expect(latestCanvasProps?.canvasMode).toBe("edit");

    fireEvent.click(screen.getByTestId("mock-connect-edge"));
    await waitFor(() =>
        expect(onDraftGraphChange).toHaveBeenLastCalledWith(
            expect.objectContaining({
                edges: [
                    expect.objectContaining({
                        from: "n1",
                        to: "n2",
                        type: "enable",
                    }),
                ],
            })
        )
    );

    fireEvent.click(screen.getByTestId("mock-connect-edge"));
    await waitFor(() => {
        const latestGraph = onDraftGraphChange.mock.calls[onDraftGraphChange.mock.calls.length - 1][0] as CDG;
        expect(latestGraph.edges).toHaveLength(1);
        expect(latestInspectorProps?.edge?.id || "").toBeTruthy();
    });
});

test("delete edge should remove the selected relationship", async () => {
    const onDraftGraphChange = jest.fn();

    render(
        <FlowPanel
            conversationId="cid_delete"
            locale="zh-CN"
            graph={graphWithTwoNodes([
                {
                    id: "e_existing",
                    from: "n1",
                    to: "n2",
                    type: "enable",
                    confidence: 0.72,
                },
            ])}
            concepts={[]}
            motifs={[]}
            motifLinks={[]}
            motifReasoningView={{ nodes: [], edges: [], steps: [] }}
            activeConceptId=""
            activeMotifId=""
            generatingGraph={false}
            onNodeEvidenceHover={() => {}}
            onSelectMotif={() => {}}
            onSelectConcept={() => {}}
            onSaveGraph={jest.fn()}
            savingGraph={false}
            extraDirty={false}
            focusNodeId=""
            onFocusNodeHandled={() => {}}
            onDraftGraphChange={onDraftGraphChange}
            conceptPanelCollapsed={false}
            onToggleConceptPanel={() => {}}
        />
    );

    enterEditMode();
    fireEvent.click(screen.getByTestId("mock-select-edge"));
    await waitFor(() => expect(screen.getByTestId("mock-selected-edge")).toHaveTextContent("e_existing"));

    fireEvent.click(screen.getByTestId("mock-delete-edge"));
    await waitFor(() => {
        const latestGraph = onDraftGraphChange.mock.calls[onDraftGraphChange.mock.calls.length - 1][0] as CDG;
        expect(latestGraph.edges).toHaveLength(0);
    });
});

test("dragging a node should persist position without reparenting edges", async () => {
    const onDraftGraphChange = jest.fn();

    render(
        <FlowPanel
            conversationId="cid_drag"
            locale="zh-CN"
            graph={graphWithTwoNodes([
                {
                    id: "e_existing",
                    from: "n1",
                    to: "n2",
                    type: "enable",
                    confidence: 0.72,
                },
            ])}
            concepts={[]}
            motifs={[]}
            motifLinks={[]}
            motifReasoningView={{ nodes: [], edges: [], steps: [] }}
            activeConceptId=""
            activeMotifId=""
            generatingGraph={false}
            onNodeEvidenceHover={() => {}}
            onSelectMotif={() => {}}
            onSelectConcept={() => {}}
            onSaveGraph={jest.fn()}
            savingGraph={false}
            extraDirty={false}
            focusNodeId=""
            onFocusNodeHandled={() => {}}
            onDraftGraphChange={onDraftGraphChange}
            conceptPanelCollapsed={false}
            onToggleConceptPanel={() => {}}
        />
    );

    enterEditMode();
    fireEvent.click(screen.getByTestId("mock-drag-node"));

    await waitFor(() => {
        const latestGraph = onDraftGraphChange.mock.calls[onDraftGraphChange.mock.calls.length - 1][0] as CDG;
        const movedNode = latestGraph.nodes.find((node) => node.id === "n2");
        expect((movedNode?.value as any)?.ui).toEqual({ x: 140, y: 96 });
        expect(latestGraph.edges).toEqual([
            expect.objectContaining({
                id: "e_existing",
                from: "n1",
                to: "n2",
                type: "enable",
            }),
        ]);
    });
});

test("view mode should keep graph read only until the user switches to edit mode", async () => {
    const onDraftGraphChange = jest.fn();

    render(
        <FlowPanel
            conversationId="cid_readonly"
            locale="zh-CN"
            graph={graphWithTwoNodes()}
            concepts={[]}
            motifs={[]}
            motifLinks={[]}
            motifReasoningView={{ nodes: [], edges: [], steps: [] }}
            activeConceptId=""
            activeMotifId=""
            generatingGraph={false}
            onNodeEvidenceHover={() => {}}
            onSelectMotif={() => {}}
            onSelectConcept={() => {}}
            onSaveGraph={jest.fn()}
            savingGraph={false}
            extraDirty={false}
            focusNodeId=""
            onFocusNodeHandled={() => {}}
            onDraftGraphChange={onDraftGraphChange}
            conceptPanelCollapsed={false}
            onToggleConceptPanel={() => {}}
        />
    );

    expect(screen.getByRole("button", { name: "+ 新增节点" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "保存并生成建议" })).toBeDisabled();
    expect(screen.getByText("切到编辑模式后可修改")).toBeInTheDocument();

    const callsBeforeConnect = onDraftGraphChange.mock.calls.length;
    fireEvent.click(screen.getByTestId("mock-connect-edge"));
    expect(onDraftGraphChange.mock.calls.length).toBe(callsBeforeConnect);

    enterEditMode();
    expect(screen.getByRole("button", { name: "+ 新增节点" })).toBeEnabled();
});

test("motif edit mode should create a user motif link from canvas connect", async () => {
    const onMotifLinksChange = jest.fn();

    render(
        <FlowPanel
            conversationId="cid_motif_link"
            locale="zh-CN"
            graph={graphWithTwoNodes()}
            concepts={[]}
            motifs={baseMotifs() as any}
            motifLinks={[]}
            motifReasoningView={{ nodes: [], edges: [], steps: [] }}
            activeConceptId=""
            activeMotifId=""
            generatingGraph={false}
            onNodeEvidenceHover={() => {}}
            onSelectMotif={() => {}}
            onSelectConcept={() => {}}
            onMotifLinksChange={onMotifLinksChange}
            onSaveGraph={jest.fn()}
            savingGraph={false}
            extraDirty={false}
            focusNodeId=""
            onFocusNodeHandled={() => {}}
            onDraftGraphChange={() => {}}
            conceptPanelCollapsed={false}
            onToggleConceptPanel={() => {}}
        />
    );

    fireEvent.click(screen.getByRole("button", { name: "Motif 推理" }));
    enterEditMode();
    expect(latestMotifCanvasProps?.canvasMode).toBe("edit");

    fireEvent.click(screen.getByTestId("mock-connect-motif-link"));

    await waitFor(() => expect(onMotifLinksChange).toHaveBeenCalledTimes(1));
    const nextLinks = onMotifLinksChange.mock.calls[0][0] as any[];
    expect(nextLinks).toHaveLength(1);
    expect(nextLinks[0]).toEqual(
        expect.objectContaining({
            fromMotifId: "m1",
            toMotifId: "m2",
            type: "supports",
            source: "user",
        })
    );
});

test("motif edit mode should update and delete a selected motif link", async () => {
    const onMotifLinksChange = jest.fn();

    render(
        <FlowPanel
            conversationId="cid_motif_link_edit"
            locale="zh-CN"
            graph={graphWithTwoNodes()}
            concepts={[]}
            motifs={baseMotifs() as any}
            motifLinks={[
                {
                    id: "ml_existing",
                    fromMotifId: "m1",
                    toMotifId: "m2",
                    type: "supports",
                    confidence: 0.76,
                    source: "user",
                    updatedAt: "2026-03-07T00:00:00.000Z",
                },
            ]}
            motifReasoningView={{ nodes: [], edges: [], steps: [] }}
            activeConceptId=""
            activeMotifId=""
            generatingGraph={false}
            onNodeEvidenceHover={() => {}}
            onSelectMotif={() => {}}
            onSelectConcept={() => {}}
            onMotifLinksChange={onMotifLinksChange}
            onSaveGraph={jest.fn()}
            savingGraph={false}
            extraDirty={false}
            focusNodeId=""
            onFocusNodeHandled={() => {}}
            onDraftGraphChange={() => {}}
            conceptPanelCollapsed={false}
            onToggleConceptPanel={() => {}}
        />
    );

    fireEvent.click(screen.getByRole("button", { name: "Motif 推理" }));
    enterEditMode();
    fireEvent.click(screen.getByTestId("mock-select-motif-link"));

    await waitFor(() => expect(screen.getByLabelText("关系类型")).toHaveValue("supports"));

    fireEvent.change(screen.getByLabelText("关系类型"), { target: { value: "refines" } });
    await waitFor(() =>
        expect(onMotifLinksChange).toHaveBeenCalledWith([
            expect.objectContaining({
                id: "ml_existing",
                type: "refines",
            }),
        ])
    );

    fireEvent.click(screen.getByRole("button", { name: "删除关系" }));
    await waitFor(() => {
        const lastCall = onMotifLinksChange.mock.calls[onMotifLinksChange.mock.calls.length - 1][0] as any[];
        expect(lastCall).toHaveLength(0);
    });
});
