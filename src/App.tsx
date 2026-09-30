import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Cctv,
  CheckSquare2,
  Cpu,
  Dog,
  Ellipsis,
  Keyboard,
  LayoutDashboard,
  ListTodo,
  MapPinned,
  PackageSearch,
  PencilLine,
  Power,
  CloudSun,
  CloudOff,
  LoaderCircle,
  Sun,
} from "lucide-react";
import { CalendarApp } from "./apps/CalendarApp";
import { ChoresApp } from "./apps/ChoresApp";
import { ComputeApp } from "./apps/ComputeApp";
import { DisplayApp } from "./apps/DisplayApp";
import { FamilyLocationApp } from "./apps/FamilyLocationApp";
import { KioskInventoryApp } from "./apps/KioskInventoryApp";
import { SammyCamApp } from "./apps/SammyCamApp";
import { SammyTabletTickerApp } from "./apps/SammyTabletTickerApp";
import { SolarApp } from "./apps/SolarApp";
import { TodosApp } from "./apps/TodosApp";
import { WhiteboardApp } from "./apps/WhiteboardApp";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { useDeviceStatus } from "./data/DataProvider";
import type { BackupStatus } from "./data/types";
import { POWER_OFF_RECOVERY_MESSAGE, schedulePowerOffRecovery } from "./lib/actionTiming";
import { dismissNativeKeyboard, installNativeKeyboard } from "./lib/nativeKeyboard";
import { useHeartbeat } from "./lib/useHeartbeat";
import { useNightDim } from "./lib/useNightDim";

// Leaflet and the bigger dashboards load only when first opened.
const WeatherApp = lazy(() => import("./apps/WeatherApp").then((module) => ({ default: module.WeatherApp })));

type AppId =
  | "whiteboard"
  | "chores"
  | "todos"
  | "calendar"
  | "weather"
  | "compute"
  | "locations"
  | "solar"
  | "sammy-tablets"
  | "sammy-cam"
  | "inventory"
  | "display";

const primaryApps = [
  { id: "whiteboard" as const, label: "白板", icon: PencilLine },
  { id: "chores" as const, label: "家务", icon: CheckSquare2 },
  { id: "todos" as const, label: "待办", icon: ListTodo },
  { id: "calendar" as const, label: "日历", icon: CalendarDays },
  { id: "weather" as const, label: "天气", icon: CloudSun },
  { id: "compute" as const, label: "算力", icon: Cpu },
  { id: "locations" as const, label: "位置", icon: MapPinned },
];

// Things used less often. The home screen's solar readout still opens Solar.
const moreApps = [
  { id: "solar" as const, label: "太阳能", description: "当前与今日发电", icon: Sun },
  { id: "sammy-tablets" as const, label: "宠物喂药", description: "驱虫提醒", icon: Dog },
  { id: "sammy-cam" as const, label: "宠物监控", description: "实时画面与昨夜回放", icon: Cctv },
  { id: "inventory" as const, label: "物品清单", description: "查找家中物品", icon: PackageSearch },
];

const DEFAULT_IDLE_TIMEOUT = 5 * 60 * 1000;
// Touches inside Sammy Cam's page never reach Cannvas, so the usual timeout
// would send someone home halfway through scrubbing back through the night.
const SAMMY_CAM_IDLE_TIMEOUT = 30 * 60 * 1000;

