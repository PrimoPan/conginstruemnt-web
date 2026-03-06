import { expect, test, type Page } from "@playwright/test";

const CONVERSATION_ID = "conv_e2e_demo";
const CONVERSATION_ID_TASK2 = "conv_e2e_task2";
const NOW = "2026-03-05T10:00:00.000Z";

function makeConversationPayload(taskStatus: "active" | "closed" = "active") {
  return {
    conversationId: CONVERSATION_ID,
    title: "E2E Conversation",
    locale: "zh-CN",
    systemPrompt: "test system prompt",
    graph: {
      id: CONVERSATION_ID,
      version: 1,
      nodes: [],
      edges: [],
    },
    concepts: [],
    motifs: [
      {
        id: "motif_1",
        motif_id: "motif_1",
        motif_type: "enable",
        templateKey: "tmpl_1",
        motifType: "pair",
        relation: "enable",
        roles: {
          sources: ["concept_a"],
          target: "concept_b",
        },
        scope: "global",
        aliases: ["motif_1"],
        concept_bindings: ["concept_a", "concept_b"],
        conceptIds: ["concept_a", "concept_b"],
        anchorConceptId: "concept_b",
        title: "偏好慢节奏 + 在地体验",
        description: "优先步行社区路线，减少高密度打卡。",
        confidence: 0.82,
        supportEdgeIds: [],
        supportNodeIds: [],
        status: "active",
        novelty: "new",
        updatedAt: NOW,
      },
    ],
    motifLinks: [],
    contexts: [],
    travelPlanState: null,
    taskDetection: {
      current_task_id: "task_1",
      is_task_switch: false,
      reason: "same_trip_context",
      signals: [],
      mode: "single_conversation",
      confidence: 0.36,
      switch_reason_code: "continuous",
    },
    cognitiveState: {
      current_task_id: "task_1",
      tasks: [],
      motif_library: [
        {
          motif_type_id: "motif_type_local",
          motif_type_title: "在地体验优先",
          dependency: "enable",
          abstraction_levels: ["L1", "L2"],
          status: "active",
          current_version_id: "v1",
          versions: [
            {
              version_id: "v1",
              version: 1,
              title: "在地体验优先",
              dependency: "enable",
              reusable_description: "优先社区步行路线，避免高密度打卡。",
              abstraction_levels: {
                L1: "偏好慢节奏路线",
                L2: "优先在地体验",
                L3: "真实体验比景点密度更重要",
              },
              status: "active",
              source_task_id: "task_prev",
              source_conversation_id: "conv_prev",
              created_at: NOW,
              updated_at: NOW,
            },
          ],
          reusable_description: "优先社区步行路线，避免高密度打卡。",
          usage_count: 1,
          source_task_ids: ["task_prev"],
          usage_stats: {
            adopted_count: 1,
            ignored_count: 0,
            feedback_negative_count: 0,
            transfer_confidence: 0.86,
            last_used_at: NOW,
          },
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
    taskLifecycle:
      taskStatus === "closed"
        ? {
            status: "closed",
            endedAt: NOW,
            endedTaskId: "task_1",
            updatedAt: NOW,
            resumable: true,
            resume_required: true,
          }
        : {
            status: "active",
            updatedAt: NOW,
            resumable: false,
            resume_required: false,
          },
  };
}

function makeFreshTaskPayload() {
  return {
    ...makeConversationPayload("active"),
    conversationId: CONVERSATION_ID_TASK2,
    title: "旅行规划·巴黎",
    graph: {
      id: CONVERSATION_ID_TASK2,
      version: 1,
      nodes: [
        {
          id: "n_dest_paris",
          type: "factual_assertion",
          layer: "requirement",
          strength: "hard",
          statement: "目的地:巴黎",
          status: "confirmed",
          confidence: 0.92,
          importance: 0.9,
          key: "slot:destination:paris",
          sourceMsgIds: ["manual_user_bootstrap", "planning_bootstrap"],
          validation_status: "resolved",
        },
      ],
      edges: [],
    },
    motifs: [],
    travelPlanState: {
      version: 1,
      plan_version: 1,
      task_id: CONVERSATION_ID_TASK2,
      updatedAt: NOW,
      last_updated: NOW,
      summary: "已创建前往巴黎的新旅行规划。请先开始第一轮对话，再评审历史规则建议。",
      trip_goal_summary: "已创建前往巴黎的新旅行规划。请先开始第一轮对话，再评审历史规则建议。",
      destinations: ["巴黎"],
      destination_scope: ["巴黎"],
      constraints: [],
      travelers: ["待确认"],
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
      source: { turnCount: 0 },
    },
    cognitiveState: {
      ...makeConversationPayload("active").cognitiveState,
      current_task_id: CONVERSATION_ID_TASK2,
    },
    taskDetection: {
      current_task_id: CONVERSATION_ID_TASK2,
      is_task_switch: true,
      reason: "新建会话",
      signals: ["新建会话"],
      mode: "new_task_detected",
      confidence: 1,
      switch_reason_code: "new_conversation",
    },
    motifTransferState: {
      recommendations: [],
      decisions: [],
      activeInjections: [],
      feedbackEvents: [],
      revisionRequests: [],
    },
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
  await expect(page.getByRole("button", { name: /结束任务|End Task/i })).toBeEnabled();
}

test("End Task should persist close_task=true via confirm API", async ({ page }) => {
  let closed = false;
  let confirmPayload: any = null;

  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method().toUpperCase();

    if (path === "/api/auth/login" && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          userId: "u1",
          username: "e2e_user",
          sessionToken: "token_e2e",
        }),
      });
      return;
    }

    if (path === "/api/conversations" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }

    if (path === "/api/conversations" && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(makeConversationPayload(closed ? "closed" : "active")),
      });
      return;
    }

    if (path === `/api/conversations/${CONVERSATION_ID}` && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(makeConversationPayload(closed ? "closed" : "active")),
      });
      return;
    }

    if (path === `/api/conversations/${CONVERSATION_ID}/turns` && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }

    if (path === `/api/conversations/${CONVERSATION_ID}/motif-library/confirm` && method === "POST") {
      confirmPayload = JSON.parse(req.postData() || "{}");
      closed = !!confirmPayload?.close_task;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          stored_count: 1,
          motifTransferState: makeConversationPayload("closed").motifTransferState,
          ...makeConversationPayload("closed"),
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
  await page.getByRole("button", { name: /结束任务|End Task/i }).click();
  await expect(page.getByRole("button", { name: /结束并存储|End Task \+ Store/i })).toBeVisible();
  await page.getByRole("button", { name: /结束并存储|End Task \+ Store/i }).click();

  await expect
    .poll(() => (confirmPayload ? confirmPayload.close_task : undefined))
    .toBe(true);
  await expect
    .poll(() => (Array.isArray(confirmPayload?.selections) ? confirmPayload.selections.length : -1))
    .toBeGreaterThan(0);
});

