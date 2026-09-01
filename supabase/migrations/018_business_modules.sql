-- ============================================================================
-- 018_business_modules.sql
--
-- General-purpose business dashboard (Phase 5) — Customers/CRM, Projects &
-- Tasks, and Invoices. Purely additive: no existing table is altered.
--
-- Follows the live 999b RLS pattern exactly (same as 017):
--   - school_id on every tenant-owned table
--   - ROW LEVEL SECURITY enabled + school-scoped policies via auth_school_id()
--   - NOT FORCE (owner/definer bypass), same as every tenant table
--
-- ZERO-BEHAVIOR-CHANGE GUARANTEE for existing tenants:
--   - All tables are brand new; nothing existing is modified.
--   - No triggers, no changes to existing policies/seed data.
--   - Only the new business pages (and future features) read/write them.
-- ============================================================================

-- ── 1) CUSTOMERS (CRM: contacts + companies) ───────────────────────────────
create table if not exists customers (
  id            bigint generated always as identity primary key,
  school_id     uuid not null references schools(id) on delete cascade,
  name          text not null,                -- company or contact name
  kind          text not null default 'contact'
                check (kind in ('contact','company')),
  email         text not null default '',
  phone         text not null default '',
  company       text not null default '',     -- company name for contacts
  status        text not null default 'active'
                check (status in ('active','lead','inactive')),
  notes         text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_customers_school on customers(school_id);
alter table customers enable row level security;
create policy "customers_school_scoped" on customers
  for all using (school_id = auth_school_id());

-- ── 2) PROJECTS ─────────────────────────────────────────────────────────────
create table if not exists projects (
  id            bigint generated always as identity primary key,
  school_id     uuid not null references schools(id) on delete cascade,
  name          text not null,
  description   text not null default '',
  status        text not null default 'active'
                check (status in ('active','paused','completed','archived')),
  customer_id   bigint references customers(id) on delete set null,
  start_date    date,
  end_date      date,
  created_by    bigint,                       -- soft ref to teachers.id (no FK)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_projects_school on projects(school_id);
alter table projects enable row level security;
create policy "projects_school_scoped" on projects
  for all using (school_id = auth_school_id());

-- ── 3) PROJECT TASKS ────────────────────────────────────────────────────────
create table if not exists project_tasks (
  id            bigint generated always as identity primary key,
  school_id     uuid not null references schools(id) on delete cascade,
  project_id    bigint not null references projects(id) on delete cascade,
  title         text not null,
  description   text not null default '',
  status        text not null default 'todo'
                check (status in ('todo','in_progress','done','blocked')),
  due_date      date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_tasks_school on project_tasks(school_id);
create index if not exists idx_tasks_project on project_tasks(project_id);
alter table project_tasks enable row level security;
create policy "tasks_school_scoped" on project_tasks
  for all using (school_id = auth_school_id());

-- ── 4) INVOICES ─────────────────────────────────────────────────────────────
create table if not exists invoices (
  id            bigint generated always as identity primary key,
  school_id     uuid not null references schools(id) on delete cascade,
  number        text not null,                -- human invoice number (unique per school)
  customer_id   bigint references customers(id) on delete set null,
  status        text not null default 'draft'
                check (status in ('draft','sent','paid','overdue','cancelled')),
  issue_date    date,
  due_date      date,
  total         numeric(14,2) not null default 0,
  notes         text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_invoices_school on invoices(school_id);
alter table invoices enable row level security;
create policy "invoices_school_scoped" on invoices
  for all using (school_id = auth_school_id());

-- ── 5) INVOICE ITEMS (line items) ───────────────────────────────────────────
create table if not exists invoice_items (
  id            bigint generated always as identity primary key,
  school_id     uuid not null references schools(id) on delete cascade,
  invoice_id    bigint not null references invoices(id) on delete cascade,
  description   text not null,
  quantity      numeric(14,2) not null default 1,
  unit_price    numeric(14,2) not null default 0,
  amount        numeric(14,2) not null default 0
);
create index if not exists idx_invoice_items_school on invoice_items(school_id);
create index if not exists idx_invoice_items_invoice on invoice_items(invoice_id);
alter table invoice_items enable row level security;
create policy "invoice_items_school_scoped" on invoice_items
  for all using (school_id = auth_school_id());

-- ============================================================================
-- END 018_business_modules.sql
-- ============================================================================
