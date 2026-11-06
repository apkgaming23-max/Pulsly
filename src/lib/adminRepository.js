import { supabase } from "./supabase";

async function requireUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("Du måste vara inloggad i Pulsly.");
  return user;
}

export async function getMyAdminRole() {
  const user = await requireUser();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();
  if (error) throw error;

  const role = data?.role || "user";
  return {
    role,
    isAdmin: role === "admin" || role === "superuser",
    isSuperuser: role === "superuser",
  };
}

async function requireAdmin() {
  const access = await getMyAdminRole();
  if (!access.isAdmin) {
    throw new Error("Du saknar administratörsbehörighet.");
  }
  return access;
}

export async function getAdminOverview() {
  await requireAdmin();

  const [profiles, activities, events, challenges, teams] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("activities").select("id", { count: "exact", head: true }),
    supabase.from("group_events").select("id", { count: "exact", head: true }),
    supabase.from("challenges").select("id", { count: "exact", head: true }),
    supabase.from("teams").select("id", { count: "exact", head: true }),
  ]);

  for (const result of [profiles, activities, events, challenges, teams]) {
    if (result.error) throw result.error;
  }

  return {
    users: Number(profiles.count || 0),
    activities: Number(activities.count || 0),
    events: Number(events.count || 0),
    challenges: Number(challenges.count || 0),
    teams: Number(teams.count || 0),
  };
}

export async function getAdminUsers({ limit = 200 } = {}) {
  await requireAdmin();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, department, location, role, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function setUserRole(userId, role) {
  const access = await requireAdmin();

  if (!access.isSuperuser) {
    throw new Error("Endast superuser kan ändra användarroller.");
  }

  if (!["user", "admin", "superuser"].includes(role)) {
    throw new Error("Ogiltig användarroll.");
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ role, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select("id, full_name, role")
    .single();
  if (error) throw error;
  return data;
}

export async function getAdminEvents({ limit = 100 } = {}) {
  await requireAdmin();

  const { data, error } = await supabase
    .from("group_events")
    .select("*")
    .order("starts_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function cancelEventAsAdmin(eventId) {
  await requireAdmin();

  const { data, error } = await supabase
    .from("group_events")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", eventId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getHealthSyncFailures({ limit = 100 } = {}) {
  await requireAdmin();

  const { data, error } = await supabase
    .from("health_sync_log")
    .select("id, user_id, provider, started_at, finished_at, status, message")
    .in("status", ["failed", "partial"])
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}
