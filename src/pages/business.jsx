/**
 * Business modules (Phase 5) — general-purpose dashboard for all business
 * types. Customers (CRM), Projects & Tasks, Invoices. Neutral terminology,
 * monochrome branding, school-scoped RLS via the standard db.* layer.
 *
 * Exports:
 *   CustomersPage   — CRM: contacts & companies (create/edit/delete, status)
 *   ProjectsPage    — projects + tasks (kanban-ish list, status flow)
 *   InvoicesPage    — invoices with line items (create/edit, status flow)
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  Building2, CheckCircle2, Circle, CreditCard, Loader2,
  Pencil, Plus, Search, Trash2, Users,
} from "lucide-react";
import { db } from "../supabaseClient.js";
import { C } from "../config/theme.js";
import { useConfirm } from "../contexts/confirm.jsx";
import { Card, Btn, Badge, Modal, Inp, Sel, Spinner, EmptyState, PageHeader } from "../components/ui.jsx";

const fmtMoney = (n) => (n === null || n === undefined || n === "") ? "—"
  : Number(n).toLocaleString("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 });

const fmtNum = (n) => (n === null || n === undefined || n === "") ? "—" : Number(n).toLocaleString();

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMERS (CRM)
// ─────────────────────────────────────────────────────────────────────────────
const CUSTOMER_KINDS = [
  { value: "contact", label: "Contact" },
  { value: "company", label: "Company" },
];
const CUSTOMER_STATUS = [
  { value: "active", label: "Active" },
  { value: "lead", label: "Lead" },
  { value: "inactive", label: "Inactive" },
];
const customerStatusColor = (s) => s === "active" ? C.green : s === "lead" ? C.amber : C.muted;

export function CustomersPage({ ctx }) {
  const { notify } = ctx;
  const confirm = useConfirm();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(null); // null | {edit:null|customer}
  const blank = { name: "", kind: "contact", email: "", phone: "", company: "", status: "active", notes: "" };
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    db.getCustomers().then(({ data }) => { setRows(data || []); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.name.trim()) { notify("Name is required", "error"); return; }
    setSaving(true);
    const { error } = await db.upsertCustomer({
      ...form,
      name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(),
      company: form.company.trim(), notes: form.notes.trim(),
    }, modal?.edit?.id || null);
    setSaving(false);
    if (error) { notify(error.message, "error"); return; }
    notify(modal?.edit ? "Customer updated ✓" : "Customer added ✓");
    setModal(null); setForm(blank); load();
  };

  const del = async (row) => {
    const __ok = await confirm({ title: "Delete Customer?", message: `Delete "${row.name}"? This cannot be undone.`, confirmLabel: "Delete", danger: true, typeToConfirm: "DELETE" });
    if (!__ok) return;
    const { error } = await db.deleteCustomer(row.id);
    if (error) notify(error.message, "error");
    else { notify("Customer deleted", "warn"); load(); }
  };

  const filtered = rows.filter(r =>
    !query || [r.name, r.email, r.phone, r.company].join(" ").toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1000, margin: "0 auto" }}>
      <PageHeader icon={<Users/>} title="Customers"
        subtitle="Your contacts and companies — leads, active relationships, and notes."
        action={<Btn onClick={() => { setModal({ edit: null }); setForm(blank); }}><Plus size={14}/> Add Customer</Btn>}/>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, maxWidth: 420 }}>
        <Search size={16} color={C.muted}/>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search customers…"
          style={{ flex: 1, padding: "10px 14px", border: `1.5px solid ${C.border}`, borderRadius: 10,
            fontSize: 13, background: C.white, color: C.text, outline: "none" }}/>
      </div>

      {loading
        ? <div style={{ padding: 48, textAlign: "center" }}><Spinner text="Loading customers…"/></div>
        : filtered.length === 0
          ? <EmptyState icon={<Users size={28} color={C.muted}/>} title="No customers yet"
              message="Add your first contact or company to start building your customer list."
              action={<Btn onClick={() => { setModal({ edit: null }); setForm(blank); }}><Plus size={14}/> Add Customer</Btn>}/>
          : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filtered.map(r => (
                <Card key={r.id} style={{ padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 14.5, fontWeight: 800, color: C.text }}>{r.name}</span>
                        <Badge color={customerStatusColor(r.status)}>{r.status}</Badge>
                        <Badge color={C.muted}>{r.kind}</Badge>
                      </div>
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap" }}>
                        {r.company && <span><Building2 size={11} style={{ verticalAlign: "text-bottom" }}/> {r.company}</span>}
                        {r.email && <span>{r.email}</span>}
                        {r.phone && <span>{r.phone}</span>}
                      </div>
                      {r.notes && <div style={{ fontSize: 12, color: C.textSoft, marginTop: 5 }}>{r.notes}</div>}
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <Btn xs outline onClick={() => { setModal({ edit: r }); setForm({ ...blank, ...r }); }}><Pencil size={12}/> Edit</Btn>
                      <Btn xs outline color={C.red} onClick={() => del(r)}><Trash2 size={12}/></Btn>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
      }

      {modal && (
        <Modal title={modal.edit ? "Edit Customer" : "Add Customer"} onClose={() => { setModal(null); setForm(blank); }} width={560}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Inp label="Name *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="e.g. Ada Obi"/>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 160px" }}>
                <Sel label="Type" value={form.kind} onChange={v => setForm(f => ({ ...f, kind: v }))} options={CUSTOMER_KINDS}/>
              </div>
              <div style={{ flex: "1 1 160px" }}>
                <Sel label="Status" value={form.status} onChange={v => setForm(f => ({ ...f, status: v }))} options={CUSTOMER_STATUS}/>
              </div>
            </div>
            <Inp label="Email" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="ada@example.com"/>
            <Inp label="Phone" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="+234…"/>
            <Inp label="Company" value={form.company} onChange={v => setForm(f => ({ ...f, company: v }))} placeholder="Company name (for contacts)"/>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: .7, marginBottom: 5 }}>Notes</label>
              <textarea rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Context, preferences, next steps…"
                style={{ width: "100%", padding: "10px 12px", border: `1.5px solid ${C.border}`, borderRadius: 9, fontSize: 13,
                  background: C.white, color: C.text, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }}/>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
              <Btn outline onClick={() => { setModal(null); setForm(blank); }}>Cancel</Btn>
              <Btn color="#111827" onClick={save} disabled={saving}>{saving ? "Saving…" : modal.edit ? "Save changes" : "Add customer"}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PROJECTS & TASKS
// ─────────────────────────────────────────────────────────────────────────────
const PROJECT_STATUS = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
];
const TASK_STATUS = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
  { value: "blocked", label: "Blocked" },
];
const projectStatusColor = (s) => s === "active" ? C.green : s === "paused" ? C.amber : s === "completed" ? C.blue : C.muted;
const taskStatusColor = (s) => s === "done" ? C.green : s === "in_progress" ? C.blue : s === "blocked" ? C.red : C.muted;

export function ProjectsPage({ ctx }) {
  const { notify, user } = ctx;
  const confirm = useConfirm();
  const [projects, setProjects] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pModal, setPModal] = useState(null); // null | {edit:null|project}
  const blankP = { name: "", description: "", status: "active", customer_id: "", start_date: "", end_date: "" };
  const [pForm, setPForm] = useState(blankP);
  const [pSaving, setPSaving] = useState(false);
  const [open, setOpen] = useState(null); // project id with tasks shown
  const [tasks, setTasks] = useState([]);
  const [tModal, setTModal] = useState(null); // null | {edit:null|task, projectId}
  const blankT = { title: "", description: "", status: "todo", due_date: "" };
  const [tForm, setTForm] = useState(blankT);
  const [tSaving, setTSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    db.getProjects().then(({ data }) => { setProjects(data || []); setLoading(false); });
    db.getCustomers().then(({ data }) => setCustomers(data || []));
  }, []);
  useEffect(() => { load(); }, [load]);

  const loadTasks = useCallback((projectId) => {
    db.getProjectTasks(projectId).then(({ data }) => setTasks(data || []));
  }, []);
  const openProject = (p) => { setOpen(open === p.id ? null : p.id); if (open !== p.id) loadTasks(p.id); };

  const saveProject = async () => {
    if (!pForm.name.trim()) { notify("Project name is required", "error"); return; }
    setPSaving(true);
    const { error } = await db.upsertProject({
      ...pForm,
      name: pForm.name.trim(), description: pForm.description.trim(),
      customer_id: pForm.customer_id || null,
      start_date: pForm.start_date || null, end_date: pForm.end_date || null,
      created_by: pModal?.edit ? undefined : (user?.teacher_db_id || null),
    }, pModal?.edit?.id || null);
    setPSaving(false);
    if (error) { notify(error.message, "error"); return; }
    notify(pModal?.edit ? "Project updated ✓" : "Project created ✓");
    setPModal(null); setPForm(blankP); load();
  };

  const delProject = async (p) => {
    const __ok = await confirm({ title: "Delete Project?", message: `Delete "${p.name}" and all its tasks?`, confirmLabel: "Delete", danger: true, typeToConfirm: "DELETE" });
    if (!__ok) return;
    const { error } = await db.deleteProject(p.id);
    if (error) notify(error.message, "error");
    else { notify("Project deleted", "warn"); load(); setOpen(null); }
  };

  const saveTask = async () => {
    if (!tForm.title.trim()) { notify("Task title is required", "error"); return; }
    setTSaving(true);
    const { error } = await db.upsertProjectTask({
      ...tForm,
      project_id: tModal.projectId,
      title: tForm.title.trim(), description: tForm.description.trim(),
      due_date: tForm.due_date || null,
    }, tModal?.edit?.id || null);
    setTSaving(false);
    if (error) { notify(error.message, "error"); return; }
    notify(tModal?.edit ? "Task updated ✓" : "Task added ✓");
    setTModal(null); setTForm(blankT); loadTasks(tModal.projectId);
  };

  const delTask = async (t) => {
    const { error } = await db.deleteProjectTask(t.id);
    if (error) notify(error.message, "error");
    else { notify("Task deleted", "warn"); loadTasks(t.project_id); }
  };

  const setTaskStatus = async (t, status) => {
    const { error } = await db.upsertProjectTask({ ...t, status }, t.id);
    if (error) notify(error.message, "error");
    else loadTasks(t.project_id);
  };

  const customerName = (id) => {
    const c = customers.find(x => x.id === id);
    return c ? (c.company || c.name) : null;
  };

  const taskCounts = (pid) => {
    const t = tasks.filter(x => x.project_id === pid);
    return { total: t.length, done: t.filter(x => x.status === "done").length };
  };

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1000, margin: "0 auto" }}>
      <PageHeader icon={<CheckCircle2/>} title="Projects & Tasks"
        subtitle="Plan work, track tasks, and keep your team moving."
        action={<Btn onClick={() => { setPModal({ edit: null }); setPForm(blankP); }}><Plus size={14}/> New Project</Btn>}/>

      {loading
        ? <div style={{ padding: 48, textAlign: "center" }}><Spinner text="Loading projects…"/></div>
        : projects.length === 0
          ? <EmptyState icon={<CheckCircle2 size={28} color={C.muted}/>} title="No projects yet"
              message="Create your first project and break it into tasks."
              action={<Btn onClick={() => { setPModal({ edit: null }); setPForm(blankP); }}><Plus size={14}/> New Project</Btn>}/>
          : <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {projects.map(p => {
                const { total, done } = taskCounts(p.id);
                const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                return (
                  <Card key={p.id} style={{ padding: 18 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{p.name}</span>
                          <Badge color={projectStatusColor(p.status)}>{p.status}</Badge>
                          {customerName(p.customer_id) && <Badge color={C.muted}>{customerName(p.customer_id)}</Badge>}
                        </div>
                        {p.description && <div style={{ fontSize: 12.5, color: C.textSoft, marginTop: 5, lineHeight: 1.5 }}>{p.description}</div>}
                        <div style={{ fontSize: 12, color: C.muted, marginTop: 5 }}>
                          {total > 0 ? `${done}/${total} tasks done` : "No tasks yet"}
                          {p.start_date && <> · {p.start_date}{p.end_date ? ` → ${p.end_date}` : ""}</>}
                        </div>
                        {total > 0 && (
                          <div style={{ marginTop: 10, background: C.offWhite, borderRadius: 8, height: 8, overflow: "hidden", border: `1px solid ${C.border}` }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: pct >= 100 ? C.green : C.blue, borderRadius: 8 }}/>
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <Btn xs outline onClick={() => openProject(p)}>{open === p.id ? "Close" : "Tasks"}</Btn>
                        <Btn xs outline onClick={() => { setPModal({ edit: p }); setPForm({ ...blankP, ...p, customer_id: p.customer_id || "" }); }}><Pencil size={12}/> Edit</Btn>
                        <Btn xs outline color={C.red} onClick={() => delProject(p)}><Trash2 size={12}/></Btn>
                      </div>
                    </div>

                    {open === p.id && (
                      <div style={{ marginTop: 14, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: .6 }}>Tasks</span>
                          <Btn xs color="#111827" onClick={() => { setTModal({ edit: null, projectId: p.id }); setTForm(blankT); }}><Plus size={12}/> Add Task</Btn>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {tasks.filter(t => t.project_id === p.id).length === 0 && (
                            <div style={{ fontSize: 12.5, color: C.light, textAlign: "center", padding: 12 }}>No tasks yet — add the first one.</div>
                          )}
                          {tasks.filter(t => t.project_id === p.id).map(t => (
                            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                              background: C.white, border: `1px solid ${C.borderLight}`, borderRadius: 8 }}>
                              <button onClick={() => setTaskStatus(t, t.status === "done" ? "todo" : "done")}
                                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: t.status === "done" ? C.green : C.light }}>
                                {t.status === "done" ? <CheckCircle2 size={16}/> : <Circle size={16}/>}
                              </button>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, textDecoration: t.status === "done" ? "line-through" : "none" }}>{t.title}</div>
                                {t.due_date && <div style={{ fontSize: 11, color: C.light }}>Due {t.due_date}</div>}
                              </div>
                              <Sel label="" value={t.status} onChange={v => setTaskStatus(t, v)} options={TASK_STATUS}/>
                              <Btn xs outline onClick={() => { setTModal({ edit: t, projectId: p.id }); setTForm({ ...blankT, ...t }); }}><Pencil size={12}/></Btn>
                              <Btn xs outline color={C.red} onClick={() => delTask(t)}><Trash2 size={12}/></Btn>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
      }

      {pModal && (
        <Modal title={pModal.edit ? "Edit Project" : "New Project"} onClose={() => { setPModal(null); setPForm(blankP); }} width={560}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Inp label="Project name *" value={pForm.name} onChange={v => setPForm(f => ({ ...f, name: v }))} placeholder="e.g. Website redesign"/>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: .7, marginBottom: 5 }}>Description</label>
              <textarea rows={3} value={pForm.description} onChange={e => setPForm(f => ({ ...f, description: e.target.value }))}
                placeholder="What is this project about?"
                style={{ width: "100%", padding: "10px 12px", border: `1.5px solid ${C.border}`, borderRadius: 9, fontSize: 13,
                  background: C.white, color: C.text, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }}/>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 160px" }}>
                <Sel label="Status" value={pForm.status} onChange={v => setPForm(f => ({ ...f, status: v }))} options={PROJECT_STATUS}/>
              </div>
              <div style={{ flex: "1 1 200px" }}>
                <Sel label="Customer (optional)" value={pForm.customer_id} onChange={v => setPForm(f => ({ ...f, customer_id: v }))}
                  options={[{ value: "", label: "None" }, ...customers.map(c => ({ value: String(c.id), label: c.company || c.name }))]}/>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 140px" }}><Inp label="Start date" type="date" value={pForm.start_date} onChange={v => setPForm(f => ({ ...f, start_date: v }))}/></div>
              <div style={{ flex: "1 1 140px" }}><Inp label="End date" type="date" value={pForm.end_date} onChange={v => setPForm(f => ({ ...f, end_date: v }))}/></div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
              <Btn outline onClick={() => { setPModal(null); setPForm(blankP); }}>Cancel</Btn>
              <Btn color="#111827" onClick={saveProject} disabled={pSaving}>{pSaving ? "Saving…" : pModal.edit ? "Save changes" : "Create project"}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {tModal && (
        <Modal title={tModal.edit ? "Edit Task" : "Add Task"} onClose={() => { setTModal(null); setTForm(blankT); }} width={480}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Inp label="Task title *" value={tForm.title} onChange={v => setTForm(f => ({ ...f, title: v }))} placeholder="e.g. Design homepage"/>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: .7, marginBottom: 5 }}>Description</label>
              <textarea rows={3} value={tForm.description} onChange={e => setTForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Details…"
                style={{ width: "100%", padding: "10px 12px", border: `1.5px solid ${C.border}`, borderRadius: 9, fontSize: 13,
                  background: C.white, color: C.text, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }}/>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 150px" }}>
                <Sel label="Status" value={tForm.status} onChange={v => setTForm(f => ({ ...f, status: v }))} options={TASK_STATUS}/>
              </div>
              <div style={{ flex: "1 1 140px" }}><Inp label="Due date" type="date" value={tForm.due_date} onChange={v => setTForm(f => ({ ...f, due_date: v }))}/></div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
              <Btn outline onClick={() => { setTModal(null); setTForm(blankT); }}>Cancel</Btn>
              <Btn color="#111827" onClick={saveTask} disabled={tSaving}>{tSaving ? "Saving…" : tModal.edit ? "Save changes" : "Add task"}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INVOICES
// ─────────────────────────────────────────────────────────────────────────────
const INVOICE_STATUS = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "cancelled", label: "Cancelled" },
];
const invoiceStatusColor = (s) => s === "paid" ? C.green : s === "overdue" ? C.red : s === "sent" ? C.blue : s === "cancelled" ? C.muted : C.amber;

export function InvoicesPage({ ctx }) {
  const { notify } = ctx;
  const confirm = useConfirm();
  const [rows, setRows] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | {edit:null|invoice}
  const blank = { number: "", customer_id: "", status: "draft", issue_date: "", due_date: "", notes: "" };
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null); // invoice with items
  const [items, setItems] = useState([]);
  const [itemForm, setItemForm] = useState({ description: "", quantity: "1", unit_price: "" });
  const [itemSaving, setItemSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    db.getInvoices().then(({ data }) => { setRows(data || []); setLoading(false); });
    db.getCustomers().then(({ data }) => setCustomers(data || []));
  }, []);
  useEffect(() => { load(); }, [load]);

  const loadDetail = useCallback((id) => {
    db.getInvoice(id).then(({ data }) => { if (data) { setDetail(data); setItems(data.invoice_items || []); } });
  }, []);

  const nextNumber = () => {
    const max = rows.reduce((m, r) => {
      const n = parseInt(String(r.number).replace(/[^0-9]/g, ""), 10);
      return isNaN(n) ? m : Math.max(m, n);
    }, 0);
    return `INV-${String(max + 1).padStart(4, "0")}`;
  };

  const save = async () => {
    if (!form.number.trim()) { notify("Invoice number is required", "error"); return; }
    setSaving(true);
    const { error } = await db.upsertInvoice({
      ...form,
      number: form.number.trim(), customer_id: form.customer_id || null,
      issue_date: form.issue_date || null, due_date: form.due_date || null, notes: form.notes.trim(),
    }, modal?.edit?.id || null);
    setSaving(false);
    if (error) { notify(error.message, "error"); return; }
    notify(modal?.edit ? "Invoice updated ✓" : "Invoice created ✓");
    setModal(null); setForm(blank); load();
  };

  const del = async (row) => {
    const __ok = await confirm({ title: "Delete Invoice?", message: `Delete ${row.number}? This cannot be undone.`, confirmLabel: "Delete", danger: true, typeToConfirm: "DELETE" });
    if (!__ok) return;
    const { error } = await db.deleteInvoice(row.id);
    if (error) notify(error.message, "error");
    else { notify("Invoice deleted", "warn"); load(); }
  };

  const setStatus = async (row, status) => {
    const { error } = await db.upsertInvoice({ ...row, status }, row.id);
    if (error) notify(error.message, "error");
    else { notify(`Invoice ${status}`); load(); }
  };

  const addItem = async () => {
    if (!detail) return;
    if (!itemForm.description.trim()) { notify("Item description is required", "error"); return; }
    setItemSaving(true);
    const qty = parseFloat(itemForm.quantity) || 1;
    const price = parseFloat(itemForm.unit_price) || 0;
    const { error } = await db.upsertInvoiceItem({
      invoice_id: detail.id, description: itemForm.description.trim(),
      quantity: qty, unit_price: price, amount: qty * price,
    });
    setItemSaving(false);
    if (error) { notify(error.message, "error"); return; }
    setItemForm({ description: "", quantity: "1", unit_price: "" });
    loadDetail(detail.id);
  };

  const delItem = async (item) => {
    const { error } = await db.deleteInvoiceItem(item.id);
    if (error) notify(error.message, "error");
    else loadDetail(detail.id);
  };

  const total = items.reduce((a, i) => a + (parseFloat(i.amount) || 0), 0);

  const customerName = (id) => {
    const c = customers.find(x => x.id === id);
    return c ? (c.company || c.name) : "—";
  };

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1000, margin: "0 auto" }}>
      <PageHeader icon={<CreditCard/>} title="Invoices"
        subtitle="Create, send, and track invoices to your customers."
        action={<Btn onClick={() => { setModal({ edit: null }); setForm({ ...blank, number: nextNumber(), issue_date: new Date().toISOString().slice(0, 10) }); }}><Plus size={14}/> New Invoice</Btn>}/>

      {loading
        ? <div style={{ padding: 48, textAlign: "center" }}><Spinner text="Loading invoices…"/></div>
        : rows.length === 0
          ? <EmptyState icon={<CreditCard size={28} color={C.muted}/>} title="No invoices yet"
              message="Create your first invoice to bill a customer."
              action={<Btn onClick={() => { setModal({ edit: null }); setForm({ ...blank, number: nextNumber(), issue_date: new Date().toISOString().slice(0, 10) }); }}><Plus size={14}/> New Invoice</Btn>}/>
          : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {rows.map(r => (
                <button key={r.id} onClick={() => { setDetail(r); loadDetail(r.id); }}
                  style={{ background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 14, padding: "14px 18px",
                    cursor: "pointer", textAlign: "left", width: "100%", display: "flex", justifyContent: "space-between",
                    gap: 12, alignItems: "center", transition: "all .15s" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = C.blue; e.currentTarget.style.boxShadow = C.shadowMd; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.boxShadow = "none"; }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{r.number}</div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
                      {customerName(r.customer_id)} · {r.issue_date || "—"}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{fmtMoney(r.total)}</span>
                    {invoiceStatusColor(r.status) && <Badge color={invoiceStatusColor(r.status)}>{r.status}</Badge>}
                  </div>
                </button>
              ))}
            </div>
      }

      {modal && (
        <Modal title={modal.edit ? "Edit Invoice" : "New Invoice"} onClose={() => { setModal(null); setForm(blank); }} width={560}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Inp label="Invoice number *" value={form.number} onChange={v => setForm(f => ({ ...f, number: v }))} placeholder="INV-0001"/>
            <Sel label="Customer (optional)" value={form.customer_id} onChange={v => setForm(f => ({ ...f, customer_id: v }))}
              options={[{ value: "", label: "None" }, ...customers.map(c => ({ value: String(c.id), label: c.company || c.name }))]}/>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 150px" }}><Inp label="Issue date" type="date" value={form.issue_date} onChange={v => setForm(f => ({ ...f, issue_date: v }))}/></div>
              <div style={{ flex: "1 1 150px" }}><Inp label="Due date" type="date" value={form.due_date} onChange={v => setForm(f => ({ ...f, due_date: v }))}/></div>
            </div>
            <Sel label="Status" value={form.status} onChange={v => setForm(f => ({ ...f, status: v }))} options={INVOICE_STATUS}/>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: .7, marginBottom: 5 }}>Notes</label>
              <textarea rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Payment terms, thanks, details…"
                style={{ width: "100%", padding: "10px 12px", border: `1.5px solid ${C.border}`, borderRadius: 9, fontSize: 13,
                  background: C.white, color: C.text, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }}/>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
              <Btn outline onClick={() => { setModal(null); setForm(blank); }}>Cancel</Btn>
              <Btn color="#111827" onClick={save} disabled={saving}>{saving ? "Saving…" : modal.edit ? "Save changes" : "Create invoice"}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {detail && (
        <Modal title={detail.number} onClose={() => setDetail(null)} width={640}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Badge color={invoiceStatusColor(detail.status)}>{detail.status}</Badge>
              <span style={{ fontSize: 12.5, color: C.muted }}>{customerName(detail.customer_id)} · {detail.issue_date || "—"}</span>
            </div>

            {/* Line items */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: .7, marginBottom: 8 }}>Line items</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {items.length === 0 && <div style={{ fontSize: 12.5, color: C.light }}>No items yet.</div>}
                {items.map(i => (
                  <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13,
                    background: C.white, border: `1px solid ${C.borderLight}`, borderRadius: 8, padding: "8px 12px" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: C.text }}>{i.description}</div>
                      <div style={{ fontSize: 11.5, color: C.muted }}>{fmtNum(i.quantity)} × {fmtMoney(i.unit_price)}</div>
                    </div>
                    <span style={{ fontWeight: 800, color: C.text }}>{fmtMoney(i.amount)}</span>
                    <Btn xs outline color={C.red} onClick={() => delItem(i)}><Trash2 size={12}/></Btn>
                  </div>
                ))}
              </div>
            </div>

            {/* Add item */}
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <input value={itemForm.description} onChange={e => setItemForm(f => ({ ...f, description: e.target.value }))} placeholder="Description"
                  style={{ flex: "2 1 180px", padding: "9px 12px", border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 13, background: C.white, color: C.text, outline: "none" }}/>
                <input inputMode="numeric" value={itemForm.quantity} onChange={e => setItemForm(f => ({ ...f, quantity: e.target.value }))} placeholder="Qty"
                  style={{ flex: "0 1 70px", padding: "9px 12px", border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 13, background: C.white, color: C.text, outline: "none" }}/>
                <input inputMode="numeric" value={itemForm.unit_price} onChange={e => setItemForm(f => ({ ...f, unit_price: e.target.value }))} placeholder="Price"
                  style={{ flex: "0 1 100px", padding: "9px 12px", border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 13, background: C.white, color: C.text, outline: "none" }}/>
                <Btn color="#111827" onClick={addItem} disabled={itemSaving}>{itemSaving ? <Loader2 size={14} style={{ animation: "spin .7s linear infinite" }}/> : "Add"}</Btn>
              </div>
            </div>

            {/* Total */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: .6 }}>Total</span>
              <span style={{ fontSize: 20, fontWeight: 900, color: C.text }}>{fmtMoney(total)}</span>
            </div>
            {detail.notes && <div style={{ fontSize: 12.5, color: C.textSoft, lineHeight: 1.5 }}>{detail.notes}</div>}

            {/* Status actions */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
              {detail.status === "draft" && <Btn sm outline color={C.blue} onClick={() => { setStatus(detail, "sent"); loadDetail(detail.id); }}>Mark sent</Btn>}
              {(detail.status === "sent" || detail.status === "overdue") && <Btn sm color={C.green} onClick={() => { setStatus(detail, "paid"); loadDetail(detail.id); }}><CheckCircle2 size={13}/> Mark paid</Btn>}
              {(detail.status === "sent") && <Btn sm outline color={C.red} onClick={() => { setStatus(detail, "overdue"); loadDetail(detail.id); }}>Mark overdue</Btn>}
              {detail.status !== "cancelled" && detail.status !== "paid" && <Btn sm outline color={C.red} onClick={() => { setStatus(detail, "cancelled"); loadDetail(detail.id); }}>Cancel</Btn>}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
