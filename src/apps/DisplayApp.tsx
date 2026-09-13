import { CheckCircle2, Clock3, Cloud, CloudFog, CloudLightning, CloudRain, CloudSun, Snowflake, Sun, Volume2, VolumeX } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useCannvasData } from "../data/DataProvider";
import { addCalendarDays, calendarDateKey, calendarEventTime, eventsForDate } from "../lib/calendar";

// The mirror proxies Bruce's private media service so the browser only needs
// access to the same loopback origin as the rest of Cannvas.
const VIDEO_ROOT = "/videos/";
const VIDEO_CACHE_KEY = "cannvas-video-list-v3";
const VIDEO_PATTERN = /<a href="([^"]+)"/g;

// --- Weather (Open-Meteo, reusing the same API as WeatherApp) ---
const LISHUI = { latitude: 28.4679, longitude: 119.9229 };
const WEATHER_CACHE_KEY = "cannvas-display-weather-v1";
const WEATHER_REFRESH_MS = 15 * 60 * 1000;
const FORECAST_URL = new URL("https://api.open-meteo.com/v1/forecast");
FORECAST_URL.search = new URLSearchParams({
  latitude: String(LISHUI.latitude),
  longitude: String(LISHUI.longitude),
  timezone: "Asia/Shanghai",
  forecast_days: "2",
  current: ["temperature_2m", "apparent_temperature", "weather_code"].join(","),
  hourly: ["temperature_2m", "precipitation_probability", "weather_code"].join(","),
  daily: ["weather_code", "temperature_2m_max", "temperature_2m_min"].join(","),
}).toString();

type DisplayWeather = {
  current: { temperature_2m: number; apparent_temperature: number; weather_code: number };
  hourly: { time: string[]; temperature_2m: number[]; precipitation_probability: number[]; weather_code: number[] };
  daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[] };
};

type Condition = { label: string; icon: ComponentType<{ className?: string }> };

function conditionFor(code: number): Condition {
  if (code === 0) return { label: "晴", icon: Sun };
  if (code <= 2) return { label: "局部多云", icon: CloudSun };
  if (code === 3) return { label: "阴", icon: Cloud };
  if (code === 45 || code === 48) return { label: "雾", icon: CloudFog };
  if (code >= 51 && code <= 67) return { label: code >= 61 ? "雨" : "毛毛雨", icon: CloudRain };
  if (code >= 71 && code <= 77) return { label: "雪", icon: Snowflake };
  if (code >= 80 && code <= 82) return { label: "阵雨", icon: CloudRain };
  if (code >= 85 && code <= 86) return { label: "阵雪", icon: Snowflake };
  if (code >= 95) return { label: "雷暴", icon: CloudLightning };
  return { label: "混合天气", icon: CloudSun };
}

function round(value: number | undefined, fallback = 0) {
  return Math.round(Number.isFinite(value) ? Number(value) : fallback);
}

function readWeatherCache(): DisplayWeather | null {
  try {
    const cached = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY) ?? "null") as DisplayWeather | null;
    return cached?.current && cached?.hourly && cached?.daily ? cached : null;
  } catch { return null; }
}

function useDisplayWeather() {
  const [weather, setWeather] = useState<DisplayWeather | null>(() => readWeatherCache());
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch(FORECAST_URL);
        if (!res.ok) throw new Error(`Weather ${res.status}`);
        const data = await res.json() as DisplayWeather;
        if (!active) return;
        setWeather(data);
        localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(data));
      } catch { /* keep cached */ }
    };
    void load();
    const timer = window.setInterval(load, WEATHER_REFRESH_MS);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  return weather;
}

