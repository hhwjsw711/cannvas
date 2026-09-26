import { CalendarDays, Check, CloudOff, LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DialogBackdrop } from "../components/DialogBackdrop";
import { useTodos } from "../data/DataProvider";
import type { Todo, TodoAssignee, TodoPriority } from "../data/types";
import { errorText } from "../lib/http";

const PEOPLE: Array<{ id: TodoAssignee; name: string; avatar: string }> = [
  { id: "mum", name: "梅宏杰", avatar: "/avatars/mum.png" },
  { id: "dad", name: "胡洪伟", avatar: "/avatars/dad.png" },
];
const PRIORITIES: TodoPriority[] = ["low", "medium", "high"];
const PRIORITY_ORDER: Record<TodoPriority, number> = { high: 0, medium: 1, low: 2 };

function friendlyDate(date: string) {
  const value = new Date(`${date}T00:00:00`);
  return value.toLocaleDateString("zh-CN", { day: "numeric", month: "short" });
}

function sortTodos(left: Todo, right: Todo) {
  if (left.completed !== right.completed) return Number(left.completed) - Number(right.completed);
  if (PRIORITY_ORDER[left.priority] !== PRIORITY_ORDER[right.priority]) {
    return PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority];
  }
  if (left.dueDate && right.dueDate) return left.dueDate.localeCompare(right.dueDate);
  if (left.dueDate) return -1;
  if (right.dueDate) return 1;
  return left.createdAt - right.createdAt;
}

