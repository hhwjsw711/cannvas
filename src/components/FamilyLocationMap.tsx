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
    .filter(({ latitude, longitude }) => Number.isFinite(latitude) && Number.isFinite(longitude));

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
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
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