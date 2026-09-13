import { useEffect, useMemo, useState } from "react";
import { Box, LoaderCircle, MapPin, Search } from "lucide-react";

type InventoryItem = {
  _id: string;
  title: string;
  category: string;
  condition: string;
  quantity: number;
  currentLocationName: string;
  updatedAt: number;
  photoUrl: string | null;
};

type InventoryResponse = {
  configured?: boolean;
  page?: InventoryItem[];
  isDone?: boolean;
  continueCursor?: string;
  error?: string;
};

export function KioskInventoryApp() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    const loadInventory = async () => {
      const loadedItems: InventoryItem[] = [];
      let cursor: string | null = null;
      let isDone = false;

      while (!isDone) {
        const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
        const response = await fetch(`/api/inventory${query}`);
        if (!response.headers.get("Content-Type")?.includes("application/json")) {
          throw new Error("物品清单仅在触控屏上可用");
        }
        const body = await response.json() as InventoryResponse;
        if (!response.ok) throw new Error(body.error || "物品清单暂时不可用");
        if (!body.configured) throw new Error("物品清单仅在触控屏上可用");
        loadedItems.push(...(body.page ?? []));
        isDone = body.isDone ?? true;
        if (!isDone && (!body.continueCursor || body.continueCursor === cursor)) {
          throw new Error("物品清单加载中断");
        }
        cursor = body.continueCursor ?? null;
      }
      if (active) setItems(loadedItems);
    };

    void loadInventory()
      .catch((error: unknown) => {
        if (active) setMessage(error instanceof Error ? error.message : "物品清单暂时不可用");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const visibleItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("zh-CN");
    if (!query) return items;
    return items.filter((item) => [
      item.title,
      item.category,
      item.condition,
      item.currentLocationName,
    ].some((value) => value.toLocaleLowerCase("zh-CN").includes(query)));
  }, [items, search]);

  return (
    <section className="kiosk-inventory-app">
      <header className="kiosk-inventory-header">
        <div>
          <div className="kiosk-inventory-title"><span><Box /></span><h1>物品清单</h1></div>
          <p>查找物品存放位置。用手机添加或编辑。</p>
        </div>
        <label className="kiosk-inventory-search">
          <Search />
          <input
            type="search"
            aria-label="搜索物品"
            value={search}
            placeholder="搜索物品或位置"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </header>

      {loading && <div className="kiosk-inventory-state"><LoaderCircle className="spin" />正在打开物品清单…</div>}
      {!loading && message && <div className="kiosk-inventory-state"><Box /><strong>{message}</strong><span>手机端应用需要登录账号。</span></div>}
      {!loading && !message && visibleItems.length === 0 && (
        <div className="kiosk-inventory-state"><Search /><strong>没有匹配的物品</strong><span>试试搜索其他物品、分类或位置。</span></div>
      )}
      {!loading && !message && visibleItems.length > 0 && (
        <div className="kiosk-inventory-grid" aria-label="家中物品清单">
          {visibleItems.map((item) => (
            <article className="kiosk-inventory-card" key={item._id}>
              <div className="kiosk-inventory-photo">
                {item.photoUrl ? <img src={item.photoUrl} alt="" /> : <Box />}
              </div>
              <div className="kiosk-inventory-copy">
                <span>{item.category}</span>
                <h2>{item.title}</h2>
                <p><MapPin />{item.currentLocationName}</p>
                <small>{item.condition}{item.quantity > 1 ? ` · ${item.quantity} 件` : ""}</small>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
