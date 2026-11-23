// JD run capabilities (roadmap sequence 1–2): the bridge between a durable
// run and the skills/autonomy stack. Before a run executes, its agentic-time
// costs for acquired skills are authorised — per the workspace autonomy dial:
// assisted runs confirm each skill cost through jd_confirm_run_skill_cost,
// autonomous runs use the standing jd_autonomous_cost_authorize bounded by
// the spend ceiling. Both database RPCs require the run to still be queued or
// planning, so this runs once at worker claim time, before the model loop.
// Every request key is deterministic per (run, skill, version, estimate), so
// worker retries replay idempotently instead of double-charging. Failure to
// authorise never breaks the run: jd_skills_load enforces the ledger
// requirement itself at load time and fails closed for acquired skills.
//
// The module also reads a run's linked discovery plan so the workforce
// deployment can be constrained to the planned specialist roles.

export const RUN_SKILL_ESTIMATE_DEFAULT_SECONDS = 600;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Deterministic request key: SHA-256 of (run, skill, version, estimate) shaped as a UUID. */
export async function runSkillRequestKey(runId: string, skillId: string, version: number, estimatedSeconds: number): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(["jd.run.skill.cost", runId, skillId, String(version), String(estimatedSeconds)].join("|")));
  const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const boundedEstimate = (value: unknown): number => {
  const seconds = Math.round(Number(value));
  if (!Number.isFinite(seconds)) return RUN_SKILL_ESTIMATE_DEFAULT_SECONDS;
  return Math.min(86400, Math.max(30, seconds));
};

export type RunDiscoveryPlan = { session_id: string; status: string; objective: string; roles: string[]; skills: Array<{ id: string; expected_seconds: number }> } | null;

/** Latest discovery session for this run: linked by run_id, else the newest
 * session started for the same objective text (a reused proposal). Service
 * role read; null when none applies. */
export async function readRunDiscoveryPlan(admin: any, schoolId: string, runId: string, requestText?: string): Promise<RunDiscoveryPlan> {
  if (!admin || !schoolId || !runId || !UUID_RE.test(String(runId))) return null;
  try {
    let data: any = null;
    const { data: linked, error: linkedError } = await admin.from("jd_discovery_sessions")
      .select("id,status,plan")
      .eq("school_id", schoolId).eq("run_id", runId)
      .in("status", ["proposed", "approved", "proceeding", "completed"])
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (linkedError) return null;
    data = linked;
    if (!data && typeof requestText === "string") {
      const idea = requestText.slice(0, 2000).trim();
      if (idea.length >= 10) {
        const { data: reused, error: reusedError } = await admin.from("jd_discovery_sessions")
          .select("id,status,plan")
          .eq("school_id", schoolId).eq("idea", idea)
          .in("status", ["proposed", "approved", "proceeding", "completed"])
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (!reusedError) data = reused;
      }
    }
    if (!data || typeof data.plan !== "object" || !data.plan) return null;
    const plan = data.plan;
    const roles = Array.isArray(plan.roles) ? plan.roles.filter((role: unknown) => typeof role === "string") : [];
    const skills = Array.isArray(plan.skills) ? plan.skills
      .filter((skill: any) => skill && typeof skill.id === "string" && Number.isFinite(Number(skill.expected_seconds)))
      .map((skill: any) => ({ id: String(skill.id), expected_seconds: Number(skill.expected_seconds) })) : [];
    return { session_id: String(data.id), status: String(data.status || ""), objective: String(plan.objective || ""), roles, skills };
  } catch {
    return null;
  }
}

/** The estimate for a run skill: the linked discovery plan, else the default. */
async function planEstimate(admin: any, schoolId: string, runId: string, skillId: string, discovery: RunDiscoveryPlan): Promise<number> {
  if (!discovery) discovery = await readRunDiscoveryPlan(admin, schoolId, runId);
  const match = discovery?.skills.find((skill) => skill.id === skillId);
  return boundedEstimate(match?.expected_seconds);
}

export type PreauthorizationResult = {
  mode: string | null;
  authorized: Array<{ skill_id: string; version: number; estimated_seconds: number; basis: string }>;
  skipped: Array<{ skill_id: string; reason: string }>;
  ceiling_stop: boolean;
  discovery_session_id: string | null;
};

