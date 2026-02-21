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
        borderColor: data?.conceptActive ? "#d97706" : data?.conceptPaused ? "#9ca3af" : data?.toneBorder,
        boxShadow: selected
            ? "0 0 0 2px rgba(30, 64, 175, 0.18), 0 4px 16px rgba(0, 0, 0, 0.08)"
            : data?.conceptActive
                ? "0 0 0 2px rgba(245, 158, 11, 0.22), 0 10px 20px rgba(120, 53, 15, 0.14)"
            : data?.toneShadow,
        opacity: data?.visualMuted ? 0.35 : 1,
        transition: "opacity 140ms ease, border-color 140ms ease, box-shadow 140ms ease",
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
            {data?.conceptPaused ? <div className="CdgNode__chip CdgNode__chip--paused">已暂停</div> : null}
            {data?.conceptActive ? <div className="CdgNode__chip CdgNode__chip--active">Concept 高亮</div> : null}
        </div>
    );
});
