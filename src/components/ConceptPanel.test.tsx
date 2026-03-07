import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConceptPanel } from "./ConceptPanel";

function renderPanel(overrides?: Partial<React.ComponentProps<typeof ConceptPanel>>) {
  const props: React.ComponentProps<typeof ConceptPanel> = {
    locale: "zh-CN",
    concepts: [],
    motifs: [],
    motifTransferState: {
      recommendations: [],
      decisions: [],
      activeInjections: [],
      feedbackEvents: [],
      revisionRequests: [],
    },
    transferRecommendationsEnabled: true,
    transferReviewStage: "fresh_task",
    motifLibrary: [],
    contexts: [],
    activeConceptId: "",
    activeMotifId: "",
    saving: false,
    onSelect: () => undefined,
    onSelectMotif: () => undefined,
    onClearSelect: () => undefined,
    onClearMotifSelect: () => undefined,
    onPatchConcept: () => undefined,
    onPatchMotif: () => undefined,
    ...overrides,
  };
  render(<ConceptPanel {...props} />);
  fireEvent.click(screen.getByRole("button", { name: /Motif \(\d+\)/ }));
}

test("does not surface transfer UI before the first turn of a new trip", () => {
  renderPanel({
    motifLibrary: [
      {
        motif_type_id: "motif_budget_duration",
        motif_type_title: "预算 + 总时长",
        dependency: "constraint",
        abstraction_levels: ["L1"],
        current_version_id: "v1",
        source_task_ids: ["task_prev"],
        status: "active",
        usage_stats: {
          adopted_count: 1,
          ignored_count: 0,
          feedback_negative_count: 0,
          transfer_confidence: 0.84,
        },
        versions: [
          {
            version_id: "v1",
            version: 1,
            title: "预算 + 总时长",
            dependency: "constraint",
            reusable_description: "预算和总时长一起限制目标。",
            abstraction_levels: { L1: "预算和时长联动" },
            status: "active",
            created_at: "2026-03-07T00:00:00.000Z",
            updated_at: "2026-03-07T00:00:00.000Z",
          },
        ],
      } as any,
    ],
  });

  expect(screen.queryByText("这次可能可以沿用的思路")).not.toBeInTheDocument();
  expect(screen.queryByText("历史思路库")).not.toBeInTheDocument();
});

test("uses section-5 user language after first-turn retrieval instead of internal mode labels", () => {
  renderPanel({
    transferReviewStage: "ready",
    motifTransferState: {
      recommendations: [
        {
          candidate_id: "cand_1",
          motif_type_id: "motif_local_lodging",
          motif_type_title: "优先住当地风格住宿",
          dependency: "enable",
          reusable_description: "如果这次也想更贴近当地生活，可以继续优先看当地风格住宿。",
          status: "active",
          reason: "高匹配",
          match_score: 0.86,
          recommended_mode: "A",
          decision_status: "pending",
          created_at: "2026-03-07T00:00:00.000Z",
        },
      ],
      decisions: [],
      activeInjections: [],
      feedbackEvents: [],
      revisionRequests: [],
    },
    motifLibrary: [
      {
        motif_type_id: "motif_local_food",
        motif_type_title: "优先找本地饮食体验",
        dependency: "enable",
        abstraction_levels: ["L1"],
        current_version_id: "v2",
        source_task_ids: ["task_prev"],
        status: "active",
        usage_stats: {
          adopted_count: 1,
          ignored_count: 0,
          feedback_negative_count: 0,
          transfer_confidence: 0.78,
        },
        versions: [
          {
            version_id: "v2",
            version: 2,
            title: "优先找本地饮食体验",
            dependency: "enable",
            reusable_description: "如果这次仍然重视在地感，可以继续优先安排本地饮食体验。",
            abstraction_levels: { L1: "优先本地饮食" },
            status: "active",
            created_at: "2026-03-07T00:00:00.000Z",
            updated_at: "2026-03-07T00:00:00.000Z",
          },
        ],
      } as any,
    ],
  });

  expect(screen.getByText("这次可能可以沿用的思路")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "直接沿用" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "先改一下" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "这次不用" })).toBeInTheDocument();
  expect(screen.getByText(/建议直接沿用/)).toBeInTheDocument();
  expect(screen.getByText("历史思路库")).toBeInTheDocument();
  expect(screen.queryByText(/Mode C/i)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "作为参考" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "作为约束" })).not.toBeInTheDocument();
});

test("renders motif cards with readable summary, named pattern, and no empty source footer", () => {
  renderPanel({
    motifs: [
      {
        id: "motif_1",
        motif_id: "motif_1",
        motif_type: "determine",
        motifType: "pair",
        relation: "determine",
        dependencyClass: "determine",
        causalOperator: "intervention",
        title: "预算直接决定住宿档位",
        description: "d",
        confidence: 0.84,
        status: "active",
        conceptIds: ["c1", "c2"],
        concept_bindings: ["c1", "c2"],
        anchorConceptId: "c2",
        supportEdgeIds: [],
        supportNodeIds: [],
        roles: { sources: ["c1"], target: "c2" },
        scope: "global",
        aliases: [],
        motif_type_title: "Context-Driven Preference Prioritization",
        updatedAt: "2026-03-07T00:00:00.000Z",
      } as any,
    ],
    contexts: [
      {
        id: "ctx_1",
        key: "family_trip",
        title: "家庭旅行规划",
        summary: "家庭旅行规划",
        status: "active",
        confidence: 0.92,
        conceptIds: ["c1", "c2"],
        motifIds: ["motif_1"],
        nodeIds: [],
        tags: [],
        openQuestions: [],
        locked: false,
        paused: false,
        updatedAt: "2026-03-07T00:00:00.000Z",
      },
    ] as any,
    concepts: [
      {
        id: "c1",
        kind: "belief",
        validationStatus: "confirmed",
        extractionStage: "identification",
        polarity: "positive",
        scope: "global",
        family: "other",
        semanticKey: "c1",
        title: "预算",
        description: "预算",
        score: 0.9,
        nodeIds: [],
        evidenceTerms: [],
        sourceMsgIds: [],
        locked: false,
        paused: false,
        updatedAt: "2026-03-07T00:00:00.000Z",
      },
      {
        id: "c2",
        kind: "belief",
        validationStatus: "confirmed",
        extractionStage: "identification",
        polarity: "positive",
        scope: "global",
        family: "other",
        semanticKey: "c2",
        title: "住宿档位",
        description: "住宿档位",
        score: 0.9,
        nodeIds: [],
        evidenceTerms: [],
        sourceMsgIds: [],
        locked: false,
        paused: false,
        updatedAt: "2026-03-07T00:00:00.000Z",
      },
    ] as any,
  });

  expect(screen.getByText("预算会直接决定住宿档位")).toBeInTheDocument();
  expect(screen.getByText("Context-Driven Preference Prioritization")).toBeInTheDocument();
  expect(screen.getByText("C1 预算 -> C2 住宿档位")).toBeInTheDocument();
  expect(screen.getByText("Context:")).toBeInTheDocument();
  expect(screen.getByText("家庭旅行规划")).toBeInTheDocument();
  expect(screen.getByText(/这条思路有多靠谱/)).toBeInTheDocument();
  expect(screen.queryByText(/来源:\s*n\/a|source:\s*n\/a/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/干预|Intervention|Determine（/i)).not.toBeInTheDocument();
});