/**
 * Authorise the acquired-skill agentic time this run will need, while the run
 * is still queued/planning. Mode comes from the workspace autonomy dial; the
 * database RPCs enforce the ceiling (54000), the acquisition requirement and
 * idempotent replay. Deterministic keys make worker retries safe. Any failure
 * is reported in the result, never thrown.
 */
export async function preauthorizeRunSkillCosts(context: {
  admin: any; schoolId: string; userId: string; runId: string; requestText: string;
}): Promise<PreauthorizationResult> {
  const idle: PreauthorizationResult = { mode: null, authorized: [], skipped: [], ceiling_stop: false, discovery_session_id: null };
  try {
    if (!context?.admin || !UUID_RE.test(String(context.schoolId || "")) || !UUID_RE.test(String(context.userId || "")) || !UUID_RE.test(String(context.runId || ""))) return idle;
    if (typeof context.requestText !== "string" || context.requestText.trim().length < 4) return idle;
    const discovery = await readRunDiscoveryPlan(context.admin, context.schoolId, context.runId);
    idle.discovery_session_id = discovery?.session_id ?? null;
    const { data: autonomy, error: autonomyError } = await context.admin.rpc("jd_read_workspace_autonomy", { p_actor: context.userId });
    if (autonomyError || !autonomy || typeof autonomy.mode !== "string") {
      idle.skipped.push({ skill_id: "*", reason: "autonomy_dial_unreadable" });
      return idle;
    }
    idle.mode = autonomy.mode;
    const { data: resolved, error: resolveError } = await context.admin.rpc("jd_skills_resolve", {
      p_actor: context.userId, p_task: context.requestText.slice(0, 2000), p_limit: 3,
    });
    const candidates = (!resolveError && resolved && Array.isArray(resolved.skills)) ? resolved.skills : [];
    for (const candidate of candidates.slice(0, 3)) {
      if (!candidate || !UUID_RE.test(String(candidate.id)) || !Number.isInteger(candidate.version) || candidate.version < 1) continue;
      if (idle.ceiling_stop) { idle.skipped.push({ skill_id: String(candidate.id), reason: "ceiling_stop" }); continue; }
      const skillId = String(candidate.id);
      // Only acquired skill versions need a ledger row before jd_skills_load.
      const { data: acquired, error: acquiredError } = await context.admin.from("jd_skill_acquisitions")
        .select("skill_id,version").eq("skill_id", candidate.id).eq("version", candidate.version).eq("school_id", context.schoolId).limit(1);
      if (acquiredError || !acquired || !acquired.length) {
        idle.skipped.push({ skill_id: skillId, reason: "not_acquired" });
        continue;
      }
      const estimatedSeconds = await planEstimate(context.admin, context.schoolId, context.runId, skillId, discovery);
      const requestKey = await runSkillRequestKey(context.runId, skillId, candidate.version, estimatedSeconds);
      const rpcName = autonomy.mode === "autonomous" ? "jd_autonomous_cost_authorize" : "jd_confirm_run_skill_cost";
      const { data: receipt, error: authorizeError } = await context.admin.rpc(rpcName, {
        p_actor: context.userId, p_request: requestKey, p_run: context.runId,
        p_skill: skillId, p_expected_version: candidate.version, p_estimated_seconds: estimatedSeconds,
      });
      if (authorizeError || !receipt || receipt.status !== "confirmed") {
        const code = String((authorizeError as any)?.code || "unknown");
        if (code === "54000") {
          idle.ceiling_stop = true;
          idle.skipped.push({ skill_id: skillId, reason: "spend_ceiling" });
        } else {
          idle.skipped.push({ skill_id: skillId, reason: code === "40001" ? "request_conflict" : "authorization_refused" });
        }
        continue;
      }
      idle.authorized.push({
        skill_id: skillId,
        version: candidate.version,
        estimated_seconds: estimatedSeconds,
        basis: autonomy.mode === "autonomous" ? "autonomous_preauthorized" : "source_index_estimate",
      });
    }
    return idle;
  } catch {
    return idle;
  }
}
