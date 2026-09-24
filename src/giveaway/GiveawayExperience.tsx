import { useQuery } from "convex/react";
import { Gift, ImageOff, LoaderCircle, PackageOpen, RefreshCw } from "lucide-react";
import { api } from "../../convex/_generated/api";

function ItemPhotos({ title, photoUrls }: { title: string; photoUrls: string[] }) {
  if (photoUrls.length === 0) {
    return <div className="giveaway-photo-placeholder"><ImageOff /><span>暂无照片</span></div>;
  }

  return (
    <div className="giveaway-photos" aria-label={`${title} 照片`}>
      {photoUrls.map((url, index) => (
        <img key={url} src={url} alt={index === 0 ? title : `${title}，视图 ${index + 1}`} loading="lazy" />
      ))}
      {photoUrls.length > 1 && <span className="giveaway-photo-count">{photoUrls.length} 张照片</span>}
    </div>
  );
}

export function GiveawayExperience() {
  const items = useQuery(api.inventory.publicGiveaway);

  return (
    <main className="giveaway-page">
      <header className="giveaway-header">
        <div className="giveaway-mark" aria-hidden="true"><Gift /></div>
        <div>
          <h1>赠送物品</h1>
          <p>来自 Mike 家的闲置物品，正在寻找新主人。</p>
        </div>
      </header>

      {items === undefined ? (
        <div className="giveaway-state"><LoaderCircle className="giveaway-spinner" /><p>正在检查可赠送的物品…</p></div>
      ) : items.length === 0 ? (
        <div className="giveaway-state"><PackageOpen /><h2>暂时没有可赠送的物品</h2><p>稍后再来看看。有新物品进入赠送清单时，本页面会自动更新。</p></div>
      ) : (
        <>
          <div className="giveaway-summary">
            <strong>{items.length} 件物品可赠送</strong>
            <span><RefreshCw />自动更新</span>
          </div>
          <section className="giveaway-grid" aria-label="可赠送的物品">
            {items.map((item) => (
              <article className="giveaway-card" key={item._id}>
                <ItemPhotos title={item.title} photoUrls={item.photoUrls} />
                <div className="giveaway-card-copy">
                  <div className="giveaway-labels">
                    <span>{item.category}</span>
                    {item.boxOnly && <span className="giveaway-box-only"><PackageOpen />仅盒子</span>}
                  </div>
                  <h2>{item.title}</h2>
                  {item.description && <p>{item.description}</p>}
                  <dl>
                    <div><dt>状况</dt><dd>{item.condition}</dd></div>
                    {item.quantity > 1 && <div><dt>数量</dt><dd>{item.quantity}</dd></div>}
                  </dl>
                  {item.enrichmentStatus !== "ready" && <small>详细信息仍在核对中。</small>}
                </div>
              </article>
            ))}
          </section>
        </>
      )}

      <footer>如果你认识 Mike 想要某件物品，给他发条消息吧。</footer>
    </main>
  );
}
