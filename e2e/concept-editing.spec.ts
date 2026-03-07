import { expect, test, type Page } from "@playwright/test";

const CONVERSATION_ID = "conv_concept_edit_e2e";
const NOW = "2026-03-07T10:00:00.000Z";

function makeConversationPayload(overrides?: { graph?: any }) {
  return {
    conversationId: CONVERSATION_ID,
    title: "Concept Editing E2E",
    locale: "zh-CN",
    systemPrompt: "test system prompt",
    graph: overrides?.graph || {
      id: CONVERSATION_ID,
      version: 1,
      nodes: [
        {
          id: "n_goal",
          type: "belief",
          layer: "intent",
          key: "slot:goal",
          statement: "意图：家庭轻松旅行",
          status: "confirmed",
          confidence: 0.92,
          importance: 0.92,
        },
        {
          id: "n_family",
          type: "belief",
          layer: "requirement",
          key: "slot:people",
          statement: "携家出游",
          status: "confirmed",
          confidence: 0.86,
          importance: 0.84,
        },
        {
          id: "n_child",
          type: "preference",
          layer: "preference",
          key: "slot:lodging_preference",
          statement: "优先儿童友好酒店",
          status: "confirmed",
          confidence: 0.84,
          importance: 0.82,
        },
      ],
      edges: [],
    },
    concepts: [
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
        score: 0.92,
        nodeIds: ["n_family"],
        evidenceTerms: ["携家出游"],
        sourceMsgIds: ["u1"],
        locked: false,
        paused: false,
        updatedAt: NOW,
      },
      {
        id: "c2",
        title: "优先儿童友好酒店",
        kind: "preference",
        family: "lodging",
        semanticKey: "slot:lodging_preference",
        validationStatus: "resolved",
        extractionStage: "disambiguation",
        polarity: "positive",
        scope: "global",
        description: "优先儿童友好酒店",
        score: 0.9,
        nodeIds: ["n_child"],
        evidenceTerms: ["儿童友好酒店"],
        sourceMsgIds: ["u2"],
        locked: false,
        paused: false,
        updatedAt: NOW,
      },
    ],
    motifs: [],
    motifLinks: [],
    contexts: [],
    travelPlanState: null,
    taskDetection: {
      current_task_id: "task_1",
      is_task_switch: false,
      reason: "same_trip_context",
      signals: [],
      mode: "single_conversation",
      confidence: 0.42,
      switch_reason_code: "continuous",
    },
    cognitiveState: {
      current_task_id: "task_1",
      tasks: [],
      motif_library: [],
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
  await page.getByPlaceholder(/用户名|Username/i).fill("concept_edit_user");
  await page.getByRole("button", { name: /登录|Login/i }).click();
  await page.getByRole("button", { name: /新建对话|New Chat/i }).click();
  await expect(page.getByRole("button", { name: /Concept 画布|Concept Graph/i })).toBeVisible();
}

test("concept edit mode should add a link and persist edited graph edges in graph save", async ({ page }) => {
  let savedGraphPayload: any = null;

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
          username: "concept_edit_user",
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
        body: JSON.stringify(makeConversationPayload()),
      });
      return;
    }

    if (path === `/api/conversations/${CONVERSATION_ID}` && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(makeConversationPayload()),
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

    if (path === `/api/conversations/${CONVERSATION_ID}/graph` && method === "PUT") {
      savedGraphPayload = JSON.parse(req.postData() || "{}");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...makeConversationPayload({
            graph: savedGraphPayload.graph,
          }),
          graph: savedGraphPayload.graph,
          concepts: savedGraphPayload.concepts || makeConversationPayload().concepts,
          motifs: [],
          motifLinks: [],
          assistantText: "已根据新的 concept 结构更新建议。",
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
  await page.getByRole("button", { name: /编辑模式|Edit/i }).click();

  const sourceHandle = page.locator(".CdgNode", { hasText: "携家出游" }).locator(".CdgNode__handle").nth(1);
  const targetHandle = page.locator(".CdgNode", { hasText: "优先儿童友好酒店" }).locator(".CdgNode__handle").nth(0);

  await expect(sourceHandle).toBeVisible();
  await expect(targetHandle).toBeVisible();

  await sourceHandle.dragTo(targetHandle);

  const relationSelect = page.getByRole("combobox");
  await expect(relationSelect).toHaveValue("enable");
  await relationSelect.selectOption("constraint");

  const saveButton = page.getByRole("button", { name: /保存并生成建议|Save and Generate Advice/i });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();

  await expect.poll(() => (savedGraphPayload?.graph?.edges || []).length).toBe(1);
  await expect.poll(() => savedGraphPayload?.graph?.edges?.[0]?.type).toBe("constraint");
  expect(savedGraphPayload.graph.edges[0]).toMatchObject({
    from: "n_family",
    to: "n_child",
  });
});
