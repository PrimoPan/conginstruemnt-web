import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { CDG } from "../core/type";
import { normalizeGraphClient } from "../core/graphSafe";

export const CANVAS_DRAFT_STORAGE_KEY = "ci_canvas_drafts_v1";

const DEFAULT_CONVERSATION_BUCKET = "__default__";

export type CanvasDraftEntry = {
    draftGraph: CDG;
    dirty: boolean;
    updatedAt: string;
};

export type CanvasDraftStoreState = {
    draftsByConversation: Record<string, CanvasDraftEntry>;
    setConversationDraft: (conversationId: string, draftGraph: CDG, dirty: boolean) => void;
    getConversationDraft: (conversationId: string) => CanvasDraftEntry | null;
    clearAllDrafts: () => void;
};

export function canvasDraftBucketKey(conversationId: string): string {
    const key = String(conversationId || "").trim();
    return key || DEFAULT_CONVERSATION_BUCKET;
}

function normalizeDraftGraph(graph: CDG): CDG {
    return normalizeGraphClient(graph);
}

function createCanvasDraftStoreState() {
    return persist<CanvasDraftStoreState>(
        (set, get) => ({
            draftsByConversation: {},

            setConversationDraft: (conversationId, draftGraph, dirty) => {
                const bucketKey = canvasDraftBucketKey(conversationId);
                set((state) => ({
                    draftsByConversation: {
                        ...state.draftsByConversation,
                        [bucketKey]: {
                            draftGraph: normalizeDraftGraph(draftGraph),
                            dirty: !!dirty,
                            updatedAt: new Date().toISOString(),
                        },
                    },
                }));
            },

            getConversationDraft: (conversationId) => {
                const bucketKey = canvasDraftBucketKey(conversationId);
                return get().draftsByConversation[bucketKey] || null;
            },

            clearAllDrafts: () => {
                set({ draftsByConversation: {} });
            },
        }),
        {
            name: CANVAS_DRAFT_STORAGE_KEY,
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                draftsByConversation: state.draftsByConversation,
            }),
        }
    );
}

export function createCanvasDraftStore() {
    return create<CanvasDraftStoreState>()(createCanvasDraftStoreState());
}

export const useCanvasDraftStore = createCanvasDraftStore();
