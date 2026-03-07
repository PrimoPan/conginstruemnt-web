import type { AppLocale, EdgeType, MotifCausalOperator } from "./type";

function tr(locale: AppLocale, zh: string, en: string) {
    return locale === "en-US" ? en : zh;
}

export function relationLabel(locale: AppLocale, relation?: EdgeType | string) {
    if (relation === "enable") return tr(locale, "支持", "Support");
    if (relation === "constraint") return tr(locale, "限制", "Limit");
    if (relation === "determine") return tr(locale, "决定", "Decide");
    if (relation === "conflicts_with") return tr(locale, "冲突", "Conflict");
    return String(relation || "");
}

export function causalOperatorFriendlyLabel(locale: AppLocale, op?: MotifCausalOperator) {
    if (op === "direct_causation") return tr(locale, "直接影响", "Direct effect");
    if (op === "mediated_causation") return tr(locale, "间接影响", "Indirect effect");
    if (op === "confounding") return tr(locale, "限制", "Limiting factor");
    if (op === "intervention") return tr(locale, "决定", "Direct decision");
    if (op === "contradiction") return tr(locale, "冲突", "Conflict");
    return tr(locale, "未设置", "Not set");
}
