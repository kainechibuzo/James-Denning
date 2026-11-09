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
      const { schoolName, address, state, phone, studentIdPrefix, adminName, adminEmail, redirectTo, presetKey } = payload;
      if (!schoolName?.trim() || !adminName?.trim() || !adminEmail?.trim()) {
        return json({ error: "schoolName, adminName, and adminEmail are required" }, 400);
      }
      const normalizedEmail = String(adminEmail).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return json({ error: "Enter a valid email address" }, 400);
      }
      const allowedRedirects = new Set([
        "https://rgs-portal-master.vercel.app",
      ]);
      let inviteRedirect = "https://rgs-portal-master.vercel.app/?invite=1";
      if (redirectTo) {
        try {
          const parsed = new URL(redirectTo);
          if (!allowedRedirects.has(parsed.origin)) return json({ error: "Unsupported email redirect destination" }, 400);
          inviteRedirect = `${parsed.origin}/?invite=1`;
        } catch {
          return json({ error: "Invalid email redirect destination" }, 400);
        }
      }

      // Validate any selected industry preset before creating anything.
      // Core business is the default; education is selected with the
      // dedicated school_management preset.
      let preset = null;
      if (presetKey) {
        const { data, error: presetErr } = await supabaseAdmin
          .from("org_presets").select("*").eq("key", presetKey).maybeSingle();
        if (presetErr) return json({ error: presetErr.message }, 500);
        if (!data) return json({ error: `Unknown preset: ${presetKey}` }, 400);
        preset = data;
      }

      // Invitation creates an unconfirmed identity and sends the verification
      // email. The user chooses their password after opening the invite link.
      const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        normalizedEmail,
        {
          data: { full_name: adminName.trim(), role: "admin" },
          redirectTo: inviteRedirect,
        },
      );
      if (authErr || !authUser?.user) return json({ error: authErr?.message ?? "Failed to send the verification invitation" }, 400);

      const rollbackRegistration = async (schoolId?: string) => {
        if (schoolId) {
          await supabaseAdmin.from("org_tools").delete().eq("school_id", schoolId);
          await supabaseAdmin.from("org_submissions").delete().eq("school_id", schoolId);
          await supabaseAdmin.from("school_settings").delete().eq("school_id", schoolId);
          await supabaseAdmin.from("profiles").delete().eq("id", authUser.user.id);
          await supabaseAdmin.from("schools").delete().eq("id", schoolId);
        }
        await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      };

      const { data: school, error: schoolErr } = await supabaseAdmin
        .from("schools")
        .insert({
          name: schoolName, address, state, phone,
          student_id_prefix: studentIdPrefix, admin_name: adminName.trim(), admin_email: normalizedEmail,
          setup_done: true,
          // Null for classic (non-preset) registrations — existing behavior.
          preset_key: preset?.key ?? null,
          onboarding_step: preset ? "complete" : null,
        })
        .select().single();
      if (schoolErr) {
        await rollbackRegistration();
        return json({ error: schoolErr.message }, 400);
      }

      const { error: profileErr } = await supabaseAdmin
        .from("profiles")
        .upsert({ id: authUser.user.id, email: normalizedEmail, full_name: adminName.trim(), role: "admin", school_id: school.id });
      if (profileErr) {
        await rollbackRegistration(school.id);
        return json({ error: profileErr.message }, 400);
      }

      // Seed the organization settings with the service-role client. The
      // browser is still unauthenticated after registration, so attempting
      // this insert from the frontend would be blocked by RLS and silently
      // leave the new workspace without its identity settings.
      const settingsSeed = preset?.settings_seed && typeof preset.settings_seed === "object"
        ? Object.entries(preset.settings_seed).map(([key, value]) => ({ school_id: school.id, key, value: String(value) }))
        : [];
      const { error: settingsErr } = await supabaseAdmin
        .from("school_settings")
        .upsert([
          { school_id: school.id, key: "school_name", value: schoolName },
          { school_id: school.id, key: "admin_email", value: normalizedEmail },
          { school_id: school.id, key: "workspace_type", value: "business" },
          { school_id: school.id, key: "education_module_enabled", value: "false" },
          ...settingsSeed,
        ], { onConflict: "school_id,key" });
      if (settingsErr) {
        await rollbackRegistration(school.id);
        return json({ error: settingsErr.message }, 400);
      }

      // Phase 1: record the org submission + seed org_tools from the preset.
      // Same service-role reasoning as the settings above.
      if (preset) {
        const { error: submissionErr } = await supabaseAdmin
          .from("org_submissions")
          .insert({
            school_id: school.id, preset_key: preset.key,
            org_name: schoolName, contact_name: adminName || "",
            contact_email: normalizedEmail, phone: phone || "",
          });
        if (submissionErr) {
          await rollbackRegistration(school.id);
          return json({ error: submissionErr.message }, 400);
        }

        const toolRows = Object.entries(preset.modules_json || {})
          .filter(([, enabled]) => enabled === true)
          .map(([toolKey]) => ({ school_id: school.id, tool_key: toolKey, is_enabled: true }));
        if (toolRows.length) {
          const { error: toolsErr } = await supabaseAdmin.from("org_tools").insert(toolRows);
          if (toolsErr) {
            await rollbackRegistration(school.id);
            return json({ error: toolsErr.message }, 400);
          }
        }
      }

      return json({ school, userId: authUser.user.id, verificationEmailSent: true });
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
      if (schoolId !== caller.school_id) return json({ error: "Cannot backfill an organization outside your own workspace" }, 403);

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
