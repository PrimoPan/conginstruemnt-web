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
  fireEvent.click(screen.getByRole("button", { name: /Motif \(0\)/ }));
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
