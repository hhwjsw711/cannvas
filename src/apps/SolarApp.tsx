import { Home, PlugZap, Sun, UtilityPole } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { FLOW_THRESHOLD_KW, formatKw, formatKwh, isSolarFresh, type SolarStatus, spareSolarKw } from "../lib/solar";
import { useSolar } from "../lib/useSolar";

export function SolarApp() {
  const state = useSolar(5000);

  return (
    <section className="solar-app">
      <header className="solar-header">
        <div>
          <p className="eyebrow">太阳能</p>
          <h1>当前功率</h1>
        </div>
        {state.kind === "ready" && state.solar.configured && <SolarStatusPill solar={state.solar} />}
      </header>

      {state.kind === "loading" && <div className="solar-message">正在读取逆变器数据…</div>}
      {state.kind === "error" && <div className="solar-message">{state.message}</div>}
      {state.kind === "ready" && !state.solar.configured && (
        <div className="solar-message">在家居控制中连接 Home Assistant 后可查看太阳能数据。</div>
      )}
      {state.kind === "ready" && state.solar.configured && (
        <>
          <PowerFlow solar={state.solar} />
          <SolarPotential solar={state.solar} />
          <TodayTiles solar={state.solar} />
          <DayChart solar={state.solar} />
        </>
      )}
    </section>
  );
}

function SolarStatusPill({ solar }: { solar: SolarStatus }) {
  const updated = solar.updatedAt ? new Date(solar.updatedAt) : null;
  const seconds = updated ? Math.max(0, Math.round((Date.now() - updated.getTime()) / 1000)) : null;
  const stale = !isSolarFresh(solar);
  return (
    <div className={`solar-status-pill${stale ? " stale" : ""}`}>
      <PlugZap aria-hidden="true" />
      <span>
        <strong>{solar.status ?? "未知"}</strong>
        {seconds == null ? "暂无读数" : seconds < 60 ? "实时" : `${Math.round(seconds / 60)} 分钟前更新`}
      </span>
    </div>
  );
}

function PowerFlow({ solar }: { solar: SolarStatus }) {
  // Keep missing readings as null so they show "–" rather than a false 0 W.
  const solarKw = solar.now?.solarKw ?? null;
  const houseKw = solar.now?.houseKw ?? null;
  const gridKw = solar.now?.gridKw ?? null;
  const importing = gridKw != null && gridKw > FLOW_THRESHOLD_KW;
  const exporting = gridKw != null && gridKw < -FLOW_THRESHOLD_KW;
  const producing = solarKw != null && solarKw > FLOW_THRESHOLD_KW;
  const potentialKw = solar.forecast?.potentialKw ?? null;

  return (
    <div className="solar-flow-card">
      <svg className="solar-flow" viewBox="0 0 1000 520" role="img" aria-label={`太阳能 ${formatKw(solarKw)}，家中用电 ${formatKw(houseKw)}，电网${importing ? "供电中" : exporting ? "回馈中" : "空闲"} ${formatKw(gridKw)}`}>
        <FlowLine d="M 210 238 C 210 350, 320 400, 430 400" active={producing} kw={solarKw ?? 0} tone="solar" />
        <FlowLine d="M 790 238 C 790 350, 680 400, 570 400" active={importing} kw={gridKw ?? 0} tone="grid" />
        <FlowLine d="M 290 110 L 710 110" active={exporting} kw={gridKw ?? 0} tone="export" />
      </svg>
      <FlowNode
        className="solar"
        x={21}
        y={21}
        icon={<Sun />}
        label="太阳能"
        value={formatKw(solarKw)}
        note={potentialKw != null ? `预计可发 ~${formatKw(potentialKw)}` : undefined}
      />
      <FlowNode className="grid" x={79} y={21} icon={<UtilityPole />} label={exporting ? "卖电中" : "电网"} value={formatKw(gridKw)} />
      <FlowNode className="home" x={50} y={77} icon={<Home />} label="家中" value={formatKw(houseKw)} />
    </div>
  );
}

