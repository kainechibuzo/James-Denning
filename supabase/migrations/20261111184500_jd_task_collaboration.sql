-- JD-B02-06: tenant-scoped operational task collaboration.
-- Notes and mentions are internal workspace records; no external notifications are sent.

create table if not exists public.jd_task_comments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  task_id uuid not null references public.jd_operational_tasks(id) on delete cascade,
  parent_comment_id uuid references public.jd_task_comments(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (length(trim(body)) between 1 and 2000),
  mentions uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now(),
  check (cardinality(mentions) <= 10)
);
create index if not exists jd_task_comments_task_timeline_idx
  on public.jd_task_comments(school_id, task_id, created_at asc);
create index if not exists jd_task_comments_author_idx
  on public.jd_task_comments(school_id, author_id, created_at desc);

alter table public.jd_task_comments enable row level security;
revoke all on public.jd_task_comments from anon, authenticated;
grant select, insert, update, delete on public.jd_task_comments to service_role;

create or replace function public.jd_add_task_comment(
  p_actor_id uuid,
  p_task_id uuid,
  p_body text,
  p_mentions uuid[] default '{}'::uuid[],
  p_parent_comment_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_school uuid;
  v_task_school uuid;
  v_comment public.jd_task_comments%rowtype;
  v_mentions uuid[] := coalesce(p_mentions, '{}'::uuid[]);
begin
  select school_id into v_school
  from public.profiles
  where id=p_actor_id and role in ('admin','manager');

  if v_school is null then
    raise exception 'Manager permission required' using errcode='42501';
  end if;

  if length(trim(coalesce(p_body,''))) not between 1 and 2000
     or cardinality(v_mentions)>10 then
    raise exception 'Comment body or mention list is invalid' using errcode='22023';
  end if;

  select school_id into v_task_school
  from public.jd_operational_tasks
  where id=p_task_id;

  if v_task_school is distinct from v_school then
    raise exception 'Operational task not found' using errcode='P0002';
  end if;

  if exists (
    select 1 from unnest(v_mentions) as mention(mention_id)
    left join public.profiles p on p.id=mention.mention_id and p.school_id=v_school
    where p.id is null
  ) then
    raise exception 'Every mentioned member must belong to this workspace' using errcode='42501';
  end if;

  if p_parent_comment_id is not null and not exists (
    select 1 from public.jd_task_comments
    where id=p_parent_comment_id and school_id=v_school and task_id=p_task_id
  ) then
    raise exception 'Parent comment not found for this task' using errcode='P0002';
  end if;

  insert into public.jd_task_comments(school_id,task_id,parent_comment_id,author_id,body,mentions)
  values(v_school,p_task_id,p_parent_comment_id,p_actor_id,trim(p_body),v_mentions)
  returning * into v_comment;

  insert into public.jd_audit_events(school_id,actor_id,event_type,event_json)
  values(v_school,p_actor_id,'task.comment.created',jsonb_build_object(
    'task_id',p_task_id,
    'comment_id',v_comment.id,
    'parent_comment_id',p_parent_comment_id,
    'mention_count',cardinality(v_mentions)
  ));

  return jsonb_build_object(
    'id',v_comment.id,
    'task_id',v_comment.task_id,
    'parent_comment_id',v_comment.parent_comment_id,
    'author_id',v_comment.author_id,
    'body',v_comment.body,
    'mentions',to_jsonb(v_comment.mentions),
    'created_at',v_comment.created_at
  );
end;
$$;

revoke all on function public.jd_add_task_comment(uuid,uuid,text,uuid[],uuid) from public, anon, authenticated;
grant execute on function public.jd_add_task_comment(uuid,uuid,text,uuid[],uuid) to service_role;
