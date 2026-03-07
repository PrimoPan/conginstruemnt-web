import { expect, test, type Page } from "@playwright/test";

const CONVERSATION_ID = "conv_transfer_review";
const NOW = "2026-03-08T10:00:00.000Z";

function makeBaseConversationPayload() {
  return {
    conversationId: CONVERSATION_ID,
    title: "Transfer Review Demo",
    locale: "zh-CN",
    transferRecommendationsEnabled: true,
    systemPrompt: "test system prompt",
    graph: {
      id: CONVERSATION_ID,
      version: 1,
      nodes: [],
      edges: [],
    },
    concepts: [],
    motifs: [],
    motifLinks: [],
    contexts: [],
    travelPlanState: {
      version: 1,
      plan_version: 1,
      task_id: "task_transfer_review",
      updatedAt: NOW,
      last_updated: NOW,
      summary: "巴黎新任务，等待用户决定是否沿用历史 motif。",
      trip_goal_summary: "巴黎新任务，等待用户决定是否沿用历史 motif。",
      destinations: ["巴黎"],
      destination_scope: ["巴黎"],
      constraints: [],
      travelers: ["两人"],
      candidate_options: [],
      itinerary_outline: [],
      day_by_day_plan: [],
      transport_plan: [],
      stay_plan: [],
      food_plan: [],
      risk_notes: [],
      budget_notes: [],
      open_questions: [],
      rationale_refs: [],
      source_map: {},
      export_ready_text: "",
      changelog: [],
      dayPlans: [],
      source: { turnCount: 1 },
    },
    taskDetection: {
      current_task_id: "task_transfer_review",
      is_task_switch: false,
      reason: "same_trip_context",
      signals: [],
      mode: "single_conversation",
      confidence: 0.4,
      switch_reason_code: "continuous",
    },
    cognitiveState: {
      current_task_id: "task_transfer_review",
      tasks: [],
      motif_library: [
        {
          motif_type_id: "motif_local_pace",
          motif_type_title: "慢节奏优先",
          dependency: "constraint",
          abstraction_levels: ["L1", "L2", "L3"],
          status: "active",
          current_version_id: "mv_pace_1",
          reusable_description: "减少跨城折返，留足休整。",
          usage_count: 2,
          source_task_ids: ["task_prev"],
          usage_stats: {
            adopted_count: 2,
            ignored_count: 0,
            feedback_negative_count: 0,
            transfer_confidence: 0.84,
          },
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
              source_task_id: "task_prev",
              source_conversation_id: "conv_prev",
              created_at: NOW,
              updated_at: NOW,
            },
          ],
        },
      ],
    },
    motifTransferState: {
      recommendations: [],
      decisions: [],
      activeInjections: [],
      feedbackEvents: [],
      revisionRequests: [],
    },
    portfolioDocumentState: null,
    taskLifecycle: {
      status: "active",
      updatedAt: NOW,
      resumable: false,
      resume_required: false,
    },
  };
}

async function bootSession(page: Page) {
  await page.goto("/");
  await page.getByPlaceholder(/用户名|Username/i).fill("e2e_user");
  await page.getByRole("button", { name: /登录|Login/i }).click();
  await page.getByRole("button", { name: /新建对话|New Chat/i }).click();
  await page.getByRole("button", { name: /Motif \(\d+\)/ }).click();
}

