import React from "react";
import type { AppLocale } from "../core/type";

export function TopBar(props: {
    locale: AppLocale;
    onLocaleChange: (locale: AppLocale) => void;
    username: string;
    setUsername: (s: string) => void;
    onLogin: () => void;
    onNewConversation: () => void;
    onNewTravelPlanning: () => void;
    onExportPlan: () => void;
    onEndTask: () => void;
    loggedIn: boolean;
    cid: string;
    graphVersion: number;
    busy: boolean;
    exportingPlan: boolean;
    exportPlanDisabled: boolean;
}) {
    const en = props.locale === "en-US";
    const tr = (zh: string, enText: string) => (en ? enText : zh);

    return (
        <div className="TopBar">
            <div className="TopBar__left">
                <div className="Brand">CogInstrument</div>
                <div className="Sub">{en ? "Research demo (EN)" : "Research demo (CN)"}</div>
            </div>

            <div className="TopBar__right">
                <button
                    className={`Btn ${!en ? "Btn--active" : ""}`}
                    onClick={() => props.onLocaleChange("zh-CN")}
                    disabled={props.busy}
                    title={tr("切换到中文", "Switch to Chinese")}
                >
                    中文
                </button>
                <button
                    className={`Btn ${en ? "Btn--active" : ""}`}
                    onClick={() => props.onLocaleChange("en-US")}
                    disabled={props.busy}
                    title="Switch to English"
                >
                    EN
                </button>
                <input
                    className="Input"
                    value={props.username}
                    onChange={(e) => props.setUsername(e.target.value)}
                    placeholder={tr("用户名（无密码）", "Username (no password)")}
                />
                <button className="Btn" onClick={props.onLogin} disabled={props.busy}>
                    {tr("登录", "Login")}
                </button>
                <button
                    className="Btn"
                    onClick={props.onNewConversation}
                    disabled={!props.loggedIn || props.busy}
                >
                    {tr("新建对话", "New Chat")}
                </button>
                <button
                    className="Btn"
                    onClick={props.onNewTravelPlanning}
                    disabled={!props.loggedIn || props.busy}
                    title={tr("从上次经验新建旅行规划", "Start a new trip planning from reusable constraints")}
                >
                    {tr("新增旅游规划", "New Trip Plan")}
                </button>
                <button
                    className="Btn"
                    onClick={props.onEndTask}
                    disabled={!props.loggedIn || !props.cid || props.busy}
                    title={tr("结束当前任务并确认认知摘要", "End current task and confirm cognitive summary")}
                >
                    {tr("结束任务", "End Task")}
                </button>
                <div className="Meta">
                    {props.cid ? (
                        <>
                            <span>CID: …{props.cid.slice(-6)}</span>
                            <span className="Dot">·</span>
                            <span>v{props.graphVersion}</span>
                        </>
                    ) : (
                        <span>{tr("未选择对话", "No conversation selected")}</span>
                    )}
                </div>
            </div>
        </div>
    );
}