export function App() {
  const { isReady, backupStatus } = useDeviceStatus();
  useHeartbeat();
  const [activeApp, setActiveApp] = useState<AppId>("whiteboard");
  const [displaySession, setDisplaySession] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [powerOffOpen, setPowerOffOpen] = useState(false);
  const [powerOffPending, setPowerOffPending] = useState(false);
  const [powerOffError, setPowerOffError] = useState("");
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const moreWrap = useRef<HTMLDivElement>(null);
  const lastInteractiveApp = useRef<AppId>("whiteboard");
  // What the idle timer is timing. State lags a render behind openApp.
  const shownApp = useRef<AppId>("whiteboard");
  const idleTimer = useRef<number | undefined>(undefined);
  const idleTimeout = Number(import.meta.env.VITE_IDLE_TIMEOUT_MS) || DEFAULT_IDLE_TIMEOUT;

  const openDisplay = useCallback(() => {
    // A focused field can be unmounted without firing focusout. Hide the native
    // keyboard explicitly so it never covers the idle display.
    dismissNativeKeyboard();
    // This also fires when the display is already active. Give DisplayApp an
    // explicit reset signal so an idle timeout always mutes the video again.
    setDisplaySession((session) => session + 1);
    shownApp.current = "display";
    setActiveApp("display");
  }, []);

  const resetIdleTimer = useCallback(() => {
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => {
      openDisplay();
    }, shownApp.current === "sammy-cam" ? Math.max(idleTimeout, SAMMY_CAM_IDLE_TIMEOUT) : idleTimeout);
  }, [idleTimeout, openDisplay]);

  useEffect(() => {
    return installNativeKeyboard(setKeyboardVisible);
  }, []);

  useEffect(() => {
    const events: Array<keyof WindowEventMap> = ["pointerdown", "pointermove", "keydown"];
    const onActivity = () => resetIdleTimer();
    for (const event of events) window.addEventListener(event, onActivity, { passive: true });
    resetIdleTimer();
    return () => {
      window.clearTimeout(idleTimer.current);
      for (const event of events) window.removeEventListener(event, onActivity);
    };
  }, [resetIdleTimer]);

  useEffect(() => {
    if (!moreOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!moreWrap.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    const closeWithKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithKeyboard);
    };
  }, [moreOpen]);

  const openApp = (app: AppId) => {
    setMoreOpen(false);
    if (app === "display") {
      openDisplay();
    } else {
      lastInteractiveApp.current = app;
      shownApp.current = app;
      setActiveApp(app);
    }
    resetIdleTimer();
  };

  const wake = () => {
    if (activeApp === "display") openApp(lastInteractiveApp.current);
  };

  const requestPowerOff = () => {
    setMoreOpen(false);
    setPowerOffError("");
    setPowerOffOpen(true);
  };

  const powerOff = async () => {
    setPowerOffPending(true);
    setPowerOffError("");
    const recoveryTimer = schedulePowerOffRecovery({
      recover: () => {
        setPowerOffPending(false);
        setPowerOffError(POWER_OFF_RECOVERY_MESSAGE);
      },
    });
    try {
      const response = await fetch("/api/system/poweroff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "poweroff" }),
      });
      if (!response.ok) throw new Error("Cannvas 未接受关机请求");
    } catch (error) {
      window.clearTimeout(recoveryTimer);
      setPowerOffPending(false);
      setPowerOffError(error instanceof Error ? error.message : "Cannvas 无法关机");
    }
  };

  const moreActive = moreApps.some(({ id }) => id === activeApp);

  return (
    <main
      className={`app-shell app-${activeApp}`}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={wake}
    >
      <div className="app-stage" aria-live="polite">
        {/* Only a brand new screen waits here, while its backup is restored. */}
        {!isReady && <RestoringCard backupStatus={backupStatus} />}
        {isReady && (
          <AppErrorBoundary key={activeApp}>
            <Suspense fallback={<div className="loading-card"><LoaderCircle className="spin" /></div>}>
              {activeApp === "whiteboard" && <WhiteboardApp />}
              {activeApp === "chores" && <ChoresApp />}
              {activeApp === "todos" && <TodosApp />}
              {activeApp === "calendar" && <CalendarApp />}
              {activeApp === "weather" && <WeatherApp />}
              {activeApp === "solar" && <SolarApp />}
              {activeApp === "compute" && <ComputeApp />}
              {activeApp === "locations" && <FamilyLocationApp />}
              {activeApp === "sammy-tablets" && <SammyTabletTickerApp />}
              {activeApp === "sammy-cam" && <SammyCamApp />}
              {activeApp === "inventory" && <KioskInventoryApp />}
              {activeApp === "display" && <DisplayApp displaySession={displaySession} onActivity={resetIdleTimer} onOpenCalendar={() => openApp("calendar")} onOpenWeather={() => openApp("weather")} onOpenLocations={() => openApp("locations")} onOpenSolar={() => openApp("solar")} />}
            </Suspense>
          </AppErrorBoundary>
        )}
      </div>

      {backupStatus.state === "error" && isReady && activeApp !== "display" && (
        <div className="backup-error-badge" role="status" title={backupStatus.message}>
          <span className="backup-error-icon"><CloudOff /></span>
          <span>
            <strong>备份已暂停</strong>
            <small>数据仍完整保存在本机</small>
          </span>
        </div>
      )}

      {keyboardVisible && activeApp !== "display" && (
        <button
          className="keyboard-dismiss-button"
          onClick={dismissNativeKeyboard}
        >
          <Keyboard />
          收起键盘
        </button>
      )}

      {activeApp !== "display" && (
        <nav className="app-dock" aria-label="Cannvas 应用">
          {primaryApps.map(({ id, label, icon: Icon }) => (
            <button
              className={activeApp === id ? "dock-item active" : "dock-item"}
              key={id}
              onClick={() => openApp(id)}
              aria-current={activeApp === id ? "page" : undefined}
            >
              <span className="dock-icon"><Icon strokeWidth={2.4} /></span>
              <span>{label}</span>
            </button>
          ))}
          <div className="dock-more-wrap" ref={moreWrap}>
            {moreOpen && (
              <div className="more-apps-popover" role="dialog" aria-label="更多应用">
                <div><strong>更多应用</strong><span>不常用的功能</span></div>
                {moreApps.map(({ id, label, description, icon: Icon }) => (
                  <button key={id} onClick={() => openApp(id)}>
                    <span className="more-app-icon"><Icon /></span>
                    <span><strong>{label}</strong><small>{description}</small></span>
                  </button>
                ))}
                <button className="more-power-button" onClick={requestPowerOff}>
                  <span className="more-app-icon"><Power /></span>
                  <span><strong>关闭 Cannvas</strong><small>安全关闭屏幕</small></span>
                </button>
              </div>
            )}
            <button
              className={moreActive ? "dock-item active" : "dock-item"}
              onClick={() => setMoreOpen((open) => !open)}
              aria-current={moreActive ? "page" : undefined}
              aria-expanded={moreOpen}
              aria-haspopup="dialog"
            >
              <span className="dock-icon"><Ellipsis strokeWidth={2.4} /></span>
              <span>更多</span>
            </button>
          </div>
          <span className="dock-divider" aria-hidden="true" />
          <button
            className="dock-item"
            onClick={() => openApp("display")}
          >
            <span className="dock-icon"><LayoutDashboard strokeWidth={2.4} /></span>
            <span>主页</span>
          </button>
        </nav>
      )}

      <ConfirmDialog
        open={powerOffOpen}
        title="关闭 Cannvas？"
        confirmLabel={powerOffPending ? "正在关闭…" : "关闭"}
        confirmDisabled={powerOffPending}
        onCancel={() => {
          if (powerOffPending) return;
          setPowerOffOpen(false);
          setPowerOffError("");
        }}
        onConfirm={() => void powerOff()}
      >
        <p>这将安全地关闭 Cannvas 电脑。如需再次启动，请重新打开电源。</p>
        {powerOffError && <p className="dialog-error">{powerOffError}</p>}
      </ConfirmDialog>

      <NightDimOverlay />
    </main>
  );
}

function RestoringCard({ backupStatus }: { backupStatus: BackupStatus }) {
  return (
    <div className="loading-card restoring-card" role="status">
      <LoaderCircle className="spin" />
      <strong>正在打开 Cannvas…</strong>
      <span>{backupStatus.state === "error"
        ? "这块屏幕是新设备，正在先恢复备份。暂时连不上备份服务，会持续重试。"
        : "这块屏幕是新设备，正在先恢复备份。"}</span>
    </div>
  );
}

// Its own component, so the minute tick and touch wake never re-render the app.
function NightDimOverlay() {
  const level = useNightDim();
  return <div className="night-dim" aria-hidden="true" style={{ opacity: level }} />;
}
