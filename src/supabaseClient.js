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

  // ── School context (multi-tenant) ─────────────────────────────────────────

  // Call db.setSchool(id) once after school selection; queries auto-filter.

  _schoolId: null,

  _studentIdPrefix: 'RGS',

  _schoolName: '',

  setSchool(id, prefix, name){ this._schoolId=id; if(prefix) this._studentIdPrefix=prefix; if(name) this._schoolName=name; },



  // ── Schools management ────────────────────────────────────────────────────

  async getSchools(){const {data,error}=await edgePost("preauth-lookup",{action:"schools"});return {data:data?.data||null,error};},

  async getSchool(id){

    const {data,error}=await supabase.from('schools').select('*').eq('id',id).limit(1);

    if(error) return {data:null,error};

    return {data:(data&&data.length)?data[0]:null,error:null};

  },

  async updateSchool(id,fields){

    return supabase.from('schools').update(fields).eq('id',id).select().single();

  },



  // ── Org presets & registration (Phase 1 — hiring feature area) ──────────

  async getOrgPresets(){

    // Global platform catalog (no school_id column) — safe for pre-auth reads
    // by the registration flow; RLS policy org_presets_public_read covers anon.
    return supabase.from('org_presets').select('*').order('id')

  },

  async getOrgSubmission(){

    let q=supabase.from('org_submissions').select('*')

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q.maybeSingle()

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



  // ── HIRING — roles, applications, threads, hires & quota (Phases 2–3) ─────

  // Landing-page URL for a role (host-relative; caller prepends origin)

  hiringRoleUrl(slug){ return `/apply/${slug}` },

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

  async deleteHireQuotaEntry(id){

    let q=supabase.from('hire_quota_entries').delete().eq('id',id)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },

  // Public landing-page RPCs (anon — narrow SECURITY DEFINER functions, no
  // table grants to anon; see 017_hiring_roles.sql)

  async publicGetRoleBySlug(slug){const {data,error}=await edgePost("public-careers",{action:"role",slug});return {data:(data?.data&&data.data.length)?data.data[0]:null,error};},
  async publicSubmitApplication({slug,name,email,phone,qualifications,askingPrice,priceNote}){return edgePost("public-careers",{action:"submit",slug,name,email,phone:phone||"",qualifications:qualifications||"",asking_price:askingPrice??null,price_note:priceNote||""});},
  async publicGetThread(token){return edgePost("public-careers",{action:"thread",token});},
  async publicPostMessage(token,senderName,body){return edgePost("public-careers",{action:"message",token,sender_name:senderName,body});},

  async getSections(activeOnly=true){

    let q=supabase.from('sections').select('*').order('sort_order')

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    if(activeOnly)q=q.eq('is_active',true)

    return q

  },

  async upsertSection(data,id=null){

    if(id)return supabase.from('sections').update(data).eq('id',id).select().single()

    const ins={...data}; if(this._schoolId&&!ins.school_id) ins.school_id=this._schoolId

    return supabase.from('sections').insert(ins).select().single()

  },

  async deleteSection(id){

    let q=supabase.from('sections').delete().eq('id',id)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },



  async getClasses(sectionId=null){

    let q=supabase.from('classes').select('*,sections(id,name,code,color)').order('name')

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    if(sectionId) q=q.eq('section_id',sectionId)

    return q

  },

  async upsertClass(data,id=null){

    if(id)return supabase.from('classes').update(data).eq('id',id).select().single()

    const ins={...data};

    if(this._schoolId&&!ins.school_id) ins.school_id=this._schoolId;

    return supabase.from('classes').insert(ins).select().single()

  },

  async deleteClass(id){

    let q=supabase.from('classes').delete().eq('id',id)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },



  async getSubjects(){

    let q=supabase.from('subjects').select('*').order('name')

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },

  async upsertSubject(data,id=null){

    if(id)return supabase.from('subjects').update(data).eq('id',id).select().single()

    const ins={...data}; if(this._schoolId&&!ins.school_id) ins.school_id=this._schoolId

    return supabase.from('subjects').insert(ins).select().single()

  },

  async deleteSubject(id){

    let q=supabase.from('subjects').delete().eq('id',id)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },



  async getSectionSubjects(sectionId=null){

    let q=supabase.from('section_subjects').select('*,sections(name,code,color)').order('name')

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    if(sectionId)q=q.eq('section_id',sectionId)

    return q

  },

  async upsertSectionSubject(data,id=null){

    if(id)return supabase.from('section_subjects').update(data).eq('id',id).select().single()

    const ins={...data}; if(this._schoolId&&!ins.school_id) ins.school_id=this._schoolId

    return supabase.from('section_subjects').insert(ins).select().single()

  },

  async deleteSectionSubject(id){

    let q=supabase.from('section_subjects').delete().eq('id',id)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },



  // CLASS ↔ SUBJECT

  async getClassSubjects(classId){

    let q=supabase.from('class_subjects')

      .select('*,section_subjects(id,name,code,section_id,sections(name,code,color))')

      .eq('class_id',classId)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },

  async assignSubjectToClass(classId,sectionSubjectId){

    const ins={class_id:classId,section_subject_id:sectionSubjectId}

    if(this._schoolId) ins.school_id=this._schoolId

    return supabase.from('class_subjects').insert(ins).select()

  },

  async removeSubjectFromClass(classId,sectionSubjectId){

    let q=supabase.from('class_subjects')

      .delete().eq('class_id',classId).eq('section_subject_id',sectionSubjectId)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },

  async getAllClassSubjects(){

    let q=supabase.from('class_subjects')

      .select('*,classes(id,name,section_id,sections(name,code,color)),section_subjects(id,name,code)')

      .order('class_id')

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },



  // FORM TEACHERS — multiple form teachers per class supported

  async getAllFormTeachers(){

    let q=supabase.from('class_teachers')

      .select('*,teachers(id,full_name,staff_id),classes(id,name,section_id,sections(name,code,color))')

      .eq('is_form_teacher',true)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },

  // Get form teacher name for a single class (for report card header)
  async getFormTeacherForClass(classId){
    let q=supabase.from('class_teachers')
      .select('teachers(full_name)').eq('class_id',+classId).eq('is_form_teacher',true).limit(1)
    if(this._schoolId) q=q.eq('school_id',this._schoolId)
    return q
  },

  // Get class IDs assigned to a teacher (for teacher-restricted class picker)
  async getTeacherClassIds(teacherId){
    let q=supabase.from('class_teachers').select('class_id').eq('teacher_id',teacherId)
    if(this._schoolId) q=q.eq('school_id',this._schoolId)
    return q
  },

  // Look up teacher email by staff_id or full_name (fallback for old requests without teacher_email)
  async getTeacherByNameOrStaffId(staffId,fullName){
    let q=supabase.from('teachers').select('email,full_name,staff_id')
    if(this._schoolId) q=q.eq('school_id',this._schoolId)
    if(staffId&&fullName) q=q.or(`staff_id.eq.${staffId},full_name.eq.${fullName}`)
    else if(staffId) q=q.eq('staff_id',staffId)
    else if(fullName) q=q.eq('full_name',fullName)
    return q.limit(1)
  },

  // Bulk delete interlock: check which students have unrefunded payments or published report cards
  async checkBulkStudentInterlock(studentIds, classIds){
    const [feePayRes,pubRes]=await Promise.all([
      supabase.from('fee_payments').select('student_id')
        .in('student_id',studentIds.map(String)).eq('is_refunded',false),
      classIds.length
        ? supabase.from('report_card_publish').select('class_id')
            .in('class_id',classIds).eq('is_published',true)
        : Promise.resolve({data:[]}),
    ])
    return {
      data:{
        blockedStudentIds:(feePayRes.data||[]).map(r=>r.student_id),
        publishedClassIds:(pubRes.data||[]).map(r=>String(r.class_id)),
      },
      error:feePayRes.error||pubRes.error||null,
    }
  },

  // Legacy single-teacher setter (kept for backward compat — replaces ALL form teachers for the class)

  async setFormTeacher(classId,teacherId){

    let dq=supabase.from('class_teachers').delete()

      .eq('class_id',classId).eq('is_form_teacher',true)

    if(this._schoolId) dq=dq.eq('school_id',this._schoolId)

    await dq

    if(!teacherId)return {data:null,error:null}

    const ins={class_id:classId,teacher_id:teacherId,is_form_teacher:true}

    if(this._schoolId) ins.school_id=this._schoolId

    return supabase.from('class_teachers').insert(ins).select()

  },

  // Add one form teacher without removing others (upsert on unique class_id+teacher_id)

  async addFormTeacher(classId,teacherId){

    return supabase.from('class_teachers')

      .upsert({class_id:+classId,teacher_id:+teacherId,is_form_teacher:true},

        {onConflict:'class_id,teacher_id'})

      .select()

  },

  // Remove one specific form teacher from a class

  async removeFormTeacher(classId,teacherId){

    return supabase.from('class_teachers').delete()

      .eq('class_id',classId).eq('teacher_id',teacherId).eq('is_form_teacher',true)

  },



  // SUBJECT TEACHERS

  async getTeacherSubjects(teacherId=null){

    let q=supabase.from('teacher_subjects')

      .select('*,teachers(id,full_name,staff_id),classes(id,name,sections(name,code,color)),section_subjects(id,name,code)')

      .order('teacher_id')

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    if(teacherId)q=q.eq('teacher_id',teacherId)

    return q

  },

  async assignTeacherSubject(teacherId,classId,subjectId){

    const ins={teacher_id:+teacherId,class_id:+classId,subject_id:+subjectId}

    if(this._schoolId) ins.school_id=this._schoolId

    return supabase.from('teacher_subjects').insert(ins).select()

  },

  async removeTeacherSubject(id){

    let q=supabase.from('teacher_subjects').delete().eq('id',id)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },

  async assignTeacherSubjectBulk(teacherId, entries){
    if(!entries?.length) return {data:[],error:null};
    const rows=entries.map(e=>({
      teacher_id:+teacherId,class_id:+e.class_id,subject_id:+e.subject_id,
      ...(this._schoolId?{school_id:this._schoolId}:{}),
    }));
    return supabase.from('teacher_subjects')
      .upsert(rows,{onConflict:'teacher_id,class_id,subject_id',ignoreDuplicates:true}).select();
  },

  async removeTeacherSubjectBulk(ids){
    if(!ids?.length) return {data:[],error:null};
    let q=supabase.from('teacher_subjects').delete().in('id',ids);
    if(this._schoolId) q=q.eq('school_id',this._schoolId);
    return q;
  },



  // SUBJECT ACCESS REQUESTS

  async getSubjectAccessRequests(filters={}){

    let q=supabase.from('subject_access_requests')

      .select(`*,

        teachers!subject_access_requests_teacher_id_fkey(id,full_name,staff_id),

        classes(id,name,sections(name,code)),

        reviewer:teachers!subject_access_requests_reviewed_by_fkey(id,full_name)

      `)

      .order('requested_at',{ascending:false})

    if(filters.school_id) q=q.eq('school_id',filters.school_id)

    if(filters.teacher_id) q=q.eq('teacher_id',filters.teacher_id)

    if(filters.status) q=q.eq('status',filters.status)

    return q

  },

  async createSubjectAccessRequest(schoolId,teacherId,classId,subjectIds){

    return supabase.from('subject_access_requests')

      .insert({school_id:schoolId,teacher_id:+teacherId,class_id:+classId,subject_ids:subjectIds,status:'pending'})

      .select().single()

  },

  async reviewSubjectAccessRequest(id,status,reviewedBy,adminNote=''){

    return supabase.from('subject_access_requests')

      .update({status,admin_note:adminNote,reviewed_at:new Date().toISOString(),reviewed_by:+reviewedBy})

      .eq('id',id).select().single()

  },



  // SUBJECT ACCESS GRANTS (approved temporary access to input scores)

  async getSubjectAccessGrants(filters={}){

    let q=supabase.from('subject_access_grants')

      .select('*,section_subjects(id,name,code),classes(id,name),teachers!subject_access_grants_teacher_id_fkey(id,full_name)')

    if(filters.teacher_id) q=q.eq('teacher_id',filters.teacher_id)

    if(filters.class_id) q=q.eq('class_id',filters.class_id)

    if(filters.school_id) q=q.eq('school_id',filters.school_id)

    return q

  },

  async createSubjectAccessGrants(schoolId,teacherId,classId,subjectIds,grantedBy){

    const rows=subjectIds.map(sid=>({

      school_id:schoolId,teacher_id:+teacherId,class_id:+classId,

      subject_id:+sid,granted_by:+grantedBy

    }))

    return supabase.from('subject_access_grants').upsert(rows,{onConflict:'teacher_id,class_id,subject_id'}).select()

  },

  async revokeSubjectAccessGrant(id){

    return supabase.from('subject_access_grants').delete().eq('id',id)

  },



  // Fetch a single student by ID with class+section joins (uses service role — bypasses RLS)
  async getStudentById(id){

    let q=supabase.from('students')

      .select('*,classes(id,name,level,section_id,sections(id,name,code,color))')

      .eq('id',id)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q.maybeSingle()

  },

  async getStudents(sectionId=null,filters={}){

    // PostgREST server max-rows caps each request at 1000 even with range().

    // Paginate in batches until we get fewer rows than the batch size.

    // Optional filters: { class_id } — narrows the query server-side (much faster for per-class fetches).

    const BATCH=1000;

    const all=[];

    let from=0;

    while(true){

      let q=supabase

        .from('students')

        .select('*,classes(id,name,level,section_id,sections(id,name,code,color))')

        .order('name')

        .range(from,from+BATCH-1);

      if(this._schoolId) q=q.eq('school_id',this._schoolId);

      if(filters.class_id) q=q.eq('class_id',filters.class_id);

      const {data,error}=await q;

      if(error) return {data:all.length?all:null,error};

      if(data&&data.length) all.push(...data);

      if(!data||data.length<BATCH) break;

      from+=BATCH;

    }

    return {data:all,error:null};

  },



  // ── Login-time lookups ──────────────────────────────────────────────────
  // These run BEFORE the person has a session, so normal RLS-protected
  // table reads won't work (nothing is readable pre-auth). They call narrow
  // SECURITY DEFINER SQL functions instead — each requires an exact
  // school_id + exact ID match, so they can look up one known account but
  // can't be used to enumerate/list anyone. See
  // supabase/migrations/999c_login_lookup_functions.sql.

  async loginFindTeacher(staffId,schoolId=null){if(!schoolId)return {data:null,error:null};const {data,error}=await edgePost("preauth-lookup",{action:"teacher",school_id:schoolId,identifier:staffId});return {data:data?.data||null,error};},
  async loginFindStudent(studentId,schoolId=null){if(!schoolId)return {data:null,error:null};const {data,error}=await edgePost("preauth-lookup",{action:"student",school_id:schoolId,identifier:String(studentId)});return {data:data?.data||null,error};},
  // Legacy ID/password login was retired. All sign-in now uses Supabase Auth directly.
  async loginAuthenticate(){return {data:null,error:{message:"Legacy ID/password sign-in has been retired. Sign in with your account email and password."}};},

  async loginGetSettings(){

    return supabase.from('school_settings').select('*')

  },

  // Fetch admin credentials for a specific school

  async loginGetSchoolAdmin(schoolId){if(!schoolId)return {data:null,error:null};const {data,error}=await edgePost("preauth-lookup",{action:"admin",school_id:schoolId});return {data:data?.data||null,error};},

  // Update admin credentials for a school

  async updateSchoolAdmin(schoolId,fields){

    return supabase.from('schools').update(fields).eq('id',schoolId);

  },

  // Record last login timestamp (fire-and-forget; uses service role to bypass RLS)

  recordLogin(type,id){

    const table=type==='teacher'?'teachers':'students';

    supabase.from(table).update({last_login:new Date().toISOString()}).eq('id',id).then(()=>{});

  },

  async setTeacherRole(id,role){

    return supabase.from('teachers').update({role}).eq('id',id);

  },

  // Update staff_id and/or password_hash for a teacher (admin credential control)

  // Pass only the fields you want to change: {staff_id, password_hash}

  async updateTeacherCredentials(id,fields){

    return supabase.from('teachers').update(fields).eq('id',id);

  },

  async countStudents(){

    let q=supabase.from('students').select('*',{count:'exact',head:true})

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    const {count,error}=await q

    return{count:count||0,error}

  },

  async upsertStudent(data,id=null){

    if(id)return supabase.from('students').update(data).eq('id',id).select().single()

    const ins={...data};

    if(this._schoolId&&!ins.school_id) ins.school_id=this._schoolId;

    return supabase.from('students').insert(ins).select().single()

  },

  // Called after a new student's first bill is generated — clears the new-enrollee flag

  async markStudentEnrolled(studentId){

    return supabase.from('students').update({is_new_enrollee:false}).eq('id',studentId)

  },

  async markStudentsEnrolledBulk(studentIds){

    if(!studentIds||!studentIds.length)return{error:null};

    return supabase.from('students').update({is_new_enrollee:false}).in('id',studentIds);

  },

  // Called when a new term is activated — clears new-enrollee flag for all students

  // A student is only "new" within their first term; once the school moves on, everyone is returning

  async clearNewEnrolleeOnTermChange(){

    return supabase.from('students').update({is_new_enrollee:false}).eq('is_new_enrollee',true);

  },

  // Returns ALL active templates for a class level + term so the admin can pick

  async getTemplatesForLevel(classLevel,academicYear,term){

    return supabase.from('fee_templates')

      .select('*,fee_template_items(*,fee_items!fee_template_items_fee_item_id_fkey(id,name))')

      .eq('class_level',classLevel)

      .eq('academic_year',academicYear)

      .eq('term',term)

      .eq('is_active',true)

      .order('template_type'); // new_student before standard alphabetically

  },

  async cancelStudentBills(studentId){

    // Mark all non-paid bills as cancelled before deleting student

    return supabase.from('fee_bills')

      .update({status:'cancelled',updated_at:new Date().toISOString()})

      .eq('student_id',studentId)

      .not('status','eq','paid')

  },

  async deleteStudent(id){

    let q=supabase.from('students').delete().eq('id',id)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },



  // Bulk delete students — chunks into groups of 200 to stay within URL limits

  // Cancels bills first, then deletes students; returns {deleted, failed}

  async bulkDeleteStudents(ids){

    const CHUNK=200; let deleted=0,failed=0;

    for(let i=0;i<ids.length;i+=CHUNK){

      const chunk=ids.slice(i,i+CHUNK);

      // Cancel unpaid bills for this chunk

      await supabase.from('fee_bills')

        .update({status:'cancelled',updated_at:new Date().toISOString()})

        .in('student_id',chunk).not('status','eq','paid');

      let dq=supabase.from('students').delete().in('id',chunk)

      if(this._schoolId) dq=dq.eq('school_id',this._schoolId)

      const{error}=await dq;

      if(error){console.error('[bulkDeleteStudents]',error);failed+=chunk.length;}

      else deleted+=chunk.length;

    }

    return{deleted,failed};

  },



  // Bulk delete teachers — chunks into groups of 200

  async bulkDeleteTeachers(ids){

    const CHUNK=200; let deleted=0,failed=0;

    for(let i=0;i<ids.length;i+=CHUNK){

      const chunk=ids.slice(i,i+CHUNK);

      const{error}=await supabase.from('teachers').delete().in('id',chunk);

      if(error){console.error('[bulkDeleteTeachers]',error);failed+=chunk.length;}

      else deleted+=chunk.length;

    }

    return{deleted,failed};

  },



  // Bulk status update — single UPDATE per chunk

  async bulkSetStudentStatus(ids,status){

    const CHUNK=200;

    for(let i=0;i<ids.length;i+=CHUNK){

      const chunk=ids.slice(i,i+CHUNK);

      await supabase.from('students').update({status,updated_at:new Date().toISOString()}).in('id',chunk);

    }

  },

  async bulkSetTeacherStatus(ids,status){

    const CHUNK=200;

    for(let i=0;i<ids.length;i+=CHUNK){

      const chunk=ids.slice(i,i+CHUNK);

      await supabase.from('teachers').update({status,updated_at:new Date().toISOString()}).in('id',chunk);

    }

  },



  async getTeachers(sectionId=null){

    const BATCH=1000;

    const all=[];

    let from=0;

    while(true){

      let q=supabase

        .from('teachers')

        .select('*')

        .order('full_name')

        .range(from,from+BATCH-1);

      if(this._schoolId) q=q.eq('school_id',this._schoolId);

      const {data,error}=await q;

      if(error) return {data:all.length?all:null,error};

      if(data&&data.length) all.push(...data);

      if(!data||data.length<BATCH) break;

      from+=BATCH;

    }

    return {data:all,error:null};

  },

  async upsertTeacher(data,id=null){

    if(id)return supabase.from('teachers').update(data).eq('id',id).select().single()

    const ins={...data};

    if(this._schoolId&&!ins.school_id) ins.school_id=this._schoolId;

    return supabase.from('teachers').insert(ins).select().single()

  },

  async deleteTeacher(id){

    let q=supabase.from('teachers').delete().eq('id',id)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },



  async getSessions(){

    let q=supabase.from('sessions').select('*').order('name',{ascending:false})

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },

  async upsertSession(data,id=null){

    if(id)return supabase.from('sessions').update(data).eq('id',id).select().single()

    const ins={...data}; if(this._schoolId&&!ins.school_id) ins.school_id=this._schoolId

    return supabase.from('sessions').insert(ins).select().single()

  },

  async setActiveSession(id){

    let q=supabase.from('sessions').update({is_active:false}).neq('id',id)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    await q

    return supabase.from('sessions').update({is_active:true}).eq('id',id).select().single()

  },



  async getTerms(sessionId=null){

    let q=supabase.from('terms').select('*,sessions(name)').order('id')

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    if(sessionId)q=q.eq('session_id',sessionId)

    return q

  },

  async upsertTerm(data,id=null){

    const ins={...data}

    // Stable term position — all app logic keys off term_order, not the name.
    // Derive it from the name when the caller didn't set it explicitly.
    if(ins.term_order==null && ins.name){
      const n=String(ins.name).toLowerCase()
      ins.term_order = (n.includes('first')||n.includes('1st')||/\bterm.?1\b/.test(n)) ? 1
        : (n.includes('second')||n.includes('2nd')||/\bterm.?2\b/.test(n)) ? 2
        : (n.includes('third')||n.includes('3rd')||/\bterm.?3\b/.test(n)) ? 3 : null
    }

    if(id)return supabase.from('terms').update(ins).eq('id',id).select().single()

    if(this._schoolId&&!ins.school_id) ins.school_id=this._schoolId

    return supabase.from('terms').insert(ins).select().single()

  },

  async setActiveTerm(id,sessionId){

    let q=supabase.from('terms').update({is_active:false}).neq('id',id)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    await q

    return supabase.from('terms').update({is_active:true}).eq('id',id).select().single()

  },

  async deleteTerm(id){

    let q=supabase.from('terms').delete().eq('id',id)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },

  // Delete a session: removes all its terms first (FK safety), then the session row.
  async deleteSession(id){

    let tq=supabase.from('terms').delete().eq('session_id',id)

    if(this._schoolId) tq=tq.eq('school_id',this._schoolId)

    await tq

    let sq=supabase.from('sessions').delete().eq('id',id)

    if(this._schoolId) sq=sq.eq('school_id',this._schoolId)

    return sq

  },


  // ── PROMOTIONS & SESSION ROLLOVER ─────────────────────────────────────────
  // See documentation/PROMOTION_ROLLOVER_SPEC.md. Invariant: promotion only ever
  // changes a student's CURRENT class/status — never historical portal_results rows.

  // Progression map: set/clear a class's destination class (null = terminal → graduate).
  async setPromotesTo(classId, toClassId){
    let q=supabase.from('classes')
      .update({promotes_to_class_id: toClassId ? +toClassId : null})
      .eq('id', classId)
    if(this._schoolId) q=q.eq('school_id', this._schoolId)
    return q
  },

  // The current non-reverted run for a session, with its decisions (null if none).
  async getActivePromotionRun(fromSessionId){
    let rq=supabase.from('promotion_runs').select('*')
      .eq('from_session_id', fromSessionId).neq('status','reverted')
      .order('id',{ascending:false}).limit(1)
    if(this._schoolId) rq=rq.eq('school_id', this._schoolId)
    const {data:runs,error}=await rq
    if(error) return {data:null,error}
    const run=runs?.[0]||null
    if(!run) return {data:null,error:null}
    const {data:decisions}=await supabase.from('promotion_decisions')
      .select('*').eq('run_id',run.id).order('id')
    return {data:{run,decisions:decisions||[]}, error:null}
  },

  // Arm a run: snapshot active students into decisions, defaulted from the class map.
  // Returns { run, terminalClassIds } so the UI can warn about unmapped classes.
  async armPromotionRun(fromSessionId, armedBy){
    // Promotion term = highest term_order in the session.
    let tq=supabase.from('terms').select('id,term_order').eq('session_id',fromSessionId)
    if(this._schoolId) tq=tq.eq('school_id',this._schoolId)
    const {data:terms}=await tq
    const promoTerm=(terms||[]).slice().sort((a,b)=>(b.term_order||0)-(a.term_order||0))[0]

    const {data:run,error:re}=await supabase.from('promotion_runs')
      .insert({school_id:this._schoolId, from_session_id:+fromSessionId,
        promotion_term_id:promoTerm?.id||null, status:'armed', armed_by:armedBy||null})
      .select().single()
    if(re) return {data:null,error:re}

    let sq=supabase.from('students').select('id,class_id,status')
    if(this._schoolId) sq=sq.eq('school_id',this._schoolId)
    const {data:students}=await sq
    let cq=supabase.from('classes').select('id,promotes_to_class_id')
    if(this._schoolId) cq=cq.eq('school_id',this._schoolId)
    const {data:classes}=await cq
    const promMap=Object.fromEntries((classes||[]).map(c=>[c.id,c.promotes_to_class_id]))

    const active=(students||[]).filter(s=>(s.status||'active')==='active' && s.class_id)
    const terminalClassIds=new Set()
    const rows=active.map(s=>{
      const to=promMap[s.class_id]
      if(!to) terminalClassIds.add(s.class_id)
      return {run_id:run.id, school_id:this._schoolId, student_id:String(s.id),
        from_class_id:s.class_id, to_class_id:to||null, decision: to ? 'promote' : 'graduate'}
    })
    if(rows.length) await supabase.from('promotion_decisions').insert(rows)
    return {data:{run, terminalClassIds:[...terminalClassIds]}, error:null}
  },

  async updatePromotionDecision(id, patch){
    let q=supabase.from('promotion_decisions')
      .update({...patch, updated_at:new Date().toISOString()}).eq('id',id)
    if(this._schoolId) q=q.eq('school_id',this._schoolId)
    return q
  },

  // Discard an armed (uncommitted) run — cascade deletes its decisions.
  async discardPromotionRun(runId){
    let q=supabase.from('promotion_runs').delete().eq('id',runId).eq('status','armed')
    if(this._schoolId) q=q.eq('school_id',this._schoolId)
    return q
  },

  // Commit: apply class/status changes (grouped so ~550 students = a handful of queries),
  // then create the next session as an INACTIVE draft with its 3 terms. Never activates it.
  async commitPromotionRun(runId, {committedBy, nextSessionName}={}){
    const {data:run}=await supabase.from('promotion_runs').select('*').eq('id',runId).single()
    if(!run) return {error:{message:'Promotion run not found'}}
    const {data:decisions}=await supabase.from('promotion_decisions').select('*').eq('run_id',runId)

    const byDest={}; const gradIds=[]
    for(const d of decisions||[]){
      if(d.decision==='promote' && d.to_class_id){ (byDest[d.to_class_id]=byDest[d.to_class_id]||[]).push(d.student_id) }
      else if(d.decision==='graduate'){ gradIds.push(d.student_id) }
      // 'repeat' = no change
    }
    for(const [toClass,ids] of Object.entries(byDest)){
      let q=supabase.from('students').update({class_id:+toClass}).in('id',ids)
      if(this._schoolId) q=q.eq('school_id',this._schoolId)
      await q
    }
    if(gradIds.length){
      let q=supabase.from('students').update({status:'graduated'}).in('id',gradIds)
      if(this._schoolId) q=q.eq('school_id',this._schoolId)
      await q
    }

    // Draft next session (inactive) + its three terms.
    let toSessionId=null
    if(nextSessionName){
      const {data:newSess,error:se}=await supabase.from('sessions')
        .insert({school_id:this._schoolId, name:nextSessionName, is_active:false}).select().single()
      if(!se && newSess){
        toSessionId=newSess.id
        const termRows=[1,2,3].map(n=>({school_id:this._schoolId, session_id:newSess.id,
          name:(n===1?'1st':n===2?'2nd':'3rd')+' Term', term_order:n, is_active:false}))
        await supabase.from('terms').insert(termRows)
      }
    }

    await supabase.from('promotion_runs').update({status:'committed',
      committed_by:committedBy||null, committed_at:new Date().toISOString(), to_session_id:toSessionId})
      .eq('id',runId)
    return {data:{toSessionId, promoted:Object.values(byDest).reduce((a,b)=>a+b.length,0), graduated:gradIds.length}, error:null}
  },

  // Undo a committed run: restore class/status; delete the draft next session iff never activated.
  async revertPromotionRun(runId){
    const {data:run}=await supabase.from('promotion_runs').select('*').eq('id',runId).single()
    if(!run) return {error:{message:'Promotion run not found'}}
    const {data:decisions}=await supabase.from('promotion_decisions').select('*').eq('run_id',runId)

    const byFrom={}; const gradIds=[]
    for(const d of decisions||[]){
      if(d.decision==='promote' && d.to_class_id){ (byFrom[d.from_class_id]=byFrom[d.from_class_id]||[]).push(d.student_id) }
      else if(d.decision==='graduate'){ gradIds.push(d.student_id) }
    }
    for(const [fromClass,ids] of Object.entries(byFrom)){
      let q=supabase.from('students').update({class_id:+fromClass}).in('id',ids)
      if(this._schoolId) q=q.eq('school_id',this._schoolId)
      await q
    }
    if(gradIds.length){
      let q=supabase.from('students').update({status:'active'}).in('id',gradIds)
      if(this._schoolId) q=q.eq('school_id',this._schoolId)
      await q
    }
    // Remove the drafted next session only if it was never activated.
    if(run.to_session_id){
      const {data:sess}=await supabase.from('sessions').select('is_active').eq('id',run.to_session_id).single()
      if(sess && !sess.is_active){
        await supabase.from('terms').delete().eq('session_id',run.to_session_id).eq('school_id',this._schoolId)
        await supabase.from('sessions').delete().eq('id',run.to_session_id).eq('school_id',this._schoolId)
      }
    }
    await supabase.from('promotion_runs').update({status:'reverted'}).eq('id',runId)
    return {data:true, error:null}
  },



  async getResults(filters={}){

    // Paginate to avoid the 1000-row PostgREST default cap.

    // A single class with 63 students × 18 subjects = 1134 rows — pagination is essential.

    const BATCH=1000;

    const all=[];

    let from=0;

    while(true){

      let q=supabase.from('portal_results')

        .select('*,students(id,name,admission_number),classes(id,name,level,section_id,sections(id,name)),section_subjects(id,name,code),terms(id,name,term_order),sessions(id,name),component_scores')

        .range(from,from+BATCH-1);

      if(this._schoolId) q=q.eq('school_id',this._schoolId);

      if(filters.student_id)q=q.eq('student_id',filters.student_id);

      if(filters.class_id)q=q.eq('class_id',filters.class_id);

      if(filters.term_id)q=q.eq('term_id',filters.term_id);

      if(filters.session_id)q=q.eq('session_id',filters.session_id);

      const{data,error}=await q;

      if(error)return{data:all.length?all:null,error};

      if(data&&data.length)all.push(...data);

      if(!data||data.length<BATCH)break;

      from+=BATCH;

    }

    return{data:all,error:null};

  },

  async upsertResult(data){

    // Always stamp school_id — never trust caller-supplied value

    const inject=(r)=>this._schoolId?{...r,school_id:this._schoolId}:r;

    const payload=Array.isArray(data)?data.map(inject):inject(data);

    return supabase.from('portal_results').upsert(payload,{onConflict:'student_id,class_id,subject_id,term_id,session_id'}).select()

  },

  // Interlock helpers — fast COUNT queries, no row data transferred

  async countResultsByClass(classId){

    const{count}=await supabase.from('portal_results')

      .select('*',{count:'exact',head:true}).eq('class_id',classId);

    return{count:count||0};

  },

  async countResultsBySubjectClass(classId,subjectId){

    const{count}=await supabase.from('portal_results')

      .select('*',{count:'exact',head:true}).eq('class_id',classId).eq('subject_id',subjectId);

    return{count:count||0};

  },

  async deleteResult(id){

    let q=supabase.from('portal_results').delete().eq('id',id)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },

  async clearClassResults(classId,termId,sessionId){

    let q=supabase.from('portal_results').delete()

      .eq('class_id',classId).eq('term_id',termId).eq('session_id',sessionId)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },

  async clearSubjectResults(classId,subjectId,termId,sessionId){

    let q=supabase.from('portal_results').delete()

      .eq('class_id',classId).eq('subject_id',subjectId)

      .eq('term_id',termId).eq('session_id',sessionId)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },

  async clearSectionResults(sectionId,termId,sessionId){

    // Delete results for all classes in the section for the given term+session

    let cq=supabase.from('classes').select('id').eq('section_id',sectionId)

    if(this._schoolId) cq=cq.eq('school_id',this._schoolId)

    const {data:cls}=await cq

    const classIds=(cls||[]).map(c=>c.id)

    if(!classIds.length)return{data:null,error:null}

    let q=supabase.from('portal_results').delete()

      .in('class_id',classIds).eq('term_id',termId).eq('session_id',sessionId)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },

  // Danger-zone: wipe ALL results / payments for this school only

  async clearAllResults(){

    if(!this._schoolId) return {error:{message:'No school context set'}}

    return supabase.from('portal_results').delete().eq('school_id',this._schoolId)

  },

  async clearAllPayments(){

    if(!this._schoolId) return {error:{message:'No school context set'}}

    const r1=await supabase.from('fee_payments').delete().eq('school_id',this._schoolId)

    if(r1.error) return r1

    return supabase.from('payments').delete().eq('school_id',this._schoolId)

  },



  async getGradingSchema(sectionId=null,schemaType=null){

    let q=supabase.from('grading_schema').select('*').order('min_score',{ascending:false})

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    if(sectionId!=null) q=q.or(`section_id.eq.${sectionId},section_id.is.null`)

    if(schemaType) q=q.eq('schema_type',schemaType)

    return q

  },

  async upsertGrade(data,id=null){

    if(id)return supabase.from('grading_schema').update(data).eq('id',id).select().single()

    const ins={...data}; if(this._schoolId&&!ins.school_id) ins.school_id=this._schoolId

    return supabase.from('grading_schema').insert(ins).select().single()

  },

  async deleteGrade(id){

    let q=supabase.from('grading_schema').delete().eq('id',id)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },



  // ── CAE TRAITS ────────────────────────────────────────────────────────────

  async getCaeTraits(sectionId=null){

    let q=supabase.from('cae_traits').select('*').eq('is_active',true).order('sort_order')

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    if(sectionId!=null) q=q.eq('section_id',sectionId)

    return q

  },

  async upsertCaeTrait(data,id=null){

    if(id)return supabase.from('cae_traits').update(data).eq('id',id).select().single()

    const ins={...data}; if(this._schoolId&&!ins.school_id) ins.school_id=this._schoolId

    return supabase.from('cae_traits').insert(ins).select().single()

  },

  async deleteCaeTrait(id){

    let q=supabase.from('cae_traits').delete().eq('id',id)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },

  async getCaeRatings(sectionId=null){

    let q=supabase.from('cae_ratings').select('*').order('sort_order')

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    if(sectionId!=null) q=q.eq('section_id',sectionId)

    return q

  },

  async upsertCaeRating(data,id=null){

    if(id)return supabase.from('cae_ratings').update(data).eq('id',id).select().single()

    const ins={...data}; if(this._schoolId&&!ins.school_id) ins.school_id=this._schoolId

    return supabase.from('cae_ratings').insert(ins).select().single()

  },

  async deleteCaeRating(id){

    let q=supabase.from('cae_ratings').delete().eq('id',id)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },

  async getCaeResults(filters={}){

    let q=supabase.from('portal_cae_results')

      .select('*,cae_traits(id,category),cae_ratings(id,label,symbol)')

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    if(filters.student_id) q=q.eq('student_id',filters.student_id)

    if(filters.class_id)   q=q.eq('class_id',filters.class_id)

    if(filters.term_id)    q=q.eq('term_id',filters.term_id)

    if(filters.session_id) q=q.eq('session_id',filters.session_id)

    return q

  },

  async upsertCaeResult(data){

    const inject=r=>this._schoolId?{...r,school_id:this._schoolId}:r

    const payload=Array.isArray(data)?data.map(inject):inject(data)

    return supabase.from('portal_cae_results')

      .upsert(payload,{onConflict:'student_id,class_id,term_id,session_id,trait_id'}).select()

  },



  // ── REPORT CARD PUBLISH ───────────────────────────────────────────────────

  async getReportPublish(filters={}){

    let q=supabase.from('report_card_publish').select('*')

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    if(filters.class_id)   q=q.eq('class_id',filters.class_id)

    if(filters.term_id)    q=q.eq('term_id',filters.term_id)

    if(filters.session_id) q=q.eq('session_id',filters.session_id)

    return q

  },

  async upsertReportPublish(data){

    const payload=this._schoolId?{...data,school_id:this._schoolId}:data

    return supabase.from('report_card_publish')

      .upsert(payload,{onConflict:'school_id,class_id,term_id,session_id'}).select().single()

  },



  async getFeeStructures(filters={}){

    let q=supabase.from('fee_structures').select('*,classes(id,name),sections(id,name,code),sessions(id,name),terms(id,name)').order('fee_type')

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    if(filters.section_id)q=q.eq('section_id',filters.section_id)

    if(filters.session_id)q=q.eq('session_id',filters.session_id)

    if(filters.term_id)q=q.eq('term_id',filters.term_id)

    return q

  },

  async upsertFee(data,id=null){

    if(id)return supabase.from('fee_structures').update(data).eq('id',id).select().single()

    const ins={...data}; if(this._schoolId&&!ins.school_id) ins.school_id=this._schoolId

    return supabase.from('fee_structures').insert(ins).select().single()

  },

  async deleteFee(id){return supabase.from('fee_structures').delete().eq('id',id)},



  async getPayments(studentId=null){

    let q=supabase.from('payments').select('*,students(id,name,admission_number),sessions(name),terms(name),fee_structures(fee_type,amount)').order('created_at',{ascending:false})

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    if(studentId)q=q.eq('student_id',studentId)

    return q

  },

  async upsertPayment(data,id=null){

    if(id)return supabase.from('payments').update(data).eq('id',id).select().single()

    const ins={...data}; if(this._schoolId&&!ins.school_id) ins.school_id=this._schoolId

    return supabase.from('payments').insert(ins).select().single()

  },



  async getAnnouncements(){

    let q=supabase.from('announcements').select('*').order('created_at',{ascending:false})

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },

  async upsertAnnouncement(data,id=null){

    if(id)return supabase.from('announcements').update(data).eq('id',id).select().single()

    const ins={...data}; if(this._schoolId&&!ins.school_id) ins.school_id=this._schoolId

    return supabase.from('announcements').insert(ins).select().single()

  },

  async deleteAnnouncement(id){

    let q=supabase.from('announcements').delete().eq('id',id)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },



  // ── STUDENT REQUESTS ──────────────────────────────────────────────────────

  async getStudentRequests(status=null){

    let q=supabase.from('student_requests')

      .select('*,classes(id,name,sections(name,code,color))')

      .order('created_at',{ascending:false})

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    if(status)q=q.eq('status',status)

    return q

  },

  async submitStudentRequest(data){

    const payload=this._schoolId?{...data,school_id:this._schoolId}:data

    return supabase.from('student_requests').insert(payload).select().single()

  },

  async submitStudentRequestsBulk(rows){

    const payload=this._schoolId?rows.map(r=>({...r,school_id:this._schoolId})):rows

    return supabase.from('student_requests').insert(payload).select()

  },

  async reviewStudentRequest(id,status,adminNote,reviewedBy){

    return supabase.from('student_requests').update({

      status,admin_note:adminNote||null,

      reviewed_at:new Date().toISOString(),reviewed_by:reviewedBy

    }).eq('id',id).select().single()

  },

  async approveAndCreateStudent(reqId,reviewedBy){

    let rq=supabase.from('student_requests').select('*').eq('id',reqId)

    if(this._schoolId) rq=rq.eq('school_id',this._schoolId)

    const {data:req,error:re}=await rq.single()

    if(re)return{error:re}

    const {data:seq,error:se}=await supabase.rpc('nextval_student_reg')

    if(se)return{error:se}

    const num=seq<100?String(seq).padStart(2,'0'):String(seq)

    const prefix=this._studentIdPrefix||'SCH'

    const newId=`${prefix}/${num}`

    const name=[req.first_name,req.middle_name,req.last_name].filter(Boolean).join(' ')

    const ins={

      id:newId,admission_number:newId,name,

      first_name:req.first_name,middle_name:req.middle_name||null,last_name:req.last_name,

      email:req.email||null,gender:req.gender||'Male',

      dob:req.dob||null,age:req.age||null,

      class_id:req.class_id||null,

      admission_year:req.admission_year||String(new Date().getFullYear()),

      password_hash:newId,

    }

    if(this._schoolId) ins.school_id=this._schoolId

    const {error:ue}=await supabase.from('students').insert(ins)

    if(ue)return{error:ue}

    await supabase.from('student_requests').update({

      status:'approved',reviewed_at:new Date().toISOString(),reviewed_by:reviewedBy

    }).eq('id',reqId)

    return{data:{id:newId}}

  },



  // ── SETTINGS ──────────────────────────────────────────────────────────────

  async getSettings(){

    let q=supabase.from('school_settings').select('*')

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },

  async getSetting(key){

    let q=supabase.from('school_settings').select('value').eq('key',key)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q.single()

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

  // Login-time settings fetch (before school context is set) — pass schoolId explicitly

  async loginGetSettingsForSchool(schoolId){

    return supabase.from('school_settings').select('*').eq('school_id',schoolId)

  },

  // Login access control — fetch only the three access keys (fast, used every login attempt)

  async getLoginAccessSettings(schoolId){const {data,error}=await edgePost("preauth-lookup",{action:"access_settings",school_id:schoolId});if(error)return {};const out={};(data?.data||[]).forEach(r=>{out[r.key]=r.value});return out;},

  // ── CAE SCORE STRUCTURES ──────────────────────────────────────────────────

  // One structure per section; each has ordered components (literal or formula)

  async getCaeStructures(){

    let q=supabase.from('cae_structures')

      .select('*,sections(id,name,code,color)')

      .order('id')

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },

  async getCaeStructureBySectionId(sectionId){

    let q=supabase.from('cae_structures')

      .select('*,sections(id,name,code,color)')

      .eq('section_id',sectionId)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q.maybeSingle()

  },

  async upsertCaeStructure(data,id=null){

    const ins={...data}; if(this._schoolId&&!ins.school_id) ins.school_id=this._schoolId

    if(id){

      let q=supabase.from('cae_structures').update({...ins,updated_at:new Date().toISOString()}).eq('id',id)

      if(this._schoolId) q=q.eq('school_id',this._schoolId)

      return q.select().single()

    }

    return supabase.from('cae_structures').insert(ins).select().single()

  },

  async deleteCaeStructure(id){

    let q=supabase.from('cae_structures').delete().eq('id',id)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },



  async getCaeComponents(caeId){

    return supabase.from('cae_components')

      .select('*')

      .eq('cae_id',caeId)

      .order('display_order')

  },

  async upsertCaeComponent(data,id=null){

    if(id)return supabase.from('cae_components').update(data).eq('id',id).select().single()

    return supabase.from('cae_components').insert(data).select().single()

  },

  async deleteCaeComponent(id){return supabase.from('cae_components').delete().eq('id',id)},

  // Replace ALL components for a structure in one shot (delete+insert)

  async replaceCaeComponents(caeId, components){

    await supabase.from('cae_components').delete().eq('cae_id',caeId)

    if(!components.length) return {data:[],error:null}

    const rows = components.map((c,i)=>({

      cae_id: caeId,

      component_name: c.component_name,

      value_or_formula: c.value_or_formula,

      mode: c.mode,

      is_total_score: c.is_total_score,

      display_order: i,

    }))

    return supabase.from('cae_components').insert(rows).select()

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

  async setUserPermission(userType,userId,pageId,allowed){

    return supabase.from('user_permissions')

      .upsert({user_type:userType,user_id:userId,page_id:pageId,allowed,updated_at:new Date().toISOString()},

        {onConflict:'user_type,user_id,page_id'}).select()

  },

  async removeUserPermission(userType,userId,pageId){

    return supabase.from('user_permissions')

      .delete().eq('user_type',userType).eq('user_id',userId).eq('page_id',pageId)

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



  // ── RESULT APPROVALS ──────────────────────────────────────────────────────

  async getResultApprovals(filters={}){

    let q=supabase.from('result_approvals')

      .select('*,classes(id,name),terms(id,name),sessions(id,name)')

      .order('class_id')

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    if(filters.class_id)   q=q.eq('class_id',filters.class_id)

    if(filters.term_id)    q=q.eq('term_id',filters.term_id)

    if(filters.session_id) q=q.eq('session_id',filters.session_id)

    return q

  },

  async getResultApproval(classId,termId,sessionId){

    let q=supabase.from('result_approvals')

      .select('*')

      .eq('class_id',classId).eq('term_id',termId).eq('session_id',sessionId)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q.maybeSingle()

  },

  async upsertResultApproval(data){

    const payload=this._schoolId?{...data,school_id:this._schoolId}:data

    return supabase.from('result_approvals')

      .upsert({...payload,updated_at:new Date().toISOString()},{onConflict:'school_id,class_id,term_id,session_id'})

      .select().single()

  },

  // Count classes with EA approval for the currently active session+term

  async countEAApprovedActive(){

    if(!this._schoolId) return{count:0};

    const [{data:ss},{data:ts}]=await Promise.all([

      supabase.from('sessions').select('id').eq('is_active',true).eq('school_id',this._schoolId).limit(1),

      supabase.from('terms').select('id').eq('is_active',true).eq('school_id',this._schoolId).limit(1),

    ]);

    const sessionId=ss?.[0]?.id;

    const termId=ts?.[0]?.id;

    if(!sessionId||!termId)return{count:0};

    let q=supabase.from('result_approvals')

      .select('*',{count:'exact',head:true})

      .eq('ea_status','approved')

      .eq('term_id',termId)

      .eq('session_id',sessionId)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    const{count}=await q;

    return{count:count||0};

  },

  async approveEA(classId,termId,sessionId,userId,notes=''){

    const payload={class_id:classId,term_id:termId,session_id:sessionId,

      ea_status:'approved',ea_approved_by:userId,ea_approved_at:new Date().toISOString(),ea_notes:notes,

      updated_at:new Date().toISOString()}

    if(this._schoolId) payload.school_id=this._schoolId

    return supabase.from('result_approvals')

      .upsert(payload,{onConflict:'class_id,term_id,session_id'}).select().single()

  },

  async revokeEA(classId,termId,sessionId){

    const payload={class_id:classId,term_id:termId,session_id:sessionId,

      ea_status:'pending',ea_approved_by:null,ea_approved_at:null,

      ma_status:'pending',ma_approved_by:null,ma_approved_at:null,

      updated_at:new Date().toISOString()}

    if(this._schoolId) payload.school_id=this._schoolId

    return supabase.from('result_approvals')

      .upsert(payload,{onConflict:'class_id,term_id,session_id'}).select().single()

  },

  async approveMA(classId,termId,sessionId,userId,notes=''){

    const payload={class_id:classId,term_id:termId,session_id:sessionId,

      ma_status:'approved',ma_approved_by:userId,ma_approved_at:new Date().toISOString(),ma_notes:notes,

      updated_at:new Date().toISOString()}

    if(this._schoolId) payload.school_id=this._schoolId

    return supabase.from('result_approvals')

      .upsert(payload,{onConflict:'class_id,term_id,session_id'}).select().single()

  },

  async revokeMA(classId,termId,sessionId){

    const payload={class_id:classId,term_id:termId,session_id:sessionId,

      ma_status:'pending',ma_approved_by:null,ma_approved_at:null,

      updated_at:new Date().toISOString()}

    if(this._schoolId) payload.school_id=this._schoolId

    return supabase.from('result_approvals')

      .upsert(payload,{onConflict:'class_id,term_id,session_id'}).select().single()

  },



  // ── SIGNATURES ────────────────────────────────────────────────────────────

  async getSignatures(activeOnly=true){

    let q=supabase.from('signatures').select('*').order('name')

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    if(activeOnly) q=q.eq('is_active',true)

    return q

  },

  async upsertSignature(data,id=null){

    const payload={...data,updated_at:new Date().toISOString()}

    if(this._schoolId&&!payload.school_id) payload.school_id=this._schoolId

    if(id) return supabase.from('signatures').update(payload).eq('id',id).select().single()

    return supabase.from('signatures').insert(payload).select().single()

  },

  async deleteSignature(id){

    let q=supabase.from('signatures').delete().eq('id',id)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },



  // ── REPORT TEMPLATES ──────────────────────────────────────────────────────

  async getReportTemplates(){

    let q=supabase.from('report_templates')

      .select('*,teacher_sig:signatures!report_templates_teacher_signature_id_fkey(id,name,image_url),principal_sig:signatures!report_templates_principal_signature_id_fkey(id,name,image_url)')

      .order('is_default',{ascending:false}).order('name')

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },

  async upsertReportTemplate(data,id=null){

    const payload={...data,updated_at:new Date().toISOString()}

    if(this._schoolId&&!payload.school_id) payload.school_id=this._schoolId

    if(id) return supabase.from('report_templates').update(payload).eq('id',id).select().single()

    return supabase.from('report_templates').insert(payload).select().single()

  },

  async deleteReportTemplate(id){

    let q=supabase.from('report_templates').delete().eq('id',id)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },

  async setDefaultTemplate(id){

    let q=supabase.from('report_templates').update({is_default:false}).neq('id',id)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    await q

    return supabase.from('report_templates').update({is_default:true}).eq('id',id).select().single()

  },



  // ── RESULT OVERVIEW — all classes at once for progress dashboard ────────────

  // Single paginated query instead of N per-class queries

  async getResultsOverview(termId,sessionId){

    if(!this._schoolId) return{data:[],error:null}

    const BATCH=1000; const all=[]; let from=0;

    while(true){

      let q=supabase.from('portal_results')

        .select('student_id,class_id,subject_id')

        .eq('term_id',termId).eq('session_id',sessionId)

        .eq('school_id',this._schoolId)

        .range(from,from+BATCH-1)

      const{data,error}=await q

      if(error)return{data:all.length?all:null,error}

      if(data?.length)all.push(...data)

      if(!data||data.length<BATCH)break

      from+=BATCH

    }

    return{data:all,error:null}

  },

  // All class→subject mappings for the school in one query

  async getAllClassSubjects(){

    if(!this._schoolId) return{data:[],error:null}

    let q=supabase.from('class_subjects')

      .select('class_id,subject_id,subjects(id,name,code)')

      .eq('school_id',this._schoolId)

    return q

  },



  // ── RESULT COMPLETENESS CHECK ─────────────────────────────────────────────

  // Aggregated results for the analytics dashboard — includes student/class/subject names.
  // Paginated to handle school-wide data (potentially thousands of rows).
  async getAcademicSummaryData({sessionId,termId,classIds}){

    const BATCH=1000;const all=[];let from=0;

    while(true){

      let q=supabase.from('portal_results')

        .select('student_id,class_id,total_score,ca_score,exam_score,students(first_name,last_name,middle_name),classes(name,sections(name,color)),section_subjects(name)')

        .eq('session_id',sessionId).eq('term_id',termId)

        .not('total_score','is',null)

        .range(from,from+BATCH-1);

      if(this._schoolId) q=q.eq('school_id',this._schoolId);

      if(classIds&&classIds.length) q=q.in('class_id',classIds);

      const{data,error}=await q;

      if(error)return{data:all.length?all:null,error};

      if(data&&data.length)all.push(...data);

      if(!data||data.length<BATCH)break;

      from+=BATCH;

    }

    return{data:all,error:null};

  },

  // Returns results count per student for a class+term+session.

  // Paginated — a class with 63 students × 18 subjects = 1134 rows, exceeding the 1000-row default cap.

  async getResultsCompleteness(classId,termId,sessionId){

    const BATCH=1000;

    const all=[];

    let from=0;

    while(true){

      const{data,error}=await supabase.from('portal_results')

        .select('student_id,subject_id,total_score,section_subjects(id,name)')

        .eq('class_id',classId).eq('term_id',termId).eq('session_id',sessionId)

        .range(from,from+BATCH-1);

      if(error)return{data:all.length?all:null,error};

      if(data&&data.length)all.push(...data);

      if(!data||data.length<BATCH)break;

      from+=BATCH;

    }

    return{data:all,error:null};

  },

  async getClassSubjectIds(classId){

    return supabase.from('class_subjects')

      .select('section_subject_id,section_subjects(id,name)')

      .eq('class_id',classId)

  },



  // ── UPLOAD SIGNATURE IMAGE to Supabase Storage ───────────────────────────

  async uploadSignatureImage(file,filename){

    const path=`signatures/${Date.now()}_${filename}`

    const {data,error}=await supabase.storage.from('school-assets').upload(path,file,{upsert:true})

    if(error)return{error}

    const {data:{publicUrl}}=supabase.storage.from('school-assets').getPublicUrl(path)

    return{data:{url:publicUrl,path}}

  },



  // ── STUDENT ID GENERATION ─────────────────────────────────────────────────

  // Looks at the actual students table to find the highest existing number,

  // then returns prefix/(max+1). This prevents gaps caused by failed inserts

  // or sequence skips in the old nextval approach.

  async nextStudentId(prefix='RGS'){

    // Uses a DB-side MAX() via RPC — immune to Supabase's 1000-row client cap

    const {data,error}=await supabase.rpc('get_next_student_id',{prefix})

    if(error){ console.error('[nextStudentId]',error) }

    return data || `${prefix}/01`

  },



  // Returns an array of `count` sequential IDs in one DB read.

  // Use this for bulk uploads instead of calling nextStudentId repeatedly.

  async nextStudentIds(prefix='RGS', count=1){

    const {data,error}=await supabase.rpc('get_next_student_id',{prefix})

    if(error)console.error('[nextStudentIds]',error)

    const first=data||`${prefix}/01`

    const base=parseInt(first.split('/')[1],10)

    return Array.from({length:count},(_,i)=>{

      const n=base+i

      return `${prefix}/${n<100?String(n).padStart(2,'0'):String(n)}`

    })

  },



  // Bulk-insert an array of student records in a single call.

  // Automatically injects school_id into every row if not already set.

  async insertStudentsBulk(rows){

    const hydrated=this._schoolId

      ? rows.map(r=>r.school_id?r:{...r,school_id:this._schoolId})

      : rows;

    return supabase.from('students').insert(hydrated)

  },



  // ── ATTENDANCE ────────────────────────────────────────────────────────────

  async getAttendance(filters={}){

    let q=supabase.from('attendance').select('*,students(id,first_name,last_name,name),classes(id,name)').order('date',{ascending:false})

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    if(filters.class_id)   q=q.eq('class_id',filters.class_id)

    if(filters.date)       q=q.eq('date',filters.date)

    if(filters.term_id)    q=q.eq('term_id',filters.term_id)

    if(filters.session_id) q=q.eq('session_id',filters.session_id)

    if(filters.student_id) q=q.eq('student_id',filters.student_id)

    return q

  },

  async upsertAttendance(records){

    const inject=r=>this._schoolId?{...r,school_id:this._schoolId}:r

    const rows=Array.isArray(records)?records.map(inject):inject(records)

    return supabase.from('attendance')

      .upsert(rows,{onConflict:'school_id,student_id,date'})

      .select()

  },

  async getAttendanceSummary(classId,termId,sessionId){

    let q=supabase.from('attendance')

      .select('student_id,status')

      .eq('class_id',classId).eq('term_id',termId).eq('session_id',sessionId)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },



  // ── EMAIL TEMPLATES ───────────────────────────────────────────────────────

  async getEmailTemplates(){

    let q=supabase.from('email_templates').select('*').order('name')

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },

  async upsertEmailTemplate(data,id=null){

    const payload={...data,updated_at:new Date().toISOString()}

    if(this._schoolId&&!payload.school_id) payload.school_id=this._schoolId

    if(id){

      let q=supabase.from('email_templates').update(payload).eq('id',id)

      if(this._schoolId) q=q.eq('school_id',this._schoolId)

      return q.select().single()

    }

    return supabase.from('email_templates').insert(payload).select().single()

  },

  async deleteEmailTemplate(id){

    let q=supabase.from('email_templates').delete().eq('id',id)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

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



  // ── EMAIL QUEUE (background batch processing) ─────────────────────────────

  async queueEmailBatch(batchId,emails,schoolId){

    const rows=emails.map(e=>({

      batch_id:batchId,

      school_id:schoolId||null,

      to_email:e.to,

      subject:e.subject,

      html:e.html,

      attachments:e.attachments||[],

      status:'pending',

      metadata:e.metadata||{},

    }));

    // Insert in chunks of 200 to avoid payload limits

    const CHUNK=200;

    for(let i=0;i<rows.length;i+=CHUNK){

      const{error}=await supabase.from('email_queue').insert(rows.slice(i,i+CHUNK));

      if(error)return{error};

    }

    return{error:null};

  },

  async getEmailQueueStatus(batchId){

    const{data,error}=await supabase.from('email_queue')

      .select('status,error_message,to_email,processed_at')

      .eq('batch_id',batchId);

    if(error)return{data:null,error};

    const total=(data||[]).length;

    const sent=(data||[]).filter(r=>r.status==='sent').length;

    const failed=(data||[]).filter(r=>r.status==='failed').length;

    const pending=(data||[]).filter(r=>r.status==='pending'||r.status==='sending').length;

    const failedRecipients=(data||[]).filter(r=>r.status==='failed').map(r=>({email:r.to_email,error:r.error_message}));

    return{data:{total,sent,failed,pending,failedRecipients,done:total>0&&pending===0},error:null};

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

  // Alias used by students.jsx bulk-email polling — same shape as getEmailQueueStatus
  async getEmailBatchProgress(batchId){ return this.getEmailQueueStatus(batchId); },

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



  // ── FEE ITEMS ─────────────────────────────────────────────────────────────

  async getFeeItems(activeOnly=false){

    let q=supabase.from('fee_items').select('*').order('name')

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    if(activeOnly)q=q.eq('is_active',true)

    return q

  },

  // Returns {[template_id]: billCount} for the given academic year + term

  async getTemplateBillCounts(academicYear,term){

    const{data,error}=await supabase.from('fee_bills')

      .select('template_id').eq('academic_year',academicYear).eq('term',term)

      .not('template_id','is',null)

    if(error)return{data:{},error}

    const counts={}

    ;(data||[]).forEach(b=>{counts[b.template_id]=(counts[b.template_id]||0)+1})

    return{data:counts,error:null}

  },

  // Returns {[fee_item_id]: billCount} — how many bills for the given term contain each item

  async getItemBillCounts(academicYear,term){

    const{data:bills,error:bErr}=await supabase.from('fee_bills')

      .select('id').eq('academic_year',academicYear).eq('term',term)

    if(bErr||!bills?.length)return{data:{},error:bErr}

    const billIds=bills.map(b=>b.id)

    const BATCH=1000;const allRows=[];let from=0

    while(true){

      const{data,error}=await supabase.from('fee_bill_items')

        .select('fee_item_id').in('bill_id',billIds).range(from,from+BATCH-1)

      if(error)return{data:{},error}

      if(data?.length)allRows.push(...data)

      if(!data||data.length<BATCH)break

      from+=BATCH

    }

    const counts={}

    allRows.forEach(i=>{counts[i.fee_item_id]=(counts[i.fee_item_id]||0)+1})

    return{data:counts,error:null}

  },

  async upsertFeeItem(data,id=null){

    const payload={...data,updated_at:new Date().toISOString()}

    if(id)return supabase.from('fee_items').update(payload).eq('id',id).select().single()

    return supabase.from('fee_items').insert(payload).select().single()

  },

  async deleteFeeItem(id){

    let q=supabase.from('fee_items').delete().eq('id',id)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },

  // Returns counts of templates and bills that reference this fee item — used for deletion interlock

  async getFeeItemUsage(id){

    const [tmplRes,billRes]=await Promise.all([

      supabase.from('fee_template_items').select('id,fee_templates(name)',{count:'exact'}).eq('fee_item_id',id),

      supabase.from('fee_bill_items').select('id',{count:'exact'}).eq('fee_item_id',id).limit(1),

    ]);

    return{

      templates:tmplRes.data||[],

      templateCount:tmplRes.count||0,

      billCount:billRes.count||0,

      error:tmplRes.error||billRes.error,

    };

  },



  // ── FEE TEMPLATES ─────────────────────────────────────────────────────────

  async getFeeTemplates(){

    let q=supabase.from('fee_templates').select('*,fee_template_items(*,fee_items!fee_template_items_fee_item_id_fkey(id,name))').order('created_at',{ascending:false})

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },

  async upsertFeeTemplate(data,id=null){

    const payload={...data,updated_at:new Date().toISOString()}

    if(id)return supabase.from('fee_templates').update(payload).eq('id',id).select().single()

    const ins=this._schoolId?{...payload,school_id:this._schoolId}:payload

    return supabase.from('fee_templates').insert(ins).select().single()

  },

  async deleteFeeTemplate(id){

    let q=supabase.from('fee_templates').delete().eq('id',id)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },

  async setActiveTemplate(id){

    let deactivate=supabase.from('fee_templates').update({is_active:false}).neq('id',id)

    if(this._schoolId) deactivate=deactivate.eq('school_id',this._schoolId)

    await deactivate

    return supabase.from('fee_templates').update({is_active:true}).eq('id',id).select().single()

  },



  // ── FEE TEMPLATE ITEMS ────────────────────────────────────────────────────

  async upsertFeeTemplateItem(data,id=null){

    if(id)return supabase.from('fee_template_items').update(data).eq('id',id).select().single()

    return supabase.from('fee_template_items').insert(data).select().single()

  },

  async deleteFeeTemplateItem(id){return supabase.from('fee_template_items').delete().eq('id',id)},

  async deleteTemplateItems(templateId){return supabase.from('fee_template_items').delete().eq('template_id',templateId)},

  async insertTemplateItems(rows){return supabase.from('fee_template_items').insert(rows).select()},



  // ── FEE BILLS ─────────────────────────────────────────────────────────────

  async deleteOrphanedBills(){

    // Paginate students — DB has 1000+ students; unpaginated fetch would cap at 1000

    // and cause valid bills for students >1000 to be wrongly classified as orphans.

    const BATCH=1000;

    const allStudentIds=[];

    let from=0;

    while(true){

      const{data,error}=await supabase.from('students').select('id').range(from,from+BATCH-1);

      if(error)return{deleted:0,error};

      if(data&&data.length)allStudentIds.push(...data.map(s=>s.id));

      if(!data||data.length<BATCH)break;

      from+=BATCH;

    }

    // Paginate bills too — could exceed 1000 over time

    const allBills=[];

    from=0;

    while(true){

      const{data,error}=await supabase.from('fee_bills').select('id,student_id').range(from,from+BATCH-1);

      if(error)return{deleted:0,error};

      if(data&&data.length)allBills.push(...data);

      if(!data||data.length<BATCH)break;

      from+=BATCH;

    }

    const studentIds=new Set(allStudentIds);

    const orphanIds=allBills.filter(b=>!studentIds.has(b.student_id)).map(b=>b.id);

    if(!orphanIds.length)return{deleted:0};

    const{error}=await supabase.from('fee_bills').delete().in('id',orphanIds);

    return{deleted:error?0:orphanIds.length,error};

  },

  async checkExistingBill(studentId,academicYear,term){

    return supabase.from('fee_bills')

      .select('id')

      .eq('student_id',studentId)

      .eq('academic_year',academicYear)

      .eq('term',term)

      .maybeSingle();

  },

  async getFeeBills(filters={}){

    let q=supabase.from('fee_bills')

      .select('*,fee_bill_items(*),fee_payments(*),fee_refunds(*),fee_discounts(*)')

      .order('created_at',{ascending:false})

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    if(filters.student_id)q=q.eq('student_id',filters.student_id)

    if(filters.status)q=q.eq('status',filters.status)

    if(filters.academic_year)q=q.eq('academic_year',filters.academic_year)

    if(filters.term)q=q.eq('term',filters.term)

    if(filters.section_id)q=q.eq('section_id',filters.section_id)

    if(filters.class_id)q=q.eq('class_id',filters.class_id)

    return q

  },

  async getFeeBill(id){

    return supabase.from('fee_bills').select('*,fee_bill_items(*),fee_payments(*)').eq('id',id).single()

  },

  async upsertFeeBill(data,id=null){

    const payload={...data,updated_at:new Date().toISOString()}

    if(id)return supabase.from('fee_bills').update(payload).eq('id',id).select().single()

    const ins=this._schoolId?{...payload,school_id:this._schoolId}:payload

    return supabase.from('fee_bills').insert(ins).select().single()

  },

  async deleteFeeBill(id){return supabase.from('fee_bills').delete().eq('id',id)},

  async deleteFeeBills(ids){return supabase.from('fee_bills').delete().in('id',ids)},

  async checkExistingBill(studentId,academicYear,term){

    return supabase.from('fee_bills')

      .select('id')

      .eq('student_id',studentId)

      .eq('academic_year',academicYear)

      .eq('term',term)

      .maybeSingle()

  },

  // Returns student_id + class_id list billed for a given term — used for dashboard checklist

  async getBilledStudentIdsForTerm(academicYear,term){

    let q=supabase.from('fee_bills').select('student_id,class_id').eq('academic_year',academicYear).eq('term',term)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },

  // Batch existence check — 1 DB call instead of N

  async getExistingBillsForStudents(studentIds,academicYear,term){

    // Only consider active (non-carried-forward) bills as "already billed".

    // A bill marked carried_forward=true for the same term is data corruption —

    // it should not block a fresh bill from being generated.

    return supabase.from('fee_bills')

      .select('id,student_id')

      .in('student_id',studentIds)

      .eq('academic_year',academicYear)

      .eq('term',term)

      .eq('carried_forward',false);

  },

  // Find corrupt CF bills for the same term — these should be cleaned up after a new bill is created

  async getCorruptCFBillsForStudents(studentIds,academicYear,term){

    return supabase.from('fee_bills')

      .select('id,student_id')

      .in('student_id',studentIds)

      .eq('academic_year',academicYear)

      .eq('term',term)

      .eq('carried_forward',true);

  },



  // Returns all unpaid/partial bills for the given students EXCLUDING the current term

  // Used for carry-forward logic and the "owing from previous term" callout

  async getOwingBillsForStudents(studentIds,currentYear,currentTerm){

    if(!studentIds?.length)return{data:[],error:null};

    const{data,error}=await supabase.from('fee_bills')

      .select('id,student_id,academic_year,term,total_amount,amount_paid,balance,status')

      .in('student_id',studentIds.map(String))

      .eq('carried_forward',false)

      .neq('status','paid');

    if(error)return{data:[],error};

    // Filter out current term in JS (PostgREST OR across two columns is awkward)

    const prev=(data||[]).filter(b=>!(b.academic_year===currentYear&&b.term===currentTerm));

    return{data:prev,error:null};

  },

  // Mark bills as carried forward so they don't count as active debt after carry-forward

  async markBillsCarriedForward(billIds){

    if(!billIds?.length)return{error:null};

    return supabase.from('fee_bills')

      .update({carried_forward:true,updated_at:new Date().toISOString()})

      .in('id',billIds);

  },

  async markBillsPaid(billIds){

    if(!billIds?.length)return{error:null};

    // NOTE: do NOT include `balance` — it is a GENERATED column (total_amount - amount_paid)
    return supabase.from('fee_bills')

      .update({status:'paid',updated_at:new Date().toISOString()})

      .in('id',billIds);

  },

  // Batch: outstanding balance per student across all terms → { [student_id]: number }.
  // Used by the Promotions page to flag graduating students who still owe.
  async getOutstandingBalancesForStudents(studentIds){
    if(!studentIds?.length) return {data:{},error:null};
    const ids=studentIds.map(String);
    const map={};
    const BATCH=1000; let from=0;
    while(true){
      let q=supabase.from('fee_bills')
        .select('student_id,balance,status,carried_forward')
        .in('student_id',ids)
        .eq('carried_forward',false)
        .neq('status','paid')
        .range(from,from+BATCH-1);
      if(this._schoolId) q=q.eq('school_id',this._schoolId);
      const {data,error}=await q;
      if(error) return {data:map,error};
      (data||[]).forEach(b=>{ map[String(b.student_id)]=(map[String(b.student_id)]||0)+(parseFloat(b.balance)||0); });
      if(!data||data.length<BATCH) break;
      from+=BATCH;
    }
    return {data:map,error:null};
  },

  // Total outstanding balance for a single student across all terms (for report card block)

  async getStudentOutstandingBalance(studentId){

    const{data,error}=await supabase.from('fee_bills')

      .select('balance,status')

      .eq('student_id',String(studentId))

      .eq('carried_forward',false)

      .neq('status','paid');

    if(error)return{balance:0,error};

    const balance=(data||[]).reduce((a,b)=>a+(parseFloat(b.balance)||0),0);

    return{balance,error:null};

  },



  // ── FEE BILL ITEMS ────────────────────────────────────────────────────────

  async insertFeeBillItems(items){

    return supabase.from('fee_bill_items').insert(items).select()

  },

  async updateFeeBillItem(id,data){

    return supabase.from('fee_bill_items').update(data).eq('id',id).select().single()

  },

  // Delete bill items by ID

  async deleteFeeBillItems(ids){

    if(!ids?.length)return{error:null};

    return supabase.from('fee_bill_items').delete().in('id',ids);

  },

  // Find CF line items on new bills that reference any of the given source bill IDs

  async getCFLineItemsBySourceBills(sourceBillIds){

    if(!sourceBillIds?.length)return{data:[],error:null};

    return supabase.from('fee_bill_items')

      .select('id,bill_id,amount')

      .in('source_bill_id',sourceBillIds)

      .eq('is_carry_forward',true);

  },

  // Recalculate total_amount and status for a set of bills from their included items and discounts.
  // NOTE: `balance` is a GENERATED column (total_amount - amount_paid) — never write it directly.
  // Status logic: if total=0 (fully discounted) → paid; else if nothing paid → unpaid; else if balance=0 → paid; else partial.

  async recalcBillTotals(billIds){

    if(!billIds?.length)return{error:null};

    // Fetch all bill items for these bills
    const{data:items,error:iErr}=await supabase.from('fee_bill_items')
      .select('bill_id,amount,is_included')
      .in('bill_id',billIds);
    if(iErr)return{error:iErr};

    // Fetch discounts for these bills
    const{data:discountRows,error:dErr}=await supabase.from('fee_discounts')
      .select('bill_id,amount')
      .in('bill_id',billIds);
    if(dErr)return{error:dErr};

    // Fetch current amount_paid for these bills
    const{data:bills,error:bErr}=await supabase.from('fee_bills')
      .select('id,amount_paid')
      .in('id',billIds);
    if(bErr)return{error:bErr};

    const paidMap=Object.fromEntries((bills||[]).map(b=>[b.id,+b.amount_paid||0]));

    // Sum included items per bill
    const subtotals={};
    (items||[]).forEach(item=>{
      if(!subtotals[item.bill_id])subtotals[item.bill_id]=0;
      if(item.is_included)subtotals[item.bill_id]+=+item.amount||0;
    });

    // Sum discounts per bill
    const discountTotals={};
    (discountRows||[]).forEach(d=>{
      if(!discountTotals[d.bill_id])discountTotals[d.bill_id]=0;
      discountTotals[d.bill_id]+=+d.amount||0;
    });

    // Update each bill — total_amount = subtotal − discounts; balance is generated so never written
    const updates=billIds.map(id=>{
      const subtotal=subtotals[id]||0;
      const totalDiscount=discountTotals[id]||0;
      const total=Math.max(0,subtotal-totalDiscount);
      const paid=paidMap[id]||0;
      const balance=Math.max(0,total-paid);
      // A fully-discounted bill (total=0) is always paid even if amount_paid=0
      const status=total<=0?'paid':paid<=0?'unpaid':balance<=0?'paid':'partial';
      // Do NOT include `balance` — it is a GENERATED column, writing it causes a Postgres 400 error
      return supabase.from('fee_bills')
        .update({total_amount:total,status,updated_at:new Date().toISOString()})
        .eq('id',id);
    });

    const results=await Promise.all(updates);
    const err=results.find(r=>r.error);
    return{error:err?.error||null};

  },

  // Bulk update is_included for optional items — used when recording a payment with item selection

  async setFeeBillItemsInclusion(includeIds=[],excludeIds=[]){

    const ops=[];

    if(includeIds.length) ops.push(supabase.from('fee_bill_items').update({is_included:true}).in('id',includeIds));

    if(excludeIds.length) ops.push(supabase.from('fee_bill_items').update({is_included:false}).in('id',excludeIds));

    const results=await Promise.all(ops);

    const err=results.find(r=>r.error);

    return{error:err?.error||null};

  },



  // ── FEE PAYMENTS ──────────────────────────────────────────────────────────

  async getFeePayments(filters={}){

    let q=supabase.from('fee_payments').select('*').order('payment_date',{ascending:false})

    if(filters.bill_id)q=q.eq('bill_id',filters.bill_id)

    if(filters.student_id)q=q.eq('student_id',filters.student_id)

    return q

  },

  async insertFeePayment(data){
    const payload=this._schoolId?{...data,school_id:this._schoolId}:data;
    return supabase.from('fee_payments').insert(payload).select().single()
  },

  async deleteFeePayment(id){return supabase.from('fee_payments').delete().eq('id',id)},



  // ── FEE REFUNDS ───────────────────────────────────────────────────────────

  async getFeeRefunds(filters={}){

    let q=supabase.from('fee_refunds').select('*').order('refund_date',{ascending:false})

    if(filters.bill_id)q=q.eq('bill_id',filters.bill_id)

    if(filters.student_id)q=q.eq('student_id',filters.student_id)

    return q

  },

  async insertFeeRefund(data){
    const payload=this._schoolId?{...data,school_id:this._schoolId}:data;
    return supabase.from('fee_refunds').insert(payload).select().single()
  },

  async deleteFeeRefund(id){
    let q=supabase.from('fee_refunds').delete().eq('id',id)
    if(this._schoolId) q=q.eq('school_id',this._schoolId)
    return q
  },

  async deleteFeePayment(id){
    let q=supabase.from('fee_payments').delete().eq('id',id)
    if(this._schoolId) q=q.eq('school_id',this._schoolId)
    return q
  },

  async deleteRefundsByPayment(paymentId){
    let q=supabase.from('fee_refunds').delete().eq('payment_id',paymentId)
    if(this._schoolId) q=q.eq('school_id',this._schoolId)
    return q
  },

  async getFeePayment(id){
    let q=supabase.from('fee_payments').select('id,bill_id,amount,is_refunded').eq('id',id)
    if(this._schoolId) q=q.eq('school_id',this._schoolId)
    return q.maybeSingle()
  },

  async checkDuplicateBankRef(bankRef){
    let q=supabase.from('fee_payments').select('id').eq('bank_reference',bankRef)
    if(this._schoolId) q=q.eq('school_id',this._schoolId)
    return q.maybeSingle()
  },

  async checkRefundByPayment(paymentId){
    let q=supabase.from('fee_refunds').select('id').eq('payment_id',paymentId)
    if(this._schoolId) q=q.eq('school_id',this._schoolId)
    return q.maybeSingle()
  },

  async deleteFeeAuditEntry(id){
    let q=supabase.from('fee_audit_log').delete().eq('id',id)
    if(this._schoolId) q=q.eq('school_id',this._schoolId)
    return q
  },

  async deleteFeeDiscount(id){
    let q=supabase.from('fee_discounts').delete().eq('id',id)
    if(this._schoolId) q=q.eq('school_id',this._schoolId)
    return q
  },

  // Clear all payment, refund, and audit history for a bill (bill itself stays intact)
  async clearBillHistory(billId){
    const [r1,r2,r3]=await Promise.all([
      supabase.from('fee_payments').delete().eq('bill_id',billId),
      supabase.from('fee_refunds').delete().eq('bill_id',billId),
      supabase.from('fee_audit_log').delete().eq('bill_id',billId),
    ])
    return {r1,r2,r3,error:r1.error||r2.error||r3.error}
  },

  async markPaymentRefunded(id){
    let q=supabase.from('fee_payments').update({is_refunded:true}).eq('id',id)
    if(this._schoolId) q=q.eq('school_id',this._schoolId)
    return q
  },



  // ── FEE DISCOUNTS ─────────────────────────────────────────────────────────

  async getFeeDiscounts(billId){

    return supabase.from('fee_discounts').select('*').eq('bill_id',billId).order('created_at')

  },

  async insertFeeDiscount(data){
    const payload=this._schoolId?{...data,school_id:this._schoolId}:data;
    return supabase.from('fee_discounts').insert(payload).select().single()
  },

  async deleteFeeDiscount(id){

    return supabase.from('fee_discounts').delete().eq('id',id)

  },



  // ── FEE AUDIT LOG ─────────────────────────────────────────────────────────

  async logFeeAction(entry){

    // entry: {bill_id, student_id, action, amount?, details?, performed_by?}

    return supabase.from('fee_audit_log').insert({

      ...entry,

      performed_by: entry.performed_by||'admin',

    }).select().single()

  },

  // Bulk audit insert — one DB call for an entire generation batch

  async logFeeActionBatch(entries){

    const rows=entries.map(e=>({...e,performed_by:e.performed_by||'admin'}));

    return supabase.from('fee_audit_log').insert(rows);

  },

  async getFeeAuditLog(billId){

    return supabase.from('fee_audit_log')

      .select('*').eq('bill_id',billId)

      .order('created_at',{ascending:false})

  },

  async getFeeAuditLogAll(){

    let q=supabase.from('fee_audit_log').select('*').order('created_at',{ascending:false}).limit(500)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },

  async getFeeAuditLogByStudent(studentId){
    if(!studentId)return{data:[],error:null};
    return supabase.from('fee_audit_log')
      .select('*')
      .eq('school_id',this._schoolId)
      .eq('student_id',String(studentId))
      .order('created_at',{ascending:false})
      .limit(300);
  },



  // ── MANUAL TRANSCRIPTS ─────────────────────────────────────────────────────

  async getManualTranscripts(studentId=null){

    let q=supabase.from('manual_transcripts')

      .select('*,manual_transcript_subjects(*)')

      .order('created_at',{ascending:false})

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    if(studentId)q=q.eq('student_id',studentId)

    return q

  },

  async saveManualTranscript(data,subjects){

    const payload=this._schoolId?{...data,school_id:this._schoolId}:data

    const{data:rec,error}=await supabase.from('manual_transcripts').insert(payload).select().single()

    if(error||!rec)return{error}

    if(subjects&&subjects.length>0){

      const rows=subjects.map((s,i)=>({...s,transcript_id:rec.id,display_order:i}))

      const{error:se}=await supabase.from('manual_transcript_subjects').insert(rows)

      if(se)return{error:se}

    }

    return{data:rec}

  },

  async updateManualTranscript(id,data,subjects){

    let uq=supabase.from('manual_transcripts').update(data).eq('id',id)

    if(this._schoolId) uq=uq.eq('school_id',this._schoolId)

    const{error}=await uq

    if(error)return{error}

    await supabase.from('manual_transcript_subjects').delete().eq('transcript_id',id)

    if(subjects&&subjects.length>0){

      const rows=subjects.map((s,i)=>({...s,transcript_id:id,display_order:i}))

      await supabase.from('manual_transcript_subjects').insert(rows)

    }

    return{data:true}

  },

  async deleteManualTranscript(id){

    let q=supabase.from('manual_transcripts').delete().eq('id',id)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },



  // ── TRANSCRIPT DRAFTS & HISTORY ─────────────────────────────────────────────

  async getTranscriptDrafts(status=null){
    let q=supabase.from('transcript_drafts')
      .select('*')
      .order('updated_at',{ascending:false})
    if(this._schoolId)q=q.eq('school_id',this._schoolId)
    if(status)q=q.eq('status',status)
    return q
  },

  async saveTranscriptDraft(id,data){
    const{created_by_name,...rest}=data
    const payload={...rest,updated_at:new Date().toISOString()}
    if(this._schoolId)payload.school_id=this._schoolId
    if(id){
      return supabase.from('transcript_drafts').update(payload).eq('id',id).select().single()
    }
    return supabase.from('transcript_drafts')
      .insert({...payload,created_by_name,created_at:new Date().toISOString()})
      .select().single()
  },

  async deleteTranscriptDraft(id){
    return supabase.from('transcript_drafts').delete().eq('id',id)
  },



  // ── ADMIN AUDIT LOG ────────────────────────────────────────────────────────

  async logAdminAction(entry){

    // entry: {action, entity_type, entity_id, entity_name, old_value?, new_value?, performed_by?, notes?}

    return supabase.from('admin_audit_log').insert({

      ...entry,

      performed_by: entry.performed_by||'admin',

      ...(this._schoolId?{school_id:this._schoolId}:{}),

    }).select().single()

  },

  async logAdminActionBatch(entries){

    if(!entries||!entries.length)return;

    const rows=entries.map(e=>({

      ...e,

      performed_by:e.performed_by||'admin',

      ...(this._schoolId?{school_id:this._schoolId}:{}),

    }));

    return supabase.from('admin_audit_log').insert(rows);

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

  async getAdminAuditLogByStudent(studentId){

    if(!studentId)return{data:[],error:null};

    return supabase.from('admin_audit_log')

      .select('*')

      .eq('school_id',this._schoolId)

      .eq('entity_type','student')

      .eq('entity_id',String(studentId))

      .order('performed_at',{ascending:false})

      .limit(200);

  },



  // ── BULK STATUS QUERIES (dashboard class-status widget) ──────────────────

  async getAllResultApprovalsForTerm(termId,sessionId){

    let q=supabase.from('result_approvals')

      .select('class_id,ea_status,ma_status')

      .eq('term_id',termId).eq('session_id',sessionId)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },

  async getAllReportPublishesForTerm(termId,sessionId){

    let q=supabase.from('report_card_publish')

      .select('class_id,is_published')

      .eq('term_id',termId).eq('session_id',sessionId)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },

  async getResultClassIds(termId,sessionId){

    // Returns unique class_ids that have ≥1 result for this term/session (paginated)

    const ids=new Set();

    let from=0;

    const PAGE=1000;

    while(true){

      let q=supabase.from('portal_results')

        .select('class_id')

        .eq('term_id',termId).eq('session_id',sessionId)

        .range(from,from+PAGE-1)

      if(this._schoolId) q=q.eq('school_id',this._schoolId)

      const{data}=await q;

      if(!data?.length)break;

      data.forEach(r=>ids.add(r.class_id));

      if(data.length<PAGE)break;

      from+=PAGE;

    }

    return{data:[...ids]};

  },



  // ── COPY SCHOOL SETTINGS (super-admin) ───────────────────────────────────

  // Copies selected configuration from srcId → dstId.

  // Returns {error, log:[{msg,ok}]}

  async copySchoolSettings(srcId, dstId, items={}){

    const log=[];

    const ok=(msg)=>{ log.push({msg,ok:true}); };

    const err=(msg)=>{ log.push({msg,ok:false}); };

    let hadError=false;



    // Helper: strip id/created_at/updated_at and stamp dstId as school_id

    const remap=(row,extra={})=>{

      const {id,created_at,updated_at,...rest}=row;

      return{...rest,...extra,school_id:dstId};

    };

    // Helper: insert batch, skip duplicates (onConflict=ignore)

    const ins=(table,rows,conflict='')=>{

      if(!rows.length) return Promise.resolve({error:null});

      const q=supabase.from(table).insert(rows,{defaultToNull:false});

      return q;

    };



    // ── 1. SECTIONS ─────────────────────────────────────────────────────────

    let sectionIdMap={}; // srcId → dstId

    if(items.sections){

      const {data:srcSections,error:e}=await supabase.from('sections').select('*').eq('school_id',srcId);

      if(e){err(`Sections fetch failed: ${e.message}`);hadError=true;}

      else if((srcSections||[]).length===0){ok('Sections: none in source, skipped.');}

      else{

        let copied=0,skipped=0;

        for(const s of srcSections){

          // Check if section with same name already exists in dst

          const {data:ex}=await supabase.from('sections').select('id').eq('school_id',dstId).eq('name',s.name).limit(1);

          if(ex&&ex.length>0){ sectionIdMap[s.id]=ex[0].id; skipped++; continue; }

          const {data:ins_,error:ie}=await supabase.from('sections').insert(remap(s)).select('id').single();

          if(ie){err(`Section "${s.name}": ${ie.message}`);hadError=true;}

          else{ sectionIdMap[s.id]=ins_.id; copied++; }

        }

        ok(`Sections: ${copied} copied, ${skipped} skipped (already exist).`);

      }

    }



    // ── 2. SECTION SUBJECTS ─────────────────────────────────────────────────

    let sectionSubjectIdMap={}; // src ss.id → dst ss.id

    if(items.section_subjects){

      const {data:srcSS,error:e}=await supabase.from('section_subjects').select('*').eq('school_id',srcId);

      if(e){err(`Section subjects fetch failed: ${e.message}`);hadError=true;}

      else if((srcSS||[]).length===0){ok('Section Subjects: none in source, skipped.');}

      else{

        let copied=0,skipped=0;

        for(const ss of srcSS){

          const dstSectionId=sectionIdMap[ss.section_id]??ss.section_id;

          const {data:ex}=await supabase.from('section_subjects').select('id').eq('school_id',dstId).eq('section_id',dstSectionId).eq('code',ss.code).limit(1);

          if(ex&&ex.length>0){ sectionSubjectIdMap[ss.id]=ex[0].id; skipped++; continue; }

          const {data:ins_,error:ie}=await supabase.from('section_subjects')

            .insert({...remap(ss),section_id:dstSectionId}).select('id').single();

          if(ie){err(`Subject "${ss.name}": ${ie.message}`);hadError=true;}

          else{ sectionSubjectIdMap[ss.id]=ins_.id; copied++; }

        }

        ok(`Section Subjects: ${copied} copied, ${skipped} skipped.`);

      }

    }



    // ── 3. CLASSES ──────────────────────────────────────────────────────────

    if(items.classes){

      const {data:srcClasses,error:e}=await supabase.from('classes').select('*').eq('school_id',srcId);

      if(e){err(`Classes fetch failed: ${e.message}`);hadError=true;}

      else if((srcClasses||[]).length===0){ok('Groups: none in source, skipped.');}

      else{

        let copied=0,skipped=0;

        for(const c of srcClasses){

          const dstSectionId=c.section_id?sectionIdMap[c.section_id]??null:null;

          const {data:ex}=await supabase.from('classes').select('id').eq('school_id',dstId).eq('name',c.name).limit(1);

          if(ex&&ex.length>0){skipped++;continue;}

          const {error:ie}=await supabase.from('classes')

            .insert({...remap(c),section_id:dstSectionId});

          if(ie){err(`Class "${c.name}": ${ie.message}`);hadError=true;}

          else copied++;

        }

        ok(`Classes: ${copied} copied, ${skipped} skipped.`);

      }

    }



    // ── 4. SESSIONS ─────────────────────────────────────────────────────────

    let sessionIdMap={};

    if(items.sessions){

      const {data:srcSessions,error:e}=await supabase.from('sessions').select('*').eq('school_id',srcId);

      if(e){err(`Sessions fetch failed: ${e.message}`);hadError=true;}

      else if((srcSessions||[]).length===0){ok('Sessions: none in source, skipped.');}

      else{

        let copied=0,skipped=0;

        for(const s of srcSessions){

          const {data:ex}=await supabase.from('sessions').select('id').eq('school_id',dstId).eq('name',s.name).limit(1);

          if(ex&&ex.length>0){sessionIdMap[s.id]=ex[0].id;skipped++;continue;}

          const {data:ins_,error:ie}=await supabase.from('sessions')

            .insert({...remap(s),is_active:false}).select('id').single();

          if(ie){err(`Session "${s.name}": ${ie.message}`);hadError=true;}

          else{sessionIdMap[s.id]=ins_.id;copied++;}

        }

        ok(`Sessions: ${copied} copied, ${skipped} skipped.`);

      }

    }



    // ── 5. TERMS ────────────────────────────────────────────────────────────

    if(items.terms){

      const {data:srcTerms,error:e}=await supabase.from('terms').select('*').eq('school_id',srcId);

      if(e){err(`Terms fetch failed: ${e.message}`);hadError=true;}

      else if((srcTerms||[]).length===0){ok('Terms: none in source, skipped.');}

      else{

        let copied=0,skipped=0;

        for(const t of srcTerms){

          const dstSessionId=sessionIdMap[t.session_id]??null;

          if(!dstSessionId){err(`Term "${t.name}": parent session not found in target — run Sessions copy first.`);hadError=true;continue;}

          const {data:ex}=await supabase.from('terms').select('id').eq('school_id',dstId).eq('session_id',dstSessionId).eq('name',t.name).limit(1);

          if(ex&&ex.length>0){skipped++;continue;}

          const {error:ie}=await supabase.from('terms')

            .insert({...remap(t),session_id:dstSessionId,is_active:false});

          if(ie){err(`Term "${t.name}": ${ie.message}`);hadError=true;}

          else copied++;

        }

        ok(`Terms: ${copied} copied, ${skipped} skipped.`);

      }

    }



    // ── 6. GRADING SCHEMA ───────────────────────────────────────────────────

    if(items.grading){

      const {data:srcGrades,error:e}=await supabase.from('grading_schema').select('*').eq('school_id',srcId);

      if(e){err(`Grading schema fetch failed: ${e.message}`);hadError=true;}

      else if((srcGrades||[]).length===0){ok('Grading Schema: none in source, skipped.');}

      else{

        // Clear existing and replace

        await supabase.from('grading_schema').delete().eq('school_id',dstId);

        const rows=srcGrades.map(g=>remap(g));

        const {error:ie}=await supabase.from('grading_schema').insert(rows);

        if(ie){err(`Grading schema: ${ie.message}`);hadError=true;}

        else ok(`Grading Schema: ${rows.length} grade rows copied (replaced existing).`);

      }

    }



    // ── 7. FEE ITEMS ────────────────────────────────────────────────────────

    let feeItemIdMap={};

    if(items.fee_items){

      const {data:srcItems,error:e}=await supabase.from('fee_items').select('*').eq('school_id',srcId);

      if(e){err(`Fee items fetch failed: ${e.message}`);hadError=true;}

      else if((srcItems||[]).length===0){ok('Fee Items: none in source, skipped.');}

      else{

        let copied=0,skipped=0;

        for(const fi of srcItems){

          const {data:ex}=await supabase.from('fee_items').select('id').eq('school_id',dstId).eq('name',fi.name).limit(1);

          if(ex&&ex.length>0){feeItemIdMap[fi.id]=ex[0].id;skipped++;continue;}

          const {data:ins_,error:ie}=await supabase.from('fee_items').insert(remap(fi)).select('id').single();

          if(ie){err(`Fee item "${fi.name}": ${ie.message}`);hadError=true;}

          else{feeItemIdMap[fi.id]=ins_.id;copied++;}

        }

        ok(`Fee Items: ${copied} copied, ${skipped} skipped.`);

      }

    }



    // ── 8. FEE TEMPLATES ────────────────────────────────────────────────────

    if(items.fee_templates){

      const {data:srcTmpl,error:e}=await supabase.from('fee_templates')

        .select('*,fee_template_items(*)').eq('school_id',srcId);

      if(e){err(`Fee templates fetch failed: ${e.message}`);hadError=true;}

      else if((srcTmpl||[]).length===0){ok('Fee Templates: none in source, skipped.');}

      else{

        let copied=0,skipped=0;

        for(const t of srcTmpl){

          const {fee_template_items:srcTmplItems,...tmpl}=t;

          const {data:ex}=await supabase.from('fee_templates').select('id').eq('school_id',dstId).eq('name',tmpl.name).limit(1);

          if(ex&&ex.length>0){skipped++;continue;}

          const {data:newTmpl,error:te}=await supabase.from('fee_templates')

            .insert({...remap(tmpl),is_active:false}).select('id').single();

          if(te){err(`Fee template "${tmpl.name}": ${te.message}`);hadError=true;continue;}

          // Copy template items — remap fee_item_id

          if((srcTmplItems||[]).length>0){

            const tiRows=srcTmplItems.map(ti=>{

              const {id,created_at,updated_at,...rest}=ti;

              return{...rest,template_id:newTmpl.id,

                fee_item_id:feeItemIdMap[ti.fee_item_id]??ti.fee_item_id};

            });

            const {error:tiErr}=await supabase.from('fee_template_items').insert(tiRows);

            if(tiErr) err(`Template "${tmpl.name}" items: ${tiErr.message}`);

          }

          copied++;

        }

        ok(`Fee Templates: ${copied} copied, ${skipped} skipped.`);

      }

    }



    // ── 9. CAE TRAITS ───────────────────────────────────────────────────────

    if(items.cae_traits){

      const {data:srcTraits,error:e}=await supabase.from('cae_traits').select('*').eq('school_id',srcId);

      if(e){err(`CAE traits fetch failed: ${e.message}`);hadError=true;}

      else if((srcTraits||[]).length===0){ok('CAE Traits: none in source, skipped.');}

      else{

        let copied=0,skipped=0;

        for(const t of srcTraits){

          const {data:ex}=await supabase.from('cae_traits').select('id').eq('school_id',dstId).eq('name',t.name).limit(1);

          if(ex&&ex.length>0){skipped++;continue;}

          const {error:ie}=await supabase.from('cae_traits').insert(remap(t));

          if(ie){err(`CAE trait "${t.name}": ${ie.message}`);hadError=true;}

          else copied++;

        }

        ok(`CAE Traits: ${copied} copied, ${skipped} skipped.`);

      }

    }



    // ── 10. CAE RATINGS ─────────────────────────────────────────────────────

    if(items.cae_ratings){

      const {data:srcRatings,error:e}=await supabase.from('cae_ratings').select('*').eq('school_id',srcId);

      if(e){err(`CAE ratings fetch failed: ${e.message}`);hadError=true;}

      else if((srcRatings||[]).length===0){ok('CAE Ratings: none in source, skipped.');}

      else{

        let copied=0,skipped=0;

        for(const r of srcRatings){

          const {data:ex}=await supabase.from('cae_ratings').select('id').eq('school_id',dstId).eq('label',r.label).limit(1);

          if(ex&&ex.length>0){skipped++;continue;}

          const {error:ie}=await supabase.from('cae_ratings').insert(remap(r));

          if(ie){err(`CAE rating "${r.label}": ${ie.message}`);hadError=true;}

          else copied++;

        }

        ok(`CAE Ratings: ${copied} copied, ${skipped} skipped.`);

      }

    }



    // ── 11. SCHOOL SETTINGS (key-value) ──────────────────────────────────────

    if(items.school_settings){

      // Exclude school-identity keys — copy only configurable settings

      const SKIP_KEYS=['portal_logo_base64','school_name','admin_email','admin_password',

        'settings_password','student_id_prefix'];

      const {data:srcSettings,error:e}=await supabase.from('school_settings').select('*').eq('school_id',srcId);

      if(e){err(`School settings fetch failed: ${e.message}`);hadError=true;}

      else{

        const rows=(srcSettings||[])

          .filter(s=>!SKIP_KEYS.includes(s.key))

          .map(s=>({school_id:dstId,key:s.key,value:s.value}));

        if(rows.length===0){ok('School Settings: nothing to copy (identity keys excluded).');}

        else{

          const {error:ie}=await supabase.from('school_settings')

            .upsert(rows,{onConflict:'school_id,key'});

          if(ie){err(`School settings: ${ie.message}`);hadError=true;}

          else ok(`School Settings: ${rows.length} keys copied.`);

        }

      }

    }



    return{error:hadError?new Error('Copy finished with errors'):null,log};

  },



  // ── INTERLOCK CHECKS (school-scoped) ─────────────────────────────────────

  async checkDeleteStudent(studentId,classId=null){

    const sid=this._schoolId

    const promises=[

      supabase.from('portal_results').select('*',{count:'exact',head:true}).eq('student_id',studentId).eq('school_id',sid),

      supabase.from('fee_payments').select('*',{count:'exact',head:true}).eq('student_id',String(studentId)).eq('is_refunded',false).eq('school_id',sid),

      supabase.from('payments').select('*',{count:'exact',head:true}).eq('student_id',String(studentId)).eq('school_id',sid),

    ]

    if(classId) promises.push(

      supabase.from('report_card_publish').select('*',{count:'exact',head:true}).eq('class_id',classId).eq('is_published',true).eq('school_id',sid)

    )

    const [resR,feePayR,legPayR,pubR]=await Promise.all(promises)

    const blocks=[],warnings=[]

    if((feePayR?.count||0)>0) blocks.push({msg:`${feePayR.count} payment record(s) exist`,fix:`Refund all payments first`})

    if(pubR&&(pubR.count||0)>0) blocks.push({msg:`Class has published report cards`,fix:`Unpublish the report cards first`})

    if((resR?.count||0)>0) warnings.push(`${resR.count} result record(s)`)

    if((legPayR?.count||0)>0) warnings.push(`${legPayR.count} legacy payment record(s)`)

    return{blocks,warnings}

  },

  async checkDeleteClass(classId){

    const sid=this._schoolId

    const [{count:stuCount},{count:resCount}]=await Promise.all([

      supabase.from('students').select('*',{count:'exact',head:true}).eq('class_id',classId).eq('school_id',sid),

      supabase.from('portal_results').select('*',{count:'exact',head:true}).eq('class_id',classId).eq('school_id',sid),

    ])

    const warnings=[]

    if(stuCount>0) warnings.push(`${stuCount} student(s) assigned`)

    if(resCount>0) warnings.push(`${resCount} result record(s)`)

    return warnings

  },

  async checkDeleteTeacher(teacherId){

    const sid=this._schoolId

    const [{count},{count:tsCount}]=await Promise.all([

      supabase.from('class_teachers').select('*',{count:'exact',head:true}).eq('teacher_id',teacherId).eq('school_id',sid),

      supabase.from('teacher_subjects').select('*',{count:'exact',head:true}).eq('teacher_id',teacherId).eq('school_id',sid),

    ])

    const warnings=[]

    if(count>0) warnings.push(`assigned as form teacher to ${count} class(es)`)

    if(tsCount>0) warnings.push(`teaching ${tsCount} subject assignment(s)`)

    return warnings

  },

  async checkDeleteSection(sectionId){

    const sid=this._schoolId

    const [{count:classCount},{count:subCount}]=await Promise.all([

      supabase.from('classes').select('*',{count:'exact',head:true}).eq('section_id',sectionId).eq('school_id',sid),

      supabase.from('section_subjects').select('*',{count:'exact',head:true}).eq('section_id',sectionId).eq('school_id',sid),

    ])

    const warnings=[]

    if(classCount>0) warnings.push(`${classCount} class(es)`)

    if(subCount>0) warnings.push(`${subCount} subject(s)`)

    return warnings

  },

  async batchCountLinked(table,column,ids,extraFilters={}){

    if(!ids.length)return 0

    const CHUNK=200

    const chunks=[]

    for(let i=0;i<ids.length;i+=CHUNK) chunks.push(ids.slice(i,i+CHUNK))

    const results=await Promise.all(chunks.map(chunk=>{

      let q=supabase.from(table).select('*',{count:'exact',head:true}).in(column,chunk)

      if(this._schoolId) q=q.eq('school_id',this._schoolId)

      Object.entries(extraFilters).forEach(([k,v])=>{ q=q.eq(k,v) })

      return q

    }))

    return results.reduce((sum,r)=>sum+(r.count||0),0)

  },



  // ── ACADEMIC CALENDAR ────────────────────────────────────────────────────

  async getCalendarEvents(filters={}){

    if(!this._schoolId)return{data:[]}

    let q=supabase.from('academic_calendar').select('*').eq('school_id',this._schoolId).order('start_date')

    if(filters.session_id) q=q.eq('session_id',filters.session_id)

    if(filters.term_id)    q=q.eq('term_id',filters.term_id)

    return q

  },

  async upsertCalendarEvent(data,id=null){

    const row={...data,school_id:this._schoolId}

    if(id) return supabase.from('academic_calendar').update(row).eq('id',id).eq('school_id',this._schoolId).select().single()

    return supabase.from('academic_calendar').insert(row).select().single()

  },

  async deleteCalendarEvent(id){

    return supabase.from('academic_calendar').delete().eq('id',id).eq('school_id',this._schoolId)

  },



  // ── TIMETABLE ────────────────────────────────────────────────────────────

  async getTimetablePeriods(){

    if(!this._schoolId)return{data:[]}

    return supabase.from('timetable_periods').select('*').eq('school_id',this._schoolId).order('order_index')

  },

  async upsertTimetablePeriod(data,id=null){

    const row={...data,school_id:this._schoolId}

    if(id) return supabase.from('timetable_periods').update(row).eq('id',id).eq('school_id',this._schoolId).select().single()

    return supabase.from('timetable_periods').insert(row).select().single()

  },

  async deleteTimetablePeriod(id){

    return supabase.from('timetable_periods').delete().eq('id',id).eq('school_id',this._schoolId)

  },

  async getTimetableSlots(classId,termId,sessionId){

    if(!this._schoolId)return{data:[]}

    return supabase.from('timetable_slots')

      .select('*,timetable_periods(id,name,start_time,end_time,is_break,order_index),section_subjects(id,name),teachers(id,full_name,staff_id)')

      .eq('school_id',this._schoolId).eq('class_id',classId)

      .eq('term_id',termId).eq('session_id',sessionId)

  },

  async getTimetableForTeacher(teacherId,termId,sessionId){

    if(!this._schoolId)return{data:[]}

    return supabase.from('timetable_slots')

      .select('*,timetable_periods(id,name,start_time,end_time,order_index),section_subjects(id,name),classes(id,name)')

      .eq('school_id',this._schoolId).eq('teacher_id',teacherId)

      .eq('term_id',termId).eq('session_id',sessionId)

  },

  async upsertTimetableSlot(data){

    const row={...data,school_id:this._schoolId}

    return supabase.from('timetable_slots')

      .upsert(row,{onConflict:'school_id,class_id,period_id,day_of_week,term_id,session_id'}).select().single()

  },

  async clearTimetableSlot(classId,periodId,day,termId,sessionId){

    return supabase.from('timetable_slots').delete()

      .eq('school_id',this._schoolId).eq('class_id',classId)

      .eq('period_id',periodId).eq('day_of_week',day)

      .eq('term_id',termId).eq('session_id',sessionId)

  },

  // Detect if a teacher is already assigned to the same period+day+term+session in another class
  async checkTeacherClash(teacherId,periodId,day,termId,sessionId,excludeClassId){

    let q=supabase.from('timetable_slots')

      .select('id,class_id,classes(name)')

      .eq('teacher_id',teacherId).eq('period_id',periodId)

      .eq('day_of_week',day).eq('term_id',termId).eq('session_id',sessionId)

      .neq('class_id',excludeClassId)

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    return q

  },



  // ── NOTIFICATIONS ─────────────────────────────────────────────────────────

  async createNotification(recipientId,recipientRole,title,body,type='info',eventType=null,linkPage=null){

    if(!this._schoolId)return

    return supabase.from('notifications').insert({

      school_id:this._schoolId,recipient_id:recipientId,recipient_role:recipientRole,

      title,body,type,event_type:eventType,link_page:linkPage

    })

  },

  async createNotificationForAdmins(title,body,type='info',eventType=null,linkPage=null){

    if(!this._schoolId)return

    return supabase.from('notifications').insert({

      school_id:this._schoolId,recipient_id:'admin',recipient_role:'admin',

      title,body,type,event_type:eventType,link_page:linkPage

    })

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

  async getUnreadNotificationCount(recipientId){

    if(!this._schoolId)return 0

    const{count}=await supabase.from('notifications')

      .select('*',{count:'exact',head:true})

      .eq('school_id',this._schoolId).eq('recipient_id',recipientId).is('read_at',null)

    return count||0

  },



  // ── SESSION TOKEN (single-device enforcement) ────────────────────────────

  async setSessionToken(userType,userId,token){

    if(!this._schoolId)return

    const table=userType==='student'?'students':'teachers'

    return supabase.from(table).update({session_token:token}).eq('id',userId).eq('school_id',this._schoolId)

  },

  async checkSessionToken(userType,userId,token){

    if(!this._schoolId)return true // can't check → assume valid

    const table=userType==='student'?'students':'teachers'

    const{data,error}=await supabase.from(table).select('session_token')

      .eq('id',userId).eq('school_id',this._schoolId).single()

    if(error||!data)return true // error → assume valid, don't kick

    if(!data.session_token)return true // token not yet set → assume valid

    return data.session_token===token

  },

  async clearSessionToken(userType,userId,token){

    if(!this._schoolId)return

    const table=userType==='student'?'students':'teachers'

    // Only clear if the token still matches — avoids wiping a newer session on another device

    return supabase.from(table).update({session_token:null})

      .eq('id',userId).eq('school_id',this._schoolId).eq('session_token',token)

  },



  // ── PASSWORD RESET ────────────────────────────────────────────────────────

  async _resetPassword(table,userId,newPassword,schoolId){

    const sid=schoolId||this._schoolId

    return supabase.from(table).update({password_hash:newPassword})

      .eq('id',userId).eq('school_id',sid)

  },



  // ── ACTIVITY ANALYTICS ────────────────────────────────────────────────────

  async getLoginActivity(){

    if(!this._schoolId)return{students:[],teachers:[]}

    // Note: avoid ordering by last_login if the column may not exist — handle errors gracefully

    const[s,t]=await Promise.all([

      supabase.from('students').select('id,first_name,last_name,last_login,status,classes(name)')

        .eq('school_id',this._schoolId).eq('status','active').order('created_at',{ascending:false}),

      supabase.from('teachers').select('id,full_name,staff_id,last_login,role')

        .eq('school_id',this._schoolId).order('full_name',{ascending:true}),

    ])

    // Sort by last_login client-side so a missing column on DB side doesn't 400

    const sortByLogin=(arr)=>[...arr].sort((a,b)=>{

      if(!a.last_login&&!b.last_login)return 0;

      if(!a.last_login)return 1;

      if(!b.last_login)return -1;

      return new Date(b.last_login)-new Date(a.last_login);

    });

    return{students:sortByLogin(s.data||[]),teachers:sortByLogin(t.data||[])}

  },



  // ── BROADSHEET ───────────────────────────────────────────────────────────

  async getBroadsheetData(classId,termId,sessionId){

    if(!this._schoolId)return{students:[],subjects:[],results:[],error:null}

    const[studentsRes,subjectsRes,resultsRes]=await Promise.all([

      this.getStudents(null,{class_id:classId}),

      this.getClassSubjects(classId),

      this.getResults({class_id:classId,term_id:termId,session_id:sessionId}),

    ])

    const students=(studentsRes.data||[])

      .filter(s=>(s.status||'active')==='active')

      .sort((a,b)=>`${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`))

    const subjects=(subjectsRes.data||[])

      .filter(cs=>cs.section_subjects?.id&&cs.section_subjects?.name)

      .map(cs=>({id:cs.section_subjects.id,name:cs.section_subjects.name,code:cs.section_subjects.code}))

      .sort((a,b)=>a.name.localeCompare(b.name))

    const results=resultsRes.data||[]

    const error=studentsRes.error||subjectsRes.error||resultsRes.error||null

    return{students,subjects,results,error}

  },



  // ── RECYCLE BIN ──────────────────────────────────────────────────────────

  _binTable(type){

    return {student:'students',teacher:'teachers',class:'classes',section:'sections',subject:'section_subjects'}[type]||null

  },

  async _binRetentionDays(){

    if(!this._schoolId) return 30

    const{data}=await supabase.from('school_settings')

      .select('value').eq('key','recycle_bin_retention_days').eq('school_id',this._schoolId).maybeSingle()

    return parseInt(data?.value||'30',10)

  },

  // Move a single record to the bin then hard-delete it

  async softDelete(type,recordId,deletedBy){

    if(!this._schoolId) return{error:{message:'No school context'}}

    const table=this._binTable(type)

    if(!table) return{error:{message:`Unknown type: ${type}`}}

    // Fetch full record snapshot

    const{data:record,error:fetchErr}=await supabase.from(table)

      .select('*').eq('id',recordId).eq('school_id',this._schoolId).single()

    if(fetchErr||!record) return{error:fetchErr||{message:'Record not found'}}

    const days=await this._binRetentionDays()

    const expires=new Date(Date.now()+days*24*60*60*1000).toISOString()

    const{error:binErr}=await supabase.from('recycle_bin').insert({

      school_id:this._schoolId,record_type:type,

      record_id:String(recordId),record_data:record,

      deleted_by:deletedBy||'admin',expires_at:expires,

    })

    if(binErr) return{error:binErr}

    let dq=supabase.from(table).delete().eq('id',recordId)

    if(this._schoolId) dq=dq.eq('school_id',this._schoolId)

    return dq

  },

  // Move many records of one type to the bin then hard-delete them all

  async bulkSoftDelete(type,ids,deletedBy){

    if(!this._schoolId||!ids.length) return{error:null}

    const table=this._binTable(type)

    if(!table) return{error:{message:`Unknown type: ${type}`}}

    const CHUNK=200

    const records=[]

    for(let i=0;i<ids.length;i+=CHUNK){

      const{data}=await supabase.from(table).select('*')

        .in('id',ids.slice(i,i+CHUNK)).eq('school_id',this._schoolId)

      if(data) records.push(...data)

    }

    const days=await this._binRetentionDays()

    const expires=new Date(Date.now()+days*24*60*60*1000).toISOString()

    const rows=records.map(r=>({

      school_id:this._schoolId,record_type:type,

      record_id:String(r.id),record_data:r,

      deleted_by:deletedBy||'admin',expires_at:expires,

    }))

    for(let i=0;i<rows.length;i+=CHUNK)

      await supabase.from('recycle_bin').insert(rows.slice(i,i+CHUNK))

    for(let i=0;i<ids.length;i+=CHUNK)

      await supabase.from(table).delete().in('id',ids.slice(i,i+CHUNK)).eq('school_id',this._schoolId)

    return{error:null}

  },

  async getRecycleBin(){

    if(!this._schoolId) return{data:[]}

    return supabase.from('recycle_bin')

      .select('*').eq('school_id',this._schoolId)

      .gt('expires_at',new Date().toISOString())

      .order('deleted_at',{ascending:false})

  },

  async restoreFromRecycleBin(binId){

    if(!this._schoolId) return{error:{message:'No school context'}}

    const{data:item,error:fetchErr}=await supabase.from('recycle_bin')

      .select('*').eq('id',binId).eq('school_id',this._schoolId).single()

    if(fetchErr||!item) return{error:fetchErr||{message:'Item not found'}}

    const table=this._binTable(item.record_type)

    if(!table) return{error:{message:'Unknown record type'}}

    const payload={...item.record_data}

    delete payload.created_at; delete payload.updated_at

    payload.school_id=this._schoolId

    const{error:insertErr}=await supabase.from(table).insert(payload)

    if(insertErr) return{error:insertErr}

    await supabase.from('recycle_bin').delete().eq('id',binId)

    return{error:null}

  },

  async permanentDeleteFromBin(binId){

    return supabase.from('recycle_bin').delete()

      .eq('id',binId).eq('school_id',this._schoolId)

  },

  async emptyRecycleBin(){

    if(!this._schoolId) return{error:{message:'No school context'}}

    return supabase.from('recycle_bin').delete().eq('school_id',this._schoolId)

  },

  async purgeExpiredBinItems(){

    if(!this._schoolId) return

    await supabase.from('recycle_bin').delete()

      .eq('school_id',this._schoolId).lt('expires_at',new Date().toISOString())

  },

  async getRecycleBinCount(){

    if(!this._schoolId) return 0

    const{count}=await supabase.from('recycle_bin')

      .select('*',{count:'exact',head:true})

      .eq('school_id',this._schoolId).gt('expires_at',new Date().toISOString())

    return count||0

  },



  // ── PLATFORM ADMIN (Apex super-admin) ────────────────────────────────────

  async getPlatformAdmin(){

    const{data,error}=await supabase.from('platform_admins')

      .select('*').limit(1)

    if(error)return{admin:null,error}

    return{admin:(data&&data.length)?data[0]:null,error:null}

  },

  async updatePlatformAdminLogin(id){

    return supabase.from('platform_admins')

      .update({last_login:new Date().toISOString()}).eq('id',id)

  },

  async updatePlatformAdminPin(id,newPin){

    return supabase.from('platform_admins')

      .update({password_hash:newPin}).eq('id',id)

  },



  // All schools for platform admin dashboard

  async getAllSchools(){

    const {data,error}=await supabase.from('schools')

      .select('id,name,logo,admin_email,admin_name,status,plan,created_at,student_id_prefix,contact_phone,address,state,country,setup_done,settings_password')

      .order('created_at',{ascending:false});

    if(error||!data) return {data,error};

    // Attach student counts

    const counts=await Promise.all(data.map(s=>

      supabase.from('students').select('id',{count:'exact',head:true}).eq('school_id',s.id)

    ));

    return {data:data.map((s,i)=>({...s,student_count:counts[i]?.count||0})),error:null};

  },

  async updateSchoolStatus(id,status){

    return supabase.from('schools').update({status}).eq('id',id).select().single()

  },

  async updateSchoolPlan(id,plan){

    return supabase.from('schools').update({plan}).eq('id',id)

  },

  async deleteSchool(id){

    return supabase.from('schools').delete().eq('id',id)

  },

  async getAllPlatformAuditLog(){

    return supabase.from('admin_audit_log')

      .select('*').order('performed_at',{ascending:false}).limit(500)

  },

  async logPlatformAction(action,entityType,entityId,entityName,notes){

    return supabase.from('admin_audit_log').insert({

      action,entity_type:entityType,entity_id:String(entityId),

      entity_name:entityName,performed_by:'platform_admin',

      notes,performed_at:new Date().toISOString()

    })

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



  // Attendance methods

  async getAttendance(filters={}){

    let q=supabase.from('attendance').select('*').order('date',{ascending:false})

    if(this._schoolId) q=q.eq('school_id',this._schoolId)

    if(filters.class_id)  q=q.eq('class_id',filters.class_id)

    if(filters.term_id)   q=q.eq('term_id',filters.term_id)

    if(filters.session_id)q=q.eq('session_id',filters.session_id)

    if(filters.date)      q=q.eq('date',filters.date)

    return q

  },



}

