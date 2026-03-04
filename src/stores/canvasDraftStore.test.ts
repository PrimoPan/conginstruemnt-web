import type { CDG } from "../core/type";
import { CANVAS_DRAFT_STORAGE_KEY, createCanvasDraftStore } from "./canvasDraftStore";

function makeGraph(id: string, x: number, y: number): CDG {
    return {
        id,
        version: 1,
        nodes: [
            {
                id: `n_${id}`,
                type: "belief",
                statement: `graph ${id}`,
                status: "confirmed",
                confidence: 0.8,
                value: { ui: { x, y } },
            },
        ],
        edges: [],
    };
}

beforeEach(() => {
    localStorage.clear();
});

test("persists drafts in isolated conversation buckets", () => {
    const store = createCanvasDraftStore();
    const g1 = makeGraph("g1", 100, 200);
    const g2 = makeGraph("g2", 320, 440);

    store.getState().setConversationDraft("cid_1", g1, true);
    store.getState().setConversationDraft("cid_2", g2, false);

    const d1 = store.getState().getConversationDraft("cid_1");
    const d2 = store.getState().getConversationDraft("cid_2");
    expect(d1?.draftGraph.id).toBe("g1");
    expect((d1?.draftGraph.nodes[0].value as any)?.ui).toEqual({ x: 100, y: 200 });
    expect(d1?.dirty).toBe(true);
    expect(d2?.draftGraph.id).toBe("g2");
    expect((d2?.draftGraph.nodes[0].value as any)?.ui).toEqual({ x: 320, y: 440 });
    expect(d2?.dirty).toBe(false);
});

test("restores persisted drafts after store recreation", async () => {
    const firstStore = createCanvasDraftStore();
    const g1 = makeGraph("g_restore", 512, 256);
    firstStore.getState().setConversationDraft("cid_restore", g1, true);
    expect(localStorage.getItem(CANVAS_DRAFT_STORAGE_KEY)).toBeTruthy();

    const recreatedStore = createCanvasDraftStore();
    await (recreatedStore as any).persist.rehydrate();
    const restored = recreatedStore.getState().getConversationDraft("cid_restore");
    expect(restored?.draftGraph.id).toBe("g_restore");
    expect((restored?.draftGraph.nodes[0].value as any)?.ui).toEqual({ x: 512, y: 256 });
    expect(restored?.dirty).toBe(true);
});

test("keeps buckets isolated when switching conversations", () => {
    const store = createCanvasDraftStore();
    store.getState().setConversationDraft("cid_a", makeGraph("ga", 11, 22), true);
    store.getState().setConversationDraft("cid_b", makeGraph("gb", 77, 88), true);
    store.getState().setConversationDraft("cid_a", makeGraph("ga_next", 33, 44), false);

    const a = store.getState().getConversationDraft("cid_a");
    const b = store.getState().getConversationDraft("cid_b");
    expect(a?.draftGraph.id).toBe("ga_next");
    expect((a?.draftGraph.nodes[0].value as any)?.ui).toEqual({ x: 33, y: 44 });
    expect(a?.dirty).toBe(false);
    expect(b?.draftGraph.id).toBe("gb");
    expect((b?.draftGraph.nodes[0].value as any)?.ui).toEqual({ x: 77, y: 88 });
});
