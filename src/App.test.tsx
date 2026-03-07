import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";
import { api, ApiHttpError } from "./api/client";

jest.mock("./components/FlowPanel", () => ({
  FlowPanel: () => <div data-testid="flow-panel" />,
}));

jest.mock("./components/ConceptPanel", () => ({
  ConceptPanel: (props: any) => (
    <div data-testid="concept-panel">
      <span data-testid="transfer-enabled">{String(!!props.transferRecommendationsEnabled)}</span>
      <span data-testid="transfer-stage">{props.transferReviewStage || ""}</span>
      <span data-testid="motif-library-count">{String((props.motifLibrary || []).length)}</span>
    </div>
  ),
}));

jest.mock("./components/PlanStatePanel", () => ({
  PlanStatePanel: () => <div data-testid="plan-panel" />,
}));

jest.mock("./components/ConversationHistoryDrawer", () => ({
  ConversationHistoryDrawer: () => <div data-testid="history-drawer" />,
}));

jest.mock("./components/CognitiveSummaryModal", () => ({
  CognitiveSummaryModal: () => null,
}));

jest.mock("./core/graphSafe", () => ({
  normalizeGraphClient: (graph: any) => graph || { id: "", version: 0, nodes: [], edges: [] },
}));

jest.mock("./api/client", () => {
  class MockApiHttpError extends Error {
    status: number;
    code?: string;
    data?: any;

    constructor(message: string, status: number, data?: any, code?: string) {
      super(message);
      this.name = "ApiHttpError";
      this.status = status;
      this.data = data;
      this.code = code;
    }
  }

  return {
    ApiHttpError: MockApiHttpError,
    api: {
      health: jest.fn(),
      login: jest.fn(),
      listConversations: jest.fn(),
      createConversation: jest.fn(),
      getConversation: jest.fn(),
      resumeTask: jest.fn(),
      saveGraph: jest.fn(),
      saveConcepts: jest.fn(),
      getTurns: jest.fn(),
      turn: jest.fn(),
      turnStream: jest.fn(),
      exportTravelPlanPdf: jest.fn(),
      confirmMotifLibrary: jest.fn(),
      motifTransferDecision: jest.fn(),
      motifTransferFeedback: jest.fn(),
      reviseMotifLibrary: jest.fn(),
    },
  };
});

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeConversationPayload(
  conversationId: string,
  overrides?: Partial<{
    title: string;
    locale: "zh-CN" | "en-US";
    taskLifecycle: any;
    transferRecommendationsEnabled: boolean;
    cognitiveState: any;
    travelPlanState: any;
  }>
) {
  return {
    conversationId,
    title: overrides?.title || "新对话",
    locale: overrides?.locale || ("zh-CN" as const),
    transferRecommendationsEnabled: overrides?.transferRecommendationsEnabled,
    systemPrompt: "system",
    graph: {
      id: conversationId,
      version: 0,
      nodes: [],
      edges: [],
    },
    concepts: [],
    motifs: [],
    motifLinks: [],
    contexts: [],
    cognitiveState: overrides?.cognitiveState,
    travelPlanState: overrides?.travelPlanState,
    taskLifecycle: overrides?.taskLifecycle,
  };
}

const mockedApi = api as jest.Mocked<typeof api>;

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  mockedApi.listConversations.mockResolvedValue([]);
  mockedApi.getTurns.mockResolvedValue([]);
});

test("renders CogInstrument shell", () => {
  render(<App />);
  expect(screen.getByText(/CogInstrument/i)).toBeInTheDocument();
});

test("keeps the new conversation active when stale restore request fails later", async () => {
  localStorage.setItem("ci_cid", "stale-cid");
  localStorage.setItem("ci_username", "test");

  const staleConversationLoad = deferred<any>();
  mockedApi.login.mockResolvedValue({
    userId: "u1",
    username: "test",
    sessionToken: "token-1",
  });
  mockedApi.createConversation.mockResolvedValue(makeConversationPayload("new-cid"));
  mockedApi.getConversation.mockImplementation((_token, cid) => {
    if (cid === "stale-cid") return staleConversationLoad.promise;
    return Promise.resolve(makeConversationPayload(cid));
  });

  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "登录" }));

  await waitFor(() => {
    expect(mockedApi.getConversation).toHaveBeenCalledWith("token-1", "stale-cid");
  });

  fireEvent.click(screen.getByRole("button", { name: "新建对话" }));

  await waitFor(() => {
    expect(mockedApi.createConversation).toHaveBeenCalledWith("token-1", "新对话", "zh-CN");
  });

  const chatInput = await screen.findByPlaceholderText("输入一句话（Enter 发送）");
  expect(chatInput).not.toBeDisabled();

  await act(async () => {
    staleConversationLoad.reject(new ApiHttpError("conversation not found", 404));
    await Promise.resolve();
  });

  await waitFor(() => {
    expect(screen.getByPlaceholderText("输入一句话（Enter 发送）")).not.toBeDisabled();
  });
  expect(localStorage.getItem("ci_cid")).toBe("new-cid");
});

test("login should clear stale saved conversation when switching to a different user", async () => {
  localStorage.setItem("ci_token", "old-token");
  localStorage.setItem("ci_cid", "stale-cid");
  localStorage.setItem("ci_username", "old-user");

  mockedApi.login.mockResolvedValue({
    userId: "u2",
    username: "new-user",
    sessionToken: "token-2",
  });

  render(<App />);

  const usernameInput = screen.getByPlaceholderText("用户名（无密码）");
  fireEvent.change(usernameInput, { target: { value: "new-user" } });
  fireEvent.click(screen.getByRole("button", { name: "登录" }));

  await waitFor(() => {
    expect(mockedApi.login).toHaveBeenCalledWith("new-user");
  });

  await waitFor(() => {
    expect(localStorage.getItem("ci_cid")).toBeNull();
  });
  expect(mockedApi.getConversation).not.toHaveBeenCalledWith("token-2", "stale-cid");
  expect(screen.getByPlaceholderText("请先登录并新建对话…")).toBeDisabled();
});

