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
  expect(screen.getByRole("button", { name: "先加入待确认" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "先改一下" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "这次不用" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "整趟任务" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "仅当前问题" })).toBeInTheDocument();
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
          display_title: "携家出游会优先考虑儿童友好选项",
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

  expect(screen.getByText("携家出游会优先考虑儿童友好选项")).toBeInTheDocument();
  expect(screen.getByText("Context-Driven Preference Prioritization")).toBeInTheDocument();
  expect(screen.getByText("C1 预算 -> C2 住宿档位")).toBeInTheDocument();
  expect(screen.getByText("Context:")).toBeInTheDocument();
  expect(screen.getByText("家庭旅行规划")).toBeInTheDocument();
  expect(screen.getByText(/这条思路有多靠谱/)).toBeInTheDocument();
  expect(screen.queryByText(/来源:\s*n\/a|source:\s*n\/a/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/干预|Intervention|Determine（/i)).not.toBeInTheDocument();
});

test("shows explicit confirmation controls after a recommendation is queued", () => {
  renderPanel({
    transferReviewStage: "ready",
    motifTransferState: {
      recommendations: [
        {
          candidate_id: "cand_pending",
          motif_type_id: "motif_local_pace",
          motif_type_title: "慢节奏优先",
          dependency: "constraint",
          reusable_description: "减少跨城折返，留足休整。",
          status: "active",
          reason: "高匹配",
          match_score: 0.82,
          recommended_mode: "A",
          decision_status: "pending_confirmation",
          created_at: "2026-03-07T00:00:00.000Z",
        },
      ],
      decisions: [],
      activeInjections: [
        {
          candidate_id: "cand_pending",
          motif_type_id: "motif_local_pace",
          motif_type_title: "慢节奏优先",
          mode: "A",
          injection_state: "pending_confirmation",
          transfer_confidence: 0.82,
          constraint_text: "减少跨城折返，留足休整。",
          adopted_at: "2026-03-07T00:00:00.000Z",
          application_scope: "local",
        },
      ],
      feedbackEvents: [],
      revisionRequests: [],
    },
  });

  expect(screen.getByText(/已加入待确认/)).toBeInTheDocument();
  expect(screen.getByText(/仅当前问题/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "确认沿用" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "先不沿用" })).toBeInTheDocument();
});

