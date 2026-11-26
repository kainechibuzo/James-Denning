-- Atomic, idempotent chat submission using the existing message/run tables.
-- Rollback: drop function jd_submit_chat_request(uuid,uuid,uuid,text,text,text,jsonb,jsonb,text);
-- then drop the two jd_messages_* indexes below. Keep content_json for history.
create unique index if not exists jd_messages_client_request
  on public.jd_messages (school_id, sender_id, (content_json->>'client_request_id'))
  where role='user' and content_json ? 'client_request_id';
create unique index if not exists jd_messages_interaction_answer
  on public.jd_messages (school_id, conversation_id, (content_json->'interaction'->>'messageId'), (content_json->'interaction'->>'blockId'))
  where role='user' and content_json ? 'interaction';

create or replace function public.jd_submit_chat_request(
 p_school_id uuid, p_actor_id uuid, p_conversation_id uuid,
 p_request_id text, p_message text, p_risk text,
 p_interaction jsonb default null, p_expected_response jsonb default null, p_trigger_type text default 'chat'
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
 v_conversation public.jd_conversations;
 v_existing public.jd_messages;
 v_parent public.jd_messages;
 v_message public.jd_messages;
 v_run public.jd_automation_runs;
 v_role text;
begin
 if p_request_id is null or length(p_request_id) not between 1 and 120 or length(p_message) not between 1 and 12000 or p_risk not in ('routine','approval_required') or p_trigger_type not in ('chat','upload') then
  raise exception 'Invalid chat request' using errcode='22023';
 end if;
 select role into v_role from public.profiles where id=p_actor_id and school_id=p_school_id;
 if v_role is null then raise exception 'Workspace access denied' using errcode='42501'; end if;
 -- Serialize concurrent retries even when the first request creates a chat.
 perform pg_advisory_xact_lock(hashtextextended(p_school_id::text||':'||p_actor_id::text||':'||p_request_id,0));
 select * into v_existing from public.jd_messages where school_id=p_school_id and sender_id=p_actor_id and role='user' and content_json->>'client_request_id'=p_request_id;
 if found then
  if v_existing.content<>p_message or (v_existing.content_json->'interaction') is distinct from p_interaction or (p_conversation_id is not null and v_existing.conversation_id<>p_conversation_id) then
   raise exception 'Request identifier conflict' using errcode='22023';
  end if;
  select * into v_run from public.jd_automation_runs where school_id=p_school_id and requested_by=p_actor_id and idempotency_key='chat:'||p_actor_id::text||':'||p_request_id;
  return jsonb_build_object('conversationId',v_existing.conversation_id,'messageId',v_existing.id,'run',to_jsonb(v_run),'replayed',true);
 end if;
 if p_conversation_id is null then
  if p_interaction is not null then raise exception 'Interaction needs a conversation' using errcode='22023'; end if;
  insert into public.jd_conversations(school_id,created_by,title) values(p_school_id,p_actor_id,left(regexp_replace(p_message,'\s+',' ','g'),72)) returning * into v_conversation;
 else
  select * into v_conversation from public.jd_conversations where id=p_conversation_id and school_id=p_school_id for update;
  if not found or (v_conversation.created_by<>p_actor_id and v_role not in ('owner','admin')) then raise exception 'Conversation not found' using errcode='42501'; end if;
 end if;
 if p_interaction is not null then
  select * into v_parent from public.jd_messages where id=(p_interaction->>'messageId')::uuid and school_id=p_school_id and conversation_id=v_conversation.id and role='assistant' for update;
  if not found or v_parent.content_json->>'streaming'='true' or p_expected_response is null or v_parent.content_json->'response' is distinct from p_expected_response then
   raise exception 'Response is no longer available' using errcode='22023';
  end if;
  if not exists(select 1 from jsonb_array_elements(p_expected_response->'blocks') b where b->>'id'=p_interaction->>'blockId' and b->>'type' in ('choice','form')) then
   raise exception 'Invalid interaction target' using errcode='22023';
  end if;
  if exists(select 1 from public.jd_messages where school_id=p_school_id and conversation_id=v_conversation.id and role='user' and content_json->'interaction'->>'messageId'=p_interaction->>'messageId' and content_json->'interaction'->>'blockId'=p_interaction->>'blockId') then
   raise exception 'This question was already answered' using errcode='23505';
  end if;
 end if;
 insert into public.jd_messages(school_id,conversation_id,sender_id,role,content,content_json)
 values(p_school_id,v_conversation.id,p_actor_id,'user',p_message,jsonb_build_object('client_request_id',p_request_id)||case when p_interaction is null then '{}'::jsonb else jsonb_build_object('interaction',p_interaction) end) returning * into v_message;
 insert into public.jd_automation_runs(school_id,conversation_id,requested_by,trigger_type,status,autonomy_mode,scope,request_text,created_by_agent,idempotency_key,result_json)
 values(p_school_id,v_conversation.id,p_actor_id,p_trigger_type,case when p_risk='approval_required' then 'awaiting_approval' else 'planning' end,'autonomous','organisation',p_message,true,'chat:'||p_actor_id::text||':'||p_request_id,jsonb_build_object('user_message_id',v_message.id)) returning * into v_run;
 update public.jd_conversations set updated_at=now() where id=v_conversation.id and school_id=p_school_id;
 insert into public.jd_audit_events(school_id,actor_id,run_id,event_type,event_json)
 values(p_school_id,p_actor_id,v_run.id,case when p_interaction is null then 'automation.requested' else 'conversation.answered' end,jsonb_build_object('risk',p_risk,'message_id',v_message.id,'response_id',p_interaction->>'messageId','block_id',p_interaction->>'blockId'));
 return jsonb_build_object('conversationId',v_conversation.id,'messageId',v_message.id,'run',to_jsonb(v_run),'replayed',false);
end $$;
-- The edge handler verifies the schema and answer. Neither anonymous nor
-- authenticated browsers may bypass it by invoking this service-only RPC.
revoke all on function public.jd_submit_chat_request(uuid,uuid,uuid,text,text,text,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.jd_submit_chat_request(uuid,uuid,uuid,text,text,text,jsonb,jsonb,text) to service_role;
