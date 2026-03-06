import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";
import { api, ApiHttpError } from "./api/client";

jest.mock("./components/FlowPanel", () => ({
  FlowPanel: () => <div data-testid="flow-panel" />,
}));

jest.mock("./components/ConceptPanel", () => ({
  ConceptPanel: () => <div data-testid="concept-panel" />,
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
  }>
) {
  return {
    conversationId,
    title: overrides?.title || "新对话",
    locale: overrides?.locale || ("zh-CN" as const),
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
