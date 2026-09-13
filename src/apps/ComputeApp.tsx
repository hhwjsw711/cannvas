import {
  Activity,
  Braces,
  CheckCircle2,
  CircleSlash,
  Clock,
  Cpu,
  Gauge,
  HardDrive,
  Layers,
  MemoryStick,
  RefreshCw,
  Server,
  ServerCog,
  Thermometer,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type SystemStats = {
  ts: number;
  cores: Array<{ index: number; online: boolean; mhz: number }>;
  cpuUsage: Array<{ usage: number | null; mhz: number | null; online: boolean } | null>;
  memory: { totalMb: number; usedMb: number; availableMb: number } | null;
  disk: { totalGb: number; freeGb: number } | null;
  load: { one: number; five: number; fifteen: number } | null;
  uptime: number | null;
  services: Record<string, boolean>;
  llama: { healthy: boolean; models: Array<{ id: string; params?: number; ctxTrain?: number }> };
  temps: Record<string, number>;
  gpu: { usage: number | null };
};

const SERVICE_LABELS: Array<{ id: string; label: string; description: string }> = [
  { id: "llama-server", label: "llama-server", description: "Qwen2.5-1.5B 推理服务" },
  { id: "llama-server-05b", label: "llama-server 0.5B", description: "Qwen2.5-0.5B 快速模型" },
  { id: "cannvas-web", label: "cannvas-web", description: "本页面静态服务" },
  { id: "cannvas-kiosk-session", label: "kiosk-session", description: "Chromium 全屏会话" },
  { id: "cloudflared", label: "cloudflared", description: "Cloudflare 内网穿透" },
  { id: "tailscaled", label: "tailscaled", description: "Tailscale 组网" },
  { id: "jetson-clocks", label: "jetson-clocks", description: "CPU 锁频 2035MHz" },
];

const HISTORY_LENGTH = 40;
const REFRESH_INTERVAL = 2_000;

function formatUptime(seconds: number | null) {
  if (seconds === null) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  return `${minutes} 分钟`;
}

function formatParams(params: number | undefined) {
  if (!params) return "";
  if (params >= 1_000_000_000) return `${(params / 1_000_000_000).toFixed(2)}B 参数`;
  if (params >= 1_000_000) return `${(params / 1_000_000).toFixed(0)}M 参数`;
  return `${params} 参数`;
}

function Sparkline({ values, max, color }: { values: number[]; max: number; color: string }) {
  const width = 100;
  const height = 34;
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(HISTORY_LENGTH - 1, 1)) * width;
      const y = height - (Math.min(value, max) / max) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className="compute-sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={`0,${height} ${points} ${width},${height}`} fill={color} opacity="0.16" stroke="none" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function ComputeApp() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [error, setError] = useState("");
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [memHistory, setMemHistory] = useState<number[]>([]);
  const [gpuHistory, setGpuHistory] = useState<number[]>([]);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/system/stats", { cache: "no-store" });
      if (!response.ok) throw new Error(`接口返回 ${response.status}`);
      const body = await response.json() as SystemStats;
      if (!mounted.current) return;
      setStats(body);
      setError("");
      // Average CPU usage across online cores for the trend chart.
      const usages = (body.cpuUsage ?? []).filter((core): core is { usage: number; mhz: number | null; online: boolean } => core !== null && core.usage !== null);
      const cpuAverage = usages.length > 0
        ? usages.reduce((sum, core) => sum + core.usage, 0) / usages.length
        : 0;
      const memPercent = body.memory && body.memory.totalMb > 0
        ? (body.memory.usedMb / body.memory.totalMb) * 100
        : 0;
      setCpuHistory((current) => [...current, cpuAverage].slice(-HISTORY_LENGTH));
      setMemHistory((current) => [...current, memPercent].slice(-HISTORY_LENGTH));
      setGpuHistory((current) => [...current, body.gpu.usage ?? 0].slice(-HISTORY_LENGTH));
    } catch (requestError) {
      if (!mounted.current) return;
      setError(requestError instanceof Error ? requestError.message : "获取系统状态失败");
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_INTERVAL);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
    };
  }, [refresh]);

  const llamaHealthy = stats?.llama.healthy === true;
  const models = stats?.llama.models ?? [];
  const servicesUp = SERVICE_LABELS.filter(({ id }) => stats?.services[id]).length;
  const memPercent = stats?.memory && stats.memory.totalMb > 0 ? (stats.memory.usedMb / stats.memory.totalMb) * 100 : 0;
  const diskPercent = stats?.disk && stats.disk.totalGb > 0 ? ((stats.disk.totalGb - stats.disk.freeGb) / stats.disk.totalGb) * 100 : 0;
  const cpuUsage = (stats?.cpuUsage ?? []).filter((core): core is { usage: number; mhz: number | null; online: boolean } => core !== null);
  const onlineCores = cpuUsage.filter((core) => core.online);
  const cpuPercent = onlineCores.length > 0
    ? onlineCores.reduce((sum, core) => sum + (core.usage ?? 0), 0) / onlineCores.length
    : 0;
  const gpuPercent = stats?.gpu.usage ?? 0;
  const gpuTemp = stats?.temps.GPU;
  const cpuTemp = stats?.temps.MCPU ?? stats?.temps.BCPU;
  const boardTemp = stats?.temps.Tboard;

  return (
    <section className="compute-app">
      <header className="compute-header">
        <div>
          <p className="eyebrow">NVIDIA Jetson TX2</p>
          <h1>算力中心</h1>
          <p className="header-note">本地 AI 推理与家庭服务的实时状态。</p>
        </div>
        <div className={`compute-status-card ${llamaHealthy ? "healthy" : ""}`}>
          {llamaHealthy ? <CheckCircle2 /> : <CircleSlash />}
          <span>
            <strong>{llamaHealthy ? "推理服务在线" : "推理服务离线"}</strong>
            {llamaHealthy ? `已加载 ${models.length} 个模型` : "llama-server 无响应"}
          </span>
        </div>
      </header>

      <div className="compute-board">
        {!stats && !error && <div className="compute-loading"><RefreshCw /> 正在读取系统状态…</div>}

        {stats && (
          <div className="compute-dashboard-scroll">
            <section className="compute-model-section">
              <div className="compute-section-title">
                <div><span>本地大模型</span><h2>AI 推理</h2></div>
                <strong className={llamaHealthy ? "ok" : "bad"}>{llamaHealthy ? "健康" : "异常"}</strong>
              </div>
              {models.length > 0 ? (
                <div className="compute-model-grid">
                  {models.map((model) => (
                    <article className="compute-model-card" key={model.id}>
                      <span className="compute-model-icon"><Braces /></span>
                      <div>
                        <strong>{model.id}</strong>
                        <small>
                          {formatParams(model.params)}
                          {model.ctxTrain ? ` · 上下文 ${Math.round(model.ctxTrain / 1024)}K` : ""}
                        </small>
                      </div>
                      <span className="compute-model-badge">就绪</span>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="compute-empty">llama-server 未返回模型信息。</p>
              )}
            </section>

            <section className="compute-metrics-section">
              <div className="compute-section-title">
                <div><span>实时指标</span><h2>硬件状态</h2></div>
                <strong>2 秒刷新</strong>
              </div>
              <div className="compute-metric-grid">
                <article className="compute-metric-card">
                  <header><span className="compute-metric-icon cpu"><Cpu /></span><div><strong>{cpuPercent.toFixed(0)}%</strong><small>CPU 占用 · {onlineCores.length} 核在线</small></div></header>
                  <Sparkline values={cpuHistory} max={100} color="#ff765e" />
                  <footer>
                    {cpuUsage.map((core, index) => (
                      <span className={core.online ? "" : "offline"} key={index}>
                        <i style={{ height: `${Math.min(core.usage ?? 0, 100)}%` }} />
                      </span>
                    ))}
                  </footer>
                </article>
                <article className="compute-metric-card">
                  <header><span className="compute-metric-icon gpu"><Layers /></span><div><strong>{gpuPercent.toFixed(0)}%</strong><small>GPU 占用 · 128 核心</small></div></header>
                  <Sparkline values={gpuHistory} max={100} color="#8b5cc7" />
                  <footer>
                    <span className="bar"><i style={{ height: `${gpuPercent}%` }} /></span>
                  </footer>
                </article>
                <article className="compute-metric-card">
                  <header><span className="compute-metric-icon mem"><MemoryStick /></span><div><strong>{memPercent.toFixed(0)}%</strong><small>内存 {stats.memory?.usedMb ?? 0} / {stats.memory?.totalMb ?? 0} MB</small></div></header>
                  <Sparkline values={memHistory} max={100} color="#3478d4" />
                  <footer>
                    <span className="bar"><i style={{ height: `${memPercent}%` }} /></span>
                  </footer>
                </article>
                <article className="compute-metric-card">
                  <header><span className="compute-metric-icon temp"><Thermometer /></span><div><strong>{gpuTemp !== undefined ? `${gpuTemp.toFixed(0)}°C` : "—"}</strong><small>GPU 温度 · 板温 {boardTemp !== undefined ? `${boardTemp.toFixed(0)}°C` : "—"}</small></div></header>
                  <div className="compute-temp-scale">
                    <span style={{ width: `${Math.min(((gpuTemp ?? 0) / 100) * 100, 100)}%` }} />
                  </div>
                  <footer className="compute-temp-footer">
                    <span>CPU {cpuTemp !== undefined ? `${cpuTemp.toFixed(0)}°C` : "—"}</span>
                    <span>PMIC {stats.temps.PMIC !== undefined ? `${stats.temps.PMIC.toFixed(0)}°C` : "—"}</span>
                  </footer>
                </article>
              </div>
            </section>

            <section className="compute-services-section">
              <div className="compute-section-title">
                <div><span>系统服务</span><h2>服务状态</h2></div>
                <strong className="ok">{servicesUp}/{SERVICE_LABELS.length} 运行中</strong>
              </div>
              <div className="compute-service-grid">
                {SERVICE_LABELS.map(({ id, label, description }) => {
                  const running = stats.services[id] === true;
                  return (
                    <article className={running ? "compute-service-card ok" : "compute-service-card down"} key={id}>
                      <span className="compute-service-icon">{running ? <ServerCog /> : <Server />}</span>
                      <div><strong>{label}</strong><small>{description}</small></div>
                      <span className={running ? "compute-service-badge ok" : "compute-service-badge down"}>
                        {running ? <CheckCircle2 /> : <CircleSlash />}
                        {running ? "运行中" : "已停止"}
                      </span>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="compute-info-section">
              <div className="compute-section-title">
                <div><span>主机概况</span><h2>系统信息</h2></div>
              </div>
              <div className="compute-info-grid">
                <article><span><HardDrive /></span><div><strong>{stats.disk ? `${stats.disk.freeGb.toFixed(0)} GB 可用` : "—"}</strong><small>磁盘 {stats.disk ? `${stats.disk.totalGb.toFixed(0)} GB · 已用 ${diskPercent.toFixed(0)}%` : "读取失败"}</small></div></article>
                <article><span><Gauge /></span><div><strong>{stats.load ? stats.load.one.toFixed(2) : "—"}</strong><small>负载 1 分钟 · 15 分钟 {stats.load ? stats.load.fifteen.toFixed(2) : "—"}</small></div></article>
                <article><span><Clock /></span><div><strong>{formatUptime(stats.uptime)}</strong><small>已连续运行</small></div></article>
                <article><span><Activity /></span><div><strong>2035 MHz</strong><small>CPU 锁频 · {stats.cores.filter((core) => core.online).length} 核全部满频</small></div></article>
              </div>
            </section>
          </div>
        )}

        {error && <div className="compute-error" role="alert"><CircleSlash /><span><strong>状态接口需要处理</strong>{error}</span></div>}
      </div>
    </section>
  );
}
