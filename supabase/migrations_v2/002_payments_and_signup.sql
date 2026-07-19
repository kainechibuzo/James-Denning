-- ============================================================================
-- 002_payments_and_signup.sql
-- Adds: payments log table (tenant-isolated, member-scoped) +
--       the atomic "create business + owner" signup function.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PAYMENTS (subs, kit fees, club dues, applicant fees — whatever the tenant
-- charges for, via Paystack or any future provider). Every transaction is
-- logged here regardless of outcome, so this doubles as the audit trail.
-- ---------------------------------------------------------------------------
create table if not exists payments (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references businesses(id) on delete cascade,
  member_id         uuid references members(id) on delete set null, -- null for e.g. applicant fees pre-membership
  application_id    uuid references applications(id) on delete set null,
  purpose           text not null default 'general', -- 'subscription','kit_fee','club_dues','application_fee', tenant-defined
  amount_kobo       bigint not null, -- store minor currency units to avoid float issues (kobo/cents)
  currency           text not null default 'NGN',
  provider          text not null default 'paystack',
  provider_reference text not null, -- Paystack transaction reference
  status            text not null default 'pending' check (status in ('pending','success','failed','refunded')),
  initiated_by      uuid references profiles(id),
  raw_response      jsonb, -- store the provider's verify-payment payload for audit/debugging
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (provider, provider_reference)
);

comment on table payments is 'Every payment attempt is logged here (pending/success/failed/refunded), tenant-isolated, so this is both the ledger and the audit trail.';

create index if not exists idx_payments_business on payments(business_id);
create index if not exists idx_payments_member on payments(member_id);
create index if not exists idx_payments_status on payments(business_id, status);

alter table payments enable row level security;
alter table payments force row level security;

-- A member can see their own payment history
create policy "payments_select_self" on payments
  for select using (
    business_id = current_business_id()
    and exists (select 1 from members m where m.id = member_id and m.profile_id = auth.uid())
  );

-- Staff/admin/owner can see all of their tenant's payments
create policy "payments_select_staff" on payments
  for select using (business_id = current_business_id() and is_staff_or_above());

-- Only the verify-payment edge function (service role, bypasses RLS) or
-- staff should write payment rows — regular members never write directly.
create policy "payments_write_staff" on payments
  for insert with check (business_id = current_business_id() and is_staff_or_above());

create policy "payments_update_staff" on payments
  for update using (business_id = current_business_id() and is_staff_or_above());

-- No delete policy at all: payments are immutable history. Refunds are a new
-- row / status change, never a deletion.

-- ---------------------------------------------------------------------------
-- SIGNUP: create a business + its founding owner profile atomically.
-- Called AFTER a Supabase Auth user has been created client-side
-- (supabase.auth.signUp), passing that new user's uid in as owner_id.
-- SECURITY DEFINER so it can insert into businesses/profiles even though
-- regular users have no direct INSERT policy on those tables.
-- ---------------------------------------------------------------------------
create or replace function create_business_with_owner(
  p_business_name  text,
  p_industry_type  text,
  p_owner_id       uuid,
  p_owner_full_name text,
  p_owner_email    text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
begin
  -- Guard: caller must be creating a profile for themselves (auth.uid()),
  -- not an arbitrary user id — prevents anyone from hijacking someone else's
  -- account into a new business.
  if p_owner_id is distinct from auth.uid() then
    raise exception 'owner_id must match the authenticated caller';
  end if;

  -- Guard: this user must not already belong to a business.
  if exists (select 1 from profiles where id = p_owner_id and business_id is not null) then
    raise exception 'This account is already attached to a business';
  end if;

  insert into businesses (name, industry_type, created_by)
  values (p_business_name, coalesce(p_industry_type, 'general'), p_owner_id)
  returning id into v_business_id;

  insert into profiles (id, business_id, full_name, email, role)
  values (p_owner_id, v_business_id, p_owner_full_name, p_owner_email, 'owner')
  on conflict (id) do update
    set business_id = excluded.business_id,
        role = 'owner',
        full_name = excluded.full_name,
        email = excluded.email;

  return v_business_id;
end;
$$;

-- Only authenticated users may call this (not anon) — you must already have
-- an auth.users row before you can found a business.
revoke all on function create_business_with_owner from public;
grant execute on function create_business_with_owner to authenticated;

-- ---------------------------------------------------------------------------
-- INVITE: staff/owner adds an existing or future user to their business.
-- For a user who hasn't signed up yet, store the invite; when they sign up
-- and confirm the invite token, this attaches them (kept intentionally
-- simple — a fuller invite-token flow can be layered on later).
-- ---------------------------------------------------------------------------
create table if not exists invites (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses(id) on delete cascade,
  email         text not null,
  role          text not null default 'member' check (role in ('admin','staff','member')),
  invited_by    uuid references profiles(id),
  accepted_at   timestamptz,
  created_at    timestamptz not null default now()
);

alter table invites enable row level security;
alter table invites force row level security;

create policy "invites_select_staff" on invites
  for select using (business_id = current_business_id() and is_staff_or_above());

create policy "invites_write_admin" on invites
  for insert with check (business_id = current_business_id() and current_role_in_business() in ('owner','admin'));
