import { CalendarCheck2, ChevronLeft, ChevronRight, Clock3, MapPin } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useCalendar } from "../data/DataProvider";
import { addCalendarDays, calendarDateKey, calendarEventTime, calendarMonthDays, eventsForDate } from "../lib/calendar";

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

export function CalendarApp() {
  const { calendarEvents: weekEvents, calendarStatus: weekStatus, calendarMonth, loadCalendarRange } = useCalendar();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => calendarDateKey(new Date()));
  const days = useMemo(() => calendarMonthDays(month), [month]);
  const range = useMemo(() => ({
    start: days[0].toISOString(),
    end: addCalendarDays(days[days.length - 1], 1).toISOString(),
  }), [days]);
  // Until this month's events arrive, show the home screen's week so today
  // is never blank.
  const viewed = calendarMonth?.start === range.start && calendarMonth.end === range.end ? calendarMonth : null;
  const showMonth = viewed?.status === "ready" || viewed?.status === "not-configured";
  const calendarEvents = showMonth ? viewed.events : weekEvents;
  const calendarStatus = showMonth ? viewed.status : viewed?.status === "error" ? "error" : weekStatus;
  const todayKey = calendarDateKey(new Date());
  const selectedEvents = eventsForDate(calendarEvents, selectedDate);
  const nextWeekEnd = addCalendarDays(new Date(), 8);
  const nextWeekCount = weekEvents.filter((event) => new Date(event.start) < nextWeekEnd && new Date(event.end) > new Date()).length;

  useEffect(() => {
    void loadCalendarRange(range.start, range.end);
  }, [loadCalendarRange, range]);

  // A month that failed to load tries again every minute while it's on screen.
  const monthFailed = viewed?.status === "error";
  useEffect(() => {
    if (!monthFailed) return;
    const timer = window.setTimeout(() => void loadCalendarRange(range.start, range.end), 60_000);
    return () => window.clearTimeout(timer);
  }, [loadCalendarRange, monthFailed, range]);

  const moveMonth = (offset: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    setMonth(next);
    setSelectedDate(calendarDateKey(next));
  };

  const returnToToday = () => {
    const today = new Date();
    setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(calendarDateKey(today));
  };

  return (
    <section className="calendar-app">
      <header className="calendar-header">
        <div>
          <p className="eyebrow">家庭日程</p>
          <h1>{month.toLocaleDateString("zh-CN", { month: "long", year: "numeric" })}</h1>
          <p className="header-note">来自 Google 日历的日程。</p>
        </div>
        <div className="calendar-summary-card">
          <CalendarCheck2 />
          <span><strong>{nextWeekCount}</strong> 未来 7 天的日程</span>
        </div>
      </header>

      <div className="calendar-board">
        <div className="calendar-weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
        <div className="calendar-month-grid">
          {days.map((day) => {
            const key = calendarDateKey(day);
            const dayEvents = eventsForDate(calendarEvents, key);
            const outside = day.getMonth() !== month.getMonth();
            return (
              <button className={`calendar-day${key === selectedDate ? " selected" : ""}${key === todayKey ? " today" : ""}${outside ? " outside" : ""}`} key={key} onClick={() => setSelectedDate(key)}>
                <span className="calendar-day-number">{day.getDate()}</span>
                <div className="calendar-day-events">
                  {dayEvents.slice(0, 3).map((event) => <span className={event.allDay ? "all-day" : ""} key={event.id}><b>{event.allDay ? "" : calendarEventTime(event)}</b>{event.title}</span>)}
                  {dayEvents.length > 3 && <small>+{dayEvents.length - 3} 更多</small>}
                </div>
              </button>
            );
          })}
        </div>

        <section className="calendar-agenda" aria-label={`${selectedDate}的日程`}>
          <header><div><span>所选日期</span><h2>{new Date(`${selectedDate}T00:00:00`).toLocaleDateString("zh-CN", { weekday: "long", day: "numeric", month: "long" })}</h2></div><strong>{selectedEvents.length} 个日程</strong></header>
          <div className="calendar-agenda-list">
            {selectedEvents.map((event) => (
              <article key={event.id}>
                <span className="calendar-event-accent" />
                <div><h3>{event.title}</h3><p><Clock3 /> {calendarEventTime(event)}{event.location && <><MapPin /> {event.location}</>}</p></div>
              </article>
            ))}
            {selectedEvents.length === 0 && <div className="calendar-empty-day"><CalendarCheck2 /><span>今天没有日程</span></div>}
          </div>
        </section>

        {calendarStatus !== "ready" && calendarEvents.length === 0 && (
          <div className="calendar-connection-state">
            <CalendarCheck2 />
            <strong>{calendarStatus === "not-configured" ? "连接 Google 日历" : calendarStatus === "error" ? "日历暂时不可用" : "正在加载日历…"}</strong>
            {calendarStatus === "not-configured" && <span>添加主日历的 iCal 地址即可开始同步。</span>}
          </div>
        )}

        <footer className="calendar-actions app-control-palette">
          <button className="icon-button" aria-label="上个月" onClick={() => moveMonth(-1)}><ChevronLeft /></button>
          <button className="button secondary" onClick={returnToToday}>今天</button>
          <button className="icon-button" aria-label="下个月" onClick={() => moveMonth(1)}><ChevronRight /></button>
        </footer>
      </div>
    </section>
  );
}
