import React from "react";
import type { CDGEdge, CDGNode, EdgeType } from "../../core/type";
import { normalize01 } from "./graphDraftUtils";

export function FlowInspector(props: {
    node: CDGNode | null;
    edge: CDGEdge | null;
    onPatchNode: (nodeId: string, patch: Partial<CDGNode>) => void;
    onPatchEdgeType: (edgeId: string, edgeType: EdgeType) => void;
    onDeleteNode: (nodeId: string) => void;
}) {
    const { node, edge, onPatchNode, onPatchEdgeType, onDeleteNode } = props;

    if (!node && !edge) {
        return (
            <div className="FlowInspector">
                <div className="FlowInspector__title">编辑面板</div>
                <div className="FlowInspector__hint">点击节点或边进行编辑</div>
            </div>
        );
    }

    if (edge && !node) {
        return (
            <div className="FlowInspector">
                <div className="FlowInspector__title">编辑边</div>
                <label className="FlowInspector__fieldLabel">
                    边类型
                    <select
                        className="FlowInspector__select"
                        value={edge.type}
                        onChange={(e) => onPatchEdgeType(edge.id, e.target.value as EdgeType)}
                    >
                        <option value="enable">enable</option>
                        <option value="constraint">constraint</option>
                        <option value="determine">determine</option>
                        <option value="conflicts_with">conflicts_with</option>
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
                <div className="FlowInspector__title">编辑节点</div>
                <button
                    type="button"
                    className="Btn FlowToolbar__btn FlowToolbar__btnDanger"
                    onClick={() => onDeleteNode(current.id)}
                    title="删除该节点并重连上下游"
                >
                    删除当前节点
                </button>
            </div>

            <label className="FlowInspector__fieldLabel">
                标题 / Statement
                <textarea
                    className="FlowInspector__editor"
                    value={current.statement || ""}
                    onChange={(e) => onPatchNode(current.id, { statement: e.target.value })}
                />
            </label>

            <div className="FlowInspector__fieldGrid">
                <label className="FlowInspector__fieldLabel">
                    类型
                    <select
                        className="FlowInspector__select"
                        value={current.type}
                        onChange={(e) => onPatchNode(current.id, { type: e.target.value as any })}
                    >
                        <option value="goal">goal</option>
                        <option value="constraint">constraint</option>
                        <option value="preference">preference</option>
                        <option value="fact">fact</option>
                        <option value="belief">belief</option>
                        <option value="question">question</option>
                    </select>
                </label>
                <label className="FlowInspector__fieldLabel">
                    层级
                    <select
                        className="FlowInspector__select"
                        value={current.layer || ""}
                        onChange={(e) =>
                            onPatchNode(current.id, { layer: (e.target.value || undefined) as any })
                        }
                    >
                        <option value="">(none)</option>
                        <option value="intent">intent</option>
                        <option value="requirement">requirement</option>
                        <option value="preference">preference</option>
                        <option value="risk">risk</option>
                    </select>
                </label>
            </div>

            <div className="FlowInspector__fieldGrid">
                <label className="FlowInspector__fieldLabel">
                    状态
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
                    强度
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
                    严重度
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
                    锁定节点
                </label>
            </div>

            <label className="FlowInspector__sliderLabel">
                重要性：{Math.round(normalize01(importanceValue, 0.68) * 100)}%
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
                置信度：{Math.round(normalize01(confidenceValue, 0.68) * 100)}%
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
