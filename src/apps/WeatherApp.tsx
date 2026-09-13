import {
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  Droplets,
  Eye,
  Gauge,
  Navigation,
  Pause,
  Play,
  RefreshCw,
  Snowflake,
  Sun,
  Sunrise,
  Sunset,
  Wind,
} from "lucide-react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState, type ComponentType, type PointerEvent as ReactPointerEvent } from "react";

const LISHUI = { latitude: 28.4679, longitude: 119.9229 };
const WEATHER_CACHE_KEY = "cannvas-weather-v1";
const WEATHER_REFRESH_MS = 15 * 60 * 1000;
const FORECAST_URL = new URL("https://api.open-meteo.com/v1/forecast");
FORECAST_URL.search = new URLSearchParams({
  latitude: String(LISHUI.latitude),
  longitude: String(LISHUI.longitude),
  timezone: "Asia/Shanghai",
  forecast_days: "10",
  current: [
    "temperature_2m",
    "relative_humidity_2m",
    "apparent_temperature",
    "precipitation",
    "weather_code",
    "cloud_cover",
    "pressure_msl",
    "wind_speed_10m",
    "wind_direction_10m",
    "wind_gusts_10m",
  ].join(","),
  hourly: [
    "temperature_2m",
    "apparent_temperature",
    "precipitation_probability",
    "precipitation",
    "weather_code",
    "relative_humidity_2m",
    "visibility",
    "pressure_msl",
    "uv_index",
    "wind_speed_10m",
    "wind_gusts_10m",
  ].join(","),
  daily: [
    "weather_code",
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_probability_max",
    "precipitation_sum",
    "sunrise",
    "sunset",
    "uv_index_max",
  ].join(","),
}).toString();

type WeatherSeries = {
  time: string[];
  temperature_2m: number[];
  apparent_temperature: number[];
  precipitation_probability: number[];
  precipitation: number[];
  weather_code: number[];
  relative_humidity_2m: number[];
  visibility: number[];
  pressure_msl: number[];
  uv_index: number[];
  wind_speed_10m: number[];
  wind_gusts_10m: number[];
};

type WeatherForecast = {
  current: {
    time: string;
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    precipitation: number;
    weather_code: number;
    cloud_cover: number;
    pressure_msl: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    wind_gusts_10m: number;
  };
  hourly: WeatherSeries;
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
    precipitation_sum: number[];
    sunrise: string[];
    sunset: string[];
    uv_index_max: number[];
  };
};

type RadarFrame = { time: number; path: string; forecast?: boolean };
type RadarResponse = {
  host: string;
  radar: { past?: RadarFrame[]; nowcast?: RadarFrame[] };
};

type Condition = {
  label: string;
  icon: ComponentType<{ className?: string }>;
};

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

function readWeatherCache(): WeatherForecast | null {
  try {
    const cached = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY) ?? "null") as WeatherForecast | null;
    return cached?.current && cached?.hourly && cached?.daily ? cached : null;
  } catch {
    return null;
  }
}

function hourLabel(value: string, index: number) {
  if (index === 0) return "现在";
  return new Date(value).toLocaleTimeString("zh-CN", { hour: "numeric" });
}

function dayLabel(value: string, index: number) {
  if (index === 0) return "今天";
  return new Date(`${value}T12:00:00`).toLocaleDateString("zh-CN", { weekday: "short" });
}

function windDirection(degrees: number) {
  const directions = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
  return directions[Math.round(degrees / 45) % directions.length];
}

function uvLabel(value: number) {
  if (value < 3) return "低";
  if (value < 6) return "中等";
  if (value < 8) return "高";
  if (value < 11) return "很高";
  return "极高";
}

function WeatherIcon({ code, className }: { code: number; className?: string }) {
  const Icon = conditionFor(code).icon;
  return <Icon className={className} />;
}