function FlowLine({ d, active, kw, tone }: { d: string; active: boolean; kw: number; tone: string }) {
  // Faster dots for bigger flows, clamped so tiny flows still move visibly.
  const duration = Math.max(0.5, Math.min(4, 2.4 / Math.max(0.2, Math.abs(kw))));
  return (
    <g className={`solar-flow-line ${tone}${active ? " active" : ""}`}>
      <path d={d} className="track" />
      {active && <path d={d} className="dots" style={{ animationDuration: `${duration}s` }} />}
    </g>
  );
}

function FlowNode({ className, x, y, icon, label, value, note }: { className: string; x: number; y: number; icon: ReactNode; label: string; value: string; note?: string }) {
  return (
    <div className={`solar-flow-node ${className}`} style={{ left: `${x}%`, top: `${y}%` }}>
      <span className="solar-flow-icon">{icon}</span>
      <strong>{value}</strong>
      <small>{label}</small>
      {note && <em className="solar-flow-note">{note}</em>}
    </div>
  );
}

// Forecast.Solar is a weather model, so everything here is worded as an estimate.
function SolarPotential({ solar }: { solar: SolarStatus }) {
  const forecast = solar.forecast;
  if (!forecast || (forecast.potentialKw == null && forecast.todayKwh == null && forecast.tomorrowKwh == null)) return null;
  const actualKw = solar.now?.solarKw ?? null;
  const spare = spareSolarKw(actualKw, forecast.potentialKw);
  // Only claim the panels are keeping up when there's an actual reading to compare.
  const comparable = actualKw != null && forecast.potentialKw != null;
  const outlook = [
    forecast.todayKwh != null ? `今日约 ${formatKwh(forecast.todayKwh)}` : null,
    forecast.tomorrowKwh != null ? `明日 ${formatKwh(forecast.tomorrowKwh)}` : null,
  ].filter(Boolean).join("，");
  return (
    <div className={`solar-potential${spare != null ? " has-spare" : ""}`}>
      <strong>
        {spare != null
          ? `约 ${formatKw(spare)} 太阳能未被利用`
          : comparable
            ? "当前太阳能几乎全部被利用"
            : "太阳能预报"}
      </strong>
      <span>
        {spare != null
          ? "由于没有电池且不并网卖电，光伏板只按家中实际用电发电。"
          : ""}
        {outlook ? `预报显示光伏板可发 ${outlook}。` : ""}
      </span>
    </div>
  );
}

function TodayTiles({ solar }: { solar: SolarStatus }) {
  const today = solar.today;
  const peakAt = today?.peakSolarAt ? new Date(today.peakSolarAt).toLocaleTimeString("zh-CN", { hour: "numeric", minute: "2-digit" }) : null;
  return (
    <div className="solar-today">
      <article className="generated">
        <span>今日发电</span>
        <strong>{formatKwh(today?.generatedKwh)}</strong>
        <small>{today?.peakSolarKw != null ? `峰值 ${formatKw(today.peakSolarKw)}${peakAt ? `（${peakAt}）` : ""}` : "暂无峰值"}</small>
      </article>
      <article className="used">
        <span>今日用电</span>
        <strong>{formatKwh(today?.consumedKwh)}</strong>
        <small>{today?.selfPoweredPct != null ? `${today.selfPoweredPct}% 来自光伏` : "等待数据"}</small>
      </article>
      <article className="imported">
        <span>买入电量</span>
        <strong>{formatKwh(today?.importedKwh)}</strong>
        <small>来自电网</small>
      </article>
      <article className="exported">
        <span>卖出电量</span>
        <strong>{formatKwh(today?.exportedKwh)}</strong>
        <small>送往电网</small>
      </article>
    </div>
  );
}

const CHART = { width: 1000, height: 700, left: 58, right: 18, top: 18, bottom: 44 };

