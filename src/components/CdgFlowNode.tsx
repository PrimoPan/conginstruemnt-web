import React, { memo, useEffect, useMemo, useState } from "react";
import { Handle, Node, NodeProps, Position } from "@xyflow/react";
import type { FlowNodeData, Severity } from "../core/type";

type CdgNode = Node<FlowNodeData, "cdgNode">;

function severityText(sev?: Severity) {
    if (sev === "critical") return "风险: 极高";
    if (sev === "high") return "风险: 高";
    if (sev === "medium") return "风险: 中";
    if (sev === "low") return "风险: 低";
    return "风险: 未标注";
}

function shorten(input: string, max = 22) {
    if (input.length <= max) return input;
    return `${input.slice(0, max)}…`;
}

export const CdgFlowNode = memo(function CdgFlowNode({ data, selected }: NodeProps<CdgNode>) {
    const [expanded, setExpanded] = useState(false);
    const [editing, setEditing] = useState(false);
    const [detailText, setDetailText] = useState(data.fullLabel);

    useEffect(() => {
        setDetailText(data.fullLabel);
        setEditing(false);
    }, [data.fullLabel]);

    const cls = useMemo(() => {
        const parts = ["CdgNode"];
        if (data?.severity) parts.push(`CdgNode--${data.severity}`);
        if (data?.nodeType) parts.push(`CdgNode--type-${data.nodeType}`);
        if (selected) parts.push("is-selected");
        return parts.join(" ");
    }, [data?.severity, data?.nodeType, selected]);

    const importancePct =
        typeof data?.importance === "number" ? `${Math.round(data.importance * 100)}%` : "未标注";

    return (
        <div className={cls}>
            <Handle type="target" position={Position.Left} className="CdgNode__handle" />
            <Handle type="source" position={Position.Right} className="CdgNode__handle" />

            <div className="CdgNode__titleWrap">
                <div className="CdgNode__title">{expanded ? detailText : shorten(detailText || data.shortLabel)}</div>
                <div className="CdgNode__badge">{importancePct}</div>
            </div>
            <div className="CdgNode__meta">{data.meta}</div>

            {expanded && (
                <div className="CdgNode__details">
                    {editing ? (
                        <textarea
                            className="CdgNode__editor"
                            value={detailText}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setDetailText(e.target.value)}
                        />
                    ) : null}
                    <div>{severityText(data.severity)}</div>
                    <div>重要度: {importancePct}</div>
                    {data.tags?.length ? <div>标签: {data.tags.join(" · ")}</div> : null}
                </div>
            )}

            <button
                type="button"
                className="CdgNode__toggle"
                onClick={(e) => {
                    e.stopPropagation();
                    setExpanded((x) => !x);
                }}
            >
                {expanded ? "收起" : "展开"}
            </button>
            {expanded ? (
                <button
                    type="button"
                    className="CdgNode__toggle"
                    onClick={(e) => {
                        e.stopPropagation();
                        setEditing((x) => !x);
                    }}
                >
                    {editing ? "完成编辑" : "编辑细节"}
                </button>
            ) : null}
        </div>
    );
});