function radarTime(frame: RadarFrame | undefined) {
  if (!frame) return "";
  return new Date(frame.time * 1000).toLocaleTimeString("zh-CN", { hour: "numeric", minute: "2-digit" });
}

function RadarScrubber({
  frames,
  frameIndex,
  onChange,
}: {
  frames: RadarFrame[];
  frameIndex: number;
  onChange: (index: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const progress = frames.length > 1 ? frameIndex / (frames.length - 1) : 0;

  const scrubTo = (clientX: number) => {
    const track = trackRef.current;
    if (!track || frames.length < 2) return;
    const bounds = track.getBoundingClientRect();
    const position = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
    onChange(Math.round(position * (frames.length - 1)));
  };

  const startScrubbing = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    scrubTo(event.clientX);
  };

  const continueScrubbing = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) scrubTo(event.clientX);
  };

  return (
    <div className="weather-radar-scrub-area">
      <div
        ref={trackRef}
        className="weather-radar-scrubber"
        role="slider"
        tabIndex={0}
        aria-label="雷达时间"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, frames.length - 1)}
        aria-valuenow={frameIndex}
        aria-valuetext={radarTime(frames[frameIndex])}
        onPointerDown={startScrubbing}
        onPointerMove={continueScrubbing}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") onChange(Math.max(0, frameIndex - 1));
          if (event.key === "ArrowRight") onChange(Math.max(0, Math.min(frames.length - 1, frameIndex + 1)));
        }}
      >
        <span className="weather-radar-scrubber-fill" style={{ width: `${progress * 100}%` }} />
        <span className="weather-radar-scrubber-thumb" style={{ left: `${progress * 100}%` }} />
        {frames.map((frame, index) => (
          <i
            className={`${index <= frameIndex ? "passed" : ""}${frame.forecast ? " forecast" : ""}`}
            style={{ left: `${frames.length > 1 ? index / (frames.length - 1) * 100 : 0}%` }}
            key={`${frame.time}:${frame.path}`}
          />
        ))}
      </div>
      <div className="weather-radar-range">
        <span>{radarTime(frames[0])}</span>
        <strong>{radarTime(frames[frameIndex])}</strong>
        <span>{frames.at(-1)?.forecast ? radarTime(frames.at(-1)) : "Now"}</span>
      </div>
    </div>
  );
}

