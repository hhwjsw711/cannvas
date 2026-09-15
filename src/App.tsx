import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarDays,
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
  CloudSun,
} from "lucide-react";
import { CalendarApp } from "./apps/CalendarApp";
import { ChoresApp } from "./apps/ChoresApp";
import { ComputeApp } from "./apps/ComputeApp";
import { DisplayApp } from "./apps/DisplayApp";
import { FamilyLocationApp } from "./apps/FamilyLocationApp";
import { KioskInventoryApp } from "./apps/KioskInventoryApp";
import { SammyTabletTickerApp } from "./apps/SammyTabletTickerApp";
import { TodosApp } from "./apps/TodosApp";
import { WhiteboardApp } from "./apps/WhiteboardApp";
import { WeatherApp } from "./apps/WeatherApp";
import { useCannvasData } from "./data/DataProvider";
import { dismissNativeKeyboard, installNativeKeyboard } from "./lib/nativeKeyboard";

type AppId =
  | "whiteboard"
  | "chores"
  | "todos"
  | "calendar"
  | "weather"
  | "compute"
  | "locations"
  | "sammy-tablets"
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

const moreApps = [
  { id: "sammy-tablets" as const, label: "宠物喂药", description: "驱虫提醒", icon: Dog },
  { id: "inventory" as const, label: "物品清单", description: "查找家中物品", icon: PackageSearch },
];

const DEFAULT_IDLE_TIMEOUT = 5 * 60 * 1000;

export function App() {
  const { isReady } = useCannvasData();
  const [activeApp, setActiveApp] = useState<AppId>("whiteboard");
  const [displaySession, setDisplaySession] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const moreWrap = useRef<HTMLDivElement>(null);
  const lastInteractiveApp = useRef<AppId>("whiteboard");
  const idleTimer = useRef<number | undefined>(undefined);
  const idleTimeout = Number(import.meta.env.VITE_IDLE_TIMEOUT_MS) || DEFAULT_IDLE_TIMEOUT;

  const openDisplay = useCallback(() => {
    // A focused field can be unmounted without firing focusout. Hide the native
    // keyboard explicitly so it never covers the idle display.
    dismissNativeKeyboard();
    // This also fires when the display is already active. Give DisplayApp an
    // explicit reset signal so an idle timeout always mutes the video again.
    setDisplaySession((session) => session + 1);
    setActiveApp("display");
  }, []);

  const resetIdleTimer = useCallback(() => {
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => {
      openDisplay();
    }, idleTimeout);
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
      setActiveApp(app);
    }
    resetIdleTimer();
  };

  const wake = () => {
    if (activeApp === "display") openApp(lastInteractiveApp.current);
  };

  const moreActive = moreApps.some(({ id }) => id === activeApp);

  return (
    <main
      className={`app-shell app-${activeApp}`}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={wake}
    >
      <div className="app-stage" aria-live="polite">
        {!isReady && <div className="loading-card">正在打开 Cannvas…</div>}
        {isReady && activeApp === "whiteboard" && <WhiteboardApp />}
        {isReady && activeApp === "chores" && <ChoresApp />}
        {isReady && activeApp === "todos" && <TodosApp />}
        {isReady && activeApp === "calendar" && <CalendarApp />}
        {isReady && activeApp === "weather" && <WeatherApp />}
        {isReady && activeApp === "compute" && <ComputeApp />}
        {isReady && activeApp === "locations" && <FamilyLocationApp />}
        {isReady && activeApp === "sammy-tablets" && <SammyTabletTickerApp />}
        {isReady && activeApp === "inventory" && <KioskInventoryApp />}
        {isReady && activeApp === "display" && <DisplayApp displaySession={displaySession} onActivity={resetIdleTimer} onOpenCalendar={() => openApp("calendar")} onOpenWeather={() => openApp("weather")} onOpenLocations={() => openApp("locations")} />}
      </div>

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
    </main>
  );
}