test("Mode C reference should be sent as structured manualReferences", async ({ page }) => {
  let streamPayload: any = null;

  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method().toUpperCase();

    if (path === "/api/auth/login" && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          userId: "u1",
          username: "e2e_user",
          sessionToken: "token_e2e",
        }),
      });
      return;
    }

    if (path === "/api/conversations" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }

    if (path === "/api/conversations" && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(makeConversationPayload("active")),
      });
      return;
    }

    if (path === `/api/conversations/${CONVERSATION_ID}` && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(makeConversationPayload("active")),
      });
      return;
    }

    if (path === `/api/conversations/${CONVERSATION_ID}/turns` && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }

    if (path === `/api/conversations/${CONVERSATION_ID}/turn/stream` && method === "POST") {
      streamPayload = JSON.parse(req.postData() || "{}");
      const done = {
        ...makeConversationPayload("active"),
        assistantText: "已收到你的参考偏好，我会按慢节奏来规划。",
        graphPatch: { ops: [], notes: [] },
      };
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: [
          `event: start\ndata: ${JSON.stringify({ conversationId: CONVERSATION_ID, graphVersion: 1 })}\n\n`,
          `event: done\ndata: ${JSON.stringify(done)}\n\n`,
        ].join(""),
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
  await page.getByRole("button", { name: /Motif \(/i }).click();
  await page.getByRole("button", { name: /作为参考|Use as Reference/i }).first().click();

  await expect(page.getByText(/Mode C 手动参考|Mode C Manual References/i)).toBeVisible();
  await page.getByPlaceholder(/输入一句话|Type a message/i).fill("请给我三天行程");
  await page.getByRole("button", { name: /发送|Send/i }).click();

  await expect.poll(() => (streamPayload ? streamPayload.userText : "")).toBe("请给我三天行程");
  await expect.poll(() => (Array.isArray(streamPayload?.manualReferences) ? streamPayload.manualReferences.length : 0)).toBe(1);
  expect(String(streamPayload.userText)).not.toContain("[Manual references selected by user]");
  expect(streamPayload.manualReferences[0]).toMatchObject({
    motif_type_id: "motif_type_local",
  });
});