function WeatherWidget() {
  const weather = useDisplayWeather();
  if (!weather) return null;
  const condition = conditionFor(weather.current.weather_code);
  const Icon = condition.icon;
  const high = round(weather.daily.temperature_2m_max[0]);
  const low = round(weather.daily.temperature_2m_min[0]);
  // next rain in 12h
  const now = new Date();
  const currentHourIdx = weather.hourly.time.findIndex(t => new Date(t).getTime() > now.getTime());
  const startIdx = Math.max(0, currentHourIdx === -1 ? 0 : currentHourIdx - 1);
  const nextHours = weather.hourly.time.slice(startIdx, startIdx + 12);
  const nextRain = nextHours.find((_, i) => {
    const idx = startIdx + i;
    return weather.hourly.precipitation_probability[idx] >= 30;
  });
  const rainHour = nextRain ? new Date(nextRain).toLocaleTimeString("zh-CN", { hour: "numeric" }) : null;
  return (
    <>
      <div className="display-weather-current">
        <Icon className="display-weather-icon" />
        <strong>{round(weather.current.temperature_2m)}°</strong>
        <span>{condition.label}</span>
      </div>
      <div className="display-weather-details">
        <span>高 {high}° / 低 {low}°</span>
        <span>体感 {round(weather.current.apparent_temperature)}°</span>
        {rainHour ? <span className="display-weather-rain">{rainHour} 有雨</span> : <span>未来无雨</span>}
      </div>
    </>
  );
}

async function crawlVideos(root = VIDEO_ROOT, depth = 0, visited = new Set<string>()): Promise<string[]> {
  if (depth > 10 || visited.has(root)) return [];
  visited.add(root);
  const response = await fetch(root);
  if (!response.ok) throw new Error(`Video server returned ${response.status}`);
  const html = await response.text();
  const urls = [...html.matchAll(VIDEO_PATTERN)]
    .map((match) => match[1])
    .filter((href) => href !== "../" && href !== "./../")
    // Keep proxy URLs relative to Cannvas. `new URL(href, root)` turns them
    // into absolute browser URLs, which then fail the VIDEO_ROOT safety check.
    .map((href) => new URL(href, new URL(root, window.location.origin)).pathname)
    .filter((url) => url.startsWith(VIDEO_ROOT));
  const videos = urls.filter((url) => /\.(mp4|m4v|mov|webm)$/i.test(url));
  const folders = urls.filter((url) => url.endsWith("/") && url !== root);
  const nested = await Promise.all(folders.map((folder) => crawlVideos(folder, depth + 1, visited)));
  return [...videos, ...nested.flat()];
}

