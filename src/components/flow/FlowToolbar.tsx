import React from "react";
import type { AppLocale } from "../../core/type";

export function FlowToolbar(props: {
    locale: AppLocale;
    onAddNode: () => void;
    onSave: () => void;
    canSave: boolean;
    saving: boolean;
    dirty: boolean;
    generating: boolean;
}) {
    const en = props.locale === "en-US";
    const tr = (zh: string, enText: string) => (en ? enText : zh);
    return (
        <div className="FlowToolbar">
            <div className="FlowToolbar__group">
                <button
                    type="button"
                    className="Btn FlowToolbar__btn"
                    onClick={props.onAddNode}
                    title={tr("新增节点", "Add node")}
                >
                    {tr("+ 新增节点", "+ Add Node")}
                </button>
            </div>
            <div className="FlowToolbar__group">
                <button
                    type="button"
                    className="Btn FlowToolbar__save"
                    onClick={props.onSave}
                    disabled={!props.canSave || props.saving}
                >
                    {props.saving ? tr("保存中...", "Saving...") : tr("保存并生成建议", "Save and Generate Advice")}
                </button>
                {props.dirty ? <span className="FlowToolbar__dirty">{tr("未保存", "Unsaved")}</span> : null}
                {props.generating ? <span className="FlowStatusTag">{tr("生成中", "Generating")}</span> : null}
            </div>
        </div>
    );
}
