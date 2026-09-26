import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSun, Home, MapPinned, Snowflake, Sun, UtilityPole, Volume2, VolumeX } from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import { useNews } from "../data/DataProvider";
import { FLOW_THRESHOLD_KW, formatKw, isSolarFresh } from "../lib/solar";
import { useMinuteClock } from "../lib/useMinuteClock";
import { useSolar } from "../lib/useSolar";
import { CalendarHomeWidget } from "./display/CalendarHomeWidget";
import { IdleVideo } from "./display/IdleVideo";

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

type FamilyPresence = {
  on: string[]; // names with a fresh location
  count: number;
};

const FAMILY_LOCATION_REFRESH_MS = 30_000;
const STALE_AFTER_SECONDS = 15 * 60; // 15 min without an update counts as "unknown"

function useFamilyPresence(): FamilyPresence | null {
  const [presence, setPresence] = useState<FamilyPresence | null>(null);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/locations", { cache: "no-store" });
        if (!res.ok) throw new Error(`Locations ${res.status}`);
        const body = await res.json() as { locations?: Array<{ id: string; name: string; lastSeen?: number }> };
        if (!active) return;
        const nowSeconds = Date.now() / 1000;
        const fresh = (body.locations ?? []).filter((location) => (location.lastSeen ?? 0) > nowSeconds - STALE_AFTER_SECONDS);
        setPresence({
          on: fresh.map((location) => location.name),
          count: fresh.length,
        });
      } catch { /* keep last good reading */ }
    };
    void load();
    const timer = window.setInterval(load, FAMILY_LOCATION_REFRESH_MS);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  return presence;
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

export function DisplayApp({
  displaySession,
  onActivity,
  onOpenCalendar,
  onOpenWeather,
  onOpenLocations,
  onOpenSolar,
}: {
  displaySession: number;
  onActivity: () => void;
  onOpenCalendar: () => void;
  onOpenWeather: () => void;
  onOpenLocations: () => void;
  onOpenSolar: () => void;
}) {
  const [videoAudio, setVideoAudio] = useState(() => ({ session: displaySession, muted: true }));
  const [videoPlayable, setVideoPlayable] = useState(false);

  // Derive this during render so a new session is muted before the video can
  // commit or produce even a brief audio blip. The stored choice only belongs
  // to the display session in which the user made it.
  const videoMuted = videoAudio.session === displaySession ? videoAudio.muted : true;

  return (
    <section className="display-app">
      <IdleVideo muted={videoMuted} onPlayableChange={setVideoPlayable} />
      <IdleClock />
      <CalendarHomeWidget onOpen={onOpenCalendar} />

      <div className="display-widgets">
        <SolarHomeWidget onOpen={onOpenSolar} />
        <WeatherWidget onOpen={onOpenWeather} />
        <FamilyLocationWidget onOpen={onOpenLocations} />
        <NewsWidget />
        {videoPlayable && (
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

// Its own component, so the minute tick re-renders only the clock.
function IdleClock() {
  const now = useMinuteClock();
  return (
    <div className="display-content">
      <p className="display-date">{now.toLocaleDateString("zh-CN", { weekday: "long", day: "numeric", month: "long" })}</p>
      <div className="display-time">{now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}</div>
    </div>
  );
}

function WeatherWidget({ onOpen }: { onOpen: () => void }) {
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
    <button
      type="button"
      className="weather-panel display-weather-panel"
      aria-label="打开丽水详细天气"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onOpen}
    >
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
    </button>
  );
}

function FamilyLocationWidget({ onOpen }: { onOpen: () => void }) {
  const familyPresence = useFamilyPresence();
  return (
    <button
      type="button"
      className="weather-panel display-family-panel"
      aria-label="打开家人位置"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onOpen}
    >
      <div className="display-family-icon"><MapPinned /></div>
      <div className="display-family-copy">
        <strong>{familyPresence && familyPresence.count > 0 ? `${familyPresence.on.join("、")} 已定位` : "家人位置"}</strong>
        <span>{familyPresence ? `${familyPresence.count} / 2 人在线` : "等待定位…"}</span>
      </div>
    </button>
  );
}

function NewsWidget() {
  const { newsHeadlines } = useNews();
  const headlines = newsHeadlines.length > 0 ? newsHeadlines : [{ title: "正在加载最新新闻…", url: "" }];
  return (
    <aside className="weather-panel news-panel">
      <div className="news-header"><span>新闻</span></div>
      <div className="news-headlines">
        {headlines.slice(0, 3).map((headline) => (
          <p key={headline.title}>{headline.title}</p>
        ))}
      </div>
    </aside>
  );
}

function SolarHomeWidget({ onOpen }: { onOpen: () => void }) {
  const state = useSolar(15000);
  if (state.kind !== "ready" || !state.solar.configured || !state.solar.now || !isSolarFresh(state.solar)) return null;
  const { now } = state.solar;
  const gridKw = now.gridKw;
  return (
    <button
      type="button"
      className="solar-home-widget"
      aria-label="打开太阳能详情"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onOpen}
    >
      <span className="solar"><Sun aria-hidden="true" />{formatKw(now.solarKw)}</span>
      <span><Home aria-hidden="true" />{formatKw(now.houseKw)}</span>
      <span className={gridKw == null ? undefined : gridKw > FLOW_THRESHOLD_KW ? "buying" : gridKw < -FLOW_THRESHOLD_KW ? "selling" : undefined}>
        <UtilityPole aria-hidden="true" />{gridKw == null ? "–" : Math.abs(gridKw) > FLOW_THRESHOLD_KW ? formatKw(gridKw) : "0 W"}
      </span>
    </button>
  );
}