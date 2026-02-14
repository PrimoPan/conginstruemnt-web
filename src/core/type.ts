export type CDGNode = {
    id: string;
    type: "goal" | "constraint" | "preference" | "belief" | "fact" | "question" | string;
    statement: string;
    status?: string;
    confidence?: number;
    strength?: "hard" | "soft";
    locked?: boolean;
};

export type CDGEdge = {
    id: string;
    from: string;
    to: string;
    type: "enable" | "constraint" | "determine" | "conflicts_with" | string;
    confidence?: number;
};

export type CDG = {
    id: string;
    version: number;
    nodes: CDGNode[];
    edges: CDGEdge[];
};

export type LoginResponse = {
    userId: string;
    username: string;
    sessionToken: string;
};

export type ConversationCreateResponse = {
    conversationId: string;
    title: string;
    systemPrompt: string;
    graph: CDG;
};

export type TurnResponse = {
    assistantText: string;
    graphPatch: any;
    graph: CDG;
};

export type TurnItem = {
    id: string;
    createdAt: string;
    userText: string;
    assistantText: string;
    graphVersion: number;
};