test("batch transfer review should submit grouped decisions and render queued confirmation state", async ({ page }) => {
  let batchPayload: any = null;
  let conversation = {
    ...makeBaseConversationPayload(),
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
          match_score: 0.86,
          recommended_mode: "A",
          decision_status: "pending",
          created_at: NOW,
        },
        {
          candidate_id: "cand_batch_2",
          motif_type_id: "motif_child_friendly",
          motif_type_title: "儿童友好优先",
          dependency: "determine",
          reusable_description: "优先儿童友好的住宿与活动。",
          status: "active",
          reason: "高匹配",
          match_score: 0.81,
          recommended_mode: "A",
          decision_status: "pending",
          created_at: NOW,
        },
      ],
      decisions: [],
      activeInjections: [],
      feedbackEvents: [],
      revisionRequests: [],
    },
  } as any;

  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method().toUpperCase();

    if (path === "/api/auth/login" && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ userId: "u1", username: "e2e_user", sessionToken: "token_e2e" }),
      });
      return;
    }
    if (path === "/api/conversations" && method === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      return;
    }
    if (path === "/api/conversations" && method === "POST") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(conversation) });
      return;
    }
    if (path === `/api/conversations/${CONVERSATION_ID}` && method === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(conversation) });
      return;
    }
    if (path === `/api/conversations/${CONVERSATION_ID}/turns` && method === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      return;
    }
    if (path === `/api/conversations/${CONVERSATION_ID}/motif-transfer/batch-decision` && method === "POST") {
      batchPayload = JSON.parse(req.postData() || "{}");
      conversation = {
        ...conversation,
        motifTransferState: {
          ...conversation.motifTransferState,
          recommendations: conversation.motifTransferState.recommendations.map((rec: any) => ({
            ...rec,
            decision_status: "pending_confirmation",
            decision_at: NOW,
          })),
          decisions: (batchPayload.items || []).map((item: any, index: number) => ({
            id: `dec_${index}`,
            candidate_id: item.candidate_id,
            action: item.action,
            decision_status: "pending_confirmation",
            decided_at: NOW,
            application_scope: item.application_scope || "trip",
          })),
          activeInjections: (batchPayload.items || []).map((item: any) => ({
            candidate_id: item.candidate_id,
            motif_type_id: item.candidate_id === "cand_batch_1" ? "motif_local_pace" : "motif_child_friendly",
            motif_type_title: item.candidate_id === "cand_batch_1" ? "慢节奏优先" : "儿童友好优先",
            mode: "A",
            injection_state: "pending_confirmation",
            transfer_confidence: 0.82,
            constraint_text: item.candidate_id === "cand_batch_1" ? "减少跨城折返，留足休整。" : "优先儿童友好的住宿与活动。",
            adopted_at: NOW,
            application_scope: item.application_scope || "trip",
          })),
          feedbackEvents: [],
          revisionRequests: [],
        },
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          decisions: conversation.motifTransferState.decisions,
          followupQuestions: ["我先把这两条历史思路放进待确认区了。"],
          ...conversation,
          updatedAt: NOW,
        }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: `unhandled ${method} ${path}` }),
    });
  });

  await bootSession(page);
  await page.getByRole("button", { name: "全选当前建议" }).click();
  await page.getByRole("button", { name: "批量加入待确认" }).click();

  await expect.poll(() => batchPayload?.items?.length || 0).toBe(2);
  expect(batchPayload.items[0].action).toBe("adopt");
  expect(batchPayload.items[1].action).toBe("adopt");
  await expect(page.getByText(/已加入待确认/)).toHaveCount(2);
  await expect(page.getByRole("button", { name: "批量确认沿用" })).toBeVisible();
});