test("preferred locale only affects new chats while current conversation locale stays locked", async () => {
  localStorage.setItem("ci_token", "token-1");
  localStorage.setItem("ci_cid", "active-zh");

  mockedApi.getConversation.mockResolvedValue(makeConversationPayload("active-zh", { locale: "zh-CN" }));
  mockedApi.createConversation.mockResolvedValue(
    makeConversationPayload("new-en", {
      title: "New Conversation",
      locale: "en-US",
    })
  );

  render(<App />);

  expect(await screen.findByPlaceholderText("输入一句话（Enter 发送）")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "EN" }));

  expect(screen.getByPlaceholderText("输入一句话（Enter 发送）")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "新建对话" }));

  await waitFor(() => {
    expect(mockedApi.createConversation).toHaveBeenCalledWith("token-1", "New Conversation", "en-US");
  });

  expect(await screen.findByPlaceholderText("Type a message (Enter to send)")).toBeInTheDocument();
});

test("restores closed task guard when reopening a closed conversation", async () => {
  localStorage.setItem("ci_token", "token-1");
  localStorage.setItem("ci_cid", "closed-cid");

  mockedApi.getConversation.mockResolvedValue(
    makeConversationPayload("closed-cid", {
      taskLifecycle: {
        status: "closed",
        endedAt: "2026-03-06T11:14:37.076Z",
        endedTaskId: "closed-cid",
        resumable: true,
        resume_required: true,
      },
    })
  );

  render(<App />);

  expect(await screen.findByText("当前任务已结束")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "恢复当前任务" })).toBeInTheDocument();
  expect(screen.getByPlaceholderText("输入一句话（Enter 发送）")).toBeDisabled();
});

test("plain new conversations keep transfer recommendations disabled even if motif library exists", async () => {
  localStorage.setItem("ci_token", "token-1");
  localStorage.setItem("ci_cid", "plain-cid");

  mockedApi.getConversation.mockResolvedValue(
    makeConversationPayload("plain-cid", {
      transferRecommendationsEnabled: false,
      cognitiveState: {
        current_task_id: "plain-cid",
        tasks: [],
        motif_library: [
          {
            motif_type_id: "motif_budget_duration",
            motif_type_title: "预算 + 总时长 限制 目标",
            dependency: "constraint",
            abstraction_levels: ["L1"],
            current_version_id: "v1",
            versions: [
              {
                version_id: "v1",
                version: 1,
                title: "预算 + 总时长 限制 目标",
                dependency: "constraint",
                reusable_description: "预算和总时长共同限制目标。",
                abstraction_levels: { L1: "预算与时长联动" },
                status: "active",
                created_at: "2026-03-07T00:00:00.000Z",
                updated_at: "2026-03-07T00:00:00.000Z",
              },
            ],
            reusable_description: "预算和总时长共同限制目标。",
            usage_count: 1,
            source_task_ids: ["task_prev"],
            status: "active",
          },
        ],
      },
    })
  );

  render(<App />);

  expect(await screen.findByPlaceholderText("输入一句话（Enter 发送）")).toBeInTheDocument();
  expect(screen.getByTestId("transfer-enabled")).toHaveTextContent("false");
  expect(screen.getByTestId("transfer-stage")).toHaveTextContent("");
});

test("new trip modal explains section-5 inheritance flow in user language", async () => {
  localStorage.setItem("ci_token", "token-1");

  render(<App />);

  fireEvent.click(screen.getByRole("button", { name: "新增旅游规划" }));

  expect(await screen.findByText("先告诉系统这次想去哪里。等首轮 assistant 回复完成后，右侧会静默出现 2-4 条“上次可能还能沿用的思路”，由你决定是否继续沿用。")).toBeInTheDocument();
  expect(
    screen.getByText("如果你已经知道这次有几条底线必须和上次一样，可以先写在这里（可选）")
  ).toBeInTheDocument();
  expect(screen.getByText("继续保留长期稳定的个人情况（身体/饮食/语言/安全等）")).toBeInTheDocument();
});

test("new trip creation carries the previous task id instead of inheriting from the whole conversation history", async () => {
  localStorage.setItem("ci_token", "token-1");
  localStorage.setItem("ci_cid", "active-trip");

  mockedApi.getConversation.mockResolvedValue(
    makeConversationPayload("active-trip", {
      locale: "zh-CN",
      travelPlanState: {
        task_id: "task_kyoto_1",
      },
    })
  );
  mockedApi.createConversation.mockResolvedValue(
    makeConversationPayload("new-trip", {
      locale: "zh-CN",
      transferRecommendationsEnabled: true,
    })
  );

  render(<App />);

  expect(await screen.findByPlaceholderText("输入一句话（Enter 发送）")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "新增旅游规划" }));
  fireEvent.change(await screen.findByPlaceholderText("例如：京都"), { target: { value: "首尔" } });
  fireEvent.click(screen.getByRole("button", { name: "创建并开始" }));

  await waitFor(() => {
    expect(mockedApi.createConversation).toHaveBeenCalledWith(
      "token-1",
      "旅行规划·首尔",
      "zh-CN",
      expect.objectContaining({
        planningBootstrap: expect.objectContaining({
          sourceTaskId: "task_kyoto_1",
          sourceConversationId: "active-trip",
          destination: "首尔",
        }),
      })
    );
  });
});
