import type { CDGNode, ConceptItem } from "./type";

const SEMANTIC_NOISE_TOKENS = new Set([
  "我",
  "我们",
  "你",
  "你们",
  "想",
  "想去",
  "要",
  "我要",
  "需要",
  "希望",
  "计划",
  "安排",
  "行程",
  "旅行",
  "旅游",
  "旅程",
  "出游",
  "目的地",
  "去",
  "到",
  "前往",
  "trip",
  "travel",
  "itinerary",
  "plan",
  "planning",
  "schedule",
  "journey",
  "destination",
  "visit",
  "go",
  "to",
  "the",
  "a",
  "an",
  "and",
  "or",
  "for",
  "with",
  "of",
  "in",
  "on",
]);

export function compactSemanticText(input: any, max = 220): string {
  return String(input ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function normalizeSemanticTextKey(input: any): string {
  return compactSemanticText(input, 260).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function normalizeSemanticSurface(input: string): string {
  return compactSemanticText(input, 260)
    .toLowerCase()
    .replace(/[_:]/g, " ")
    .replace(
      /(我想|想去|我要|需要|希望|准备|计划|打算|去|到|前往|trip|travel|itinerary|plan|planning|schedule|journey|visit|go to)/gi,
      " "
    )
    .replace(/(行程|旅行|旅游|旅程|出游|安排|方案|路线|攻略)/g, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function semanticTokens(text: string): string[] {
  const chunks = normalizeSemanticSurface(text).match(/[\u4e00-\u9fa5]{1,4}|[a-z0-9]{2,24}/g) || [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of chunks) {
    const token = compactSemanticText(raw, 24).toLowerCase();
    if (!token || seen.has(token) || SEMANTIC_NOISE_TOKENS.has(token)) continue;
    seen.add(token);
    out.push(token);
    if (out.length >= 16) break;
  }
  return out;
}

function tokenJaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  setA.forEach((x) => {
    if (setB.has(x)) inter += 1;
  });
  const union = setA.size + setB.size - inter;
  if (!union) return 0;
  return inter / union;
}

function semanticCoreFromText(text: string): string {
  return semanticTokens(text).slice(0, 6).join("_");
}

function semanticCoreFromKey(rawKey: string): string {
  const key = compactSemanticText(rawKey, 200).toLowerCase();
  if (!key || !key.startsWith("slot:")) return "";

  if (key.startsWith("slot:destination:")) {
    const city = semanticCoreFromText(key.slice("slot:destination:".length).replace(/_/g, " "));
    return `destination:${city || "unknown"}`;
  }
  if (key.startsWith("slot:duration_city:")) {
    const city = semanticCoreFromText(key.slice("slot:duration_city:".length).replace(/_/g, " "));
    return `duration_city:${city || "unknown"}`;
  }
  if (key.startsWith("slot:sub_location:")) {
    const parts = key.slice("slot:sub_location:".length).split(":");
    const root = semanticCoreFromText((parts[0] || "").replace(/_/g, " "));
    const loc = semanticCoreFromText(parts.slice(1).join(" ").replace(/_/g, " "));
    return `sub_location:${root || "root"}:${loc || "loc"}`;
  }
  if (key.startsWith("slot:freeform:")) {
    const parts = key.split(":");
    const tail = parts.slice(3).join(" ").replace(/_/g, " ");
    const sig = semanticCoreFromText(tail);
    return `freeform:${sig || "node"}`;
  }
  return key;
}

function conceptSemanticCore(concept: ConceptItem): string {
  const coreByKey = semanticCoreFromKey(concept.semanticKey);
  if (coreByKey) return coreByKey;
  const titleCore = semanticCoreFromText(concept.title || "");
  return titleCore ? `title:${titleCore}` : "";
}

function conceptSemanticTokens(concept: ConceptItem): string[] {
  return Array.from(
    new Set([
      ...semanticTokens(concept.title || ""),
      ...semanticTokens(concept.semanticKey || ""),
      ...semanticTokens((concept.evidenceTerms || []).join(" ")),
    ])
  ).slice(0, 20);
}

function coreTail(core: string): string {
  if (!core) return "";
  const idx = core.lastIndexOf(":");
  return (idx >= 0 ? core.slice(idx + 1) : core).replace(/_/g, " ");
}

function isCoreEquivalent(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const tailA = semanticCoreFromText(coreTail(a));
  const tailB = semanticCoreFromText(coreTail(b));
  return !!tailA && !!tailB && tailA === tailB;
}

export function makeCanonicalFreeformSemanticKey(statement: string, nodeType: CDGNode["type"]): string {
  return `slot:freeform:${nodeType}:${semanticCoreFromText(statement) || "node"}`;
}

export function canonicalizeManualSemanticKey(
  rawSemanticKey: string,
  statement: string,
  nodeType: CDGNode["type"]
): string {
  const key = compactSemanticText(rawSemanticKey, 200).toLowerCase();
  if (!key) return makeCanonicalFreeformSemanticKey(statement, nodeType);
  if (key.startsWith("slot:destination:")) {
    const city = semanticCoreFromText(key.slice("slot:destination:".length).replace(/_/g, " ")) || semanticCoreFromText(statement);
    return `slot:destination:${city || "unknown"}`;
  }
  if (key.startsWith("slot:freeform:")) {
    const parts = key.split(":");
    const mappedType = compactSemanticText(parts[2], 24) || nodeType;
    const tail = semanticCoreFromText(parts.slice(3).join(" ").replace(/_/g, " ")) || semanticCoreFromText(statement);
    return `slot:freeform:${mappedType}:${tail || "node"}`;
  }
  return key;
}

export function findBestConceptMatch(
  text: string,
  concepts: ConceptItem[],
  opts?: { minScore?: number; semanticKeyHint?: string }
): ConceptItem | null {
  const queryText = compactSemanticText(text, 260);
  const queryKey = normalizeSemanticTextKey(queryText);
  const queryTokens = semanticTokens(queryText);
  const queryCore =
    semanticCoreFromKey(compactSemanticText(opts?.semanticKeyHint, 200).toLowerCase()) || semanticCoreFromText(queryText);
  if (!queryKey && !queryTokens.length && !queryCore) return null;

  let best: ConceptItem | null = null;
  let bestScore = 0;
  for (const concept of concepts || []) {
    const titleKey = normalizeSemanticTextKey(concept.title || "");
    const semanticKey = compactSemanticText(concept.semanticKey, 200).toLowerCase();
    const semanticKeyNorm = normalizeSemanticTextKey(semanticKey);
    const conceptCore = conceptSemanticCore(concept);
    const conceptTokens = conceptSemanticTokens(concept);

    let score = 0;
    if (queryKey && (queryKey === titleKey || queryKey === semanticKeyNorm)) score = 0.99;
    if (queryKey && (titleKey.includes(queryKey) || queryKey.includes(titleKey))) score = Math.max(score, 0.8);
    if (queryKey && semanticKeyNorm && (semanticKeyNorm.includes(queryKey) || queryKey.includes(semanticKeyNorm))) {
      score = Math.max(score, 0.86);
    }
    if (queryCore && conceptCore && isCoreEquivalent(queryCore, conceptCore)) score = Math.max(score, 0.92);
    const tokenScore = tokenJaccard(queryTokens, conceptTokens);
    score = Math.max(score, tokenScore * 0.9);

    if (score > bestScore) {
      best = concept;
      bestScore = score;
    }
  }
  return bestScore >= (opts?.minScore ?? 0.54) ? best : null;
}

export function findBestConceptForUpsert(params: {
  statement: string;
  semanticKey?: string;
  nodeType: CDGNode["type"];
  concepts: ConceptItem[];
  minScore?: number;
}): ConceptItem | null {
  const canonicalKey = canonicalizeManualSemanticKey(params.semanticKey || "", params.statement, params.nodeType);
  const byStatement = findBestConceptMatch(params.statement, params.concepts, {
    minScore: params.minScore ?? 0.56,
    semanticKeyHint: canonicalKey,
  });
  if (byStatement) return byStatement;
  return findBestConceptMatch(coreTail(semanticCoreFromKey(canonicalKey)).replace(/_/g, " "), params.concepts, {
    minScore: params.minScore ?? 0.56,
    semanticKeyHint: canonicalKey,
  });
}
