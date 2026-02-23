import React from "react";

export function TopBar(props: {
    username: string;
    setUsername: (s: string) => void;
    onLogin: () => void;
    onNewConversation: () => void;
    onExportPlan: () => void;
    loggedIn: boolean;
    cid: string;
    graphVersion: number;
    busy: boolean;
    exportingPlan: boolean;
    exportPlanDisabled: boolean;
}) {
    return (
        <div className="TopBar">
            <div className="TopBar__left">
                <div className="Brand">CogInstrument</div>
                <div className="Sub">Research demo (CN)</div>
            </div>

            <div className="TopBar__right">
                <input
                    className="Input"
                    value={props.username}
                    onChange={(e) => props.setUsername(e.target.value)}
                    placeholder="用户名（无密码）"
                />
                <button className="Btn" onClick={props.onLogin} disabled={props.busy}>
                    登录
                </button>
                <button
                    className="Btn"
                    onClick={props.onNewConversation}
                    disabled={!props.loggedIn || props.busy}
                >
                    新建对话
                </button>
                <button
                    className="Btn"
                    onClick={props.onExportPlan}
                    disabled={props.exportPlanDisabled || props.exportingPlan || props.busy}
                    title={props.exportPlanDisabled ? "请先开始对话后再导出" : "导出当前旅行计划 PDF"}
                >
                    {props.exportingPlan ? "导出中..." : "导出旅行计划PDF"}
                </button>

                <div className="Meta">
                    {props.cid ? (
                        <>
                            <span>CID: …{props.cid.slice(-6)}</span>
                            <span className="Dot">·</span>
                            <span>v{props.graphVersion}</span>
                        </>
                    ) : (
                        <span>未选择对话</span>
                    )}
                </div>
            </div>
        </div>
    );
}
