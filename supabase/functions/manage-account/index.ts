import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// v12: student/teacher account creation and the legacy backfill are retired (those roles no longer exist).
// Callers may be owner or admin. Owners' passwords can only be reset by an owner.
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

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

async function allowRegistration(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown").split(",")[0].trim().slice(0, 80);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip + "|register_school"));
  const key = Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, "0")).join("");
  const { data, error } = await supabaseAdmin.rpc("consume_public_endpoint_rate_limit", { p_bucket_key: key, p_limit: 3, p_window_seconds: 3600 });
  return !error && data === true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { action, ...payload } = await req.json();

    // PUBLIC: register a brand-new workspace + its first account (rate limited: 3 per hour per IP)
    if (action === "register_school") {
      if (!await allowRegistration(req)) return json({ error: "Too many registration attempts. Try again later." }, 429);
      const { schoolName, address, state, phone, studentIdPrefix, adminName, adminEmail, redirectTo, presetKey } = payload;
      if (!schoolName?.trim() || !adminName?.trim() || !adminEmail?.trim()) {
        return json({ error: "schoolName, adminName, and adminEmail are required" }, 400);
      }
      const normalizedEmail = String(adminEmail).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return json({ error: "Enter a valid email address" }, 400);
      }
      // Production uses the verified custom domain. Keep the legacy Vercel
      // production alias available during the transition; preview origins must
      // be explicitly listed in JD_APP_ORIGINS rather than accepted broadly.
      const defaultOrigin = "https://james-denning.com.ng";
      const allowedRedirects = new Set([
        defaultOrigin,
        "https://james-denning-james-projects-57651351.vercel.app",
        ...(Deno.env.get("JD_APP_ORIGINS") || "").split(",").map((x) => x.trim().replace(/\/$/, "")).filter(Boolean),
      ]);
      let inviteRedirect = `${defaultOrigin}/?invite=1`;
      if (redirectTo) {
        try {
          const parsed = new URL(redirectTo);
          if (!allowedRedirects.has(parsed.origin)) return json({ error: "Unsupported email redirect destination" }, 400);
          inviteRedirect = `${parsed.origin}/?invite=1`;
        } catch {
          return json({ error: "Invalid email redirect destination" }, 400);
        }
      }

      let preset = null;
      if (presetKey) {
        const { data, error: presetErr } = await supabaseAdmin
          .from("org_presets").select("*").eq("key", presetKey).maybeSingle();
        if (presetErr) return json({ error: presetErr.message }, 500);
        if (!data) return json({ error: `Unknown preset: ${presetKey}` }, 400);
        preset = data;
      }

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

    // ADMIN-ONLY from here down: caller must be a real owner or admin
    const caller = await getCallerProfile(req);
    if (!caller || !["owner", "admin"].includes(String(caller.role))) {
      return json({ error: "Not authorized — admin login required" }, 403);
    }

    if (action === "create_teacher" || action === "create_student" || action === "backfill_existing_school") {
      return json({ error: "This action has been retired. Invite members with a business role (owner, admin, manager, finance, hr, staff, contractor or viewer)." }, 410);
    }

    if (action === "reset_password") {
      const { targetProfileId, newPassword } = payload;
      if (!targetProfileId || !newPassword) return json({ error: "targetProfileId, newPassword required" }, 400);
      if (String(newPassword).length < 10) return json({ error: "Password must be at least 10 characters" }, 400);

      const { data: targetProfile } = await supabaseAdmin.from("profiles").select("school_id,role").eq("id", targetProfileId).single();
      if (!targetProfile || targetProfile.school_id !== caller.school_id) {
        return json({ error: "Cannot reset a password outside your own workspace" }, 403);
      }
      if (targetProfile.role === "owner" && caller.role !== "owner") {
        return json({ error: "Only an owner can reset an owner's password" }, 403);
      }

      const { error } = await supabaseAdmin.auth.admin.updateUserById(targetProfileId, { password: newPassword });
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
