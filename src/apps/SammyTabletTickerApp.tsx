import { CalendarDays, Check, ChevronLeft, ChevronRight, HeartPulse, History, RotateCcw, ShieldCheck, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useCannvasData } from "../data/DataProvider";
import type { TabletId, TabletSchedule } from "../data/types";

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

function todayKey() {
  const today = new Date();
  return [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
}

function fromDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDate(value: string) {
  return fromDateKey(value).toLocaleDateString("zh-CN", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
}

function dateKey(value: Date) {
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"), String(value.getDate()).padStart(2, "0")].join("-");
}

function calendarDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
}

function dueState(tablet: TabletSchedule) {
  if (!tablet.dueDate) return { label: "选择日期", className: "unset" };
  const days = Math.round((fromDateKey(tablet.dueDate).getTime() - fromDateKey(todayKey()).getTime()) / 86_400_000);
  if (days < 0) return { label: `逾期 ${Math.abs(days)} 天`, className: "overdue" };
  if (days === 0) return { label: "今天到期", className: "today" };
  if (days === 1) return { label: "明天到期", className: "soon" };
  return { label: `${days} 天后到期`, className: days <= 14 ? "soon" : "scheduled" };
}

export function SammyTabletTickerApp() {
  const { tabletSchedules, tabletCompletions, setTabletDueDate, completeTablet, undoTabletCompletion } = useCannvasData();
  const [showHistory, setShowHistory] = useState(false);
  const [dateTabletId, setDateTabletId] = useState<TabletId | null>(null);
  const [pickerMonth, setPickerMonth] = useState(() => new Date());
  const latestByTablet = useMemo(() => new Map(tabletSchedules.map((tablet) => [
    tablet.id,
    [...tabletCompletions].reverse().find((completion) => completion.tabletId === tablet.id),
  ])), [tabletCompletions, tabletSchedules]);
  const sortedHistory = useMemo(
    () => [...tabletCompletions].sort((left, right) => right.takenDate.localeCompare(left.takenDate)),
    [tabletCompletions],
  );
  const dateTablet = tabletSchedules.find(({ id }) => id === dateTabletId);
  const pickerDays = useMemo(() => calendarDays(pickerMonth), [pickerMonth]);

  const openDatePicker = (tablet: TabletSchedule) => {
    const initialDate = tablet.dueDate ? fromDateKey(tablet.dueDate) : new Date();
    setPickerMonth(new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
    setDateTabletId(tablet.id);
  };

  const chooseDate = async (value: string) => {
    if (!dateTabletId) return;
    await setTabletDueDate(dateTabletId, value);
    setDateTabletId(null);
  };

  return (
    <section className="sammy-tablets-app">
      <header className="sammy-tablets-header">
        <div className="sammy-title-icon"><HeartPulse /></div>
        <div>
          <h1>宠物喂药</h1>
          <p>设置下次服药时间，给药后勾选确认。</p>
        </div>
        <button className="tablet-history-button" onClick={() => setShowHistory(true)}>
          <History />
          服药记录
          <span>{tabletCompletions.length}</span>
        </button>
      </header>

      <div className="tablet-list">
        {tabletSchedules.map((tablet) => {
          const status = dueState(tablet);
          const latest = latestByTablet.get(tablet.id);
          return (
            <article className={`tablet-card ${status.className}`} key={tablet.id} style={{ "--tablet-color": tablet.color } as React.CSSProperties}>
              <div className="tablet-card-top">
                <div className="tablet-mark"><ShieldCheck /></div>
                <div className="tablet-name">
                  <h2>{tablet.name}</h2>
                  <p>{tablet.purpose} · {tablet.id === "nuheart" ? "每月一次，驱虫月除外" : "每 3 个月"}</p>
                </div>
                <span className={`tablet-status ${status.className}`}>{status.label}</span>
              </div>

              <div className="tablet-card-actions">
                <button className="tablet-date-field" onClick={() => openDatePicker(tablet)} aria-label={`选择${tablet.name}的下次日期`}>
                  <CalendarDays />
                  <span>
                    <small>下次服药</small>
                    <strong>{tablet.dueDate ? formatDate(tablet.dueDate) : "点击设置日期"}</strong>
                  </span>
                </button>
                <button
                  className="tablet-done-button"
                  disabled={!tablet.dueDate}
                  onClick={() => void completeTablet(tablet.id, todayKey())}
                >
                  <Check strokeWidth={3.2} />
                  已给药
                </button>
              </div>

              {latest && (
                <div className="tablet-last-given">
                  <span>上次给药 {formatDate(latest.takenDate)}</span>
                  {latest.previousDueDate !== undefined && (
                    <button onClick={() => void undoTabletCompletion(tablet.id)}><RotateCcw /> 撤销</button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {showHistory && (
        <div className="dialog-backdrop" role="presentation" onPointerDown={() => setShowHistory(false)}>
          <section className="dialog-card tablet-history-card" role="dialog" aria-modal="true" aria-labelledby="tablet-history-title" onPointerDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2 id="tablet-history-title">服药记录</h2>
                <p>{tabletCompletions.length} 次记录</p>
              </div>
              <button className="tablet-history-close" onClick={() => setShowHistory(false)} aria-label="关闭服药记录"><X /></button>
            </header>
            <div className="tablet-history-list">
              {sortedHistory.map((completion) => {
                const tablet = tabletSchedules.find(({ id }) => id === completion.tabletId);
                if (!tablet) return null;
                return (
                  <article key={completion.id} style={{ "--tablet-color": tablet.color } as React.CSSProperties}>
                    <span className="tablet-history-dot"><Check /></span>
                    <div><strong>{tablet.name}</strong><small>{tablet.purpose}</small></div>
                    <time dateTime={completion.takenDate}>{formatDate(completion.takenDate)}</time>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {dateTablet && (
        <div className="dialog-backdrop" role="presentation" onPointerDown={() => setDateTabletId(null)}>
          <section className="dialog-card tablet-date-picker-card" role="dialog" aria-modal="true" aria-labelledby="tablet-date-picker-title" onPointerDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2 id="tablet-date-picker-title">{dateTablet.name}下次服药</h2>
                <p>选择下次给药日期。</p>
              </div>
              <button className="tablet-history-close" onClick={() => setDateTabletId(null)} aria-label="关闭日期选择器"><X /></button>
            </header>

            <div className="tablet-picker-month">
              <button onClick={() => setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() - 1, 1))} aria-label="上个月"><ChevronLeft /></button>
              <strong>{pickerMonth.toLocaleDateString("zh-CN", { month: "long", year: "numeric" })}</strong>
              <button onClick={() => setPickerMonth(new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + 1, 1))} aria-label="下个月"><ChevronRight /></button>
            </div>

            <div className="tablet-picker-weekdays" aria-hidden="true">
              {WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}
            </div>
            <div className="tablet-picker-grid">
              {pickerDays.map((day) => {
                const key = dateKey(day);
                const outside = day.getMonth() !== pickerMonth.getMonth();
                const selected = key === dateTablet.dueDate;
                const today = key === todayKey();
                return (
                  <button
                    className={`${outside ? "outside" : ""}${selected ? " selected" : ""}${today ? " today" : ""}`}
                    key={key}
                    onClick={() => void chooseDate(key)}
                    aria-label={day.toLocaleDateString("zh-CN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                    aria-pressed={selected}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>

            <footer className="tablet-picker-actions">
              {dateTablet.dueDate && <button className="button secondary" onClick={() => void chooseDate("")}>清除日期</button>}
              <button className="button primary" onClick={() => void chooseDate(todayKey())}>今天</button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
