import { House, MapPin } from "lucide-react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";

export type FamilyLocation = {
  id: string;
  name: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  lastSeen?: number;
};

export const FAMILY = [
  { id: "mike", name: "胡洪伟", avatar: "/avatars/dad.png", matches: ["mike", "cann", "胡洪伟", "hh"] },
  { id: "kelsie", name: "梅宏杰", avatar: "/avatars/mum.png", matches: ["kelsie", "kels", "梅宏杰", "mh"] },
] as const;

export function familyAvatarFor(id: string, name = "") {
  const haystack = `${id} ${name}`.toLowerCase();
  return FAMILY.find((member) => member.matches.some((match) => haystack.includes(match)))?.avatar ?? "/avatars/dad.png";
}

export function familyNameFor(id: string) {
  return FAMILY.find((member) => member.id === id)?.name ?? id;
}

// --- WGS-84 → GCJ-02 (火星坐标系) 转换 ---
// 手机 GPS 上报的是 WGS-84 坐标，而高德瓦片使用 GCJ-02 坐标系。
// 直接叠加会偏移数百米，因此显示前需要转换（中国官方公开算法）。
const PI = 3.14159265358979324;
const GCJ_A = 6378245.0;
const GCJ_EE = 0.00669342162296594323;

function transformLat(x: number, y: number) {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((160.0 * Math.sin((y / 12.0) * PI) + 320.0 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0;
  return ret;
}

function transformLng(x: number, y: number) {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0;
  return ret;
}

export function wgs84ToGcj02(lng: number, lat: number): [number, number] {
  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - GCJ_EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((GCJ_A * (1 - GCJ_EE)) / (magic * sqrtMagic)) * PI);
  dLng = (dLng * 180.0) / ((GCJ_A / sqrtMagic) * Math.cos(radLat) * PI);
  return [lng + dLng, lat + dLat];
}

export function FamilyLocationMap({
  locations,
  mapId = "family-location-map",
  height = 360,
}: {
  locations: FamilyLocation[];
  mapId?: string;
  height?: number;
}) {
  const located = locations
    .map((location) => ({
      ...location,
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
    }))
    .filter(({ latitude, longitude }) => Number.isFinite(latitude) && Number.isFinite(longitude))
    // GPS (WGS-84) → 高德瓦片 (GCJ-02)，避免 marker 偏移数百米。
    .map((location) => {
      const [lng, lat] = wgs84ToGcj02(location.longitude, location.latitude);
      return { ...location, latitude: lat, longitude: lng };
    });

  const locationGroups = Array.from(located.reduce((groups, location) => {
    // Family members at the same spot share one marker so one cannot hide another.
    const key = `${location.latitude.toFixed(4)},${location.longitude.toFixed(4)}`;
    const group = groups.get(key) ?? [];
    group.push(location);
    groups.set(key, group);
    return groups;
  }, new Map<string, typeof located>()).values()).map((group) => ({
    locations: group,
    latitude: group.reduce((sum, location) => sum + location.latitude, 0) / group.length,
    longitude: group.reduce((sum, location) => sum + location.longitude, 0) / group.length,
  }));

  const locationKey = JSON.stringify(located.map(({ id, latitude, longitude }) => [id, latitude, longitude]));

  useEffect(() => {
    if (located.length === 0) return;
    const container = document.querySelector<HTMLElement>(`#${mapId}`);
    if (!container) return;

    // Leaflet stores its instance on the element, so remove an old map before
    // rebuilding it with the latest coordinates.
    if ((container as HTMLElement & { _leaflet_id?: number })._leaflet_id) {
      (container as HTMLElement & { _leaflet_id?: number })._leaflet_id = undefined;
      container.replaceChildren();
    }

    const map = L.map(container, { zoomControl: false, scrollWheelZoom: false, attributionControl: true });
    // 高德瓦片（OSM 在国内无法访问），subdomains 1-4 轮询负载均衡。
    L.tileLayer("https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}", {
      attribution: "&copy; 高德地图",
      subdomains: ["1", "2", "3", "4"],
      maxZoom: 18,
    }).addTo(map);

    const bounds = L.latLngBounds([]);
    locationGroups.forEach(({ locations: groupedLocations, latitude, longitude }) => {
      const avatars = groupedLocations.map(({ id, name }) => familyAvatarFor(id, name));
      const grouped = groupedLocations.length > 1;
      const iconWidth = grouped ? 94 : 58;
      const marker = L.marker([latitude, longitude], {
        icon: L.divIcon({
          className: `home-location-marker${grouped ? " is-group" : ""}`,
          html: `<span>${avatars.map((avatar) => `<b><img src="${avatar}" alt=""><i></i></b>`).join("")}</span>`,
          iconSize: [iconWidth, 66],
          iconAnchor: [iconWidth / 2, 62],
        }),
      }).addTo(map);
      marker.bindTooltip(groupedLocations.map(({ name }) => name).join(" & "), {
        permanent: true,
        direction: "right",
        offset: [grouped ? 34 : 18, -31],
        className: "home-location-label",
      });
      bounds.extend([latitude, longitude]);
    });

    if (locationGroups.length === 1) map.setView(bounds.getCenter(), 15);
    else map.fitBounds(bounds.pad(.35), { maxZoom: 15 });
    window.setTimeout(() => map.invalidateSize(), 0);
    return () => {
      map.remove();
    };
    // The serialized key changes only when a person's coordinates change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationKey]);

  if (located.length === 0) {
    return <div className="home-location-empty"><House /> 当家人追踪器报告 GPS 坐标时，位置将显示在此。</div>;
  }
  return <div id={mapId} className="home-location-map" style={{ height }} aria-label="家人位置地图" />;
}