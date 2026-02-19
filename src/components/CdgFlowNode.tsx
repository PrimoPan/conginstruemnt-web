import React, { memo, useMemo } from "react";
import { Handle, Node, NodeProps, Position } from "@xyflow/react";
import type { FlowNodeData } from "../core/type";

type CdgNode = Node<FlowNodeData, "cdgNode">;

function shorten(input: string, max = 36) {
    const s = String(input || "");
    if (s.length <= max) return s;
    return `${s.slice(0, max)}...`;
}

export const CdgFlowNode = memo(function CdgFlowNode({ data, selected }: NodeProps<CdgNode>) {
    const cls = useMemo(() => {
        const parts = ["CdgNode"];
        if (data?.nodeType) parts.push(`CdgNode--type-${data.nodeType}`);
        if (selected) parts.push("is-selected");
        return parts.join(" ");
    }, [data?.nodeType, selected]);

    const importancePct =
        typeof data?.importance === "number" ? `${Math.round(data.importance * 100)}%` : "未标注";

    const wrapperStyle: React.CSSProperties = {
        background: data?.toneBg,
        borderColor: data?.toneBorder,
        boxShadow: selected
            ? "0 0 0 2px rgba(30, 64, 175, 0.18), 0 4px 16px rgba(0, 0, 0, 0.08)"
            : data?.toneShadow,
    };

    const title = data.fullLabel || "";

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

            <div className="CdgNode__titleRow">
                <div className="CdgNode__dragHandle" title="拖拽节点">
                    ⋮⋮
                </div>
                <div className="CdgNode__titleWrap">
                    <div className="CdgNode__title" title={title}>
                        {shorten(title)}
                    </div>
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
            </div>
            <div className="CdgNode__meta">{data.meta}</div>
        </div>
    );
});
