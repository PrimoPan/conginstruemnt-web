import React from "react";

export function FlowToolbar(props: {
    onAddNode: () => void;
    onSave: () => void;
    canSave: boolean;
    saving: boolean;
    dirty: boolean;
    generating: boolean;
}) {
    return (
        <div className="FlowToolbar">
            <div className="FlowToolbar__group">
                <button
                    type="button"
                    className="Btn FlowToolbar__btn"
                    onClick={props.onAddNode}
                    title="新增节点"
                >
                    + 新增节点
                </button>
            </div>
            <div className="FlowToolbar__group">
                <button
                    type="button"
                    className="Btn FlowToolbar__save"
                    onClick={props.onSave}
                    disabled={!props.canSave || props.saving}
                >
                    {props.saving ? "保存中..." : "保存并生成建议"}
                </button>
                {props.dirty ? <span className="FlowToolbar__dirty">未保存</span> : null}
                {props.generating ? <span className="FlowStatusTag">生成中</span> : null}
            </div>
        </div>
    );
}
