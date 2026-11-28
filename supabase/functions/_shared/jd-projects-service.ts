// Tenant-isolated JD Projects service (business initiatives & software builds).
// Every read and write is scoped by profile.school_id and authenticated actorId.

const MANAGER_ROLES = ["owner", "admin", "manager"];
const ADMIN_ROLES = ["owner", "admin"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function sanitizePreviewConfig(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (typeof raw.route === "string") out.route = raw.route.slice(0, 120);
  if (typeof raw.headline === "string") out.headline = raw.headline.slice(0, 240);
  if (typeof raw.summary === "string") out.summary = raw.summary.slice(0, 2000);
  if (typeof raw.domain === "string") out.domain = raw.domain.slice(0, 160);
  if (typeof raw.template === "string") out.template = raw.template.slice(0, 80);
  if (typeof raw.html_preview === "string") out.html_preview = raw.html_preview.slice(0, 24000);
  if (Array.isArray(raw.highlights)) {
    out.highlights = raw.highlights.slice(0, 12).map((item) => String(item || "").slice(0, 200));
  }
  return out;
}

export async function handleProjects({
  payload,
  admin,
  profile,
  actorId,
  json,
}: {
  payload: any;
  admin: any;
  profile: { school_id: string; role: string; full_name?: string };
  actorId: string;
  json: (body: unknown, status?: number) => Response;
}) {
  const action = String(payload.action || "");
  const schoolId = profile.school_id;
  const isPrivileged = ADMIN_ROLES.includes(String(profile.role || ""));
  const canWrite = MANAGER_ROLES.includes(String(profile.role || "")) || isPrivileged;

  if (action === "projects.list") {
    const filter = typeof payload.filter === "string" ? payload.filter : "all";
    const kind = typeof payload.kind === "string" ? payload.kind : "";
    let query = admin
      .from("jd_projects")
      .select("id,school_id,created_by,name,description,kind,status,pinned,preview_config,metadata_json,created_at,updated_at")
      .eq("school_id", schoolId)
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(120);

    if (!MANAGER_ROLES.includes(String(profile.role || ""))) {
      query = query.eq("created_by", actorId);
    }
    if (filter === "archived") {
      query = query.eq("status", "archived");
    } else if (filter === "published") {
      query = query.eq("status", "published");
    } else if (filter === "pinned") {
      query = query.eq("pinned", true).neq("status", "archived");
    } else if (filter === "active") {
      query = query.in("status", ["active", "published"]);
    }
    if (kind === "initiative" || kind === "software") {
      query = query.eq("kind", kind);
    }

    const { data, error } = await query;
    if (error) return json({ error: "Could not load workspace projects" }, 500);
    return json({ projects: data || [] });
  }

  if (action === "projects.create") {
    if (!canWrite) {
      return json({ error: "Manager or administrator access is required to create projects" }, 403);
    }
    const name = cleanText(payload.name, 140);
    if (name.length < 2) {
      return json({ error: "Project name must be at least 2 characters" }, 400);
    }
    const description = cleanText(payload.description, 4000);
    const kind = payload.kind === "software" ? "software" : "initiative";
    const previewConfig = sanitizePreviewConfig(payload.previewConfig) || {
      route: "/",
      headline: name,
      summary: description || (kind === "software"
        ? "Software build workspace — describe features, UI, or architecture in Chat to iterate."
        : "Business initiative workspace — plan operations, tasks, team ownership, and deliverables."),
    };
    const { data: created, error } = await admin
      .from("jd_projects")
      .insert({
        school_id: schoolId,
        created_by: actorId,
        name,
        description,
        kind,
        status: "active",
        pinned: Boolean(payload.pinned),
        preview_config: previewConfig,
        metadata_json: {
          owner_name: cleanText(profile.full_name, 120) || "Workspace Member",
          initial_mode: ["ask", "plan", "execute"].includes(payload.initialMode) ? payload.initialMode : "plan",
        },
      })
      .select("*")
      .single();

    if (error || !created) return json({ error: "Could not create project" }, 500);
    await admin.from("jd_audit_events").insert({
      school_id: schoolId,
      actor_id: actorId,
      event_type: "project.created",
      event_json: { project_id: created.id, kind, name: created.name },
    });
    return json({ project: created }, 201);
  }

  if (action === "projects.update") {
    const projectId = payload.projectId;
    if (!isUuid(projectId)) return json({ error: "Valid projectId is required" }, 400);
    const { data: existing, error: readErr } = await admin
      .from("jd_projects")
      .select("*")
      .eq("id", projectId)
      .eq("school_id", schoolId)
      .maybeSingle();
    if (readErr || !existing) return json({ error: "Project not found" }, 404);
    if (existing.created_by !== actorId && !isPrivileged) {
      return json({ error: "Only the project owner or an administrator can update this project" }, 403);
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof payload.name === "string") {
      const name = cleanText(payload.name, 140);
      if (name.length < 2) return json({ error: "Project name must be at least 2 characters" }, 400);
      patch.name = name;
    }
    if (typeof payload.description === "string") {
      patch.description = cleanText(payload.description, 4000);
    }
    if (payload.kind === "initiative" || payload.kind === "software") {
      patch.kind = payload.kind;
    }
    if (["active", "published", "archived"].includes(payload.status)) {
      if (payload.status === "published" && !isPrivileged && !canWrite) {
        return json({ error: "Publishing requires manager or administrator access" }, 403);
      }
      patch.status = payload.status;
    }
    if (typeof payload.pinned === "boolean") {
      patch.pinned = payload.pinned;
    }
    if (payload.previewConfig !== undefined) {
      const sanitized = sanitizePreviewConfig(payload.previewConfig);
      if (!sanitized) return json({ error: "Invalid preview configuration" }, 400);
      patch.preview_config = { ...(existing.preview_config || {}), ...sanitized };
    }

    const { data: updated, error: updateErr } = await admin
      .from("jd_projects")
      .update(patch)
      .eq("id", projectId)
      .eq("school_id", schoolId)
      .select("*")
      .single();
    if (updateErr || !updated) return json({ error: "Could not update project" }, 500);
    await admin.from("jd_audit_events").insert({
      school_id: schoolId,
      actor_id: actorId,
      event_type: "project.updated",
      event_json: { project_id: projectId, status: updated.status, pinned: updated.pinned },
    });
    return json({ project: updated });
  }

  if (action === "projects.detail") {
    const projectId = payload.projectId;
    if (!isUuid(projectId)) return json({ error: "Valid projectId is required" }, 400);
    const { data: project, error: projectErr } = await admin
      .from("jd_projects")
      .select("*")
      .eq("id", projectId)
      .eq("school_id", schoolId)
      .maybeSingle();
    if (projectErr || !project) return json({ error: "Project not found" }, 404);
    if (!MANAGER_ROLES.includes(String(profile.role || "")) && project.created_by !== actorId) {
      return json({ error: "Project not found" }, 404);
    }

    const [{ data: conversations }, { data: tasks }, { data: memory }] = await Promise.all([
      admin
        .from("jd_conversations")
        .select("id,title,status,updated_at,created_at")
        .eq("school_id", schoolId)
        .eq("project_id", projectId)
        .order("updated_at", { ascending: false })
        .limit(25),
      admin
        .from("jd_operational_tasks")
        .select("id,title,description,department,priority,status,due_at,updated_at")
        .eq("school_id", schoolId)
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(40),
      admin
        .from("jd_business_memory")
        .select("memory_key,category,content,confidence,updated_at")
        .eq("school_id", schoolId)
        .order("updated_at", { ascending: false })
        .limit(12),
    ]);

    return json({
      project,
      conversations: conversations || [],
      tasks: tasks || [],
      memory: memory || [],
    });
  }

  return json({ error: "Unsupported project action" }, 400);
}
