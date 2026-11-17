import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if(!SUPABASE_URL || !SUPABASE_ANON_KEY){
  throw new Error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Set them in your .env " +
    "(or Vercel project env vars) — there is no fallback. This app used to " +
    "silently fall back to another project's live credentials, which is a " +
    "real security problem; it now fails loudly instead."
  )
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const edgePost = async (name, body) => {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {method:"POST",headers:{"Content-Type":"application/json","apikey":SUPABASE_ANON_KEY,"Authorization":`Bearer ${SUPABASE_ANON_KEY}`},body:JSON.stringify(body)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)return {data:null,error:{message:data.error||`Request failed (${response.status})`,status:response.status}};
    return {data,error:null};
  } catch(error){return {data:null,error:{message:error?.message||"Network error"}};}
};

// All browser database access uses the anon/publishable client and is governed by Supabase RLS.
// — the service role bypasses RLS entirely, and anything VITE_-prefixed gets
// bundled into the browser JS, meaning the key would be readable by anyone
// who opens dev tools. This export is a deliberate landmine left in place
// on purpose: if you ever add VITE_SUPABASE_SERVICE_ROLE_KEY to your env,
// this throws immediately instead of silently shipping the key to the
// browser. The hundreds of existing supabase.from(...) calls throughout
// this codebase are a known migration debt — they need to move to
// supabase.from(...) (respecting the real RLS policies now in place) or to
// server-side Edge Functions (see supabase/functions/manage-account) over
// time. Not fixed in this pass; flagging clearly instead of hiding it.
if(import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY){
  throw new Error(
    "VITE_SUPABASE_SERVICE_ROLE_KEY is set. Never expose the service role " +
    "key to the browser — remove it from your env. Server-side operations " +
    "belong in Edge Functions (see supabase/functions/manage-account), " +
    "which get SUPABASE_SERVICE_ROLE_KEY auto-injected securely."
  )
}

