import { expect, test, type Page } from "@playwright/test";

const CONVERSATION_ID = "conv_e2e_demo";
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
          }
        : {
            status: "active",
            updatedAt: NOW,
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