test("revision diff editor should submit edited fields and partial propagation targets", async ({ page }) => {
  let revisePayload: any = null;
  let conversation = {
    ...makeBaseConversationPayload(),
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
        updatedAt: NOW,
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
        updatedAt: NOW,
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
        updatedAt: NOW,
      },
    ],
    motifs: [
      {
        id: "m_focus",
        motif_id: "m_focus",
        motif_type: "constraint",
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
        description: "午休优先影响全程节奏",
        confidence: 0.86,
        supportEdgeIds: [],
        supportNodeIds: [],
        status: "active",
        novelty: "new",
        updatedAt: NOW,
        motif_type_id: "motif_local_pace",
      },
      {
        id: "m_downstream",
        motif_id: "m_downstream",
        motif_type: "determine",
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
        description: "低强度节奏会收紧住宿策略",
        confidence: 0.82,
        supportEdgeIds: [],
        supportNodeIds: [],
        status: "active",
        novelty: "new",
        updatedAt: NOW,
      },
    ],
    motifLinks: [
      {
        id: "ml_1",
        fromMotifId: "m_focus",
        toMotifId: "m_downstream",
        type: "supports",
        confidence: 0.82,
        source: "system",
        updatedAt: NOW,
      },
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
          adopted_at: NOW,
          application_scope: "trip",
        },
        {
          candidate_id: "cand_drop",
          motif_type_id: "motif_local_pace",
          motif_type_title: "慢节奏优先",
          mode: "A",
          injection_state: "injected",
          transfer_confidence: 0.74,
          constraint_text: "只在午休安排里保留。",
          adopted_at: NOW,
          application_scope: "local",
        },
      ],
      feedbackEvents: [],
      revisionRequests: [
        {
          request_id: "req_revision",
          motif_type_id: "motif_local_pace",
          candidate_id: "cand_keep",
          reason: "explicit_negation_detected",
          detected_text: "这次不用整趟都慢节奏，只要保住午休就行。",
          detected_at: NOW,
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
  } as any;

  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method().toUpperCase();

    if (path === "/api/auth/login" && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ userId: "u1", username: "e2e_user", sessionToken: "token_e2e" }),
      });
      return;
    }
    if (path === "/api/conversations" && method === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      return;
    }
    if (path === "/api/conversations" && method === "POST") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(conversation) });
      return;
    }
    if (path === `/api/conversations/${CONVERSATION_ID}` && method === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(conversation) });
      return;
    }
    if (path === `/api/conversations/${CONVERSATION_ID}/turns` && method === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      return;
    }
    if (path === `/api/conversations/${CONVERSATION_ID}/motif-library/revise` && method === "POST") {
      revisePayload = JSON.parse(req.postData() || "{}");
      conversation = {
        ...conversation,
        motifTransferState: {
          ...conversation.motifTransferState,
          revisionRequests: [],
        },
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          revised_entry: { motif_type_id: "motif_local_pace" },
          revision_summary: {
            choice: revisePayload.choice,
            previous_version_id: "mv_pace_1",
            current_version_id: revisePayload.choice === "overwrite" ? "mv_pace_1" : "mv_pace_2",
            overwritten_version_id: revisePayload.choice === "overwrite" ? "mv_pace_1" : undefined,
            version_created: revisePayload.choice !== "overwrite",
            changed_fields: [
              { field: "title", current_value: "慢节奏优先", next_value: revisePayload.title },
              {
                field: "reusable_description",
                current_value: "减少跨城折返，留足休整。",
                next_value: revisePayload.reusable_description,
              },
            ],
          },
          motifTransferState: conversation.motifTransferState,
          ...conversation,
          updatedAt: NOW,
        }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: `unhandled ${method} ${path}` }),
    });
  });

  await bootSession(page);
  await page.getByRole("button", { name: "查看 diff 并处理" }).click();
  const structure = page.locator(".TransferSuggestions__structure");
  await expect(structure.getByText("Before", { exact: true })).toBeVisible();
  await expect(structure.getByText("After", { exact: true })).toBeVisible();
  await expect(structure.getByText("Affected motif links", { exact: true })).toBeVisible();
  await expect(structure.getByText(/午休缓冲会限制轻松节奏/).first()).toBeVisible();
  await expect(structure.getByText(/轻松节奏会直接决定稳定住宿/).first()).toBeVisible();
  await page.getByLabel("标题").fill("午休优先，但不必整趟都慢");
  await page.getByLabel("复用描述").fill("保留午休和低强度时段，但不强制整趟都压低节奏。");
  await page.getByLabel("传播到 cand_drop").uncheck();
  await page.getByRole("button", { name: "保存为新版本" }).click();

  await expect.poll(() => revisePayload?.motif_type_id || "").toBe("motif_local_pace");
  expect(revisePayload.title).toBe("午休优先，但不必整趟都慢");
  expect(revisePayload.target_candidate_ids).toEqual(["cand_keep"]);
  await expect(page.getByText(/已新建版本 motif/i)).toBeVisible();
});
