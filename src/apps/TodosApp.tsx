import { CalendarDays, Check, Pencil, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useCannvasData } from "../data/DataProvider";
import type { Todo, TodoAssignee, TodoPriority } from "../data/types";

const PEOPLE: Array<{ id: TodoAssignee; name: string; avatar: string }> = [
  { id: "mum", name: "妈妈", avatar: "/avatars/mum.png" },
  { id: "josh", name: "孩子", avatar: "/avatars/josh.png" },
  { id: "dad", name: "爸爸", avatar: "/avatars/dad.png" },
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
  const { todos, addTodo, updateTodo, toggleTodo } = useCannvasData();
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState<TodoAssignee>("josh");
  const [priority, setPriority] = useState<TodoPriority>("medium");
  const [dueDate, setDueDate] = useState("");
  const openCount = todos.filter((todo) => !todo.completed).length;
  const completedCount = todos.length - openCount;

  const groupedTodos = useMemo(() => Object.fromEntries(
    PEOPLE.map(({ id }) => [id, todos.filter((todo) => todo.assignee === id).sort(sortTodos)]),
  ) as Record<TodoAssignee, Todo[]>, [todos]);

  const openAdd = (selectedAssignee: TodoAssignee = "josh") => {
    setTitle("");
    setAssignee(selectedAssignee);
    setPriority("medium");
    setDueDate("");
    setEditingId("new");
  };

  const openEdit = (todo: Todo) => {
    setTitle(todo.title);
    setAssignee(todo.assignee);
    setPriority(todo.priority);
    setDueDate(todo.dueDate ?? "");
    setEditingId(todo.id);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !editingId) return;
    if (editingId === "new") await addTodo(title.trim(), assignee, priority, dueDate || undefined);
    else await updateTodo(editingId, title.trim(), assignee, priority, dueDate || undefined);
    setEditingId(null);
  };

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
                    <button className="todo-check" onClick={() => void toggleTodo(todo.id)} aria-label={`${todo.completed ? "重新打开" : "完成"} ${todo.title}`} aria-pressed={todo.completed}>
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
        </footer>
      </div>

      {editingId && (
        <div className="dialog-backdrop todo-dialog-backdrop" role="presentation" onPointerDown={() => setEditingId(null)}>
          <form className="dialog-card todo-editor-card" onSubmit={(event) => void submit(event)} onPointerDown={(event) => event.stopPropagation()}>
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

            <div className="dialog-actions"><button type="button" className="button secondary" onClick={() => setEditingId(null)}>取消</button><button className="button primary" type="submit" disabled={!title.trim()}>{editingId === "new" ? "添加" : "保存"}</button></div>
          </form>
        </div>
      )}

    </section>
  );
}
