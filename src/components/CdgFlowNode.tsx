import React, { memo, useEffect, useMemo, useState } from "react";
import { Handle, Node, NodeProps, Position } from "@xyflow/react";
import type { FlowNodeData, NodeLayer, Severity } from "../core/type";

type CdgNode = Node<FlowNodeData, "cdgNode">;

function severityText(sev?: Severity) {
    if (sev === "critical") return "风险: 极高";
    if (sev === "high") return "风险: 高";
    if (sev === "medium") return "风险: 中";
    if (sev === "low") return "风险: 低";
    return "风险: 未标注";
}

function layerText(layer?: NodeLayer) {
    if (layer === "intent") return "层级: Intent";
    if (layer === "requirement") return "层级: Requirement";
    if (layer === "preference") return "层级: Preference";
    if (layer === "risk") return "层级: Risk";
    return "层级: 未标注";
}

function shorten(input: string, max = 22) {
    if (input.length <= max) return input;
    return `${input.slice(0, max)}…`;
}

export const CdgFlowNode = memo(function CdgFlowNode({ id, data, selected }: NodeProps<CdgNode>) {
    const [expanded, setExpanded] = useState(false);
    const [editing, setEditing] = useState(false);
    const [detailText, setDetailText] = useState(data.fullLabel);

    useEffect(() => {
        setDetailText(data.fullLabel);
        setEditing(false);
    }, [data.fullLabel]);

    const cls = useMemo(() => {
        const parts = ["CdgNode"];
        if (data?.nodeType) parts.push(`CdgNode--type-${data.nodeType}`);
        if (selected) parts.push("is-selected");
        return parts.join(" ");
    }, [data?.nodeType, selected]);

    const importancePct =
        typeof data?.importance === "number" ? `${Math.round(data.importance * 100)}%` : "未标注";
    const importanceValue = typeof data?.importance === "number" ? data.importance : 0.68;
    const wrapperStyle: React.CSSProperties = {
        background: data?.toneBg,
        borderColor: data?.toneBorder,
        boxShadow: selected
            ? "0 0 0 2px rgba(30, 64, 175, 0.18), 0 4px 16px rgba(0, 0, 0, 0.08)"
            : data?.toneShadow,
    };

    return (
        <div className={cls} style={wrapperStyle}>
            <Handle
                type="target"
                position={Position.Left}
                className="CdgNode__handle"
                style={{ background: data?.toneHandle || "#111827" }}
            />
            <Handle
                type="source"
                position={Position.Right}
                className="CdgNode__handle"
                style={{ background: data?.toneHandle || "#111827" }}
            />

            <div className="CdgNode__titleWrap">
                <div className="CdgNode__title">{expanded ? detailText : shorten(detailText || data.shortLabel)}</div>
                <div
                    className="CdgNode__badge"
                    style={{
                        background: data?.toneBadgeBg,
                        borderColor: data?.toneBadgeBorder,
                    }}
                >
                    {importancePct}
                </div>
            </div>
            <div className="CdgNode__meta">{data.meta}</div>

            {expanded && (
                <div className="CdgNode__details">
                    {editing ? (
                        <textarea
                            className="CdgNode__editor nodrag nopan nowheel"
                            value={detailText}
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                            onChange={(e) => setDetailText(e.target.value)}
                        />
                    ) : null}
                    <div>{severityText(data.severity)}</div>
                    <div>{layerText(data.layer)}</div>
                    <div>重要度: {importancePct}</div>
                    <label
                        className="CdgNode__sliderLabel nodrag nopan nowheel"
                        onMouseDown={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        重要性滑块
                        <input
                            className="nodrag nopan nowheel"
                            type="range"
                            min={0.35}
                            max={0.98}
                            step={0.01}
                            value={importanceValue}
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                            onChange={(e) => data?.onImportanceChange?.(id, Number(e.target.value))}
                        />
                    </label>
                    {data.tags?.length ? <div>标签: {data.tags.join(" · ")}</div> : null}
                </div>
            )}

            <button
                type="button"
                className="CdgNode__toggle nodrag nopan"
                onClick={(e) => {
                    e.stopPropagation();
                    setExpanded((x) => !x);
                }}
                onMouseDown={(e) => e.stopPropagation()}
            >
                {expanded ? "收起" : "展开"}
            </button>
            {expanded ? (
                <button
                    type="button"
                    className="CdgNode__toggle nodrag nopan"
                    onClick={(e) => {
                        e.stopPropagation();
                        setEditing((x) => !x);
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    {editing ? "完成编辑" : "编辑细节"}
                </button>
            ) : null}
        </div>
    );
});