export const db = {

  // ── Organisation context (multi-tenant; legacy column names, see docs/LEGACY_SCHEMA.md) ─────────────────────────────────────────

  // Call db.setSchool(id) once after the workspace is activated; queries auto-filter.

  _schoolId: null,

  _schoolName: '',

  setSchool(id, _legacyPrefix, name){ this._schoolId=id; if(name) this._schoolName=name; },

  async getSchool(id){

    const {data,error}=await supabase.from('schools').select('*').eq('id',id).limit(1);

    if(error) return {data:null,error};

    return {data:(data&&data.length)?data[0]:null,error:null};

  },

  // ── Org presets & registration (Phase 1 — hiring feature area) ──────────

  async getOrgPresets(){

    // Global platform catalog (no school_id column) — safe for pre-auth reads
    // by the registration flow; RLS policy org_presets_public_read covers anon.
    // The retired education preset stays in the table for existing tenants
    // but is never offered for new organisations.
    return supabase.from('org_presets').select('*').neq('key','school_management').order('id')

  },

  async getOrgTools(){

    let q=supabase.from('org_tools').select('*').order('tool_key')

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },

  async setOrgTool(toolKey,isEnabled){

    const row={tool_key:toolKey,is_enabled:isEnabled,created_at:new Date().toISOString()}

    if(this._schoolId) row.school_id=this._schoolId

    return supabase.from('org_tools').upsert(row,{onConflict:'school_id,tool_key'}).select()

  },

  async getHiringRoles(){

    let q=supabase.from('hiring_roles').select('*').order('created_at',{ascending:false})

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },

  async upsertHiringRole(data,id=null){

    if(id){

      let q=supabase.from('hiring_roles').update({...data,updated_at:new Date().toISOString()}).eq('id',id)

      if(this._schoolId) q=q.eq('school_id',this._schoolId)

      return q.select().single()

    }

    const ins={...data}

    if(this._schoolId&&!ins.school_id) ins.school_id=this._schoolId

    return supabase.from('hiring_roles').insert(ins).select().single()

  },

  async deleteHiringRole(id){

    let q=supabase.from('hiring_roles').delete().eq('id',id)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },

  // Role + its application count (paginated-safe; roles are few)

  async getHiringRolesWithCounts(){

    const roles=await this.getHiringRoles()

    if(roles.error) return roles

    const apps=await this.getHiringApplications()

    if(apps.error) return {data:roles.data,error:null}

    const counts={}

    ;(apps.data||[]).forEach(a=>{ counts[a.role_id]=(counts[a.role_id]||0)+1 })

    return {data:(roles.data||[]).map(r=>({...r,application_count:counts[r.id]||0})),error:null}

  },

  async getHiringApplications(filters={}){

    let q=supabase.from('hiring_applications')

      .select('*,hiring_roles(id,title,slug)')

      .order('created_at',{ascending:false})

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    if(filters.role_id) q=q.eq('role_id',filters.role_id)

    if(filters.status) q=q.eq('status',filters.status)

    return q

  },

  async getHiringApplication(id){

    let q=supabase.from('hiring_applications')

      .select('*,hiring_roles(id,title,slug)')

      .eq('id',id)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q.single()

  },

  async setHiringApplicationStatus(id,status){

    let q=supabase.from('hiring_applications')

      .update({status,updated_at:new Date().toISOString()}).eq('id',id)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q.select().single()

  },

  // Owner-side message (negotiation + post-hire internal chat)

  async addHiringMessage(applicationId, sender, senderName, body){

    const row={application_id:applicationId, sender, sender_name:senderName, body}

    if(this._schoolId) row.school_id=this._schoolId

    return supabase.from('hiring_messages').insert(row).select().single()

  },

  async getHiringMessages(applicationId){

    let q=supabase.from('hiring_messages')

      .select('*').eq('application_id',applicationId).order('id')

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },

  // Hire + quota config (owner-defined metric at hire time). Also flips the
  // application to 'hired'.
  async createHire({applicationId, roleId, hireName, contactEmail, quota}){

    const row={

      application_id:applicationId, role_id:roleId,

      hire_name:hireName||'', contact_email:contactEmail||'',

      quota_metric:quota?.metric||'', quota_unit:quota?.unit||'',

      quota_target:quota?.target||0, quota_period:quota?.period||'monthly',

      quota_measure_method:quota?.measureMethod||'',

      quota_start:quota?.start||null, quota_end:quota?.end||null,

    }

    if(this._schoolId) row.school_id=this._schoolId

    const {data,error}=await supabase.from('hires').insert(row).select().single()

    if(error) return {data:null,error}

    await this.setHiringApplicationStatus(applicationId,'hired').catch(()=>{})

    return {data,error:null}

  },

  async getHires(){

    let q=supabase.from('hires')

      .select('*,hiring_roles(id,title,slug)')

      .order('created_at',{ascending:false})

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },

  async getHire(id){

    let q=supabase.from('hires')

      .select('*,hiring_roles(id,title,slug),hiring_applications(id,applicant_name,applicant_email,applicant_phone)')

      .eq('id',id)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q.single()

  },

  async updateHire(id,fields){

    let q=supabase.from('hires')

      .update({...fields,updated_at:new Date().toISOString()}).eq('id',id)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q.select().single()

  },

  async addHireQuotaEntry(hireId,value,note,recordedBy){

    const row={hire_id:hireId, value, note:note||'', recorded_by:recordedBy||'admin'}

    if(this._schoolId) row.school_id=this._schoolId

    return supabase.from('hire_quota_entries').insert(row).select().single()

  },

  async getHireQuotaEntries(hireId){

    let q=supabase.from('hire_quota_entries')

      .select('*').eq('hire_id',hireId).order('recorded_at',{ascending:false})

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },

  // Public landing-page RPCs (anon — narrow SECURITY DEFINER functions, no
  // table grants to anon; see 017_hiring_roles.sql)

  async publicGetRoleBySlug(slug){const {data,error}=await edgePost("public-careers",{action:"role",slug});return {data:(data?.data&&data.data.length)?data.data[0]:null,error};},
  async publicSubmitApplication({slug,name,email,phone,qualifications,askingPrice,priceNote}){return edgePost("public-careers",{action:"submit",slug,name,email,phone:phone||"",qualifications:qualifications||"",asking_price:askingPrice??null,price_note:priceNote||""});},
  async publicGetThread(token){return edgePost("public-careers",{action:"thread",token});},
  async publicPostMessage(token,senderName,body){return edgePost("public-careers",{action:"message",token,sender_name:senderName,body});},

  async getSessions(){

    let q=supabase.from('sessions').select('*').order('name',{ascending:false})

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },

  async getTerms(sessionId=null){

    let q=supabase.from('terms').select('*,sessions(name)').order('id')

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    if(sessionId)q=q.eq('session_id',sessionId)

    return q

  },

  // ── SETTINGS ──────────────────────────────────────────────────────────────

  async getSettings(){

    let q=supabase.from('school_settings').select('*')

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },

  async setSetting(key,value){

    const row={key,value,updated_at:new Date().toISOString()}

    if(this._schoolId) row.school_id=this._schoolId

    return supabase.from('school_settings').upsert(row,{onConflict:'school_id,key'}).select()

  },

  async setSettings(kvPairs){ // [{key,value},...]

    const rows=kvPairs.map(({key,value})=>{

      const r={key,value,updated_at:new Date().toISOString()}

      if(this._schoolId) r.school_id=this._schoolId

      return r

    })

    return supabase.from('school_settings').upsert(rows,{onConflict:'school_id,key'}).select()

  },

  // ── Notification config (stored as JSON in school_settings key 'notif_config') ──

  async getNotifConfig(){
    let q=supabase.from('school_settings').select('value').eq('key','notif_config')
    if(this._schoolId) q=q.eq('school_id',this._schoolId)
    const {data,error}=await q.maybeSingle()
    if(error) return {data:null,error}
    try{ return {data: data?.value ? JSON.parse(data.value) : null, error:null} }
    catch{ return {data:null,error:null} }
  },

  async saveNotifConfig(config){
    const row={key:'notif_config',value:JSON.stringify(config),updated_at:new Date().toISOString()}
    if(this._schoolId) row.school_id=this._schoolId
    const {error}=await supabase.from('school_settings').upsert(row,{onConflict:'school_id,key'})
    return {error}
  },

  // ── Digest config (stored as JSON in school_settings key 'digest_config') ──

  async getDigestConfig(){
    let q=supabase.from('school_settings').select('value').eq('key','digest_config')
    if(this._schoolId) q=q.eq('school_id',this._schoolId)
    const {data,error}=await q.maybeSingle()
    if(error) return {data:null,error}
    try{ return {data: data?.value ? JSON.parse(data.value) : null, error:null} }
    catch{ return {data:null,error:null} }
  },

  async saveDigestConfig(config){
    const row={key:'digest_config',value:JSON.stringify(config),updated_at:new Date().toISOString()}
    if(this._schoolId) row.school_id=this._schoolId
    const {error}=await supabase.from('school_settings').upsert(row,{onConflict:'school_id,key'})
    return {error}
  },

  // Trigger the scheduled-digest edge function immediately (admin "Send Now" button)
  async triggerDigestNow(){
    try{
      const res=await fetch(`${SUPABASE_URL}/functions/v1/scheduled-digest`,{
        method:'POST',
        headers:{'Authorization':`Bearer ${SUPABASE_ANON_KEY}`,'Content-Type':'application/json'},
        body:JSON.stringify({manual:true,school_id:this._schoolId}),
      });
      if(!res.ok){const t=await res.text().catch(()=>'');return{data:null,error:{message:`${res.status}: ${t}`}};}
      const data=await res.json().catch(()=>({}));
      return{data,error:null};
    }catch(e){return{data:null,error:{message:e.message}};}
  },

  // ── Admin alert email (Tier A notifications) ──────────────────────────────
  // Fire-and-forget: failures are logged but never throw to the caller.
  // {subject, html, eventKey?, config?}
  //   eventKey — check notif_config.events[eventKey]; omit to always send (e.g. test)
  //   config   — pass notif_config directly to skip the DB fetch (e.g. test button)
  async sendAdminAlert({subject, html, eventKey, config}){
    try{
      const nc = config || (await this.getNotifConfig())?.data;
      if(!nc?.admin_email || !nc.admin_email.includes('@')) return;
      // Event-level gate: if events map exists and the key is explicitly false, skip
      if(eventKey && nc.events && nc.events[eventKey]===false) return;
      await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${SUPABASE_ANON_KEY}`},
        body:JSON.stringify({to:nc.admin_email,subject,html}),
      });
    }catch(e){
      console.warn('[sendAdminAlert] failed (non-blocking):',e);
    }
  },

  // ── ROLE PERMISSIONS ─────────────────────────────────────────────────────

  async getRolePermissions(role=null){

    let q=supabase.from('role_permissions').select('*').order('role').order('page_id')

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    if(role) q=q.eq('role',role)

    return q

  },

  async setRolePermission(role,pageId,allowed){

    const payload={role,page_id:pageId,allowed,updated_at:new Date().toISOString()}

    if(this._schoolId) payload.school_id=this._schoolId

    return supabase.from('role_permissions')

      .upsert(payload,{onConflict:'school_id,role,page_id'}).select()

  },

  // ── USER PERMISSIONS ──────────────────────────────────────────────────────

  async getUserPermissions(userId){

    return supabase.from('user_permissions').select('*').eq('user_id',userId)

  },

  // ── Permission Audit Log ──────────────────────────────────────────────────

  async logPermissionChange(adminId,action,targetRole,targetUserId,pageId,oldVal,newVal){

    return supabase.from('permission_audit_log')

      .insert({admin_id:adminId,action,target_role:targetRole||null,

        target_user_id:targetUserId||null,page_id:pageId,

        old_value:oldVal===undefined?null:String(oldVal),

        new_value:newVal===undefined?null:String(newVal),

        created_at:new Date().toISOString()})

  },

  async getPermissionAuditLog(limit=100){

    return supabase.from('permission_audit_log')

      .select('*').order('created_at',{ascending:false}).limit(limit)

  },

  // ── EMAIL LOGS ────────────────────────────────────────────────────────────

  async getEmailLogs(limit=100){

    let q=supabase.from('email_logs').select('*').order('sent_at',{ascending:false}).limit(limit)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },

  async logEmail(data){

    // data may include: subject, body, recipients, recipient_count, status,

    //   delivered_count, failed_count, failed_recipients (JSONB array), error_message, metadata

    const payload=this._schoolId?{...data,school_id:this._schoolId}:data

    return supabase.from('email_logs').insert(payload).select().single()

  },

  async deleteEmailLog(id){

    return supabase.from('email_logs').delete().eq('id',id)

  },

  // Returns all distinct batches with aggregated counts — for email logs batch panel

  async getEmailBatches(){

    const schoolFilter=this._schoolId;

    let q=supabase.from('email_queue')

      .select('batch_id,status,to_email,subject,created_at,processed_at,error_message')

      .order('created_at',{ascending:false})

    if(schoolFilter) q=q.eq('school_id',schoolFilter)

    const{data,error}=await q

    if(error||!data) return{data:[],error}

    // Group by batch_id

    const map={}

    for(const row of data){

      if(!map[row.batch_id]) map[row.batch_id]={

        batch_id:row.batch_id, subject:row.subject,

        total:0, sent:0, failed:0, pending:0,

        created_at:row.created_at,

        failedRecipients:[],

      }

      const b=map[row.batch_id]

      b.total++

      if(row.status==='sent') b.sent++

      else if(row.status==='failed'){b.failed++;b.failedRecipients.push({email:row.to_email,error:row.error_message})}

      else b.pending++

    }

    return{data:Object.values(map).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)),error:null}

  },

  async retriggerBatch(batchId, ratePerMin=10){

    // Re-mark any stuck "sending" rows back to "pending" then re-trigger

    await supabase.from('email_queue').update({status:'pending'}).eq('batch_id',batchId).eq('status','sending')

    return{batchId,error:null}

  },

  async deleteEmailLogs(ids){

    return supabase.from('email_logs').delete().in('id',ids)

  },

  async deleteEmailLogsBefore(isoDate){

    return supabase.from('email_logs').delete().lt('sent_at',isoDate)

  },

  async getAdminAuditLog(filters={}){

    let q=supabase.from('admin_audit_log').select('*').order('performed_at',{ascending:false})

    if(this._schoolId)      q=q.eq('school_id',this._schoolId)

    if(filters.entity_type) q=q.eq('entity_type',filters.entity_type)

    if(filters.entity_id)   q=q.eq('entity_id',filters.entity_id)

    if(filters.limit)       q=q.limit(filters.limit)

    else                    q=q.limit(500)

    return q

  },

  async getNotifications(recipientId,limit=30){

    if(!this._schoolId)return{data:[]}

    return supabase.from('notifications').select('*')

      .eq('school_id',this._schoolId).eq('recipient_id',recipientId)

      .order('created_at',{ascending:false}).limit(limit)

  },

  async getAdminNotifications(limit=30){

    if(!this._schoolId)return{data:[]}

    return supabase.from('notifications').select('*')

      .eq('school_id',this._schoolId).eq('recipient_id','admin')

      .order('created_at',{ascending:false}).limit(limit)

  },

  async markNotificationRead(id){

    return supabase.from('notifications').update({read_at:new Date().toISOString()}).eq('id',id)

  },

  async markAllNotificationsRead(recipientId){

    if(!this._schoolId)return

    return supabase.from('notifications').update({read_at:new Date().toISOString()})

      .eq('school_id',this._schoolId).eq('recipient_id',recipientId).is('read_at',null)

  },

  async _binRetentionDays(){

    if(!this._schoolId) return 30

    const{data}=await supabase.from('school_settings')

      .select('value').eq('key','recycle_bin_retention_days').eq('school_id',this._schoolId).maybeSingle()

    return parseInt(data?.value||'30',10)

  },

  // School self-signup — creates school + school_settings skeleton

  async createSchoolSignup(schoolData){
    // Account creation happens server-side. The canonical function is
    // `manage-account`; `clever-processor` is retained as a one-release
    // fallback for the legacy deployment that used that generated slug.
    const body={
      action:'register_school',
      schoolName:schoolData.name,
      adminEmail:schoolData.admin_email,
      adminName:schoolData.admin_name,
      redirectTo:schoolData.redirect_to,
      studentIdPrefix:(schoolData.student_id_prefix||schoolData.name.slice(0,3)).toUpperCase(),
      address:schoolData.address||'',
      phone:schoolData.phone||schoolData.contact_phone||'',
      state:schoolData.state||'',
      presetKey:schoolData.preset_key||null,
    };

    const readFunctionError=async(error)=>{
      const status=error?.context?.status;
      let detail='';
      try{
        const response=error?.context;
        if(response?.clone){
          const payload=await response.clone().json();
          detail=payload?.error||payload?.message||'';
        }
      }catch{/* non-JSON response */}
      if(status===401||status===403){
        return {message:`Registration service rejected the request (${status}). Deploy the manage-account Edge Function with public JWT verification disabled for registration.`};
      }
      return {message:detail||error?.message||'Registration service unavailable.'};
    };

    const result=await supabase.functions.invoke('manage-account',{body});
    if(!result.error){
      if(result.data?.error) return {data:null,error:{message:result.data.error}};
      const school=result.data?.school;
      if(!school) return {data:null,error:{message:'Registration service returned no organization record.'}};
      return {data:{school,verificationEmailSent:result.data?.verificationEmailSent===true},error:null};
    }
    return {data:null,error:await readFunctionError(result.error)};
  },

}

