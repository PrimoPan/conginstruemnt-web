export type ConceptType =
    | "constraint"
    | "preference"
    | "belief"
    | "factual_assertion";

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

export type AppLocale = "zh-CN" | "en-US";

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
    validation_status?: ConceptValidationStatus;
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
    locale?: AppLocale;
};

export type TaskDetection = {
    current_task_id: string;
    is_task_switch: boolean;
    reason: string;
    signals: string[];
    mode: "single_conversation" | "new_task_detected";
};

export type CognitiveStateConcept = {
    concept_id: string;
    kind: string;
    title: string;
    description: string;
    validation_status: string;
    source_msg_ids: string[];
    evidence_terms: string[];
};

export type CognitiveStateMotifInstance = {
    motif_id: string;
    motif_type: string;
    relation: string;
    title: string;
    status: string;
    confidence: number;
    concept_ids: string[];
    anchor_concept_id: string;
    rationale?: string;
};

export type CognitiveState = {
    current_task_id: string;
    tasks: Array<{
        task_id: string;
        task_type: "travel_planning";
        task_context: {
            conversation_id: string;
            locale: AppLocale;
            destination_scope: string[];
            duration?: string;
            trip_goal_summary: string;
            updated_at: string;
        };
        concepts_from_user: CognitiveStateConcept[];
        motif_instances_current_task: CognitiveStateMotifInstance[];
        motif_transfer_candidates: Array<{
            motif_type_id: string;
            motif_type_title: string;
            dependency: string;
            reusable_description: string;
            status: "uncertain";
            reason: string;
        }>;
        clarification_questions: string[];
        history: Array<{
            at: string;
            action: string;
            summary: string;
            source: string;
        }>;
    }>;
    motif_library: Array<{
        motif_type_id: string;
        motif_type_title: string;
        dependency: string;
        reusable_description: string;
        usage_count: number;
        source_task_ids: string[];
    }>;
};

export type PortfolioDocumentState = {
    portfolio_id: string;
    user_scope: string;
    trips: Array<{
        task_id: string;
        trip_title: string;
        destination_scope: string[];
        travelers: string[];
        duration: string;
        plan_snapshot: {
            summary: string;
            constraints: string[];
            day_plan_count: number;
            budget_notes: string[];
        };
        export_ready_text: string;
        status: "draft" | "active" | "archived";
        last_updated: string;
    }>;
    export_order: string[];
    combined_outline: string[];
    combined_export_ready_text: string;
    pdf_metadata: {
        generated_at: string;
        trip_count: number;
        locale: AppLocale;
    };
    last_updated: string;
};

export type MotifInvariantReport = {
    requiredCausalEdges: number;
    coveredCausalEdges: number;
    uncoveredCausalEdges: number;
    repairedMotifCount: number;
    componentCount: number;
    excludedNonReasoningEdges?: number;
    excludedByReason?: Record<string, number>;
    llmValidatedEdges?: number;
    llmRejectedEdges?: number;
};

export type ConversationDetail = {
    conversationId: string;
    title: string;
    locale?: AppLocale;
    systemPrompt: string;
    graph: CDG;
    concept_graph?: CDG;
    concepts?: ConceptItem[];
    motifs?: ConceptMotif[];
    motifLinks?: MotifLink[];
    motif_graph?: {
        motifs: ConceptMotif[];
        motif_links: MotifLink[];
    };
    motifReasoningView?: MotifReasoningView;
    motifInvariantReport?: MotifInvariantReport;
    reasoning_steps?: ReasoningStepPayload[];
    contexts?: ContextItem[];
    validation_status?: ConceptValidationStatus;
    travelPlanState?: TravelPlanState | null;
    taskDetection?: TaskDetection;
    cognitiveState?: CognitiveState;
    portfolioDocumentState?: PortfolioDocumentState;
};

export type ConversationCreateResponse = ConversationDetail;

export type GraphSaveResponse = {
    conversationId: string;
    locale?: AppLocale;
    graph: CDG;
    concept_graph?: CDG;
    concepts?: ConceptItem[];
    motifs?: ConceptMotif[];
    motifLinks?: MotifLink[];
    motif_graph?: {
        motifs: ConceptMotif[];
        motif_links: MotifLink[];
    };
    motifReasoningView?: MotifReasoningView;
    motifInvariantReport?: MotifInvariantReport;
    reasoning_steps?: ReasoningStepPayload[];
    contexts?: ContextItem[];
    validation_status?: ConceptValidationStatus;
    travelPlanState?: TravelPlanState | null;
    taskDetection?: TaskDetection;
    cognitiveState?: CognitiveState;
    portfolioDocumentState?: PortfolioDocumentState;
    updatedAt: string;
    assistantText?: string;
    adviceError?: string;
    conflictGate?: ConflictGatePayload | null;
};