test("Cognitive summary should allow clearing L2 without forcing re-check", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method().toUpperCase();

    if (path === "/api/auth/login" && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          userId: "u1",
          username: "e2e_user",
          sessionToken: "token_e2e",
        }),
      });
      return;
    }

    if (path === "/api/conversations" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }

    if (path === "/api/conversations" && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(makeConversationPayload("active")),
      });
      return;
    }

    if (path === `/api/conversations/${CONVERSATION_ID}` && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(makeConversationPayload("active")),
      });
      return;
    }

    if (path === `/api/conversations/${CONVERSATION_ID}/turns` && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
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
  await page.getByRole("button", { name: /结束任务|End Task/i }).click();
  const firstRow = page.locator(".TaskSummaryModal__item").first();
  const levelChecks = firstRow.locator(".TaskSummaryModal__levelCheck input");
  const storeCheck = firstRow.locator(".TaskSummaryModal__check input");

  await levelChecks.nth(0).uncheck();
  await expect(levelChecks.nth(0)).not.toBeChecked();
  await levelChecks.nth(1).uncheck();
  await expect(levelChecks.nth(1)).not.toBeChecked();
  await expect(storeCheck).not.toBeChecked();
});

test("Transfer decision error should not leak raw HTML payload", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method().toUpperCase();

    if (path === "/api/auth/login" && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          userId: "u1",
          username: "e2e_user",
          sessionToken: "token_e2e",
        }),
      });
      return;
    }

    if (path === "/api/conversations" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }

    if (path === "/api/conversations" && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(makeConversationPayload("active")),
      });
      return;
    }

    if (path === `/api/conversations/${CONVERSATION_ID}` && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(makeConversationPayload("active")),
      });
      return;
    }

    if (path === `/api/conversations/${CONVERSATION_ID}/turns` && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }

    if (path === `/api/conversations/${CONVERSATION_ID}/motif-transfer/decision` && method === "POST") {
      await route.fulfill({
        status: 502,
        contentType: "text/html",
        body: "<html><head><title>502 Bad Gateway</title></head><body><h1>502 Bad Gateway</h1></body></html>",
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
  await page.getByRole("button", { name: /Motif \(/i }).click();
  await page.getByRole("button", { name: /作为约束|Use as Constraint/i }).first().click();

  const lastBubble = page.locator(".BubbleText").last();
  await expect(lastBubble).toContainText(/迁移决策失败|Transfer decision failed/i);
  await expect(lastBubble).toContainText(/服务暂时不可用|temporarily unavailable/i);
  await expect(lastBubble).not.toContainText(/<html>|<head>|<body>/i);
});

test("New Trip should stay clean before first turn and show recommendations after first reply", async ({ page }) => {
  let createCalls = 0;
  let confirmCalled = false;
  let streamCalls = 0;

  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method().toUpperCase();

    if (path === "/api/auth/login" && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          userId: "u1",
          username: "e2e_user",
          sessionToken: "token_e2e",
        }),
      });
      return;
    }

    if (path === "/api/conversations" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }

    if (path === "/api/conversations" && method === "POST") {
      createCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(createCalls === 1 ? makeConversationPayload("active") : makeFreshTaskPayload()),
      });
      return;
    }

    if (path === `/api/conversations/${CONVERSATION_ID}` && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(makeConversationPayload("active")),
      });
      return;
    }

    if (path === `/api/conversations/${CONVERSATION_ID}/turns` && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }

    if (path === `/api/conversations/${CONVERSATION_ID_TASK2}` && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(makeFreshTaskPayload()),
      });
      return;
    }

    if (path === `/api/conversations/${CONVERSATION_ID_TASK2}/turns` && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }

    if (path === `/api/conversations/${CONVERSATION_ID}/motif-library/confirm` && method === "POST") {
      confirmCalled = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          stored_motif_type_ids: ["motif_type_local"],
          ...makeConversationPayload("active"),
        }),
      });
      return;
    }

    if (path === `/api/conversations/${CONVERSATION_ID_TASK2}/turn/stream` && method === "POST") {
      streamCalls += 1;
      const done = {
        ...makeFreshTaskPayload(),
        assistantText: "先按巴黎七天、慢节奏和在地体验来收敛第一版。",
        graphPatch: { ops: [], notes: [] },
        motifTransferState: {
          recommendations: [
            {
              candidate_id: "motif_type_local::v1",
              motif_type_id: "motif_type_local",
              motif_type_title: "在地体验优先",
              dependency: "enable",
              reusable_description: "优先社区步行路线，避免高密度打卡。",
              status: "active",
              reason: "与当前任务语境高度匹配，可优先评估是否沿用。",
              match_score: 0.86,
              recommended_mode: "A",
              decision_status: "pending",
              source_task_id: "task_prev",
              source_conversation_id: "conv_prev",
              created_at: NOW,
            },
          ],
          decisions: [],
          activeInjections: [],
          feedbackEvents: [],
          revisionRequests: [],
          lastEvaluatedAt: NOW,
        },
        travelPlanState: {
          ...makeFreshTaskPayload().travelPlanState,
          source: { turnCount: 1 },
        },
      };
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: [
          `event: start\ndata: ${JSON.stringify({ conversationId: CONVERSATION_ID_TASK2, graphVersion: 1 })}\n\n`,
          `event: done\ndata: ${JSON.stringify(done)}\n\n`,
        ].join(""),
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
  await page.getByRole("button", { name: /新增旅游规划|New Trip Plan/i }).click();
  await page.getByRole("button", { name: /确认存储|Confirm Storage/i }).click();
  await expect.poll(() => confirmCalled).toBe(true);

  await page.locator(".TripBootstrapModal__input").fill("巴黎");
  await page.getByRole("button", { name: /创建并开始|Create & Start/i }).click();
  await page.getByRole("button", { name: /Motif \(/i }).click();

  await expect(page.getByText(/首轮 assistant 回复完成后，这里会静默展示 2-4 条历史规则建议/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /直接采用|Adopt/i })).toHaveCount(0);

  await page.getByPlaceholder(/输入一句话|Type a message/i).fill("帮我规划巴黎七天旅行");
  await page.getByRole("button", { name: /发送|Send/i }).click();

  await expect.poll(() => streamCalls).toBe(1);
  await expect(page.getByRole("button", { name: /直接采用|Adopt/i })).toHaveCount(1);
});

