import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  Snowflake,
  Sun,
} from "lucide-react";
import type { ComponentType } from "react";

export const LISHUI = { latitude: 28.4679, longitude: 119.9229 };
export const WEATHER_REFRESH_MS = 15 * 60 * 1000;
const WEATHER_CACHE_KEY = "cannvas-weather-v1";

export const FORECAST_URL = new URL("https://api.open-meteo.com/v1/forecast");
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

export type WeatherForecast = {
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

type Condition = {
  label: string;
  icon: ComponentType<{ className?: string }>;
};

export function conditionFor(code: number): Condition {
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

export function WeatherIcon({ code, className }: { code: number; className?: string }) {
  const Icon = conditionFor(code).icon;
  return <Icon className={className} />;
}

export function round(value: number | undefined, fallback = 0) {
  return Math.round(Number.isFinite(value) ? Number(value) : fallback);
}

export function readWeatherCache(): WeatherForecast | null {
  try {
    const cached = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY) ?? "null") as WeatherForecast | null;
    return cached?.current && cached?.hourly && cached?.daily ? cached : null;
  } catch {
    return null;
  }
}

export function writeWeatherCache(forecast: WeatherForecast) {
  try {
    localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(forecast));
  } catch {
    // A full or blocked store only costs the offline fallback.
  }
}

export function hourLabel(value: string, index: number) {
  if (index === 0) return "现在";
  return new Date(value).toLocaleTimeString("zh-CN", { hour: "numeric" });
}

export function dayLabel(value: string, index: number) {
  if (index === 0) return "今天";
  return new Date(`${value}T12:00:00`).toLocaleDateString("zh-CN", { weekday: "short" });
}

export function windDirection(degrees: number) {
  const directions = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
  return directions[Math.round(degrees / 45) % directions.length];
}

export function uvLabel(value: number) {
  if (value < 3) return "低";
  if (value < 6) return "中等";
  if (value < 8) return "高";
  if (value < 11) return "很高";
  return "极高";
}
