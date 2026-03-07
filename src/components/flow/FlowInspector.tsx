import React from "react";
import type { AppLocale, CDGEdge, CDGNode, EdgeType } from "../../core/type";
import { normalize01 } from "./graphDraftUtils";
import { relationLabel } from "../../core/relationLabels";
import { FieldHelp } from "./FieldHelp";

function fieldHead(label: string, helpText: string) {
    return (
        <span className="FlowInspector__fieldHead">
            <span>{label}</span>
            <FieldHelp label={label} text={helpText} />
        </span>
    );
}

export function FlowInspector(props: {
    locale: AppLocale;
    canvasMode: "view" | "edit";
    node: CDGNode | null;
    edge: CDGEdge | null;
    onPatchNode: (nodeId: string, patch: Partial<CDGNode>) => void;
    onPatchEdgeType: (edgeId: string, edgeType: EdgeType) => void;
    onDeleteEdge: (edgeId: string) => void;
    onDeleteNode: (nodeId: string) => void;
}) {
    const { node, edge, onPatchNode, onPatchEdgeType, onDeleteEdge, onDeleteNode, locale, canvasMode } = props;
    const en = locale === "en-US";
    const tr = (zh: string, enText: string) => (en ? enText : zh);
    const readOnly = canvasMode !== "edit";
    const readOnlyHint = tr("当前是查看模式，切到编辑模式后才可以修改。", "You are in view mode. Switch to edit mode to make changes.");

    const titleHelp = tr(
        "这里写的是这条信息本身。改它会影响节点在图里的含义，也会影响系统后面怎么理解和追问。",
        "This is the information itself. Changing it changes what the node means and how the system reasons about it."
    );
    const typeHelp = tr(
        "类型是在说这句话更像目标、限制、偏好，还是事实。改了以后，系统会用不同方式理解它和别的节点的关系。",
        "Type tells the system whether this is a goal, limit, preference, or fact. That changes how it relates this node to others."
    );
    const statusHelp = tr(
        "状态表示这条信息现在有多确定。越确定，系统越会直接拿来规划；如果还没说清楚，就先保持在较不确定的状态。",
        "Status shows how settled this information is. More settled information is used more directly in planning."
    );
    const strengthHelp = tr(
        "强度是在说这件事是硬条件还是软偏好。硬条件更像必须遵守，软条件更像尽量满足。",
        "Strength says whether this is a hard rule or a softer preference. Hard rules are treated as must-follow."
    );
    const severityHelp = tr(
        "严重度是在说这条信息如果没被照顾好，影响会有多大。越高，系统越会优先注意它。",
        "Severity says how serious it is if this information is ignored. Higher severity gets more attention."
    );
    const lockHelp = tr(
        "锁定后，这个节点更不容易被系统后续自动改掉。适合那些你已经非常确定、不想被自动调整的内容。",
        "When locked, the system is less likely to change this node automatically later. Use it for things you are sure about."
    );
    const importanceHelp = tr(
        "你可以把重要性理解成“这件事在整张图里占多大分量”。调高后，系统更会围着它做安排；调低后，它还会保留，但影响会小一些。",
        "Importance is how much weight this item carries in the graph. Higher means planning will lean on it more."
    );
    const confidenceLabel = tr("系统觉得这条信息有多靠谱", "How reliable this feels to the system");
    const confidenceHelpText = tr(
        "你可以把它理解成：系统有多相信你刚刚这句话。往高了调，系统会更容易把它当真，直接照着安排；往低了调，系统会先记下来，但更可能再问你一句，确认是不是这个意思。已经想清楚、基本不会变的，就调高一点；只是随口提一下、自己也还没拿准的，就调低一点。",
        "You can think of this as how much the system trusts what you said. Higher means it will act on it more directly. Lower means it will keep it in mind, but is more likely to ask a follow-up question before using it."
    );

    if (!node && !edge) {
        return (
            <div className="FlowInspector">
                <div className="FlowInspector__title">{tr("编辑面板", "Editor")}</div>
                <div className="FlowInspector__hint">{tr("点击节点或边查看详情", "Click a node or edge to inspect")}</div>
                {readOnly ? <div className="FlowInspector__modeHint">{readOnlyHint}</div> : null}
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
                        title={readOnly ? readOnlyHint : tr("删除当前关系", "Delete current relationship")}
                        disabled={readOnly}
                    >
                        {tr("删除关系", "Delete Relationship")}
                    </button>
                </div>
                {readOnly ? <div className="FlowInspector__modeHint">{readOnlyHint}</div> : null}
                <label className="FlowInspector__fieldLabel">
                    {fieldHead(
                        tr("关系类型", "Relationship Type"),
                        tr(
                            "关系类型表示这两个节点之间是什么关系。改它会改变系统怎么理解这条连线对推理和规划的影响。",
                            "Relationship type changes how the system interprets the link between these two nodes."
                        )
                    )}
                    <select
                        className="FlowInspector__select"
                        value={edge.type}
                        onChange={(e) => onPatchEdgeType(edge.id, e.target.value as EdgeType)}
                        disabled={readOnly}
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
                    title={readOnly ? readOnlyHint : tr("删除该节点并重连上下游", "Delete node and reconnect parent/children")}
                    disabled={readOnly}
                >
                    {tr("删除当前节点", "Delete Node")}
                </button>
            </div>

            {readOnly ? <div className="FlowInspector__modeHint">{readOnlyHint}</div> : null}

            <label className="FlowInspector__fieldLabel">
                {fieldHead(tr("标题 / Statement", "Title / Statement"), titleHelp)}
                <textarea
                    className="FlowInspector__editor"
                    value={current.statement || ""}
                    onChange={(e) => onPatchNode(current.id, { statement: e.target.value })}
                    disabled={readOnly}
                />
            </label>

            <div className="FlowInspector__fieldGrid">
                <label className="FlowInspector__fieldLabel">
                    {fieldHead(tr("类型", "Type"), typeHelp)}
                    <select
                        className="FlowInspector__select"
                        value={current.type}
                        onChange={(e) => onPatchNode(current.id, { type: e.target.value as any })}
                        disabled={readOnly}
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
                    {fieldHead(tr("状态", "Status"), statusHelp)}
                    <select
                        className="FlowInspector__select"
                        value={current.status || "proposed"}
                        onChange={(e) => onPatchNode(current.id, { status: e.target.value as any })}
                        disabled={readOnly}
                    >
                        <option value="proposed">proposed</option>
                        <option value="confirmed">confirmed</option>
                        <option value="rejected">rejected</option>
                        <option value="disputed">disputed</option>
                    </select>
                </label>
                <label className="FlowInspector__fieldLabel">
                    {fieldHead(tr("强度", "Strength"), strengthHelp)}
                    <select
                        className="FlowInspector__select"
                        value={current.strength || ""}
                        onChange={(e) =>
                            onPatchNode(current.id, { strength: (e.target.value || undefined) as any })
                        }
                        disabled={readOnly}
                    >
                        <option value="">(none)</option>
                        <option value="hard">hard</option>
                        <option value="soft">soft</option>
                    </select>
                </label>
            </div>

            <div className="FlowInspector__fieldGrid">
                <label className="FlowInspector__fieldLabel">
                    {fieldHead(tr("严重度", "Severity"), severityHelp)}
                    <select
                        className="FlowInspector__select"
                        value={current.severity || ""}
                        onChange={(e) =>
                            onPatchNode(current.id, { severity: (e.target.value || undefined) as any })
                        }
                        disabled={readOnly}
                    >
                        <option value="">(none)</option>
                        <option value="low">low</option>
                        <option value="medium">medium</option>
                        <option value="high">high</option>
                        <option value="critical">critical</option>
                    </select>
                </label>
                <label className="FlowInspector__fieldLabel FlowInspector__fieldLabel--check">
                    {fieldHead(tr("锁定节点", "Lock node"), lockHelp)}
                    <input
                        type="checkbox"
                        checked={!!current.locked}
                        onChange={(e) => onPatchNode(current.id, { locked: e.target.checked })}
                        disabled={readOnly}
                    />
                </label>
            </div>

            <label className="FlowInspector__sliderLabel">
                <span className="FlowInspector__sliderHead">
                    <span>{tr("重要性", "Importance")}: {Math.round(normalize01(importanceValue, 0.68) * 100)}%</span>
                    <FieldHelp label={tr("重要性", "Importance")} text={importanceHelp} />
                </span>
                <input
                    type="range"
                    min={0.35}
                    max={0.98}
                    step={0.01}
                    value={importanceValue}
                    onChange={(e) => onPatchNode(current.id, { importance: Number(e.target.value) })}
                    disabled={readOnly}
                />
            </label>

            <label className="FlowInspector__sliderLabel">
                <span className="FlowInspector__sliderHead">
                    <span>{confidenceLabel}: {Math.round(normalize01(confidenceValue, 0.68) * 100)}%</span>
                    <FieldHelp label={confidenceLabel} text={confidenceHelpText} />
                </span>
                <input
                    type="range"
                    min={0.2}
                    max={0.99}
                    step={0.01}
                    value={confidenceValue}
                    onChange={(e) => onPatchNode(current.id, { confidence: Number(e.target.value) })}
                    disabled={readOnly}
                />
            </label>
        </div>
    );
}
