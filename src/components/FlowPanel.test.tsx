import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CDG } from "../core/type";
import { useCanvasDraftStore } from "../stores/canvasDraftStore";
import { FlowPanel } from "./FlowPanel";

const mockSetNodes = jest.fn();
const mockSetEdges = jest.fn();
const mockOnNodesChange = jest.fn();
const mockOnEdgesChange = jest.fn();

jest.mock("./flow/FlowCanvas", () => ({
    FlowCanvas: () => <div data-testid="mock-flow-canvas" />,
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
    FlowInspector: () => null,
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

beforeEach(() => {
    localStorage.clear();
    useCanvasDraftStore.getState().clearAllDrafts();
    mockSetNodes.mockClear();
    mockSetEdges.mockClear();
    mockOnNodesChange.mockClear();
    mockOnEdgesChange.mockClear();
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