function DayChart({ solar }: { solar: SolarStatus }) {
  const series = solar.series;
  const chart = useMemo(() => {
    if (!series) return null;
    const start = new Date(series.start).getTime();
    const step = series.stepMinutes * 60_000;
    const day = 24 * 60 * 60_000;
    const possible = series.possible ?? [];
    const values = [...series.solar, ...series.house, ...series.grid, ...possible].filter((value): value is number => value != null);
    const max = Math.max(2, Math.ceil(Math.max(...values, 0)));
    const plotWidth = CHART.width - CHART.left - CHART.right;
    const plotHeight = CHART.height - CHART.top - CHART.bottom;
    const x = (index: number) => CHART.left + ((index * step + step / 2) / day) * plotWidth;
    const y = (value: number) => CHART.top + plotHeight - (Math.max(0, value) / max) * plotHeight;
    const baseline = y(0);

    const line = (points: Array<number | null>) => {
      let path = "";
      let drawing = false;
      points.forEach((value, index) => {
        if (value == null) { drawing = false; return; }
        path += `${drawing ? "L" : "M"} ${x(index).toFixed(1)} ${y(value).toFixed(1)} `;
        drawing = true;
      });
      return path;
    };
    const area = (points: Array<number | null>) => {
      // Close each unbroken run of readings down to the baseline.
      let path = "";
      let run: number[] = [];
      const flush = () => {
        if (run.length > 1) {
          path += `M ${x(run[0]).toFixed(1)} ${baseline} ` + run.map((index) => `L ${x(index).toFixed(1)} ${y(points[index] ?? 0).toFixed(1)}`).join(" ") + ` L ${x(run[run.length - 1]).toFixed(1)} ${baseline} Z `;
        }
        run = [];
      };
      points.forEach((value, index) => (value == null ? flush() : run.push(index)));
      flush();
      return path;
    };

    const nowX = CHART.left + (Math.min(day, Date.now() - start) / day) * plotWidth;
    const hours = [0, 3, 6, 9, 12, 15, 18, 21, 24];
    const ticks = Array.from({ length: max + 1 }, (_, value) => value).filter((value) => max <= 4 || value % 2 === 0);
    return {
      solarArea: area(series.solar),
      solarLine: line(series.solar),
      importArea: area(series.grid.map((value) => (value == null ? null : Math.max(0, value)))),
      houseLine: line(series.house),
      possibleLine: possible.some((value) => value != null) ? line(possible) : "",
      nowX,
      hours: hours.map((hour) => ({ hour, x: CHART.left + (hour / 24) * plotWidth })),
      ticks: ticks.map((value) => ({ value, y: y(value) })),
    };
  }, [series]);

  if (!chart) return null;

  return (
    <div className="solar-chart-card">
      <div className="solar-chart-heading">
        <h2>今日走势</h2>
        <div className="solar-chart-legend">
          <span className="solar">光伏</span>
          <span className="house">家中</span>
          <span className="grid">电网</span>
          {chart.possibleLine && <span className="possible">潜力（估算）</span>}
        </div>
      </div>
      <svg className="solar-chart" viewBox={`0 0 ${CHART.width} ${CHART.height}`} role="img" aria-label="今日光伏、家中与电网功率">
        {chart.ticks.map(({ value, y }) => (
          <g key={value} className="solar-chart-grid">
            <line x1={CHART.left} x2={CHART.width - CHART.right} y1={y} y2={y} />
            <text x={CHART.left - 12} y={y + 5} textAnchor="end">{value} kW</text>
          </g>
        ))}
        {chart.hours.map(({ hour, x }) => (
          <text key={hour} className="solar-chart-hour" x={x} y={CHART.height - 12} textAnchor="middle">
            {hour === 0 || hour === 24 ? "0时" : `${hour}时`}
          </text>
        ))}
        <path className="solar-chart-area" d={chart.solarArea} />
        <path className="solar-chart-import" d={chart.importArea} />
        <path className="solar-chart-solar-line" d={chart.solarLine} />
        {chart.possibleLine && <path className="solar-chart-possible" d={chart.possibleLine} />}
        <path className="solar-chart-house" d={chart.houseLine} />
        <line className="solar-chart-now" x1={chart.nowX} x2={chart.nowX} y1={CHART.top} y2={CHART.height - CHART.bottom} />
      </svg>
    </div>
  );
}
