import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected into every
// Edge Function's environment by Supabase — never set these manually as
// secrets, and NEVER expose this client or its key to the frontend.
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Teachers/students log in with a Staff ID / Student ID, not an email, but
// Supabase Auth requires an email. We generate a synthetic one — invisible
// to the user, who only ever sees/types their ID — scoped by school_id
// since auth.users.email is unique platform-wide, not per-school.
function syntheticEmail(kind: "staff" | "student", localId: string, schoolId: string) {
  const clean = localId.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${kind}-${clean}--${schoolId}@login.internal`;
}

async function getCallerProfile(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData?.user) return null;
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", userData.user.id)
    .single();
  return profile ?? null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { action, ...payload } = await req.json();

    // ── PUBLIC: register a brand-new school + its admin account ───────────
    if (action === "register_school") {
      const { schoolName, address, state, phone, studentIdPrefix, adminName, adminEmail, adminPassword } = payload;
      if (!schoolName || !adminEmail || !adminPassword) {
        return json({ error: "schoolName, adminEmail, and adminPassword are required" }, 400);
      }

      const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
      });
      if (authErr || !authUser?.user) return json({ error: authErr?.message ?? "Failed to create admin account" }, 400);

      const { data: school, error: schoolErr } = await supabaseAdmin
        .from("schools")
        .insert({
          name: schoolName, address, state, phone,
          student_id_prefix: studentIdPrefix, admin_name: adminName, admin_email: adminEmail,
          setup_done: true,
        })
        .select().single();
      if (schoolErr) {
        await supabaseAdmin.auth.admin.deleteUser(authUser.user.id); // rollback
        return json({ error: schoolErr.message }, 400);
      }

      const { error: profileErr } = await supabaseAdmin
        .from("profiles")
        .upsert({ id: authUser.user.id, email: adminEmail, full_name: adminName, role: "admin", school_id: school.id });
      if (profileErr) return json({ error: profileErr.message }, 400);

      return json({ school, userId: authUser.user.id });
    }

    // ── ADMIN-ONLY from here down: verify the caller is a real admin ──────
    const caller = await getCallerProfile(req);
    if (!caller || caller.role !== "admin") {
      return json({ error: "Not authorized — admin login required" }, 403);
    }

    // ── Create a teacher/staff account on behalf of the school ────────────
    if (action === "create_teacher") {
      const { staffId, fullName, email, phone, gender, password } = payload;
      if (!staffId || !fullName || !password) return json({ error: "staffId, fullName, password required" }, 400);

      const authEmail = syntheticEmail("staff", staffId, caller.school_id);
      const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email: authEmail, password, email_confirm: true,
      });
      if (authErr || !authUser?.user) return json({ error: authErr?.message ?? "Failed to create account" }, 400);

      const { data: teacher, error: teacherErr } = await supabaseAdmin
        .from("teachers")
        .insert({
          school_id: caller.school_id, staff_id: staffId, full_name: fullName,
          email, phone, gender, profile_id: authUser.user.id, role: "teacher", status: "active",
        })
        .select().single();
      if (teacherErr) {
        await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
        return json({ error: teacherErr.message }, 400);
      }

      await supabaseAdmin.from("profiles").upsert({
        id: authUser.user.id, email: authEmail, full_name: fullName, role: "teacher", school_id: caller.school_id,
      });

      return json({ teacher });
    }

    // ── Create a student/member account on behalf of the school ───────────
    if (action === "create_student") {
      const { studentId, fullName, classId, gender, dob, password } = payload;
      if (!studentId || !fullName || !password) return json({ error: "studentId, fullName, password required" }, 400);

      const authEmail = syntheticEmail("student", studentId, caller.school_id);
      const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email: authEmail, password, email_confirm: true,
      });
      if (authErr || !authUser?.user) return json({ error: authErr?.message ?? "Failed to create account" }, 400);

      const { data: student, error: studentErr } = await supabaseAdmin
        .from("students")
        .insert({
          id: studentId, school_id: caller.school_id, name: fullName,
          class_id: classId, gender, dob, status: "active",
        })
        .select().single();
      if (studentErr) {
        await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
        return json({ error: studentErr.message }, 400);
      }

      await supabaseAdmin.from("profiles").upsert({
        id: authUser.user.id, email: authEmail, full_name: fullName, role: "student", school_id: caller.school_id,
      });
      await supabaseAdmin.from("student_profiles").insert({ student_id: studentId, profile_id: authUser.user.id });

      return json({ student });
    }

    // ── Reset a teacher/student's password (admin action) ─────────────────
    if (action === "reset_password") {
      const { targetProfileId, newPassword } = payload;
      if (!targetProfileId || !newPassword) return json({ error: "targetProfileId, newPassword required" }, 400);

      const { data: targetProfile } = await supabaseAdmin.from("profiles").select("school_id").eq("id", targetProfileId).single();
      if (!targetProfile || targetProfile.school_id !== caller.school_id) {
        return json({ error: "Cannot reset a password outside your own school" }, 403);
      }

      const { error } = await supabaseAdmin.auth.admin.updateUserById(targetProfileId, { password: newPassword });
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    // ── ONE-TIME BACKFILL: bootstrap real auth accounts for a school that
    // already has data (created before real Auth was wired up) but has no
    // real admin auth account yet. Gated by that check so it can't be used
    // to hijack a school that already has a real admin — safe to leave in,
    // but intended to be run once per pre-migration school, then ignored.
    if (action === "backfill_existing_school") {
      const { schoolId, tempPassword } = payload;
      if (!schoolId || !tempPassword) return json({ error: "schoolId, tempPassword required" }, 400);

      const { count: existingAdmins } = await supabaseAdmin
        .from("profiles").select("id", { count: "exact", head: true })
        .eq("school_id", schoolId).eq("role", "admin");
      if ((existingAdmins ?? 0) > 0) {
        return json({ error: "This school already has a real admin account — backfill already done or not needed." }, 400);
      }

      const { data: school } = await supabaseAdmin.from("schools").select("*").eq("id", schoolId).single();
      if (!school) return json({ error: "School not found" }, 404);

      const results = { admin: null, teachers: [], students: [], errors: [] };

      // Admin
      if (school.admin_email) {
        const { data: adminAuth, error: adminErr } = await supabaseAdmin.auth.admin.createUser({
          email: school.admin_email, password: tempPassword, email_confirm: true,
        });
        if (adminErr) results.errors.push(`admin: ${adminErr.message}`);
        else {
          await supabaseAdmin.from("profiles").upsert({
            id: adminAuth.user.id, email: school.admin_email, full_name: school.admin_name, role: "admin", school_id: schoolId,
          });
          results.admin = school.admin_email;
        }
      }

      // Teachers
      const { data: teachers } = await supabaseAdmin.from("teachers").select("*").eq("school_id", schoolId);
      for (const t of teachers ?? []) {
        const authEmail = syntheticEmail("staff", t.staff_id, schoolId);
        const { data: tAuth, error: tErr } = await supabaseAdmin.auth.admin.createUser({
          email: authEmail, password: tempPassword, email_confirm: true,
        });
        if (tErr) { results.errors.push(`teacher ${t.staff_id}: ${tErr.message}`); continue; }
        await supabaseAdmin.from("teachers").update({ profile_id: tAuth.user.id }).eq("id", t.id);
        await supabaseAdmin.from("profiles").upsert({
          id: tAuth.user.id, email: authEmail, full_name: t.full_name, role: "teacher", school_id: schoolId,
        });
        results.teachers.push(t.staff_id);
      }

      // Students
      const { data: students } = await supabaseAdmin.from("students").select("*").eq("school_id", schoolId);
      for (const s of students ?? []) {
        const authEmail = syntheticEmail("student", s.id, schoolId);
        const { data: sAuth, error: sErr } = await supabaseAdmin.auth.admin.createUser({
          email: authEmail, password: tempPassword, email_confirm: true,
        });
        if (sErr) { results.errors.push(`student ${s.id}: ${sErr.message}`); continue; }
        await supabaseAdmin.from("profiles").upsert({
          id: sAuth.user.id, email: authEmail, full_name: s.name, role: "student", school_id: schoolId,
        });
        await supabaseAdmin.from("student_profiles").insert({ student_id: s.id, profile_id: sAuth.user.id });
        results.students.push(s.id);
      }

      return json(results);
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