function WeatherRadar() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const radarLayerRef = useRef<L.TileLayer | null>(null);
  const radarLayerPathRef = useRef("");
  const desiredRadarPathRef = useRef("");
  const pendingRadarLayersRef = useRef(new Map<string, L.TileLayer>());
  const radarRenderTimeRef = useRef(0);
  const [host, setHost] = useState("");
  const [frames, setFrames] = useState<RadarFrame[]>([]);
  const [frameIndex, setFrameIndex] = useState(0);
  const [renderedFrameIndex, setRenderedFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [radarError, setRadarError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("https://api.rainviewer.com/public/weather-maps.json");
        if (!response.ok) throw new Error(`Radar returned ${response.status}`);
        const data = await response.json() as RadarResponse;
        if (cancelled) return;
        const past = data.radar.past ?? [];
        const nowcast = (data.radar.nowcast ?? []).map((frame) => ({ ...frame, forecast: true }));
        const nextFrames = [...past, ...nowcast];
        setHost(data.host);
        setFrames(nextFrames);
        setFrameIndex(Math.max(0, nextFrames.length - 1));
        setRadarError(nextFrames.length === 0);
      } catch {
        if (!cancelled) setRadarError(true);
      }
    };
    void load();
    const timer = window.setInterval(load, WEATHER_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: false,
      scrollWheelZoom: false,
      attributionControl: true,
      minZoom: 6,
      maxZoom: 12,
    }).setView([LISHUI.latitude, LISHUI.longitude], 8);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      className: "weather-base-map",
      maxZoom: 19,
    }).addTo(map);
    L.control.zoom({ position: "topright" }).addTo(map);
    L.circleMarker([LISHUI.latitude, LISHUI.longitude], {
      radius: 8,
      color: "#ffffff",
      weight: 3,
      fillColor: "#4a9eff",
      fillOpacity: 1,
    }).bindTooltip("丽水", { permanent: true, direction: "right", offset: [8, 0] }).addTo(map);
    mapRef.current = map;
    window.setTimeout(() => map.invalidateSize(), 0);
    return () => {
      map.remove();
      mapRef.current = null;
      radarLayerRef.current = null;
      radarLayerPathRef.current = "";
      desiredRadarPathRef.current = "";
      pendingRadarLayersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    let timer: number | undefined;
    const render = () => {
      radarRenderTimeRef.current = performance.now();
      setRenderedFrameIndex(frameIndex);
    };
    const remaining = 180 - (performance.now() - radarRenderTimeRef.current);
    if (remaining <= 0) render();
    else timer = window.setTimeout(render, remaining);
    return () => window.clearTimeout(timer);
  }, [frameIndex]);

  useEffect(() => {
    const map = mapRef.current;
    const frame = frames[renderedFrameIndex];
    if (!map || !host || !frame) return;
    desiredRadarPathRef.current = frame.path;
    if (radarLayerPathRef.current === frame.path || pendingRadarLayersRef.current.has(frame.path)) return;

    const nextLayer = L.tileLayer(`${host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`, {
      tileSize: 256,
      opacity: 0,
      maxNativeZoom: 7,
      maxZoom: 12,
      attribution: "Radar &copy; RainViewer",
    }).addTo(map);
    pendingRadarLayersRef.current.set(frame.path, nextLayer);

    // Keep the old frame visible while the next set of tiles loads. Once it is
    // ready, Leaflet fades the complete frame in rather than flashing empty map.
    // Pending frames continue loading during a fast scrub so going back can use
    // the browser cache instead of starting the same tile requests again.
    nextLayer.once("load", () => {
      pendingRadarLayersRef.current.delete(frame.path);
      if (desiredRadarPathRef.current !== frame.path) {
        // Leaflet still reads the layer's map after firing `load`, so removing
        // it inside that callback causes a null-map error. Drop it next tick.
        window.setTimeout(() => {
          if (mapRef.current === map && map.hasLayer(nextLayer)) map.removeLayer(nextLayer);
        }, 0);
        return;
      }
      const previousLayer = radarLayerRef.current;
      radarLayerRef.current = nextLayer;
      radarLayerPathRef.current = frame.path;
      nextLayer.setOpacity(.78);
      if (previousLayer && previousLayer !== nextLayer) {
        window.setTimeout(() => {
          if (map.hasLayer(previousLayer)) map.removeLayer(previousLayer);
        }, 220);
      }
    });
  }, [renderedFrameIndex, frames, host]);

  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const timer = window.setInterval(() => {
      setFrameIndex((index) => (index + 1) % frames.length);
    }, 750);
    return () => window.clearInterval(timer);
  }, [frames.length, playing]);

  const frame = frames[frameIndex];
  const hasForecastFrames = frames.some(({ forecast }) => forecast);

  return (
    <section className="weather-card weather-radar-card">
      <div className="weather-card-heading">
        <div>
          <span>降雨雷达</span>
          <strong>{frame ? radarTime(frame) : "正在加载雷达"}</strong>
        </div>
        <small>{hasForecastFrames ? "观测与预报" : "过去 2 小时观测"}</small>
      </div>
      <div className="weather-radar-map" ref={containerRef} aria-label="丽水降雨雷达图">
        {radarError && <div className="weather-radar-error">雷达暂时不可用</div>}
        <div className="weather-radar-key"><i />弱 <i />强</div>
      </div>
      <div className="weather-radar-controls">
        <button onClick={() => setFrameIndex((index) => Math.max(0, index - 1))} disabled={frameIndex === 0} aria-label="上一帧"><ChevronLeft /></button>
        <button className="weather-radar-play" onClick={() => setPlaying((value) => !value)} disabled={frames.length < 2} aria-label={playing ? "暂停" : "播放"}>{playing ? <Pause /> : <Play />}</button>
        <RadarScrubber
          frames={frames}
          frameIndex={frameIndex}
          onChange={(index) => { setPlaying(false); setFrameIndex(index); }}
        />
        <button onClick={() => setFrameIndex((index) => Math.min(frames.length - 1, index + 1))} disabled={frameIndex >= frames.length - 1} aria-label="下一帧"><ChevronRight /></button>
      </div>
      {!hasForecastFrames && <p className="weather-radar-note">雷达显示已测降雨。12 小时时间线显示预期降雨。</p>}
    </section>
  );
}

