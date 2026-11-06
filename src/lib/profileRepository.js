import { supabase } from "./supabase";

async function currentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("Du måste vara inloggad i Pulsly.");
  return user;
}

export async function getMyProfile() {
  const user = await currentUser();
  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function updateMyProfile(values = {}) {
  const user = await currentUser();
  const allowed = {
    full_name: values.full_name?.trim() || null,
    avatar_url: values.avatar_url || null,
    department: values.department?.trim() || null,
    location: values.location?.trim() || null,
    bio: values.bio?.trim() || null,
    profile_visibility: values.profile_visibility || "members",
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from("profiles").update(allowed).eq("id", user.id).select("*").single();
  if (error) throw error;
  return data;
}

export async function searchMembers(query, limit = 30) {
  const text = String(query || "").trim();
  if (text.length < 2) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("id,full_name,avatar_url,department,location")
    .ilike("full_name", `%${text}%`)
    .limit(Math.max(1, Math.min(100, Number(limit) || 30)));
  if (error) throw error;
  return data || [];
}

export async function getTeams() {
  const user = await currentUser();
  const [teams, memberships] = await Promise.all([
    supabase.from("teams").select("*").order("name"),
    supabase.from("team_members").select("team_id,user_id,joined_at").eq("user_id", user.id),
  ]);
  if (teams.error) throw teams.error;
  if (memberships.error) throw memberships.error;
  return { teams: teams.data || [], myMemberships: memberships.data || [] };
}

export async function createTeam({ name, description = "" }) {
  const user = await currentUser();
  const title = String(name || "").trim();
  if (!title) throw new Error("Laget måste ha ett namn.");
  const { data: team, error } = await supabase.from("teams").insert({ name: title, description: String(description || "").trim() || null, created_by: user.id }).select("*").single();
  if (error) throw error;
  const { error: memberError } = await supabase.from("team_members").insert({ team_id: team.id, user_id: user.id });
  if (memberError) throw memberError;
  return team;
}

export async function joinTeam(teamId) {
  const user = await currentUser();
  const { error } = await supabase.from("team_members").insert({ team_id: teamId, user_id: user.id });
  if (error && error.code !== "23505") throw error;
}

export async function leaveTeam(teamId) {
  const user = await currentUser();
  const { error } = await supabase.from("team_members").delete().eq("team_id", teamId).eq("user_id", user.id);
  if (error) throw error;
}

export async function getTeamMembers(teamId) {
  const { data: links, error } = await supabase.from("team_members").select("user_id,joined_at").eq("team_id", teamId).order("joined_at");
  if (error) throw error;
  const ids = (links || []).map((item) => item.user_id);
  if (!ids.length) return [];
  const { data: profiles, error: profileError } = await supabase.from("profiles").select("id,full_name,avatar_url,department,location").in("id", ids);
  if (profileError) throw profileError;
  const byId = new Map((profiles || []).map((profile) => [profile.id, profile]));
  return (links || []).map((link) => ({ ...link, profile: byId.get(link.user_id) || null }));
}
