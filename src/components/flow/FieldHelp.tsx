import React from "react";

export function FieldHelp(props: { label: string; text: string }) {
    return (
        <span className="FlowInspector__help">
            <button
                type="button"
                className="FlowInspector__helpTrigger"
                aria-label={`查看“${props.label}”的说明`}
            >
                ?
            </button>
            <span className="FlowInspector__tooltip" role="tooltip">
                {props.text}
            </span>
        </span>
    );
}