test("Closed task prompt should offer resume and new-task actions", async ({ page }) => {
  let resumeCalls = 0;

  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method().toUpperCase();

    if (path === "/api/auth/login" && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          userId: "u1",
          username: "e2e_user",
          sessionToken: "token_e2e",
        }),
      });
      return;
    }

    if (path === "/api/conversations" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }

    if (path === "/api/conversations" && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(makeConversationPayload("active")),
      });
      return;
    }

    if (path === `/api/conversations/${CONVERSATION_ID}` && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(makeConversationPayload("active")),
      });
      return;
    }

    if (path === `/api/conversations/${CONVERSATION_ID}/turns` && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
      return;
    }

    if (path === `/api/conversations/${CONVERSATION_ID}/motif-library/confirm` && method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          stored_motif_type_ids: ["motif_type_local"],
          ...makeConversationPayload("closed"),
        }),
      });
      return;
    }

    if (path === `/api/conversations/${CONVERSATION_ID}/task/resume` && method === "POST") {
      resumeCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(makeConversationPayload("active")),
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
  await page.getByRole("button", { name: /结束任务|End Task/i }).click();
  await page.getByRole("button", { name: /结束并存储|End Task \+ Store/i }).click();

  await expect(page.getByText(/当前任务已结束|Current task is closed/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /恢复当前任务|Resume Task/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /新建任务|Start New Task/i })).toBeVisible();

  await page.getByRole("button", { name: /恢复当前任务|Resume Task/i }).click();
  await expect.poll(() => resumeCalls).toBe(1);
  await expect(page.getByText(/已恢复当前任务|Current task resumed/i)).toBeVisible();
});
