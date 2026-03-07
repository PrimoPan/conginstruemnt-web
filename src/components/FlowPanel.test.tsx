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
    MotifReasoningCanvas: () => <div data-testid="mock-motif-canvas" />,
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

beforeEach(() => {
    localStorage.clear();
    useCanvasDraftStore.getState().clearAllDrafts();
    mockSetNodes.mockClear();
    mockSetEdges.mockClear();
    mockOnNodesChange.mockClear();
    mockOnEdgesChange.mockClear();
    latestCanvasProps = null;
    latestInspectorProps = null;
});

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
