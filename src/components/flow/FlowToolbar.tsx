import React from "react";
import type { AppLocale } from "../../core/type";

export function FlowToolbar(props: {
    locale: AppLocale;
    canvasMode: "view" | "edit";
    onAddNode: () => void;
    onSave: () => void;
    canSave: boolean;
    saving: boolean;
    dirty: boolean;
    generating: boolean;
}) {
    const en = props.locale === "en-US";
    const tr = (zh: string, enText: string) => (en ? enText : zh);
    const readOnly = props.canvasMode !== "edit";
    const readOnlyHint = tr("切到编辑模式后可修改", "Switch to edit mode to modify");

    return (
        <div className="FlowToolbar">
            <div className="FlowToolbar__group">
                <button
                    type="button"
                    className="Btn FlowToolbar__btn"
                    onClick={props.onAddNode}
                    title={readOnly ? readOnlyHint : tr("新增节点", "Add node")}
                    disabled={readOnly}
                >
                    {tr("+ 新增节点", "+ Add Node")}
                </button>
            </div>

            <div className="FlowToolbar__group">
                <button
                    type="button"
                    className="Btn FlowToolbar__save"
                    onClick={props.onSave}
                    disabled={readOnly || !props.canSave || props.saving}
                    title={readOnly ? readOnlyHint : undefined}
                >
                    {props.saving ? tr("保存中...", "Saving...") : tr("保存并生成建议", "Save and Generate Advice")}
                </button>
                {props.dirty ? <span className="FlowToolbar__dirty">{tr("未保存", "Unsaved")}</span> : null}
                {props.generating ? <span className="FlowStatusTag">{tr("生成中", "Generating")}</span> : null}
            </div>

            {readOnly ? <div className="FlowToolbar__hint">{readOnlyHint}</div> : null}
        </div>
    );
}