export function WeatherApp() {
  const [forecast, setForecast] = useState<WeatherForecast | null>(() => readWeatherCache());
  const [loading, setLoading] = useState(!forecast);
  const [error, setError] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(FORECAST_URL);
        if (!response.ok) throw new Error(`Forecast returned ${response.status}`);
        const data = await response.json() as WeatherForecast;
        if (cancelled) return;
        setForecast(data);
        setError(false);
        localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(data));
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(load, WEATHER_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [refreshVersion]);

  const currentHourIndex = useMemo(() => {
    if (!forecast) return 0;
    const currentTime = new Date(forecast.current.time).getTime();
    const firstAfterNow = forecast.hourly.time.findIndex((time) => new Date(time).getTime() > currentTime);
    if (firstAfterNow === -1) return Math.max(0, forecast.hourly.time.length - 1);
    return Math.max(0, firstAfterNow - 1);
  }, [forecast]);

  if (!forecast) {
    return (
      <section className="weather-app weather-app-loading">
        <RefreshCw />
        <strong>{error ? "天气暂时不可用" : "正在加载丽水天气"}</strong>
        {error && <button onClick={() => { setLoading(true); setRefreshVersion((value) => value + 1); }}>重试</button>}
      </section>
    );
  }

  const condition = conditionFor(forecast.current.weather_code);
  const CurrentIcon = condition.icon;
  const hourly = forecast.hourly.time.slice(currentHourIndex, currentHourIndex + 12).map((time, offset) => {
    const index = currentHourIndex + offset;
    return {
      time,
      temperature: forecast.hourly.temperature_2m[index],
      rainChance: forecast.hourly.precipitation_probability[index],
      rain: forecast.hourly.precipitation[index],
      code: forecast.hourly.weather_code[index],
    };
  });
  const detailIndex = currentHourIndex;
  const todayHigh = forecast.daily.temperature_2m_max[0];
  const todayLow = forecast.daily.temperature_2m_min[0];
  const nextRain = hourly.find(({ rainChance, rain }) => rainChance >= 30 || rain > 0);
  const rainSummary = nextRain
    ? `${round(nextRain.rainChance)}% 降雨概率 ${nextRain === hourly[0] ? "现在" : `${hourLabel(nextRain.time, 1)}左右`}`
    : "未来 12 小时无雨";
  const updatedAt = new Date(forecast.current.time).toLocaleTimeString("zh-CN", { hour: "numeric", minute: "2-digit" });

  return (
    <section className={`weather-app weather-code-${forecast.current.weather_code}`}>
      <div className="weather-sky" aria-hidden="true"><i /><i /><i /></div>
      <div className="weather-scroll">
        <header className="weather-hero">
          <div>
            <p>丽水</p>
            <div className="weather-current-temperature">{round(forecast.current.temperature_2m)}°</div>
            <strong>{condition.label}</strong>
            <span>体感 {round(forecast.current.apparent_temperature)}° · 高:{round(todayHigh)}° 低:{round(todayLow)}°</span>
          </div>
          <CurrentIcon className="weather-current-icon" />
          <button
            className="weather-refresh"
            onClick={() => { setLoading(true); setRefreshVersion((value) => value + 1); }}
            disabled={loading}
            aria-label="刷新天气"
          ><RefreshCw /></button>
        </header>

        {error && <div className="weather-stale-message">刷新失败，显示上次保存的预报。</div>}

        <section className="weather-card weather-hourly-card">
          <div className="weather-card-heading">
            <div><span>未来 12 小时</span><strong>{rainSummary}</strong></div>
            <small>更新于 {updatedAt}</small>
          </div>
          <div className="weather-hourly-row">
            {hourly.map((hour, index) => (
              <article key={hour.time}>
                <strong>{hourLabel(hour.time, index)}</strong>
                <WeatherIcon code={hour.code} />
                <span className={hour.rainChance >= 30 ? "has-rain" : undefined}>{round(hour.rainChance)}%</span>
                <b>{round(hour.temperature)}°</b>
              </article>
            ))}
          </div>
        </section>

        <WeatherRadar />

        <section className="weather-card weather-daily-card">
          <div className="weather-card-heading"><div><span>10 天预报</span><strong>每日展望</strong></div></div>
          <div className="weather-daily-list">
            {forecast.daily.time.map((time, index) => (
              <article key={time}>
                <strong>{dayLabel(time, index)}</strong>
                <WeatherIcon code={forecast.daily.weather_code[index]} />
                <span>{round(forecast.daily.precipitation_probability_max[index])}%</span>
                <small>{round(forecast.daily.temperature_2m_min[index])}°</small>
                <i><b style={{ width: `${Math.max(12, Math.min(100, (forecast.daily.temperature_2m_max[index] - forecast.daily.temperature_2m_min[index]) * 7))}%` }} /></i>
                <strong>{round(forecast.daily.temperature_2m_max[index])}°</strong>
              </article>
            ))}
          </div>
        </section>

        <div className="weather-details-grid">
          <article className="weather-card"><div><Wind /><span>风速</span></div><strong>{round(forecast.current.wind_speed_10m)} <small>km/h</small></strong><p>{windDirection(forecast.current.wind_direction_10m)} · 阵风 {round(forecast.current.wind_gusts_10m)} km/h</p><Navigation style={{ transform: `rotate(${forecast.current.wind_direction_10m + 180}deg)` }} /></article>
          <article className="weather-card"><div><Droplets /><span>湿度</span></div><strong>{round(forecast.current.relative_humidity_2m)}%</strong><p>体感 {round(forecast.current.apparent_temperature)}°</p></article>
          <article className="weather-card"><div><Sun /><span>紫外线指数</span></div><strong>{round(forecast.hourly.uv_index[detailIndex])}</strong><p>{uvLabel(forecast.hourly.uv_index[detailIndex])}</p><i className="uv-scale" /></article>
          <article className="weather-card"><div><Eye /><span>能见度</span></div><strong>{round(forecast.hourly.visibility[detailIndex] / 1000)} <small>km</small></strong><p>{forecast.hourly.visibility[detailIndex] >= 10000 ? "视野清晰" : "能见度降低"}</p></article>
          <article className="weather-card"><div><Gauge /><span>气压</span></div><strong>{round(forecast.current.pressure_msl)} <small>hPa</small></strong><p>海平面气压</p></article>
          <article className="weather-card weather-sun-card"><div><Sunset /><span>日落</span></div><strong>{new Date(forecast.daily.sunset[0]).toLocaleTimeString("zh-CN", { hour: "numeric", minute: "2-digit" })}</strong><p><Sunrise /> 日出 {new Date(forecast.daily.sunrise[0]).toLocaleTimeString("zh-CN", { hour: "numeric", minute: "2-digit" })}</p></article>
        </div>

        <footer className="weather-attribution">预报由 Open-Meteo 提供 · 雷达由 RainViewer 提供 · 地图由 OpenStreetMap 提供</footer>
      </div>
    </section>
  );
}
