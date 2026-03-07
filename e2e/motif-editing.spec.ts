import { expect, test, type Page } from "@playwright/test";

const CONVERSATION_ID = "conv_motif_edit_e2e";
const NOW = "2026-03-07T10:00:00.000Z";

function makeConversationPayload(overrides?: {
  motifLinks?: any[];
  graph?: any;
}) {
  return {
    conversationId: CONVERSATION_ID,
    title: "Motif Editing E2E",
    locale: "zh-CN",
    systemPrompt: "test system prompt",
    graph: overrides?.graph || {
      id: CONVERSATION_ID,
      version: 1,
      nodes: [],
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
        score: 0.9,
        nodeIds: [],
        evidenceTerms: [],
        sourceMsgIds: ["u1"],
        locked: false,
        paused: false,
        updatedAt: NOW,
      },
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
        score: 0.88,
        nodeIds: [],
        evidenceTerms: [],
        sourceMsgIds: ["u2"],
        locked: false,
        paused: false,
        updatedAt: NOW,
      },
      {
        id: "c3",
        title: "住宿筛选",
        kind: "constraint",
        family: "lodging",
        semanticKey: "slot:lodging_filter",
        validationStatus: "resolved",
        extractionStage: "disambiguation",
        polarity: "positive",
        scope: "global",
        description: "住宿筛选",
        score: 0.84,
        nodeIds: [],
        evidenceTerms: [],
        sourceMsgIds: ["u3"],
        locked: false,
        paused: false,
        updatedAt: NOW,
      },
    ],
    motifs: [
      {
        id: "m1",
        motif_id: "m1",
        motif_type: "enable",
        templateKey: "tmpl_1",
        motifType: "pair",
        relation: "enable",
        dependencyClass: "enable",
        roles: { sources: ["c1"], target: "c2" },
        scope: "global",
        aliases: ["m1"],
        concept_bindings: ["c1", "c2"],
        conceptIds: ["c1", "c2"],
        anchorConceptId: "c2",
        title: "携家出游 supports 儿童友好选项",
        display_title: "携家出游会优先考虑儿童友好选项",
        description: "家庭约束会让选择更偏儿童友好。",
        confidence: 0.83,
        supportEdgeIds: [],
        supportNodeIds: [],
        status: "active",
        novelty: "new",
        updatedAt: NOW,
      },
      {
        id: "m2",
        motif_id: "m2",
        motif_type: "constraint",
        templateKey: "tmpl_2",
        motifType: "pair",
        relation: "constraint",
        dependencyClass: "constraint",
        roles: { sources: ["c2"], target: "c3" },
        scope: "global",
        aliases: ["m2"],
        concept_bindings: ["c2", "c3"],
        conceptIds: ["c2", "c3"],
        anchorConceptId: "c3",
        title: "儿童友好选项 constrains 住宿筛选",
        display_title: "儿童友好诉求会限制住宿筛选",
        description: "儿童友好要求会进入住宿筛选条件。",
        confidence: 0.79,
        supportEdgeIds: [],
        supportNodeIds: [],
        status: "active",
        novelty: "new",
        updatedAt: NOW,
      },
    ],
    motifLinks: overrides?.motifLinks || [],
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
  await page.getByPlaceholder(/用户名|Username/i).fill("motif_edit_user");
  await page.getByRole("button", { name: /登录|Login/i }).click();
  await page.getByRole("button", { name: /新建对话|New Chat/i }).click();
  await expect(page.getByRole("button", { name: /Motif 推理|Motif Reasoning/i })).toBeVisible();
}

test("motif edit mode should add a link and persist edited motifLinks in graph save", async ({ page }) => {
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
          username: "motif_edit_user",
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
            motifLinks: savedGraphPayload.motifLinks,
          }),
          graph: savedGraphPayload.graph,
          motifLinks: savedGraphPayload.motifLinks,
          assistantText: "已根据新的 motif 推理结构更新建议。",
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
  await page.getByRole("button", { name: /Motif 推理|Motif Reasoning/i }).click();
  await page.getByRole("button", { name: /编辑模式|Edit/i }).click();

  const sourceHandle = page
    .locator(".MotifReasoningNode", { hasText: "携家出游会优先考虑儿童友好选项" })
    .locator(".MotifReasoningNode__handle")
    .nth(1);
  const targetHandle = page
    .locator(".MotifReasoningNode", { hasText: "儿童友好诉求会限制住宿筛选" })
    .locator(".MotifReasoningNode__handle")
    .nth(0);

  await expect(sourceHandle).toBeVisible();
  await expect(targetHandle).toBeVisible();

  await sourceHandle.dragTo(targetHandle);

  const relationSelect = page.getByLabel(/关系类型|Relationship/i);
  await expect(relationSelect).toHaveValue("supports");
  await relationSelect.selectOption("refines");

  const saveButton = page.getByRole("button", { name: /保存并生成建议|Save and Generate Advice/i });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();

  await expect.poll(() => (savedGraphPayload?.motifLinks || []).length).toBe(1);
  await expect.poll(() => savedGraphPayload?.motifLinks?.[0]?.type).toBe("refines");
  expect(savedGraphPayload.motifLinks[0]).toMatchObject({
    fromMotifId: "m1",
    toMotifId: "m2",
    source: "user",
  });
});
