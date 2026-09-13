import { Check, ChevronLeft, ChevronRight, CircleDollarSign, CircleHelp, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { ChoreCategoryPicker } from "../components/ChoreCategoryPicker";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useCannvasData } from "../data/DataProvider";
import type { ChoreCategory } from "../data/types";
import { addDays, dateKey, fromDateKey, money, startOfWeek } from "../lib/dates";

export function ChoresApp() {
  const { chores, completions, addChore, updateChore, removeChore, toggleCompletion } = useCannvasData();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [showAdd, setShowAdd] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [choreToRemove, setChoreToRemove] = useState<string | null>(null);
  const [choreToEdit, setChoreToEdit] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [value, setValue] = useState("0.50");
  const [category, setCategory] = useState<ChoreCategory>("standard");
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const sunday = days[6];
  const isInterestPayday = addDays(sunday, 7).getMonth() !== sunday.getMonth();
  const completionKeys = useMemo(
    () => new Set(completions.map(({ choreId, date }) => `${choreId}:${date}`)),
    [completions],
  );
  const weekDates = new Set(days.map(dateKey));
  const bonusChores = chores.filter((chore) => chore.category === "bonus");
  const standardChores = chores.filter((chore) => chore.category === "standard");
  const earned = completions.reduce((total, completion) => {
    if (!weekDates.has(completion.date)) return total;
    const chore = chores.find((candidate) => candidate.id === completion.choreId);
    return total + (chore?.category === "bonus" ? chore.valueCents : 0);
  }, 0);
  const possible = bonusChores.reduce((total, chore) => total + chore.valueCents * 7, 0);
  const standardDone = completions.filter((completion) => weekDates.has(completion.date) && standardChores.some((chore) => chore.id === completion.choreId)).length;
  const standardPossible = standardChores.length * 7;
  const isThisWeek = dateKey(weekStart) === dateKey(startOfWeek(new Date()));
  const submitChore = async (event: React.FormEvent) => {
    event.preventDefault();
    const valueCents = Math.round(Number(value) * 100);
    if (!name.trim() || !Number.isFinite(valueCents) || valueCents < 0) return;
    await addChore(name.trim(), valueCents, category);
    setName("");
    setValue("0.50");
    setShowAdd(false);
  };

  const submitRename = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!choreToEdit || !name.trim()) return;
    const valueCents = Math.round(Number(value) * 100);
    if (!Number.isFinite(valueCents) || valueCents < 0) return;
    await updateChore(choreToEdit, name.trim(), valueCents, category);
    setChoreToEdit(null);
  };

  const openAdd = () => {
    setName("");
    setValue("0.50");
    setCategory("standard");
    setShowAdd(true);
  };

  const openEdit = (id: string) => {
    const chore = chores.find((candidate) => candidate.id === id);
    if (!chore) return;
    setName(chore.name);
    setValue((chore.valueCents / 100).toFixed(2));
    setCategory(chore.category);
    setChoreToEdit(id);
  };

  return (
    <section className="chores-app">
      <header className="chores-header">
        <div>
          <p className="eyebrow">每周任务</p>
          <h1>家务挑战 <Sparkles className="sparkle" /></h1>
          <p className="header-note">小任务，大成就。</p>
        </div>
        <div className="reward-card">
          <span>本周已获奖励</span>
          <strong>{money(earned)}</strong>
          <div className="reward-progress"><span style={{ width: `${possible ? Math.min(100, (earned / possible) * 100) : 0}%` }} /></div>
          <small>{money(possible)} 可获奖励</small>
          <small className="standard-summary">日常完成 {standardDone}/{standardPossible}</small>
        </div>
      </header>

      {isInterestPayday && (
        <div className="interest-payday-banner" role="status">
          <div className="interest-payday-icon"><CircleDollarSign /></div>
          <div>
            <strong>利息发薪日！</strong>
            <span>{sunday.toLocaleDateString("zh-CN", { day: "numeric", month: "long" })} 是本月最后一个周日。</span>
          </div>
          <div className="interest-payday-rate">
            <strong>10%</strong>
            <span>爸爸银行奖励存入成长罐</span>
          </div>
        </div>
      )}

      <div className="week-toolbar">
        <button className="icon-button" aria-label="上一周" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft /></button>
        <button className="week-label" onClick={() => setWeekStart(startOfWeek(new Date()))}>
          <strong>{isThisWeek ? "本周" : `${weekStart.toLocaleDateString("zh-CN", { day: "numeric", month: "long" })}起`}</strong>
          {!isThisWeek && <span>点击回到本周</span>}
        </button>
        <button className="icon-button" aria-label="下一周" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight /></button>
      </div>

      <div className="chore-board">
        <div className="chore-grid grid-header">
          <div className="chore-title-cell">我的家务</div>
          {days.map((day) => (
            <div className={dateKey(day) === dateKey(new Date()) ? "day-heading today" : "day-heading"} key={dateKey(day)}>
              <span>{day.toLocaleDateString("zh-CN", { weekday: "short" })}</span>
              <strong>{day.getDate()}</strong>
            </div>
          ))}
        </div>

        {chores.map((chore) => (
          <div className="chore-grid chore-row" key={chore.id}>
            <div className="chore-name" style={{ "--chore-color": chore.color } as React.CSSProperties}>
              <span className="chore-dot" />
                <button className="chore-name-button" onClick={() => openEdit(chore.id)} aria-label={`编辑${chore.name}`}>
                <strong>{chore.name}</strong>
                <small><span className={`category-badge ${chore.category}`}>{chore.category === "bonus" ? "奖励" : "日常"}</span>{chore.category === "bonus" ? `${money(chore.valueCents)} 每次` : "日常责任"}</small>
              </button>
            </div>
            {days.map((day) => {
              const dayKey = dateKey(day);
              const checked = completionKeys.has(`${chore.id}:${dayKey}`);
              return (
                <button
                  key={dayKey}
                  className={checked ? "chore-check checked" : "chore-check"}
                  style={{ "--chore-color": chore.color } as React.CSSProperties}
                  onClick={() => void toggleCompletion(chore.id, dayKey)}
                  aria-label={`${checked ? "取消勾选" : "勾选"} ${chore.name} ${day.toLocaleDateString("zh-CN", { weekday: "long" })}`}
                  aria-pressed={checked}
                >
                  <span>{checked && <Check strokeWidth={4} />}</span>
                </button>
              );
            })}
          </div>
        ))}

        {chores.length === 0 && (
          <div className="empty-chores"><Sparkles /><h2>准备开始新的挑战？</h2><p>在下方添加第一个家务。</p></div>
        )}
        <footer className="chores-actions app-control-palette">
          <button className="button primary" onClick={openAdd}><Plus /> 添加家务</button>
          <button className="button secondary pocket-money-info-button" onClick={() => setShowInfo(true)}><CircleHelp /> 零花钱规则</button>
        </footer>
      </div>

      {showAdd && (
        <div className="dialog-backdrop" role="presentation" onPointerDown={() => setShowAdd(false)}>
          <form className="dialog-card add-chore-card chore-editor-card" onSubmit={(event) => void submitChore(event)} onPointerDown={(event) => event.stopPropagation()}>
            <div className="dialog-symbol add"><Plus /></div>
            <h2>添加新家务</h2>
            <ChoreCategoryPicker value={category} onChange={setCategory} />
            <div className="chore-form-fields">
              <label><span>做什么？</span><input type="text" value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" autoCapitalize="sentences" enterKeyHint="done" placeholder="点击输入家务名称" autoFocus /></label>
              {category === "bonus" && <label><span>每次奖励金额</span><div className="money-input"><b>￥</b><input type="text" inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} autoComplete="off" enterKeyHint="done" /></div></label>}
            </div>
            <div className="dialog-actions"><button type="button" className="button secondary" onClick={() => setShowAdd(false)}>取消</button><button className="button primary" type="submit" disabled={!name.trim()}>添加</button></div>
          </form>
        </div>
      )}

      {choreToEdit && (
        <div className="dialog-backdrop" role="presentation" onPointerDown={() => setChoreToEdit(null)}>
          <form className="dialog-card chore-editor-card" onSubmit={(event) => void submitRename(event)} onPointerDown={(event) => event.stopPropagation()}>
            <div className="dialog-symbol edit"><Pencil /></div>
            <h2>编辑家务</h2>
            <ChoreCategoryPicker value={category} onChange={setCategory} />
            <label><span>家务名称</span><input type="text" value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" autoCapitalize="sentences" enterKeyHint="done" autoFocus /></label>
            {category === "bonus" && <label><span>每次奖励金额</span><div className="money-input"><b>￥</b><input type="text" inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} autoComplete="off" enterKeyHint="done" /></div></label>}
            <div className="dialog-actions">
              <button type="button" className="button quiet-danger" onClick={() => setChoreToRemove(choreToEdit)}><Trash2 /> 删除</button>
              <button type="button" className="button secondary" onClick={() => setChoreToEdit(null)}>取消</button>
              <button className="button primary" type="submit" disabled={!name.trim()}>保存</button>
            </div>
          </form>
        </div>
      )}

      {showInfo && (
        <div className="dialog-backdrop" role="presentation" onPointerDown={() => setShowInfo(false)}>
          <section className="dialog-card pocket-money-card" role="dialog" aria-modal="true" aria-labelledby="pocket-money-title" onPointerDown={(event) => event.stopPropagation()}>
            <div className="dialog-symbol info"><CircleHelp /></div>
            <h2 id="pocket-money-title">零花钱规则</h2>
            <div className="category-explanations">
              <div className="standard"><strong>日常</strong><p>每周日常需要完成的家庭责任。每次勾选不单独付费。</p></div>
              <div className="bonus"><strong>奖励</strong><p>可选的额外任务。每次完成勾选即可获得对应金额。</p></div>
            </div>
            <ul>
              <li>每周日下午发零花钱。</li>
              <li>每周 ￥3 分为 ￥1 消费、￥1 成长、￥1 慈善。</li>
              <li>孩子可以自行选择奖励钱存入哪个罐子。</li>
              <li>成长罐每月获得 10% 爸爸银行利息。</li>
            </ul>
            <button className="button primary" onClick={() => setShowInfo(false)}>知道了</button>
          </section>
        </div>
      )}

      <ConfirmDialog open={choreToRemove !== null} title="确定删除这个家务？" confirmLabel="删除" onCancel={() => setChoreToRemove(null)} onConfirm={() => { if (choreToRemove) void removeChore(choreToRemove); setChoreToRemove(null); setChoreToEdit(null); }}>
        这将从任务面板上移除该家务。已有的本周统计数据可能会变化。
      </ConfirmDialog>
    </section>
  );
}
