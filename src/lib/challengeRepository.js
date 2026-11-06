import { supabase } from "./supabase";

async function currentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("Du måste vara inloggad i Pulsly.");
  return user;
}

export async function getChallenges() {
  const user = await currentUser();
  const [challenges, memberships] = await Promise.all([
    supabase.from("challenges").select("*").order("starts_at", { ascending: true }),
    supabase.from("challenge_members").select("challenge_id,user_id,joined_at").eq("user_id", user.id),
  ]);
  if (challenges.error) throw challenges.error;
  if (memberships.error) throw memberships.error;
  return { challenges: challenges.data || [], myMemberships: memberships.data || [] };
}

export async function joinChallenge(challengeId) {
  const user = await currentUser();
  const { error } = await supabase.from("challenge_members").insert({ challenge_id: challengeId, user_id: user.id });
  if (error && error.code !== "23505") throw error;
}

export async function leaveChallenge(challengeId) {
  const user = await currentUser();
  const { error } = await supabase.from("challenge_members").delete().eq("challenge_id", challengeId).eq("user_id", user.id);
  if (error) throw error;
}

export async function getChallengeProgress(challengeId) {
  const user = await currentUser();
  const { data: challenge, error: challengeError } = await supabase.from("challenges").select("*").eq("id", challengeId).maybeSingle();
  if (challengeError) throw challengeError;
  if (!challenge) return null;

  const from = challenge.starts_at || challenge.start_date;
  const to = challenge.ends_at || challenge.end_date;
  let activityQuery = supabase.from("activities").select("points,distance_meters,steps,duration_seconds,started_at,verified").eq("user_id", user.id).eq("verified", true);
  if (from) activityQuery = activityQuery.gte("started_at", new Date(from).toISOString());
  if (to) activityQuery = activityQuery.lte("started_at", new Date(to).toISOString());
  const { data: activities, error } = await activityQuery;
  if (error) throw error;

  const totals = (activities || []).reduce((sum, item) => ({
    points: sum.points + Number(item.points || 0),
    distanceMeters: sum.distanceMeters + Number(item.distance_meters || 0),
    steps: sum.steps + Number(item.steps || 0),
    activeMinutes: sum.activeMinutes + Math.round(Number(item.duration_seconds || 0) / 60),
  }), { points: 0, distanceMeters: 0, steps: 0, activeMinutes: 0 });

  return { challenge, totals };
}

export async function createChallenge(values = {}) {
  const user = await currentUser();
  const name = String(values.name || values.title || "").trim();
  if (!name) throw new Error("Utmaningen måste ha ett namn.");

  const payload = {
    name,
    description: String(values.description || "").trim() || null,
    created_by: user.id,
  };
  if (values.starts_at) payload.starts_at = values.starts_at;
  if (values.ends_at) payload.ends_at = values.ends_at;
  if (values.goal_type) payload.goal_type = values.goal_type;
  if (values.goal_value != null) payload.goal_value = Number(values.goal_value);

  const { data, error } = await supabase.from("challenges").insert(payload).select("*").single();
  if (error) throw error;
  return data;
}
