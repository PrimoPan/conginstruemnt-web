import React, { useEffect, useMemo, useState } from "react";
import type { AppLocale, ConceptMotif } from "../core/type";

type SummaryRow = {
    motifId: string;
    motifTypeId: string;
    store: boolean;
    levels: Array<"L1" | "L2" | "L3">;
    text: { L1: string; L2: string; L3: string };
};

function tr(locale: AppLocale, zh: string, en: string) {
    return locale === "en-US" ? en : zh;
}

function clean(input: any, max = 220) {
    return String(input ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max);
}

export function CognitiveSummaryModal(props: {
    locale: AppLocale;
    open: boolean;
    scenario?: "export" | "new_trip" | "end_task" | null;
    motifs: ConceptMotif[];
    busy?: boolean;
    onClose: () => void;
    onConfirm: (selections: Array<{
        motif_id?: string;
        motif_type_id?: string;
        store?: boolean;
        abstraction_levels?: Array<"L1" | "L2" | "L3">;
        abstraction_text?: { L1?: string; L2?: string; L3?: string };
    }>) => void | Promise<void>;
}) {
    const [rows, setRows] = useState<SummaryRow[]>([]);

    const candidateMotifs = useMemo(
        () =>
            (props.motifs || [])
                .filter((m) => m.status !== "cancelled" && m.status !== "disabled")
                .slice()
                .sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id))
                .slice(0, 16),
        [props.motifs]
    );

    useEffect(() => {
        if (!props.open) return;
        setRows(
            candidateMotifs.map((m) => ({
                motifId: m.id,
                motifTypeId: clean((m as any).motif_type_id, 180) || clean(m.id, 180),
                store: true,
                levels: ["L1", "L2"],
                text: {
                    L1: clean(m.title, 180),
                    L2: clean((m as any).motif_type_title || m.title, 180),
                    L3: clean((m as any).motif_type_reusable_description || m.rationale || m.description, 220),
                },
            }))
        );
    }, [props.open, candidateMotifs]);

    if (!props.open) return null;

    const summaryTitle =
        props.scenario === "export"
            ? tr(props.locale, "导出前认知摘要", "Cognitive Summary Before Export")
            : props.scenario === "new_trip"
                ? tr(props.locale, "开启新任务前认知摘要", "Cognitive Summary Before New Task")
                : tr(props.locale, "结束任务认知摘要", "Cognitive Summary for Task Closure");
    const summaryHint =
        props.scenario === "export"
            ? tr(
                props.locale,
                "导出前请确认需要写入 Motif Library 的规则及抽象层级（L1/L2/L3）。",
                "Before export, confirm motifs to store and their abstraction levels (L1/L2/L3)."
            )
            : props.scenario === "new_trip"
                ? tr(
                    props.locale,
                    "开始下一任务前，请确认需要沉淀到 Motif Library 的规则与层级。",
                    "Before starting the next task, confirm motifs and abstraction levels to persist."
                )
                : tr(
                    props.locale,
                    "结束当前任务前，选择需要写入 Motif Library 的规则，并确认抽象层级（L1/L2/L3）。",
                    "Before ending this task, choose motifs to store and confirm abstraction levels (L1/L2/L3)."
                );
    const confirmLabel =
        props.scenario === "end_task"
            ? tr(props.locale, "结束并存储", "End Task + Store")
            : tr(props.locale, "确认存储", "Confirm Storage");

    return (
        <div className="TaskSummaryModal" role="dialog" aria-modal="true">
            <div className="TaskSummaryModal__mask" onClick={props.onClose} />
            <div className="TaskSummaryModal__panel">
                <div className="TaskSummaryModal__title">{summaryTitle}</div>
                <div className="TaskSummaryModal__hint">{summaryHint}</div>
                <div className="TaskSummaryModal__list">
                    {!rows.length ? (
                        <div className="TaskSummaryModal__empty">
                            {tr(props.locale, "当前没有可存储的 motif。", "No motifs available for storage.")}
                        </div>
                    ) : null}
                    {rows.map((row) => (
                        <div key={row.motifId} className="TaskSummaryModal__item">
                            <label className="TaskSummaryModal__check">
                                <input
                                    type="checkbox"
                                    checked={row.store}
                                    onChange={(e) =>
                                        setRows((prev) =>
                                            prev.map((x) => (x.motifId === row.motifId ? { ...x, store: e.target.checked } : x))
                                        )
                                    }
                                />
                                <span>{row.text.L2 || row.text.L1 || row.motifId}</span>
                            </label>
                            <div className="TaskSummaryModal__levels">
                                {(["L1", "L2", "L3"] as const).map((lvl) => {
                                    const checked = row.levels.includes(lvl);
                                    return (
                                        <label key={`${row.motifId}_${lvl}`} className="TaskSummaryModal__levelCheck">
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={(e) =>
                                                    setRows((prev) =>
                                                        prev.map((x) => {
                                                            if (x.motifId !== row.motifId) return x;
                                                            const levels = e.target.checked
                                                                ? Array.from(new Set([...x.levels, lvl]))
                                                                : x.levels.filter((v) => v !== lvl);
                                                            return { ...x, levels: levels.length ? levels : ["L2"] };
                                                        })
                                                    )
                                                }
                                            />
                                            <span>{lvl}</span>
                                        </label>
                                    );
                                })}
                            </div>
                            <div className="TaskSummaryModal__inputs">
                                {(["L1", "L2", "L3"] as const).map((lvl) => (
                                    <label key={`${row.motifId}_txt_${lvl}`} className="TaskSummaryModal__field">
                                        <span>{lvl}</span>
                                        <input
                                            className="Input"
                                            value={row.text[lvl]}
                                            onChange={(e) =>
                                                setRows((prev) =>
                                                    prev.map((x) =>
                                                        x.motifId === row.motifId
                                                            ? { ...x, text: { ...x.text, [lvl]: e.target.value } }
                                                            : x
                                                    )
                                                )
                                            }
                                        />
                                    </label>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="TaskSummaryModal__actions">
                    <button type="button" className="Btn" disabled={!!props.busy} onClick={props.onClose}>
                        {tr(props.locale, "取消", "Cancel")}
                    </button>
                    <button
                        type="button"
                        className="Btn Btn--active"
                        disabled={!!props.busy}
                        onClick={() =>
                            props.onConfirm(
                                rows.map((row) => ({
                                    motif_id: row.motifId,
                                    motif_type_id: row.motifTypeId,
                                    store: row.store,
                                    abstraction_levels: row.levels,
                                    abstraction_text: row.text,
                                }))
                            )
                        }
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
