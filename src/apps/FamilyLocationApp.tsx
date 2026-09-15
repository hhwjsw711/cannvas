import { MapPinned, RefreshCw, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FAMILY, FamilyLocation, FamilyLocationMap } from "../components/FamilyLocationMap";

type LocationResponse = {
  tracked: boolean;
  locations: FamilyLocation[];
};

const LOCATION_REFRESH_MS = 15_000;
const STALE_AFTER_MS = 15 * 60_000; // show "很久" after 15 min without an update

function timeAgo(ts: number | undefined) {
  if (!ts) return "暂无数据";
  const seconds = Math.max(0, Math.round((Date.now() / 1000) - ts));
  if (seconds < 60) return "刚刚";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
  return `${Math.floor(seconds / 86400)} 天前`;
}

export function FamilyLocationApp() {
  const [locations, setLocations] = useState<FamilyLocation[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/locations", { cache: "no-store" });
      if (!response.ok) throw new Error("位置服务不可用");
      const body = await response.json() as LocationResponse & { error?: string };
      if (body.error) throw new Error(body.error);
      setLocations(body.locations ?? []);
      setError("");
    } catch {
      // 生产站点（cannvas.isllm.com）没有本机位置 API，保持空状态即可。
      setError("位置服务未在家中运行");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), LOCATION_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  // Tick every 30s so "x 分钟前" labels stay fresh.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const byId = useMemo(() => new Map(locations.map((location) => [location.id, location])), [locations]);

  const members = FAMILY.map((member) => ({
    ...member,
    location: byId.get(member.id),
    stale: (byId.get(member.id)?.lastSeen ?? 0) < (now / 1000) - (STALE_AFTER_MS / 1000),
  }));

  const onlineCount = members.filter(({ location, stale }) => location && !stale).length;

  return (
    <section className="family-location-app">
      <header className="home-automation-header">
        <div>
          <p className="eyebrow">Family Locations</p>
          <h1>家人位置</h1>
          <p className="header-note">实时查看家人所在位置，数据仅保存在本机。</p>
        </div>
        <div className={`home-connection-card ${onlineCount > 0 ? "connected" : ""}`}>
          {onlineCount > 0 ? <MapPinned /> : <UserRound />}
          <span><strong>{onlineCount > 0 ? `${onlineCount} 人已定位` : "暂无定位"}</strong>{error || "等待家人手机上报位置"}</span>
        </div>
      </header>

      <div className="home-automation-board">
        {loading && <div className="home-loading"><RefreshCw /> 正在加载位置…</div>}

        <div className="family-location-map-wrap">
          <FamilyLocationMap locations={locations} mapId="family-location-page-map" height={430} />
        </div>

        <section className="home-presence-section">
          <div className="home-section-title"><div><span>成员</span><h2>家人状态</h2></div><strong>{onlineCount} / {members.length} 在线</strong></div>
          <div className="home-presence-grid">
            {members.map(({ id, name, avatar, location, stale }) => (
              <article className={location && !stale ? "home-person-card is-home" : "home-person-card needs-setup"} key={id}>
                <img className="home-person-avatar" src={avatar} alt={`${name}'s face`} />
                <div>
                  <strong>{name}</strong>
                  <small>{location ? `${timeAgo(location.lastSeen)}${location.accuracy ? ` · 精度 ${Math.round(location.accuracy)}m` : ""}` : "等待上报"}</small>
                </div>
                {location && !stale ? <MapPinned /> : <UserRound />}
              </article>
            ))}
          </div>
          <p className="home-section-empty family-location-note">位置由家人的手机（OwnTracks）通过本机回环上报，坐标不会离开这台设备。</p>
        </section>
      </div>
    </section>
  );
}