export function TodosApp() {
  const { todos, todosStatus, addTodo, updateTodo, toggleTodo, removeTodo } = useTodos();
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState<TodoAssignee>("dad");
  const [priority, setPriority] = useState<TodoPriority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [listError, setListError] = useState("");
  const [confirmClearFinished, setConfirmClearFinished] = useState(false);
  const [clearing, setClearing] = useState(false);
  // A quick double tap would toggle twice and land back where it started.
  const [toggling, setToggling] = useState<ReadonlySet<string>>(() => new Set());
  const openCount = todos.filter((todo) => !todo.completed).length;
  const completedCount = todos.length - openCount;
  const editingTodo = todos.find((todo) => todo.id === editingId);
  // A stray touch on the backdrop may only close a form with nothing to lose.
  const editorUnchanged = editingId === "new"
    ? !title.trim()
    : editingTodo !== undefined
      && title === editingTodo.title
      && assignee === editingTodo.assignee
      && priority === editingTodo.priority
      && dueDate === (editingTodo.dueDate ?? "");

  const groupedTodos = useMemo(() => Object.fromEntries(
    PEOPLE.map(({ id }) => [id, todos.filter((todo) => todo.assignee === id).sort(sortTodos)]),
  ) as Record<TodoAssignee, Todo[]>, [todos]);

  const openAdd = (selectedAssignee: TodoAssignee = "dad") => {
    setTitle("");
    setAssignee(selectedAssignee);
    setPriority("medium");
    setDueDate("");
    setEditorError("");
    setEditingId("new");
  };

  const openEdit = (todo: Todo) => {
    setTitle(todo.title);
    setAssignee(todo.assignee);
    setPriority(todo.priority);
    setDueDate(todo.dueDate ?? "");
    setEditorError("");
    setEditingId(todo.id);
  };

  const closeEditor = () => {
    if (!saving) setEditingId(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !editingId || saving) return;
    setSaving(true);
    setEditorError("");
    try {
      if (editingId === "new") await addTodo(title.trim(), assignee, priority, dueDate || undefined);
      else await updateTodo(editingId, title.trim(), assignee, priority, dueDate || undefined);
      setEditingId(null);
    } catch (error) {
      setEditorError(`待办保存失败。${errorText(error, "请检查网络后重试。")}`);
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (todo: Todo) => {
    if (toggling.has(todo.id)) return;
    setToggling((current) => new Set(current).add(todo.id));
    setListError("");
    try {
      await toggleTodo(todo.id);
    } catch (error) {
      setListError(`无法更新「${todo.title}」。${errorText(error, "请稍后重试。")}`);
    } finally {
      setToggling((current) => {
        const next = new Set(current);
        next.delete(todo.id);
        return next;
      });
    }
  };

  const clearFinished = async () => {
    setClearing(true);
    setListError("");
    const finished = todos.filter((todo) => todo.completed);
    const results = await Promise.allSettled(finished.map((todo) => removeTodo(todo.id)));
    const failed = results.filter((result) => result.status === "rejected").length;
    if (failed > 0) setListError(`有 ${failed} 条已完成待办清除失败，请稍后重试。`);
    setClearing(false);
    setConfirmClearFinished(false);
  };

  if (todosStatus !== "ready") {
    const loading = todosStatus === "loading";
    return (
      <section className="todos-app todos-app-waiting">
        <div className="todos-waiting" role="status">
          {loading ? <LoaderCircle className="spin" /> : <CloudOff />}
          <strong>{loading ? "正在获取家庭清单…" : "暂时连不上待办列表"}</strong>
          <span>{loading
            ? "马上就好。"
            : "它保存在云端，网络恢复后会自动回来。屏幕上的其他功能不受影响。"}</span>
        </div>
      </section>
    );
  }

  return (
    <section className="todos-app">
      <header className="todos-header">
        <div>
          <p className="eyebrow">家庭清单</p>
          <h1>待办事项</h1>
          <p className="header-note">重要的事，谁来做。</p>
        </div>
        <div className="todo-summary-card">
          <span><strong>{openCount}</strong> 待完成</span>
          <span><strong>{completedCount}</strong> 已完成</span>
        </div>
      </header>

      {listError && <p className="todos-error" role="alert">{listError}</p>}

      <div className="todo-board">
        {PEOPLE.map((person) => {
          const personTodos = groupedTodos[person.id];
          return (
            <section className={`todo-person-column person-${person.id}`} key={person.id}>
              <header className="todo-person-header">
                <img src={person.avatar} alt={person.name} />
                <div className="todo-person-copy"><h2>{person.name}</h2><span>{personTodos.filter((todo) => !todo.completed).length} 待办</span></div>
                <button className="todo-person-add" onClick={() => openAdd(person.id)} aria-label={`为${person.name}添加待办`}><Plus /></button>
              </header>
              <div className="todo-list">
                {personTodos.map((todo) => (
                  <article className={todo.completed ? "todo-card completed" : "todo-card"} key={todo.id}>
                    <button className="todo-check" onClick={() => void toggle(todo)} disabled={toggling.has(todo.id)} aria-label={`${todo.completed ? "重新打开" : "完成"} ${todo.title}`} aria-pressed={todo.completed}>
                      {todo.completed && <Check strokeWidth={4} />}
                    </button>
                    <div className="todo-copy">
                      <strong>{todo.title}</strong>
                      <div className="todo-meta">
                        <span className={`priority-badge ${todo.priority}`}>{todo.priority === "low" ? "低" : todo.priority === "medium" ? "中" : "高"}</span>
                        {todo.dueDate && <span className="due-date"><CalendarDays /> {friendlyDate(todo.dueDate)}</span>}
                      </div>
                    </div>
                    <div className="todo-card-actions">
                      <button onClick={() => openEdit(todo)} aria-label={`编辑${todo.title}`}><Pencil /></button>
                    </div>
                  </article>
                ))}
                {personTodos.length === 0 && <div className="todo-empty"><Check /><span>全部完成</span></div>}
              </div>
            </section>
          );
        })}
        <footer className="todos-actions app-control-palette">
          <button className="button primary" onClick={() => openAdd()}><Plus /> 添加待办</button>
          {completedCount > 0 && (
            <button className="button secondary" onClick={() => setConfirmClearFinished(true)}><Trash2 /> 清除已完成</button>
          )}
        </footer>
      </div>

      {editingId && (
        <DialogBackdrop className="todo-dialog-backdrop" onDismiss={editorUnchanged && !saving ? closeEditor : undefined}>
          <form className="dialog-card todo-editor-card" onSubmit={(event) => void submit(event)}>
            <div className={`dialog-symbol ${editingId === "new" ? "add" : "edit"}`}>{editingId === "new" ? <Plus /> : <Pencil />}</div>
            <h2>{editingId === "new" ? "添加待办" : "编辑待办"}</h2>
            <label className="todo-title-field"><span>做什么？</span><input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus autoComplete="off" autoCapitalize="sentences" enterKeyHint="done" placeholder="输入待办内容" /></label>

            <fieldset className="todo-option-picker assignee-picker">
              <legend>谁来负责？</legend>
              <div>{PEOPLE.map((person) => <button type="button" className={assignee === person.id ? "selected" : ""} key={person.id} onClick={() => setAssignee(person.id)}><img src={person.avatar} alt="" /><span>{person.name}</span></button>)}</div>
            </fieldset>

            <div className="todo-editor-options">
              <fieldset className="todo-option-picker priority-picker">
                <legend>优先级</legend>
                <div>{PRIORITIES.map((value) => <button type="button" className={`${value} ${priority === value ? "selected" : ""}`} key={value} onClick={() => setPriority(value)}>{value === "low" ? "低" : value === "medium" ? "中" : "高"}</button>)}</div>
              </fieldset>
              <label className="todo-due-field"><span>截止日期 <small>选填</small></span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
            </div>

            {editorError && <p className="dialog-error" role="alert">{editorError}</p>}
            <div className="dialog-actions">
              <button type="button" className="button secondary" onClick={closeEditor} disabled={saving}>取消</button>
              <button className="button primary" type="submit" disabled={!title.trim() || saving}>
                {saving ? "正在保存…" : editingId === "new" ? "添加" : "保存修改"}
              </button>
            </div>
          </form>
        </DialogBackdrop>
      )}

      <ConfirmDialog
        open={confirmClearFinished}
        title="清除已完成的待办？"
        confirmLabel={clearing ? "正在清除…" : `清除 ${completedCount} 条`}
        confirmDisabled={clearing}
        onCancel={() => { if (!clearing) setConfirmClearFinished(false); }}
        onConfirm={() => void clearFinished()}
      >
        这会把 {completedCount} 条已勾选的待办从大家的列表中移除。
      </ConfirmDialog>
    </section>
  );
}
