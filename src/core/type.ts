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
    concepts?: ConceptItem[];
    motifs?: ConceptMotif[];
    motifLinks?: MotifLink[];
    contexts?: ContextItem[];
    travelPlanState?: TravelPlanState | null;
};

export type ConversationCreateResponse = ConversationDetail;

export type GraphSaveResponse = {
    conversationId: string;
    graph: CDG;
    concepts?: ConceptItem[];
    motifs?: ConceptMotif[];
    motifLinks?: MotifLink[];
    contexts?: ContextItem[];
    travelPlanState?: TravelPlanState | null;
    updatedAt: string;
    assistantText?: string;
    adviceError?: string;
};

export type ConceptSaveResponse = {
    conversationId: string;
    graph: CDG;
    concepts: ConceptItem[];
    motifs?: ConceptMotif[];
    motifLinks?: MotifLink[];
    contexts?: ContextItem[];
    travelPlanState?: TravelPlanState | null;
    updatedAt: string;
};

export type ConflictGateItem = {
    id: string;
    title: string;
    status: MotifLifecycleStatus;
    statusReason?: string;
    confidence: number;
};

export type ConflictGatePayload = {
    blocked: boolean;
    unresolvedMotifs: ConflictGateItem[];
    message: string;
};

export type TurnResponse = {
    assistantText: string;
    graphPatch: GraphPatch;
    graph: CDG;
    concepts?: ConceptItem[];
    motifs?: ConceptMotif[];
    motifLinks?: MotifLink[];
    contexts?: ContextItem[];
    travelPlanState?: TravelPlanState | null;
    conflictGate?: ConflictGatePayload | null;
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
    conceptIds?: string[];
    conceptActive?: boolean;
    conceptPaused?: boolean;
    visualMuted?: boolean;
    onImportanceChange?: (nodeId: string, value: number) => void;
    onNodePatch?: (nodeId: string, patch: Partial<CDGNode>) => void;
};

export type NodeEvidenceFocus = {
    nodeId: string;
    evidenceTerms: string[];
    sourceMsgIds?: string[];
};

export type ConceptKind =
    | "intent"
    | "requirement"
    | "preference"
    | "risk"
    | "belief"
    | "fact"
    | "question"
    | "other";

export type ConceptFamily =
    | "goal"
    | "destination"
    | "duration_total"
    | "duration_city"
    | "budget"
    | "people"
    | "lodging"
    | "activity_preference"
    | "meeting_critical"
    | "limiting_factor"
    | "scenic_preference"
    | "generic_constraint"
    | "sub_location"
    | "other";

export type ConceptItem = {
    id: string;
    kind: ConceptKind;
    family: ConceptFamily;
    semanticKey: string;
    title: string;
    description: string;
    score: number;
    nodeIds: string[];
    primaryNodeId?: string;
    evidenceTerms: string[];
    sourceMsgIds: string[];
    motifIds?: string[];
    locked: boolean;
    paused: boolean;
    updatedAt: string;
};

export type ConceptMotifType = "pair" | "triad";
export type MotifLifecycleStatus = "active" | "uncertain" | "deprecated" | "disabled" | "cancelled";
export type MotifChangeState = "new" | "updated" | "unchanged";

export type ConceptMotif = {
    id: string;
    templateKey: string;
    motifType: ConceptMotifType;
    relation: EdgeType;
    conceptIds: string[];
    anchorConceptId: string;
    title: string;
    description: string;
    confidence: number;
    supportEdgeIds: string[];
    supportNodeIds: string[];
    status: MotifLifecycleStatus;
    statusReason?: string;
    resolved?: boolean;
    resolvedAt?: string;
    resolvedBy?: "user" | "system";
    novelty: MotifChangeState;
    updatedAt: string;
};

export type MotifLinkType = "supports" | "depends_on" | "conflicts" | "refines";

export type MotifLink = {
    id: string;
    fromMotifId: string;
    toMotifId: string;
    type: MotifLinkType;
    confidence: number;
    source: "system" | "user";
    updatedAt: string;
};

export type ContextStatus = "active" | "uncertain" | "conflicted" | "disabled";

export type ContextItem = {
    id: string;
    key: string;
    title: string;
    summary: string;
    status: ContextStatus;
    confidence: number;
    conceptIds: string[];
    motifIds: string[];
    nodeIds: string[];
    tags: string[];
    openQuestions: string[];
    locked: boolean;
    paused: boolean;
    updatedAt: string;
};

export type TravelPlanDay = {
    day: number;
    city?: string;
    title: string;
    items: string[];
};

export type TravelPlanState = {
    version: number;
    updatedAt: string;
    summary: string;
    destinations: string[];
    constraints: string[];
    totalDays?: number;
    budget?: {
        totalCny?: number;
        spentCny?: number;
        remainingCny?: number;
    };
    dayPlans: TravelPlanDay[];
    source: {
        turnCount: number;
        lastTurnAt?: string;
    };
};
