import type { CalendarEvent } from "../data/types";

export const CALENDAR_TIME_ZONE = "Asia/Shanghai";

export function calendarDateKey(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CALENDAR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function fromCalendarDateKey(key: string) {
  return new Date(`${key}T00:00:00+08:00`);
}

// 与丽水（东八区）保持一致；日历 key 是纯日期，+08:00 与 Asia/Shanghai 固定时区无 DST，等价。
export function addCalendarDays(date: Date, days: number) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

export function startOfCalendarWeek(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  value.setDate(value.getDate() - ((value.getDay() + 6) % 7));
  return value;
}

export function calendarMonthDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = startOfCalendarWeek(first);
  return Array.from({ length: 42 }, (_, index) => addCalendarDays(start, index));
}

export function eventOccursOn(event: CalendarEvent, key: string) {
  const start = fromCalendarDateKey(key);
  const end = addCalendarDays(start, 1);
  return new Date(event.start) < end && new Date(event.end) > start;
}

export function eventsForDate(events: CalendarEvent[], key: string) {
  return events
    .filter((event) => eventOccursOn(event, key))
    .sort((left, right) => Number(right.allDay) - Number(left.allDay) || left.start.localeCompare(right.start));
}

export function calendarEventTime(event: CalendarEvent) {
  if (event.allDay) return "All day";
  return new Date(event.start).toLocaleTimeString("zh-CN", {
    timeZone: CALENDAR_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  });
}
