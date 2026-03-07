import React from "react";
import { render, screen } from "@testing-library/react";
import { MotifReasoningCanvas } from "./MotifReasoningCanvas";

test("does not show source n/a when a reasoning node has no source refs", async () => {
    render(
        <MotifReasoningCanvas
            locale="zh-CN"
            motifs={[
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
                } as any,
            ]}
            motifLinks={[]}
            concepts={[
                {
                    id: "c1",
                    title: "携家出游",
                    kind: "belief",
                    family: "people",
                    semanticKey: "slot:people",
                    validationStatus: "resolved",
                    extractionStage: "disambiguation",
                    polarity: "positive",
                    scope: "global",
                    description: "携家出游",
                    score: 0.9,
                    nodeIds: [],
                    evidenceTerms: [],
                    sourceMsgIds: [],
                    locked: false,
                    paused: false,
                    updatedAt: "2026-03-07T00:00:00.000Z",
                } as any,
                {
                    id: "c2",
                    title: "儿童友好选项",
                    kind: "preference",
                    family: "lodging",
                    semanticKey: "slot:lodging",
                    validationStatus: "resolved",
                    extractionStage: "disambiguation",
                    polarity: "positive",
                    scope: "global",
                    description: "儿童友好选项",
                    score: 0.9,
                    nodeIds: [],
                    evidenceTerms: [],
                    sourceMsgIds: [],
                    locked: false,
                    paused: false,
                    updatedAt: "2026-03-07T00:00:00.000Z",
                } as any,
            ]}
            reasoningView={{
                nodes: [
                    {
                        id: "rm_1",
                        motifId: "m1",
                        title: "旧标题",
                        relation: "enable",
                        dependencyClass: "enable",
                        motifType: "pair",
                        status: "active",
                        confidence: 0.82,
                        pattern: "C1 -> C2",
                        conceptIds: ["c1", "c2"],
                        conceptTitles: ["携家出游", "儿童友好选项"],
                        sourceRefs: [],
                    },
                ],
                edges: [],
                steps: [],
            }}
        />
    );

    expect(await screen.findByText("携家出游会优先考虑儿童友好选项")).toBeInTheDocument();
    expect(screen.queryByText(/来源:\s*n\/a|source:\s*n\/a/i)).not.toBeInTheDocument();
});
