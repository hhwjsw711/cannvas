import { useAuthActions } from "@convex-dev/auth/react";
import {
  Box,
  Camera,
  ChevronLeft,
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  LogOut,
  MapPin,
  PackageOpen,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { preparePhotoForUpload } from "./photoPrep";

type InventoryStatus = "active" | "disposed" | "donated" | "sold" | "lost";
type InventoryItemSummary = {
  _id: Id<"inventoryItems">;
  title: string;
  description: string;
  category: string;
  tags: string[];
  currentLocationName: string;
  enrichmentStatus: string;
  photoUrl: string | null;
  quantity: number;
};

type CapturePhoto = {
  id: string;
  file: File;
  previewUrl: string;
  status: "uploading" | "uploaded" | "failed";
  storageId?: Id<"_storage">;
};

const MAX_PHOTOS_PER_UPLOAD = 8;
const MAX_PHOTOS_PER_ITEM = 24;
const INVENTORY_PAGE_SIZE = 18;
const BOX_ONLY_TAG = "box only";

// Convex 事件类型 -> 中文展示文案（历史记录用）
const EVENT_LABELS: Record<string, string> = {
  added: "添加",
  edited: "编辑",
  moved: "移动",
  photo_added: "添加照片",
  ai_enriched: "AI 识别",
  ai_failed: "AI 识别失败",
  disposed: "已丢弃",
  donated: "已捐赠",
  sold: "已出售",
  lost: "已丢失",
  restored: "已恢复",
};

function hasTag(tags: string[], tag: string) {
  const normalizedTag = tag.toLocaleLowerCase("en-AU");
  return tags.some((candidate) => candidate.toLocaleLowerCase("en-AU") === normalizedTag);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message.replace(/^\[CONVEX[^\]]*\]\s*/, "") : String(error);
}

function AuthScreen() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signIn("password", { email: email.trim(), password, flow });
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="inventory-auth">
      <div className="inventory-auth-mark"><Box /></div>
      <h1>Cannvas 物品清单</h1>
      <p>你拥有的每一样东西，以及它确切存放的位置。</p>
      <form onSubmit={submit}>
        <label>邮箱<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>密码<input type="password" autoComplete={flow === "signUp" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /></label>
        {error && <div className="inventory-error"><CircleAlert />{error}</div>}
        <button className="inventory-primary" disabled={busy}>
          {busy ? <LoaderCircle className="spin" /> : null}
          {flow === "signIn" ? "登录" : "创建账户"}
        </button>
      </form>
      <button className="inventory-text-button" onClick={() => setFlow(flow === "signIn" ? "signUp" : "signIn")}>
        {flow === "signIn" ? "第一次使用？创建账户" : "已有账户？登录"}
      </button>
    </main>
  );
}

function AccessGate() {
  const status = useQuery(api.inventory.accessStatus);
  const { signOut } = useAuthActions();

  if (status === undefined) return <LoadingScreen />;
  if (status.hasAccess) return <InventoryBrowser />;

  return (
    <main className="inventory-auth">
      <div className="inventory-auth-mark"><ShieldCheck /></div>
      <h1>需要访问权限</h1>
      <p>该账户尚未获得访问 Cannvas 家庭物品清单的权限。</p>
      <button className="inventory-text-button" onClick={() => void signOut()}>退出登录</button>
    </main>
  );
}

function LoadingScreen() {
  return <main className="inventory-loading"><LoaderCircle className="spin" /><span>正在打开物品清单…</span></main>;
}

async function uploadFile(file: File, generateUploadUrl: () => Promise<string>) {
  // Strip EXIF (including GPS) before anything leaves the phone.
  const photo = await preparePhotoForUpload(file);
  const uploadUrl = await generateUploadUrl();
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": "image/jpeg" },
    body: photo,
  });
  if (!response.ok) throw new Error("照片上传失败，请重试。");
  return (await response.json() as { storageId: Id<"_storage"> }).storageId;
}

// One at a time, and one bad file does not throw away the rest.
async function uploadFiles(
  files: File[],
  generateUploadUrl: () => Promise<string>,
) {
  const storageIds: Id<"_storage">[] = [];
  const errors: string[] = [];
  for (const file of files) {
    try {
      storageIds.push(await uploadFile(file, generateUploadUrl));
    } catch (caught) {
      errors.push(getErrorMessage(caught));
    }
  }
  return { storageIds, errors };
}

