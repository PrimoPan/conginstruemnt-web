export type ConceptType =
    | "goal"
    | "constraint"
    | "preference"
    | "belief"
    | "fact"
    | "question";

export type Strength = "hard" | "soft";
export type Status = "proposed" | "confirmed" | "rejected" | "disputed";
export type Severity = "low" | "medium" | "high" | "critical";
export type NodeLayer = "intent" | "requirement" | "preference" | "risk";
export type EdgeType = "enable" | "constraint" | "determine" | "conflicts_with";
export type MotifType = "belief" | "hypothesis" | "expectation" | "cognitive_step";

export type MotifStructure = {
    premises?: string[];
    inference?: string;
    conclusion?: string;
};

export type MotifEvidence = {
    id?: string;
    quote: string;
    source?: string;
    link?: string;
};

export type RevisionRecord = {
    at: string;
    action: "created" | "updated" | "replaced" | "merged";
    reason?: string;
    by?: "user" | "assistant" | "system";
};

export type CDGNode = {
    id: string;
    type: ConceptType;
    layer?: NodeLayer;
    strength?: Strength;
    statement: string;
    status: Status;
    confidence: number;
    locked?: boolean;
    severity?: Severity;
    importance?: number;
    tags?: string[];
    key?: string;
    value?: unknown;
    evidenceIds?: string[];
    sourceMsgIds?: string[];
    motifType?: MotifType;
    claim?: string;
    structure?: MotifStructure;
    evidence?: MotifEvidence[];
    linkedIntentIds?: string[];
    rebuttalPoints?: string[];
    revisionHistory?: RevisionRecord[];
    priority?: number;
    successCriteria?: string[];
};

export type CDGEdge = {
    id: string;
    from: string;
    to: string;
    type: EdgeType;
    confidence: number;
    phi?: string;
};

export type CDG = {
    id: string;
    version: number;
    nodes: CDGNode[];
    edges: CDGEdge[];
};

export type PatchOp =
    | { op: "add_node"; node: CDGNode }
    | { op: "update_node"; id: string; patch: Partial<CDGNode> }
    | { op: "remove_node"; id: string }
    | { op: "add_edge"; edge: CDGEdge }
    | { op: "remove_edge"; id: string };

export type GraphPatch = {
    ops: PatchOp[];
    notes?: string[];
};

export type LoginResponse = {
    userId: string;
    username: string;
    sessionToken: string;
};

export type ConversationSummary = {
    conversationId: string;
    title: string;
    updatedAt: string;
};

export type ConversationDetail = {
    conversationId: string;
    title: string;
    systemPrompt: string;
    graph: CDG;
};

export type ConversationCreateResponse = ConversationDetail;

export type GraphSaveResponse = {
    conversationId: string;
    graph: CDG;
    updatedAt: string;
    assistantText?: string;
    adviceError?: string;
};

export type TurnResponse = {
    assistantText: string;
    graphPatch: GraphPatch;
    graph: CDG;
};

export type TurnItem = {
    id: string;
    createdAt: string;
    userText: string;
    assistantText: string;
    graphVersion: number;
};

export type TurnStreamStartData = {
    conversationId: string;
    graphVersion: number;
};

export type TurnStreamPingData = {
    t: number;
};

export type TurnStreamErrorData = {
    message: string;
};

export type FlowNodeData = {
    shortLabel: string;
    fullLabel: string;
    meta: string;
    rawNode: CDGNode;
    nodeType: ConceptType;
    layer?: NodeLayer;
    severity?: Severity;
    importance?: number;
    confidence?: number;
    status?: Status;
    strength?: Strength;
    locked?: boolean;
    key?: string;
    value?: unknown;
    tags?: string[];
    evidenceIds?: string[];
    sourceMsgIds?: string[];
    motifType?: MotifType;
    claim?: string;
    structure?: MotifStructure;
    evidence?: MotifEvidence[];
    linkedIntentIds?: string[];
    rebuttalPoints?: string[];
    revisionHistory?: RevisionRecord[];
    priority?: number;
    successCriteria?: string[];
    baseImportance?: number;
    toneBg?: string;
    toneBorder?: string;
    toneBadgeBg?: string;
    toneBadgeBorder?: string;
    toneHandle?: string;
    toneShadow?: string;
    onImportanceChange?: (nodeId: string, value: number) => void;
    onNodePatch?: (nodeId: string, patch: Partial<CDGNode>) => void;
};

export type NodeEvidenceFocus = {
    nodeId: string;
    evidenceTerms: string[];
    sourceMsgIds?: string[];
};
