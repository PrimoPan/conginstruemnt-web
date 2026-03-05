import React, { useMemo, useState } from "react";
import type { AppLocale, ConversationSummary } from "../core/type";

type HistoryGroupKey = "today" | "last7Days" | "last30Days" | "older";
const DAY_MS = 24 * 60 * 60 * 1000;

function formatTimestamp(locale: AppLocale, input: string) {
  const d = new Date(input);
  if (!Number.isFinite(d.getTime())) return input || "";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function toLocalDayStartEpoch(input: string): number | null {
  const d = new Date(input);
  if (!Number.isFinite(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function sortByUpdatedAtDesc(a: ConversationSummary, b: ConversationSummary) {
  const ta = new Date(a.updatedAt).getTime();
  const tb = new Date(b.updatedAt).getTime();
  const sa = Number.isFinite(ta) ? ta : -Infinity;
  const sb = Number.isFinite(tb) ? tb : -Infinity;
  return sb - sa;
}

function resolveHistoryGroup(updatedAt: string, todayStartEpoch: number): HistoryGroupKey {
  const dayStart = toLocalDayStartEpoch(updatedAt);
  if (dayStart == null) return "older";
  const deltaDays = Math.floor((todayStartEpoch - dayStart) / DAY_MS);
  if (deltaDays <= 0) return "today";
  if (deltaDays <= 6) return "last7Days";
  if (deltaDays <= 29) return "last30Days";
  return "older";
}

export function ConversationHistoryDrawer(props: {
  locale: AppLocale;
  open: boolean;
  loading: boolean;
  errorText?: string;
  items: ConversationSummary[];
  activeConversationId: string;
  onClose: () => void;
  onRefresh: () => void;
  onSelectConversation: (conversationId: string) => void;
  onNewConversation: () => void;
  initialSearchQuery?: string;
}) {
  const en = props.locale === "en-US";
  const tr = (zh: string, enText: string) => (en ? enText : zh);
  const [query, setQuery] = useState(() => String(props.initialSearchQuery || "").trim());

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = (props.items || []).filter((x) => {
      if (!q) return true;
      const title = String(x.title || "").toLowerCase();
      const cidSuffix = String(x.conversationId || "").slice(-6).toLowerCase();
      return title.includes(q) || cidSuffix.includes(q);
    });

    const sorted = filtered.slice().sort(sortByUpdatedAtDesc);
    const now = new Date();
    const todayStartEpoch = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const groups: Record<HistoryGroupKey, ConversationSummary[]> = {
      today: [],
      last7Days: [],
      last30Days: [],
      older: [],
    };

    for (const item of sorted) {
      const key = resolveHistoryGroup(item.updatedAt, todayStartEpoch);
      groups[key].push(item);
    }

    return {
      query: q,
      filteredCount: sorted.length,
      groups,
    };
  }, [props.items, query]);

  const groupOrder: HistoryGroupKey[] = ["today", "last7Days", "last30Days", "older"];

  function groupTitle(key: HistoryGroupKey, count: number) {
    if (key === "today") return tr(`今天 (${count})`, `Today (${count})`);
    if (key === "last7Days") return tr(`近7天 (${count})`, `Last 7 days (${count})`);
    if (key === "last30Days") return tr(`近30天 (${count})`, `Last 30 days (${count})`);
    return tr(`更早 (${count})`, `Older (${count})`);
  }

  return (
    <div className={`HistoryDrawer ${props.open ? "is-open" : ""}`} aria-hidden={!props.open}>
      <div className="HistoryDrawer__mask" onClick={props.onClose} />
      <aside className="HistoryDrawer__panel" role="dialog" aria-label={tr("历史会话", "Conversation History")}>
        <div className="HistoryDrawer__head">
          <div className="HistoryDrawer__title">{tr("历史会话", "Conversation History")}</div>
          <div className="HistoryDrawer__actions">
            <button className="Btn" type="button" onClick={props.onNewConversation}>
              {tr("新建", "New")}
            </button>
            <button className="Btn" type="button" onClick={props.onRefresh} disabled={props.loading}>
              {props.loading ? tr("刷新中...", "Refreshing...") : tr("刷新", "Refresh")}
            </button>
            <button className="Btn" type="button" onClick={props.onClose}>
              {tr("收起", "Close")}
            </button>
          </div>
        </div>

        {props.errorText ? <div className="HistoryDrawer__error">{props.errorText}</div> : null}
        <div className="HistoryDrawer__search">
          <input
            className="HistoryDrawer__searchInput"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr("搜索标题或CID后缀", "Search title or CID suffix")}
          />
        </div>

        <div className="HistoryDrawer__list">
          {!props.items.length && props.loading ? (
            <div className="HistoryDrawer__empty">{tr("加载中...", "Loading...")}</div>
          ) : null}
          {!props.items.length && !props.loading ? (
            <div className="HistoryDrawer__empty">{tr("暂无历史会话", "No conversation history")}</div>
          ) : null}
          {!!props.items.length && !grouped.filteredCount ? (
            <div className="HistoryDrawer__empty">{tr("未找到匹配会话", "No matching conversations")}</div>
          ) : null}

          {groupOrder.map((gk) => {
            const items = grouped.groups[gk];
            if (!items.length) return null;
            return (
              <section className="HistoryDrawer__group" key={gk}>
                <div className="HistoryDrawer__groupTitle">{groupTitle(gk, items.length)}</div>
                <div className="HistoryDrawer__groupList">
                  {items.map((x) => (
                    <button
                      key={x.conversationId}
                      type="button"
                      className={`HistoryDrawer__item ${
                        x.conversationId === props.activeConversationId ? "is-active" : ""
                      }`}
                      onClick={() => props.onSelectConversation(x.conversationId)}
                    >
                      <div className="HistoryDrawer__itemTitle">{x.title || tr("未命名对话", "Untitled conversation")}</div>
                      <div className="HistoryDrawer__itemMeta">
                        <span>…{x.conversationId.slice(-6)}</span>
                        <span>{formatTimestamp(props.locale, x.updatedAt)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