export type ConceptSaveResponse = {
    conversationId: string;
    locale?: AppLocale;
    graph: CDG;
    concept_graph?: CDG;
    concepts: ConceptItem[];
    motifs?: ConceptMotif[];
    motifLinks?: MotifLink[];
    motif_graph?: {
        motifs: ConceptMotif[];
        motif_links: MotifLink[];
    };
    motifReasoningView?: MotifReasoningView;
    motifInvariantReport?: MotifInvariantReport;
    reasoning_steps?: ReasoningStepPayload[];
    contexts?: ContextItem[];
    validation_status?: ConceptValidationStatus;
    travelPlanState?: TravelPlanState | null;
    taskDetection?: TaskDetection;
    cognitiveState?: CognitiveState;
    portfolioDocumentState?: PortfolioDocumentState;
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
    concept_graph?: CDG;
    concepts?: ConceptItem[];
    motifs?: ConceptMotif[];
    motifLinks?: MotifLink[];
    motif_graph?: {
        motifs: ConceptMotif[];
        motif_links: MotifLink[];
    };
    motifReasoningView?: MotifReasoningView;
    motifInvariantReport?: MotifInvariantReport;
    reasoning_steps?: ReasoningStepPayload[];
    contexts?: ContextItem[];
    validation_status?: ConceptValidationStatus;
    travelPlanState?: TravelPlanState | null;
    taskDetection?: TaskDetection;
    cognitiveState?: CognitiveState;
    portfolioDocumentState?: PortfolioDocumentState;
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
    locale?: AppLocale;
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
    | "belief"
    | "constraint"
    | "preference"
    | "factual_assertion";

export type ConceptExtractionStage =
    | "identification"
    | "disambiguation";

export const CONCEPT_EXTRACTION_STAGES: ConceptExtractionStage[] = [
    "identification",
    "disambiguation",
];

export type ConceptValidationStatus = "unasked" | "pending" | "resolved";

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
    | "conflict"
    | "other";

export type ConceptItem = {
    id: string;
    kind: ConceptKind;
    validationStatus: ConceptValidationStatus;
    extractionStage: ConceptExtractionStage;
    polarity: "positive" | "negative";
    scope: string;
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
    migrationHistory?: string[];
    locked: boolean;
    paused: boolean;
    updatedAt: string;
};

export type ConceptMotifType = "pair" | "triad";
export type MotifInstanceStatus = "active" | "uncertain" | "deprecated" | "cancelled";
export type MotifLifecycleStatus = MotifInstanceStatus | "disabled";
export type MotifChangeState = "new" | "updated" | "unchanged";
export type MotifCausalOperator =
    | "direct_causation"
    | "mediated_causation"
    | "confounding"
    | "intervention"
    | "contradiction";
export type MotifDependencyType = "enable" | "constraint" | "determine";

export type ConceptMotif = {
    id: string;
    motif_id: string;
    motif_type: "enable" | "constraint" | "determine";
    templateKey: string;
    motifType: ConceptMotifType;
    relation: EdgeType;
    roles: {
        sources: string[];
        target: string;
    };
    scope: string;
    aliases: string[];
    concept_bindings: string[];
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
    causalOperator?: MotifCausalOperator;
    causalFormula?: string;
    dependencyClass?: EdgeType;
    history?: Array<{
        at: string;
        by: "system" | "user";
        action: "status_changed" | "edited" | "resolved";
        from?: MotifLifecycleStatus;
        to?: MotifLifecycleStatus;
        reason?: string;
    }>;
    novelty: MotifChangeState;
    updatedAt: string;
    reuseClass?: "reusable" | "context_specific";
    reuseReason?: string;
    motif_type_id?: string;
    motif_type_title?: string;
    motif_type_dependency?: MotifDependencyType[];
    motif_type_role_schema?: {
        drivers: string[];
        target: string[];
    };
    motif_type_reusable_description?: string;
    motif_instance_id?: string;
    motif_instance_status?: MotifInstanceStatus;
    context?: string;
    bound_concepts?: {
        drivers: string[];
        target: string[];
    };
    evidence?: Array<{
        quote: string;
        source?: string;
        conceptId?: string;
    }>;
    rationale?: string;
    coverage_origin?: "native" | "edge_repair";
    subgraph_verified?: boolean;
    reasoning_eligible?: boolean;
    coverage_skip_reason?: string;
};

export type MotifLinkType = "precedes" | "supports" | "conflicts_with" | "refines";

export type MotifLink = {
    id: string;
    fromMotifId: string;
    toMotifId: string;
    type: MotifLinkType;
    confidence: number;
    source: "system" | "user";
    updatedAt: string;
};

export type MotifReasoningNode = {
    id: string;
    motifId: string;
    title: string;
    relation: EdgeType;
    dependencyClass?: EdgeType;
    causalOperator?: MotifCausalOperator;
    causalFormula?: string;
    motifType: ConceptMotifType;
    status: MotifLifecycleStatus;
    confidence: number;
    pattern: string;
    conceptIds: string[];
    conceptTitles: string[];
    sourceRefs: string[];
};

export type MotifReasoningEdge = {
    id: string;
    from: string;
    to: string;
    type: MotifLinkType;
    confidence: number;
};

export type MotifReasoningStepRole = "premise" | "bridge" | "decision" | "isolated";

export type MotifReasoningStep = {
    step_id: string;
    summary: string;
    motif_ids: string[];
    concept_ids: string[];
    depends_on: string[];
    id: string;
    order: number;
    motifId: string;
    motifNodeId: string;
    role: MotifReasoningStepRole;
    status: MotifLifecycleStatus;
    dependencyClass?: EdgeType;
    causalOperator?: MotifCausalOperator;
    dependsOnMotifIds: string[];
    usedConceptIds: string[];
    usedConceptTitles: string[];
    explanation: string;
};

export type ReasoningStepPayload = {
    step_id: string;
    summary: string;
    motif_ids: string[];
    concept_ids: string[];
    depends_on: string[];
};

export type MotifReasoningView = {
    nodes: MotifReasoningNode[];
    edges: MotifReasoningEdge[];
    steps?: MotifReasoningStep[];
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
    dateLabel?: string;
    title: string;
    items: string[];
};

export type TravelPlanAssistantPlan = {
    sourceTurnIndex: number;
    sourceTurnCreatedAt?: string;
    rawText: string;
    narrative: string;
    parser: "day_header" | "date_header" | "mixed" | "fallback";
    dayPlans: TravelPlanDay[];
};

export type TravelPlanSourceLabel =
    | "assistant_proposed"
    | "user_confirmed"
    | "co_authored"
    | "transferred_pattern_based";

export type TravelPlanTaskHistorySegment = {
    task_id: string;
    trip_title: string;
    destination_scope: string[];
    travelers: string[];
    duration?: string;
    trip_goal_summary: string;
    export_ready_text: string;
    open_questions: string[];
    rationale_refs: string[];
    source_map: Record<string, { source_label: TravelPlanSourceLabel; notes?: string }>;
    status: "archived" | "active";
    closed_at: string;
};

export type TravelPlanState = {
    version: number;
    plan_version?: number;
    task_id?: string;
    updatedAt: string;
    last_updated?: string;
    summary: string;
    trip_goal_summary?: string;
    destinations: string[];
    destination_scope?: string[];
    constraints: string[];
    travel_dates_or_duration?: string;
    travelers?: string[];
    totalDays?: number;
    budget?: {
        totalCny?: number;
        spentCny?: number;
        remainingCny?: number;
        pendingCny?: number;
    };
    budgetLedger?: Array<{
        type: string;
        amountCny?: number;
        evidence: string;
    }>;
    budgetSummary?: {
        totalCny?: number;
        spentCny?: number;
        remainingCny?: number;
        pendingCny?: number;
    };
    narrativeText?: string;
    exportNarrative?: string;
    candidate_options?: string[];
    itinerary_outline?: string[];
    day_by_day_plan?: TravelPlanDay[];
    transport_plan?: string[];
    stay_plan?: string[];
    food_plan?: string[];
    risk_notes?: string[];
    budget_notes?: string[];
    open_questions?: string[];
    rationale_refs?: string[];
    source_map?: Record<string, { source_label: TravelPlanSourceLabel; notes?: string }>;
    export_ready_text?: string;
    changelog?: Array<{
        plan_version: number;
        changed_at: string;
        action: string;
        summary: string;
        source_label: string;
    }>;
    task_history?: TravelPlanTaskHistorySegment[];
    assistantPlan?: TravelPlanAssistantPlan;
    evidenceAppendix?: Array<{
        title: string;
        content: string;
        source: "dialogue" | "budget" | "graph";
    }>;
    dayPlans: TravelPlanDay[];
    source: {
        turnCount: number;
        lastTurnAt?: string;
    };
};