export function DisplayApp({
  displaySession,
  onActivity,
  onOpenCalendar,
  onOpenWeather,
}: {
  displaySession: number;
  onActivity: () => void;
  onOpenCalendar: () => void;
  onOpenWeather: () => void;
}) {
  const { calendarEvents, calendarStatus, newsHeadlines } = useCannvasData();
  const [now, setNow] = useState(new Date());
  const [videoAudio, setVideoAudio] = useState(() => ({ session: displaySession, muted: true }));
  const [calendarCanExpand, setCalendarCanExpand] = useState(false);
  const calendarWidgetRef = useRef<HTMLElement>(null);
  const [weatherVersion, setWeatherVersion] = useState(Date.now()); // kept for potential cache-busting
  const [videos, setVideos] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(VIDEO_CACHE_KEY) ?? "[]") as string[]; } catch { return []; }
  });
  const [videoIndex, setVideoIndex] = useState(() => Math.floor(Math.random() * Math.max(1, videos.length)));

  // Derive this during render so a new session is muted before the video can
  // commit or produce even a brief audio blip. The stored choice only belongs
  // to the display session in which the user made it.
  const videoMuted = videoAudio.session === displaySession ? videoAudio.muted : true;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setWeatherVersion(Date.now()), 2 * 60 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void crawlVideos().then((found) => {
      if (found.length > 0) {
        setVideos(found);
        localStorage.setItem(VIDEO_CACHE_KEY, JSON.stringify(found));
      }
    }).catch(() => undefined);
  }, []);

  const currentVideo = videos[videoIndex % Math.max(1, videos.length)];
  const todayKey = calendarDateKey(now);
  const todayEvents = useMemo(() => eventsForDate(calendarEvents, todayKey), [calendarEvents, todayKey]);
  const upcomingEvents = useMemo(() => {
    const result = [];
    for (let offset = 1; offset <= 7; offset += 1) {
      const date = addCalendarDays(now, offset);
      const key = calendarDateKey(date);
      for (const event of eventsForDate(calendarEvents, key)) {
        result.push({ event, date, key: `${key}:${event.id}` });
      }
    }
    return result;
  }, [calendarEvents, todayKey]);

  useEffect(() => {
    const widget = calendarWidgetRef.current;
    if (!widget) return;

    const updateOverflow = () => setCalendarCanExpand(widget.scrollHeight > widget.clientHeight + 1);
    updateOverflow();
    const observer = new ResizeObserver(updateOverflow);
    observer.observe(widget);
    return () => observer.disconnect();
  }, [calendarStatus, todayEvents.length, upcomingEvents.length]);

  return (
    <section className="display-app">
      <div className="display-media">
        {currentVideo ? (
          <video key={currentVideo} src={currentVideo} autoPlay muted={videoMuted} playsInline onEnded={() => setVideoIndex((value) => value + 1)} onError={() => setVideoIndex((value) => value + 1)} />
        ) : (
          <div className="display-gradient"><span>C</span></div>
        )}
      </div>

      <div className="display-content">
        <p className="display-date">{now.toLocaleDateString("zh-CN", { weekday: "long", day: "numeric", month: "long" })}</p>
        <div className="display-time">{now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}</div>
      </div>

        <aside
        ref={calendarWidgetRef}
        className={`calendar-home-widget${calendarCanExpand ? " has-more" : ""}`}
        aria-label="打开日历应用"
        role="button"
        tabIndex={0}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onOpenCalendar}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpenCalendar();
          }
        }}
      >
        <section>
          <h2>今天</h2>
          <div className="calendar-home-list">
            {todayEvents.slice(0, 3).map((event) => {
              const hasPassed = !event.allDay && new Date(event.end) <= now;
              return (
                <article className={hasPassed ? "passed" : undefined} key={event.id} aria-label={`${event.title}, ${calendarEventTime(event)}${hasPassed ? ", passed" : ""}`}>
                  <span className="calendar-home-time">{hasPassed && <CheckCircle2 aria-hidden="true" />}{calendarEventTime(event)}</span>
                  <strong>{event.title}</strong>
                </article>
              );
            })}
            {calendarStatus === "ready" && todayEvents.length === 0 && <p className="calendar-home-empty">今天没有日程</p>}
          </div>
        </section>
        <section>
          <h2>未来</h2>
          <div className="calendar-home-list upcoming">
            {upcomingEvents.map(({ event, date, key }) => (
              <article key={key}>
                <span className="calendar-home-day">{date.toLocaleDateString("zh-CN", { weekday: "short", day: "numeric" })}</span>
                <strong>{event.title}</strong>
                <small><Clock3 /> {calendarEventTime(event)}</small>
              </article>
            ))}
            {calendarStatus === "ready" && upcomingEvents.length === 0 && <p className="calendar-home-empty">未来 7 天没有日程</p>}
          </div>
        </section>
        {calendarStatus !== "ready" && calendarEvents.length === 0 && (
          <p className="calendar-home-status">{calendarStatus === "not-configured" ? "连接 Google 日历以查看日程" : calendarStatus === "error" ? "日历暂时不可用" : "正在加载日历…"}</p>
        )}
      </aside>

      <div className="display-widgets">
        <button
          type="button"
          className="weather-panel display-weather-panel"
          aria-label="打开丽水详细天气"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onOpenWeather}
        >
          <WeatherWidget />
        </button>
        <aside className="weather-panel news-panel">
          <div className="news-header"><span>新闻</span></div>
          <div className="news-headlines">
            {(newsHeadlines.length > 0 ? newsHeadlines : [{ title: "正在加载最新新闻…", url: "" }]).slice(0, 3).map((headline) => (
              <p key={headline.title}>{headline.title}</p>
            ))}
          </div>
        </aside>
        {currentVideo && (
          <button
            type="button"
            className={`display-audio-toggle${videoMuted ? "" : " is-playing"}`}
            aria-label={videoMuted ? "开启视频声音" : "静音视频"}
            aria-pressed={!videoMuted}
            onPointerDown={(event) => {
              // Keep this tap from waking the previous app, but still restart
              // the idle clock so sound is muted again after inactivity.
              event.stopPropagation();
              onActivity();
            }}
            onClick={() => setVideoAudio({ session: displaySession, muted: !videoMuted })}
          >
            {videoMuted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
          </button>
        )}
      </div>
    </section>
  );
}
