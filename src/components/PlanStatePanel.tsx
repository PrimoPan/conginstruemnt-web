import React from "react";
import type {
  AppLocale,
  CognitiveState,
  PortfolioDocumentState,
  TaskDetection,
  TravelPlanState,
} from "../core/type";

function tr(locale: AppLocale, zh: string, en: string) {
  return locale === "en-US" ? en : zh;
}

function clean(input: any, max = 140) {
  return String(input ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function PlanStatePanel(props: {
  locale: AppLocale;
  taskDetection: TaskDetection | null;
  cognitiveState: CognitiveState | null;
  portfolioDocumentState: PortfolioDocumentState | null;
  travelPlanState: TravelPlanState | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const { locale, taskDetection, cognitiveState, portfolioDocumentState, travelPlanState, collapsed, onToggleCollapsed } = props;

  const taskMode = taskDetection?.mode || "single_conversation";
  const taskReason = clean(taskDetection?.reason, 180);
  const activeTask = clean(cognitiveState?.current_task_id || travelPlanState?.task_id, 80);
  const currentTask =
    (cognitiveState?.tasks || []).find((t) => clean(t.task_id, 80) === activeTask) || cognitiveState?.tasks?.[0];
  const activeMotifs = (currentTask?.motif_instances_current_task || []).filter((m) => m.status === "active").length;
  const openQuestions =
    travelPlanState?.open_questions?.length || currentTask?.clarification_questions?.length || 0;
  const tripCount = portfolioDocumentState?.trips?.length || 0;
  const archivedTaskCount = Math.max(0, (cognitiveState?.tasks?.length || 1) - 1);
  const planVersion = Number(travelPlanState?.plan_version || travelPlanState?.version || 1);

  return (
    <div className="Panel PlanStatePanel">
      <div className="PanelHeader PlanStatePanel__head">
        <span>{tr(locale, "计划状态", "Plan State")}</span>
        <button
          type="button"
          className="PlanStatePanel__toggle"
          onClick={onToggleCollapsed}
          title={collapsed ? tr(locale, "展开计划状态", "Expand plan state") : tr(locale, "收起计划状态", "Collapse plan state")}
        >
          {collapsed ? tr(locale, "展开", "Expand") : tr(locale, "收起", "Collapse")}
        </button>
      </div>
      {!collapsed ? (
      <div className="PlanStatePanel__body">
        <div className="PlanStatePanel__row">
          <span className="PlanStatePanel__key">{tr(locale, "任务模式", "Task mode")}</span>
          <span className="PlanStatePanel__val">{taskMode}</span>
        </div>
        <div className="PlanStatePanel__row">
          <span className="PlanStatePanel__key">{tr(locale, "当前任务", "Current task")}</span>
          <span className="PlanStatePanel__val">{activeTask || tr(locale, "待生成", "pending")}</span>
        </div>
        <div className="PlanStatePanel__row">
          <span className="PlanStatePanel__key">{tr(locale, "计划版本", "Plan version")}</span>
          <span className="PlanStatePanel__val">v{planVersion}</span>
        </div>
        <div className="PlanStatePanel__row">
          <span className="PlanStatePanel__key">{tr(locale, "Active motifs", "Active motifs")}</span>
          <span className="PlanStatePanel__val">{activeMotifs}</span>
        </div>
        <div className="PlanStatePanel__row">
          <span className="PlanStatePanel__key">{tr(locale, "待澄清项", "Open questions")}</span>
          <span className="PlanStatePanel__val">{openQuestions}</span>
        </div>
        <div className="PlanStatePanel__row">
          <span className="PlanStatePanel__key">{tr(locale, "Portfolio 行程", "Portfolio trips")}</span>
          <span className="PlanStatePanel__val">{tripCount}</span>
        </div>
        <div className="PlanStatePanel__row">
          <span className="PlanStatePanel__key">{tr(locale, "历史任务", "Archived tasks")}</span>
          <span className="PlanStatePanel__val">{archivedTaskCount}</span>
        </div>
        {taskReason ? <div className="PlanStatePanel__reason">{taskReason}</div> : null}
      </div>
      ) : (
        <div className="PlanStatePanel__summary">
          {tr(locale, "默认收起，点击“展开”查看任务状态详情。", "Collapsed by default. Click Expand to view details.")}
        </div>
      )}
    </div>
  );
}
