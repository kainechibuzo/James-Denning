-- Restrict JD conversations and operational records to their owner and workspace admins.
-- Edge Functions use the service role after validating the caller; authenticated clients are read-only.

drop policy if exists jd_conversations_select on public.jd_conversations;
create policy jd_conversations_select on public.jd_conversations
  for select to authenticated
  using (
    created_by = (select auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.school_id = jd_conversations.school_id
        and p.role = 'admin'
    )
  );

drop policy if exists jd_conversations_update on public.jd_conversations;

drop policy if exists jd_messages_select on public.jd_messages;
create policy jd_messages_select on public.jd_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.jd_conversations c
      where c.id = jd_messages.conversation_id
        and c.school_id = jd_messages.school_id
        and (
          c.created_by = (select auth.uid())
          or exists (
            select 1 from public.profiles p
            where p.id = (select auth.uid())
              and p.school_id = jd_messages.school_id
              and p.role = 'admin'
          )
        )
    )
  );

drop policy if exists jd_messages_insert on public.jd_messages;

drop policy if exists jd_runs_select on public.jd_automation_runs;
create policy jd_runs_select on public.jd_automation_runs
  for select to authenticated
  using (
    requested_by = (select auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.school_id = jd_automation_runs.school_id
        and p.role = 'admin'
    )
  );

drop policy if exists jd_runs_insert on public.jd_automation_runs;

drop policy if exists jd_steps_select on public.jd_automation_steps;
create policy jd_steps_select on public.jd_automation_steps
  for select to authenticated
  using (
    exists (
      select 1 from public.jd_automation_runs r
      where r.id = jd_automation_steps.run_id
        and r.school_id = jd_automation_steps.school_id
        and (
          r.requested_by = (select auth.uid())
          or exists (
            select 1 from public.profiles p
            where p.id = (select auth.uid())
              and p.school_id = jd_automation_steps.school_id
              and p.role = 'admin'
          )
        )
    )
  );

drop policy if exists jd_approvals_select on public.jd_approvals;
create policy jd_approvals_select on public.jd_approvals
  for select to authenticated
  using (
    requested_by = (select auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.school_id = jd_approvals.school_id
        and p.role = 'admin'
    )
  );

drop policy if exists jd_audit_select on public.jd_audit_events;
create policy jd_audit_select on public.jd_audit_events
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.school_id = jd_audit_events.school_id
        and p.role = 'admin'
    )
  );

-- All chat/run writes go through the authenticated Edge Function, never directly from a browser.
revoke insert, update, delete on public.jd_conversations from authenticated;
revoke insert, update, delete on public.jd_messages from authenticated;
revoke insert, update, delete on public.jd_automation_runs from authenticated;
revoke insert, update, delete on public.jd_automation_steps from authenticated;
revoke insert, update, delete on public.jd_approvals from authenticated;
revoke insert, update, delete on public.jd_audit_events from authenticated;

grant select on public.jd_conversations, public.jd_messages,
  public.jd_automation_runs, public.jd_automation_steps,
  public.jd_approvals, public.jd_audit_events to authenticated;
