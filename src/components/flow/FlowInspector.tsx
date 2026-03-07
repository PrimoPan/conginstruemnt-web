import React from "react";
import type { AppLocale, CDGEdge, CDGNode, EdgeType } from "../../core/type";
import { normalize01 } from "./graphDraftUtils";
import { relationLabel } from "../../core/relationLabels";

export function FlowInspector(props: {
    locale: AppLocale;
    node: CDGNode | null;
    edge: CDGEdge | null;
    onPatchNode: (nodeId: string, patch: Partial<CDGNode>) => void;
    onPatchEdgeType: (edgeId: string, edgeType: EdgeType) => void;
    onDeleteEdge: (edgeId: string) => void;
    onDeleteNode: (nodeId: string) => void;
}) {
    const { node, edge, onPatchNode, onPatchEdgeType, onDeleteEdge, onDeleteNode, locale } = props;
    const en = locale === "en-US";
    const tr = (zh: string, enText: string) => (en ? enText : zh);
    const confidenceLabel = tr("系统觉得这条信息有多靠谱", "How reliable this feels to the system");
    const confidenceHelpText = tr(
        "你可以把它理解成：系统有多相信你刚刚这句话。往高了调，系统会更容易把它当真，直接照着安排；往低了调，系统会先记下来，但更可能再问你一句，确认是不是这个意思。已经想清楚、基本不会变的，就调高一点；只是随口提一下、自己也还没拿准的，就调低一点。",
        "You can think of this as how much the system trusts what you said. Higher means it will act on it more directly. Lower means it will keep it in mind, but is more likely to ask a follow-up question before using it."
    );

    if (!node && !edge) {
        return (
            <div className="FlowInspector">
                <div className="FlowInspector__title">{tr("编辑面板", "Editor")}</div>
                <div className="FlowInspector__hint">{tr("点击节点或边进行编辑", "Click a node or edge to edit")}</div>
            </div>
        );
    }

    if (edge && !node) {
        return (
            <div className="FlowInspector">
                <div className="FlowInspector__head">
                    <div className="FlowInspector__title">{tr("编辑关系", "Edit Relationship")}</div>
                    <button
                        type="button"
                        className="Btn FlowToolbar__btn FlowToolbar__btnDanger"
                        onClick={() => onDeleteEdge(edge.id)}
                        title={tr("删除当前关系", "Delete current relationship")}
                    >
                        {tr("删除关系", "Delete Relationship")}
                    </button>
                </div>
                <label className="FlowInspector__fieldLabel">
                    {tr("关系类型", "Relationship Type")}
                    <select
                        className="FlowInspector__select"
                        value={edge.type}
                        onChange={(e) => onPatchEdgeType(edge.id, e.target.value as EdgeType)}
                    >
                        <option value="enable">{relationLabel(locale, "enable")}</option>
                        <option value="constraint">{relationLabel(locale, "constraint")}</option>
                        <option value="determine">{relationLabel(locale, "determine")}</option>
                        <option value="conflicts_with">{relationLabel(locale, "conflicts_with")}</option>
                    </select>
                </label>
            </div>
        );
    }

    const current = node!;
    const importanceValue = Number.isFinite(Number(current.importance))
        ? Number(current.importance)
        : 0.68;
    const confidenceValue = Number.isFinite(Number(current.confidence))
        ? Number(current.confidence)
        : 0.68;

    return (
            <div className="FlowInspector">
                <div className="FlowInspector__head">
                <div className="FlowInspector__title">{tr("编辑节点", "Edit Node")}</div>
                <button
                    type="button"
                    className="Btn FlowToolbar__btn FlowToolbar__btnDanger"
                    onClick={() => onDeleteNode(current.id)}
                    title={tr("删除该节点并重连上下游", "Delete node and reconnect parent/children")}
                >
                    {tr("删除当前节点", "Delete Node")}
                </button>
            </div>

            <label className="FlowInspector__fieldLabel">
                {tr("标题 / Statement", "Title / Statement")}
                <textarea
                    className="FlowInspector__editor"
                    value={current.statement || ""}
                    onChange={(e) => onPatchNode(current.id, { statement: e.target.value })}
                />
            </label>

            <div className="FlowInspector__fieldGrid">
                <label className="FlowInspector__fieldLabel">
                    {tr("类型", "Type")}
                    <select
                        className="FlowInspector__select"
                        value={current.type}
                        onChange={(e) => onPatchNode(current.id, { type: e.target.value as any })}
                    >
                        <option value="belief">belief</option>
                        <option value="constraint">constraint</option>
                        <option value="preference">preference</option>
                        <option value="factual_assertion">factual_assertion</option>
                    </select>
                </label>
            </div>

            <div className="FlowInspector__fieldGrid">
                <label className="FlowInspector__fieldLabel">
                    {tr("状态", "Status")}
                    <select
                        className="FlowInspector__select"
                        value={current.status || "proposed"}
                        onChange={(e) => onPatchNode(current.id, { status: e.target.value as any })}
                    >
                        <option value="proposed">proposed</option>
                        <option value="confirmed">confirmed</option>
                        <option value="rejected">rejected</option>
                        <option value="disputed">disputed</option>
                    </select>
                </label>
                <label className="FlowInspector__fieldLabel">
                    {tr("强度", "Strength")}
                    <select
                        className="FlowInspector__select"
                        value={current.strength || ""}
                        onChange={(e) =>
                            onPatchNode(current.id, { strength: (e.target.value || undefined) as any })
                        }
                    >
                        <option value="">(none)</option>
                        <option value="hard">hard</option>
                        <option value="soft">soft</option>
                    </select>
                </label>
            </div>

            <div className="FlowInspector__fieldGrid">
                <label className="FlowInspector__fieldLabel">
                    {tr("严重度", "Severity")}
                    <select
                        className="FlowInspector__select"
                        value={current.severity || ""}
                        onChange={(e) =>
                            onPatchNode(current.id, { severity: (e.target.value || undefined) as any })
                        }
                    >
                        <option value="">(none)</option>
                        <option value="low">low</option>
                        <option value="medium">medium</option>
                        <option value="high">high</option>
                        <option value="critical">critical</option>
                    </select>
                </label>
                <label className="FlowInspector__fieldLabel FlowInspector__fieldLabel--check">
                    <input
                        type="checkbox"
                        checked={!!current.locked}
                        onChange={(e) => onPatchNode(current.id, { locked: e.target.checked })}
                    />
                    {tr("锁定节点", "Lock node")}
                </label>
            </div>

            <label className="FlowInspector__sliderLabel">
                {tr("重要性", "Importance")}: {Math.round(normalize01(importanceValue, 0.68) * 100)}%
                <input
                    type="range"
                    min={0.35}
                    max={0.98}
                    step={0.01}
                    value={importanceValue}
                    onChange={(e) => onPatchNode(current.id, { importance: Number(e.target.value) })}
                />
            </label>

            <label className="FlowInspector__sliderLabel">
                <span className="FlowInspector__sliderHead">
                    <span>{confidenceLabel}: {Math.round(normalize01(confidenceValue, 0.68) * 100)}%</span>
                    <span className="FlowInspector__help">
                        <button
                            type="button"
                            className="FlowInspector__helpTrigger"
                            aria-label={tr("查看“系统觉得这条信息有多靠谱”的说明", 'Show help for "How reliable this feels to the system"')}
                        >
                            ?
                        </button>
                        <span className="FlowInspector__tooltip" role="tooltip">
                            {confidenceHelpText}
                        </span>
                    </span>
                </span>
                <input
                    type="range"
                    min={0.2}
                    max={0.99}
                    step={0.01}
                    value={confidenceValue}
                    onChange={(e) => onPatchNode(current.id, { confidence: Number(e.target.value) })}
                />
            </label>
        </div>
    );
}