function CaptureSheet({ onClose }: { onClose: () => void }) {
  const suggestions = useQuery(api.inventory.locationSuggestions) ?? [];
  const generateUploadUrlMutation = useMutation(api.inventory.generateUploadUrl);
  const createItem = useMutation(api.inventory.create);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrls = useRef(new Set<string>());
  const [photos, setPhotos] = useState<CapturePhoto[]>([]);
  const [location, setLocation] = useState("");
  const [boxOnly, setBoxOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => () => {
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);
  useEffect(() => {
    inputRef.current?.click();
  }, []);

  const uploadPhoto = async (photo: CapturePhoto) => {
    try {
      const storageId = await uploadFile(photo.file, () => generateUploadUrlMutation({}));
      setPhotos((current) => current.map((candidate) =>
        candidate.id === photo.id ? { ...candidate, status: "uploaded", storageId } : candidate,
      ));
    } catch (caught) {
      setPhotos((current) => current.map((candidate) =>
        candidate.id === photo.id ? { ...candidate, status: "failed" } : candidate,
      ));
      setError(getErrorMessage(caught));
    }
  };

  const addFiles = (incoming: File[]) => {
    const accepted = incoming.slice(0, Math.max(0, MAX_PHOTOS_PER_UPLOAD - photos.length));
    if (!accepted.length) return;
    setError("");
    setSuccess("");
    const additions = accepted.map((file): CapturePhoto => {
      const previewUrl = URL.createObjectURL(file);
      previewUrls.current.add(previewUrl);
      return {
        id: crypto.randomUUID(),
        file,
        previewUrl,
        status: "uploading",
      };
    });
    setPhotos((current) => [...current, ...additions]);
    additions.forEach((photo) => void uploadPhoto(photo));
  };

  const removePhoto = (photo: CapturePhoto) => {
    URL.revokeObjectURL(photo.previewUrl);
    previewUrls.current.delete(photo.previewUrl);
    setPhotos((current) => current.filter((candidate) => candidate.id !== photo.id));
  };

  const retryUploads = () => {
    const failed = photos.filter((photo) => photo.status === "failed");
    setError("");
    setPhotos((current) => current.map((photo) =>
      photo.status === "failed" ? { ...photo, status: "uploading" } : photo,
    ));
    failed.forEach((photo) => void uploadPhoto({ ...photo, status: "uploading" }));
  };

  const clearPhotos = () => {
    photos.forEach((photo) => {
      URL.revokeObjectURL(photo.previewUrl);
      previewUrls.current.delete(photo.previewUrl);
    });
    setPhotos([]);
  };

  const save = async (keepGoing: boolean) => {
    const storageIds = photos.flatMap((photo) => photo.storageId ? [photo.storageId] : []);
    if (storageIds.length !== photos.length || !location.trim()) return;
    setBusy(true);
    setError("");
    try {
      await createItem({ storageIds, locationName: location.trim(), boxOnly });
      clearPhotos();
      if (keepGoing) {
        setBoxOnly(false);
        setSuccess("物品已保存，已加入 AI 识别队列。可以继续添加下一件。");
        setBusy(false);
      } else {
        onClose();
      }
    } catch (caught) {
      setError(getErrorMessage(caught));
      setBusy(false);
    }
  };

  const isUploading = photos.some((photo) => photo.status === "uploading");
  const hasFailedUploads = photos.some((photo) => photo.status === "failed");
  const canSave = photos.length > 0 && !isUploading && !hasFailedUploads && Boolean(location.trim());

  return (
    <div className="inventory-sheet-backdrop" role="presentation">
      <section className="inventory-sheet" role="dialog" aria-modal="true" aria-label="添加物品">
        <header><div><h2>添加物品</h2><p>拍摄标签、接口和各个有用的角度。</p></div><button className="inventory-icon-button" aria-label="关闭" disabled={busy || isUploading} onClick={onClose}><X /></button></header>
        <input ref={inputRef} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={(event) => {
          // FileList is live. Copy it before resetting the input or Safari empties it
          // before React gets to the state update.
          const incoming = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          addFiles(incoming);
        }} />
        <div className="inventory-photo-strip">
          {photos.map((photo, index) => (
            <div className="inventory-photo-preview" key={photo.id}>
              <img src={photo.previewUrl} alt={`物品角度 ${index + 1}`} />
              <span className={`inventory-photo-upload-state ${photo.status}`}>
                {photo.status === "uploading" ? <LoaderCircle className="spin" /> : photo.status === "uploaded" ? <CircleCheck /> : <CircleAlert />}
              </span>
              <button aria-label={`移除角度 ${index + 1}`} onClick={() => removePhoto(photo)}><X /></button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS_PER_UPLOAD && <button className="inventory-add-photo" onClick={() => inputRef.current?.click()}><Camera /><span>{photos.length ? "再来一张" : success ? "拍摄下一件物品" : "拍照"}</span></button>}
        </div>
        <label className="inventory-location-field">
          <span>它放在哪里？</span>
          <div><MapPin /><input value={location} list="inventory-locations" placeholder="例如：阁楼、A 箱" onChange={(event) => setLocation(event.target.value)} /></div>
        </label>
        <datalist id="inventory-locations">{suggestions.map((suggestion) => <option key={suggestion._id} value={suggestion.name} />)}</datalist>
        {suggestions.length > 0 && <div className="inventory-location-chips">{suggestions.slice(0, 6).map((suggestion) => <button key={suggestion._id} onClick={() => setLocation(suggestion.name)}>{suggestion.name}</button>)}</div>}
        <label className="inventory-box-toggle">
          <input type="checkbox" checked={boxOnly} onChange={(event) => setBoxOnly(event.target.checked)} />
          <span><PackageOpen /><span><b>仅盒子</b><small>物品不在盒内</small></span></span>
        </label>
        {success && <div className="inventory-success" aria-live="polite"><CircleCheck />{success}</div>}
        {error && <div className="inventory-error"><CircleAlert />{error}</div>}
        {hasFailedUploads ? (
          <button className="inventory-save-button" disabled={busy} onClick={retryUploads}>重试上传</button>
        ) : (
          <div className="inventory-capture-actions">
            <button className="inventory-save-button" disabled={busy || !canSave} onClick={() => void save(true)}>
              {busy || isUploading ? <LoaderCircle className="spin" /> : <Sparkles />}
              {busy ? "正在保存物品…" : isUploading ? "正在上传照片…" : "保存并添加下一件"}
            </button>
            <button className="inventory-finish-button" disabled={busy || !canSave} onClick={() => void save(false)}>保存并完成</button>
          </div>
        )}
      </section>
    </div>
  );
}

function InventoryCard({ item, onOpen }: {
  item: InventoryItemSummary;
  onOpen: () => void;
}) {
  const needsReview = hasTag(item.tags, "needs review");
  const boxOnly = hasTag(item.tags, BOX_ONLY_TAG);
  return (
    <button className="inventory-card" onClick={onOpen}>
      <div className="inventory-card-photo">
        {item.photoUrl ? <img src={item.photoUrl} alt="" /> : <PackageOpen />}
        {item.enrichmentStatus !== "ready" && <span className={`inventory-ai-state ${item.enrichmentStatus}`}><Sparkles />{item.enrichmentStatus === "failed" ? "需要补充" : "识别中"}</span>}
        {item.enrichmentStatus === "ready" && needsReview && <span className="inventory-ai-state review"><CircleAlert />需要复核</span>}
      </div>
      <div className="inventory-card-copy">
        <div className="inventory-card-labels"><span className="inventory-category">{item.category}</span>{boxOnly && <span className="inventory-box-only-label"><PackageOpen />仅盒子</span>}</div>
        <h2>{item.title}</h2>
        {item.description && <p>{item.description}</p>}
        <div className="inventory-card-location"><MapPin />{item.currentLocationName}{item.quantity > 1 && <b>×{item.quantity}</b>}</div>
      </div>
    </button>
  );
}

function DetailSheet({ itemId, onClose }: { itemId: Id<"inventoryItems">; onClose: () => void }) {
  const detail = useQuery(api.inventory.get, { itemId });
  const suggestions = useQuery(api.inventory.locationSuggestions) ?? [];
  const updateDetails = useMutation(api.inventory.updateDetails);
  const move = useMutation(api.inventory.move);
  const setStatus = useMutation(api.inventory.setStatus);
  const generateUploadUrlMutation = useMutation(api.inventory.generateUploadUrl);
  const addPhotos = useMutation(api.inventory.addPhotos);
  const photoInput = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [location, setLocation] = useState("");

  if (detail === undefined) return <div className="inventory-detail-backdrop"><LoadingScreen /></div>;
  if (!detail) return null;
  const { item, photos, events } = detail;

  const saveDetails = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await updateDetails({
        itemId,
        title: String(data.get("title") ?? ""),
        description: String(data.get("description") ?? ""),
        category: String(data.get("category") ?? ""),
        tags: [
          ...String(data.get("tags") ?? "").split(",").filter((tag) => tag.trim().toLocaleLowerCase("en-AU") !== BOX_ONLY_TAG),
          ...(data.get("boxOnly") === "on" ? [BOX_ONLY_TAG] : []),
        ],
        condition: String(data.get("condition") ?? ""),
        quantity: Number(data.get("quantity") ?? 1),
        attributes: item.attributes,
      });
      setEditing(false);
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const moveItem = async () => {
    if (!location.trim()) return;
    setBusy(true);
    setError("");
    try {
      await move({ itemId, locationName: location.trim() });
      setLocation("");
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const uploadMore = async (files: File[]) => {
    if (!files.length) return;
    const availableSlots = MAX_PHOTOS_PER_ITEM - photos.length;
    if (availableSlots <= 0) {
      setError(`每个物品最多可保存 ${MAX_PHOTOS_PER_ITEM} 张照片。`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { storageIds, errors } = await uploadFiles(
        files.slice(0, Math.min(MAX_PHOTOS_PER_UPLOAD, availableSlots)),
        () => generateUploadUrlMutation({}),
      );
      if (storageIds.length > 0) await addPhotos({ itemId, storageIds, rerunEnrichment: true });
      if (errors.length > 0) {
        setError(`有 ${errors.length} / ${errors.length + storageIds.length} 张照片未能添加。${errors[0]}`);
      }
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (status: InventoryStatus) => {
    setBusy(true);
    setError("");
    try {
      await setStatus({ itemId, status });
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="inventory-detail-backdrop">
      <article className="inventory-detail">
        <header className="inventory-detail-header"><button className="inventory-icon-button" onClick={onClose}><ChevronLeft /></button><button className="inventory-icon-button" onClick={() => setEditing(!editing)}><Pencil /></button></header>
        <div className="inventory-detail-photos">
          {photos.map((photo) => photo.url && <img key={photo._id} src={photo.url} alt="物品照片" />)}
          {photos.length < MAX_PHOTOS_PER_ITEM && <button disabled={busy} onClick={() => photoInput.current?.click()}><Camera /><span>添加照片</span></button>}
          <input ref={photoInput} className="visually-hidden" type="file" accept="image/*" capture="environment" multiple onChange={(event) => {
            const incoming = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = "";
            void uploadMore(incoming);
          }} />
        </div>
        {editing ? (
          <form className="inventory-edit-form" onSubmit={saveDetails}>
            <label>名称<input name="title" defaultValue={item.title} /></label>
            <label>描述<textarea name="description" defaultValue={item.description} rows={4} /></label>
            <div className="inventory-form-pair"><label>分类<input name="category" defaultValue={item.category} /></label><label>数量<input name="quantity" type="number" min="1" defaultValue={item.quantity} /></label></div>
            <label>状况<input name="condition" defaultValue={item.condition} /></label>
            <label>标签<input name="tags" defaultValue={item.tags.join(", ")} /></label>
            <label className="inventory-edit-box-toggle"><input name="boxOnly" type="checkbox" defaultChecked={hasTag(item.tags, BOX_ONLY_TAG)} />仅盒子，物品不在盒内</label>
            <button className="inventory-primary" disabled={busy}>保存修改</button>
          </form>
        ) : (
          <div className="inventory-detail-copy">
            <span className="inventory-category">{item.category}</span>
            <h1>{item.title}</h1>
            <p>{item.description || "暂无描述。"}</p>
            <div className="inventory-detail-meta"><span><MapPin />{item.currentLocationName}</span><span>{item.condition}</span><span>数量 {item.quantity}</span>{hasTag(item.tags, BOX_ONLY_TAG) && <span className="box-only"><PackageOpen />仅盒子</span>}</div>
            {item.tags.length > 0 && <div className="inventory-tags">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
            {hasTag(item.tags, "needs review") && <div className="inventory-review-note"><CircleAlert />AI 对部分细节不够确定。有空时请检查名称、照片和属性。</div>}
            {item.attributes.length > 0 && <dl className="inventory-attributes">{item.attributes.map(({ label, value }) => <div key={`${label}-${value}`}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
            {item.enrichmentStatus === "failed" && <div className="inventory-error"><CircleAlert />{item.enrichmentError ?? "AI 识别失败。"}</div>}
            {item.aiSources.length > 0 && <section className="inventory-sources"><h2>识别信息来源</h2>{item.aiSources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title}</a>)}</section>}
          </div>
        )}
        <section className="inventory-move"><h2>移动物品</h2><div><input value={location} list="detail-locations" placeholder="输入新位置" onChange={(event) => setLocation(event.target.value)} /><button disabled={!location.trim() || busy} onClick={() => void moveItem()}>移动</button></div><datalist id="detail-locations">{suggestions.map((suggestion) => <option key={suggestion._id} value={suggestion.name} />)}</datalist></section>
        <section className="inventory-lifecycle"><h2>物品状态</h2><select value={item.status} disabled={busy} onChange={(event) => void changeStatus(event.target.value as InventoryStatus)}><option value="active">在物品中</option><option value="disposed">已丢弃</option><option value="donated">已捐赠</option><option value="sold">已出售</option><option value="lost">已丢失</option></select></section>
        <section className="inventory-history"><h2>历史记录</h2>{events.map((event) => <div key={event._id}><span>{EVENT_LABELS[event.type] ?? event.type.replaceAll("_", " ")}</span><p>{event.fromLocationName && event.toLocationName ? `${event.fromLocationName} → ${event.toLocationName}` : event.note}</p><time>{new Date(event.occurredAt).toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" })}</time></div>)}</section>
        {error && <div className="inventory-error inventory-sticky-error"><CircleAlert />{error}</div>}
      </article>
    </div>
  );
}

function InventoryBrowser() {
  const { signOut } = useAuthActions();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<InventoryStatus>("active");
  const [capturing, setCapturing] = useState(false);
  const [selected, setSelected] = useState<Id<"inventoryItems"> | null>(null);
  const reviewFilterActive = search.trim().toLocaleLowerCase("en-AU") === "needs review";
  const sentinel = useRef<HTMLDivElement>(null);
  const { results, status: pageStatus, loadMore } = usePaginatedQuery(
    api.inventory.list,
    { search: search.trim() || undefined, status },
    { initialNumItems: INVENTORY_PAGE_SIZE },
  );

  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && pageStatus === "CanLoadMore") {
        loadMore(INVENTORY_PAGE_SIZE);
      }
    }, { rootMargin: "300px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore, pageStatus]);

  return (
    <main className="inventory-root">
      <header className="inventory-topbar">
        <div><div className="inventory-logo"><Box /></div><h1>物品清单</h1></div>
        <button className="inventory-icon-button" onClick={() => void signOut()} aria-label="退出登录"><LogOut /></button>
      </header>
      <div className="inventory-search"><Search /><input type="search" value={search} placeholder="搜索所有物品" onChange={(event) => setSearch(event.target.value)} />{search && <button onClick={() => setSearch("")}><X /></button>}</div>
      <div className="inventory-status-tabs">
        <button className={status === "active" ? "active" : ""} onClick={() => setStatus("active")}>在物品中</button>
        <button className={reviewFilterActive ? "active" : ""} onClick={() => setSearch(reviewFilterActive ? "" : "needs review")}>需要复核</button>
        <button className={status !== "active" ? "active" : ""} onClick={() => setStatus(status === "active" ? "disposed" : status)}>已移除</button>
        {status !== "active" && <select value={status} onChange={(event) => setStatus(event.target.value as InventoryStatus)}><option value="disposed">已丢弃</option><option value="donated">已捐赠</option><option value="sold">已出售</option><option value="lost">已丢失</option></select>}
      </div>
      <section className="inventory-grid">
        {results.map((item) => <InventoryCard key={item._id} item={item} onOpen={() => setSelected(item._id)} />)}
      </section>
      {results.length === 0 && pageStatus !== "LoadingFirstPage" && <div className="inventory-empty"><PackageOpen /><h2>{search ? "没有匹配的结果" : "物品清单还是空的"}</h2><p>{search ? "换个关键词或位置试试。" : "拍下第一件想记录的东西吧。"}</p></div>}
      {(pageStatus === "LoadingFirstPage" || pageStatus === "LoadingMore") && <div className="inventory-page-loading"><LoaderCircle className="spin" /></div>}
      <div ref={sentinel} />
      <button className="inventory-fab" onClick={() => setCapturing(true)}><Plus /><span>添加物品</span></button>
      {capturing && <CaptureSheet onClose={() => setCapturing(false)} />}
      {selected && <DetailSheet itemId={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}

export function InventoryExperience() {
  return (
    <>
      <AuthLoading><LoadingScreen /></AuthLoading>
      <Unauthenticated><AuthScreen /></Unauthenticated>
      <Authenticated><AccessGate /></Authenticated>
    </>
  );
}