test("supports batch transfer review actions for multiple visible recommendations", () => {
  const onTransferBatchDecision = jest.fn();
  renderPanel({
    transferReviewStage: "ready",
    onTransferBatchDecision,
    motifTransferState: {
      recommendations: [
        {
          candidate_id: "cand_batch_1",
          motif_type_id: "motif_local_pace",
          motif_type_title: "慢节奏优先",
          dependency: "constraint",
          reusable_description: "减少跨城折返，留足休整。",
          status: "active",
          reason: "高匹配",
          match_score: 0.82,
          recommended_mode: "A",
          decision_status: "pending",
          created_at: "2026-03-07T00:00:00.000Z",
        },
        {
          candidate_id: "cand_batch_2",
          motif_type_id: "motif_child_friendly",
          motif_type_title: "儿童友好优先",
          dependency: "determine",
          reusable_description: "优先儿童友好的住宿与活动。",
          status: "active",
          reason: "高匹配",
          match_score: 0.8,
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
  });

  fireEvent.click(screen.getByRole("button", { name: "全选当前建议" }));
  fireEvent.click(screen.getByRole("button", { name: "批量加入待确认" }));

  expect(onTransferBatchDecision).toHaveBeenCalledWith({
    items: [
      expect.objectContaining({
        candidateId: "cand_batch_1",
        action: "adopt",
        applicationScope: "trip",
        recommendation: expect.objectContaining({ motif_type_title: "慢节奏优先" }),
      }),
      expect.objectContaining({
        candidateId: "cand_batch_2",
        action: "adopt",
        applicationScope: "trip",
        recommendation: expect.objectContaining({ motif_type_title: "儿童友好优先" }),
      }),
    ],
  });
});

test("revision editor submits diff fields and partial propagation targets", () => {
  const onReviseMotifLibrary = jest.fn();
  renderPanel({
    transferReviewStage: "ready",
    onReviseMotifLibrary,
    concepts: [
      {
        id: "c1",
        kind: "constraint",
        validationStatus: "resolved",
        extractionStage: "identification",
        polarity: "positive",
        scope: "global",
        family: "limiting_factor",
        semanticKey: "c1",
        title: "午休缓冲",
        description: "午休缓冲",
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
        kind: "preference",
        validationStatus: "resolved",
        extractionStage: "identification",
        polarity: "positive",
        scope: "global",
        family: "goal",
        semanticKey: "c2",
        title: "轻松节奏",
        description: "轻松节奏",
        score: 0.9,
        nodeIds: [],
        evidenceTerms: [],
        sourceMsgIds: [],
        locked: false,
        paused: false,
        updatedAt: "2026-03-07T00:00:00.000Z",
      },
      {
        id: "c3",
        kind: "preference",
        validationStatus: "resolved",
        extractionStage: "identification",
        polarity: "positive",
        scope: "global",
        family: "lodging",
        semanticKey: "c3",
        title: "稳定住宿",
        description: "稳定住宿",
        score: 0.88,
        nodeIds: [],
        evidenceTerms: [],
        sourceMsgIds: [],
        locked: false,
        paused: false,
        updatedAt: "2026-03-07T00:00:00.000Z",
      },
    ] as any,
    motifs: [
      {
        id: "m_focus",
        motif_id: "m_focus",
        motif_type: "constraint",
        templateKey: "tmpl_focus",
        motifType: "pair",
        relation: "constraint",
        dependencyClass: "constraint",
        roles: { sources: ["c1"], target: "c2" },
        scope: "global",
        aliases: [],
        concept_bindings: ["c1", "c2"],
        conceptIds: ["c1", "c2"],
        anchorConceptId: "c2",
        title: "午休缓冲限制轻松节奏",
        description: "d",
        confidence: 0.86,
        supportEdgeIds: [],
        supportNodeIds: [],
        status: "active",
        novelty: "new",
        updatedAt: "2026-03-07T00:00:00.000Z",
        motif_type_id: "motif_local_pace",
      },
      {
        id: "m_downstream",
        motif_id: "m_downstream",
        motif_type: "determine",
        templateKey: "tmpl_downstream",
        motifType: "pair",
        relation: "determine",
        dependencyClass: "determine",
        roles: { sources: ["c2"], target: "c3" },
        scope: "global",
        aliases: [],
        concept_bindings: ["c2", "c3"],
        conceptIds: ["c2", "c3"],
        anchorConceptId: "c3",
        title: "轻松节奏决定稳定住宿",
        description: "d2",
        confidence: 0.82,
        supportEdgeIds: [],
        supportNodeIds: [],
        status: "active",
        novelty: "new",
        updatedAt: "2026-03-07T00:00:00.000Z",
      },
    ] as any,
    motifLinks: [
      {
        id: "ml_1",
        fromMotifId: "m_focus",
        toMotifId: "m_downstream",
        type: "supports",
        confidence: 0.82,
        source: "system",
        updatedAt: "2026-03-07T00:00:00.000Z",
      },
    ],
    motifLibrary: [
      {
        motif_type_id: "motif_local_pace",
        motif_type_title: "慢节奏优先",
        dependency: "constraint",
        reusable_description: "减少跨城折返，留足休整。",
        abstraction_levels: ["L1", "L2", "L3"],
        current_version_id: "mv_pace_1",
        source_task_ids: ["task_prev"],
        status: "active",
        usage_count: 3,
        versions: [
          {
            version_id: "mv_pace_1",
            version: 1,
            title: "慢节奏优先",
            dependency: "constraint",
            reusable_description: "减少跨城折返，留足休整。",
            abstraction_levels: {
              L1: "不要太赶",
              L2: "低强度节奏优先",
              L3: "慢节奏旅行",
            },
            status: "active",
            created_at: "2026-03-07T00:00:00.000Z",
            updated_at: "2026-03-07T00:00:00.000Z",
          },
        ],
        usage_stats: {
          adopted_count: 4,
          ignored_count: 1,
          feedback_negative_count: 0,
          transfer_confidence: 0.81,
        },
      } as any,
    ],
    motifTransferState: {
      recommendations: [],
      decisions: [],
      activeInjections: [
        {
          candidate_id: "cand_keep",
          motif_type_id: "motif_local_pace",
          motif_type_title: "慢节奏优先",
          mode: "A",
          injection_state: "injected",
          transfer_confidence: 0.82,
          constraint_text: "减少跨城折返，留足休整。",
          adopted_at: "2026-03-07T00:00:00.000Z",
          application_scope: "trip",
        },
        {
          candidate_id: "cand_drop",
          motif_type_id: "motif_local_pace",
          motif_type_title: "慢节奏优先",
          mode: "A",
          injection_state: "injected",
          transfer_confidence: 0.7,
          constraint_text: "只在午休安排里保留。",
          adopted_at: "2026-03-07T00:00:00.000Z",
          application_scope: "local",
        },
      ],
      feedbackEvents: [],
      revisionRequests: [
        {
          request_id: "req_1",
          motif_type_id: "motif_local_pace",
          candidate_id: "cand_keep",
          reason: "explicit_negation_detected",
          detected_text: "这次不用整趟都慢节奏，只要把午休保住就行。",
          detected_at: "2026-03-07T00:00:00.000Z",
          status: "pending_user_choice",
          options: ["overwrite", "new_version"],
          suggested_action: "new_version",
          affected_injections: [
            {
              candidate_id: "cand_keep",
              motif_type_id: "motif_local_pace",
              motif_type_title: "慢节奏优先",
              injection_state: "injected",
              application_scope: "trip",
              constraint_text: "减少跨城折返，留足休整。",
            },
            {
              candidate_id: "cand_drop",
              motif_type_id: "motif_local_pace",
              motif_type_title: "慢节奏优先",
              injection_state: "injected",
              application_scope: "local",
              constraint_text: "只在午休安排里保留。",
            },
          ],
        },
      ],
    },
  });

  fireEvent.click(screen.getByRole("button", { name: "查看 diff 并处理" }));
  expect(screen.getByText("Before")).toBeInTheDocument();
  expect(screen.getByText("After")).toBeInTheDocument();
  expect(screen.getByText("Affected motif links")).toBeInTheDocument();
  expect(screen.getAllByText(/午休缓冲会限制轻松节奏/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/轻松节奏会直接决定稳定住宿/).length).toBeGreaterThan(0);
  fireEvent.change(screen.getByLabelText("标题"), { target: { value: "午休优先，但不必整趟都慢" } });
  fireEvent.change(screen.getByLabelText("复用描述"), {
    target: { value: "保留午休和低强度时段，但不强制整趟都压低节奏。" },
  });
  fireEvent.click(screen.getByLabelText(/cand_drop/i));
  fireEvent.click(screen.getByRole("button", { name: "保存为新版本" }));

  expect(onReviseMotifLibrary).toHaveBeenCalledWith({
    motifTypeId: "motif_local_pace",
    requestId: "req_1",
    choice: "new_version",
    title: "午休优先，但不必整趟都慢",
    dependency: "constraint",
    reusableDescription: "保留午休和低强度时段，但不强制整趟都压低节奏。",
    abstractionText: {
      L1: "不要太赶",
      L2: "低强度节奏优先",
      L3: "慢节奏旅行",
    },
    targetCandidateIds: ["cand_keep"],
  });
});
