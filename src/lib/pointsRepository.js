import { supabase } from "./supabase";

async function currentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("Du måste vara inloggad i Pulsly.");
  return user;
}

export async function getMyPointsSummary({ days = 30 } = {}) {
  const user = await currentUser();
  const from = new Date(Date.now() - (Math.max(1, days) - 1) * 86400000);
  from.setHours(0, 0, 0, 0);

  const [activityResult, passiveResult] = await Promise.all([
    supabase
      .from("activities")
      .select("id,activity_type,started_at,base_points,multiplier,points,is_group_activity,verified,event_id")
      .eq("user_id", user.id)
      .gte("started_at", from.toISOString())
      .order("started_at", { ascending: false }),
    supabase
      .from("passive_activity_points")
      .select("activity_date,passive_points,rewarded_steps,active_minutes")
      .eq("user_id", user.id)
      .gte("activity_date", from.toISOString().slice(0, 10))
      .order("activity_date", { ascending: false }),
  ]);

  if (activityResult.error) throw activityResult.error;
  if (passiveResult.error) throw passiveResult.error;

  const activities = activityResult.data || [];
  const passive = passiveResult.data || [];

  const activePoints = activities.reduce(
    (sum, item) => sum + Number(item.points || 0),
    0
  );
  const passivePoints = passive.reduce(
    (sum, item) => sum + Number(item.passive_points || 0),
    0
  );
  const groupBonusExtra = activities.reduce((sum, item) => {
    const base = Number(item.base_points || 0);
    const multiplier = Number(item.multiplier || 1);
    return sum + Math.max(0, base * multiplier - base);
  }, 0);

  return {
    totalPoints: activePoints + passivePoints,
    activePoints,
    passivePoints,
    groupBonusExtra,
    activities,
    passiveDays: passive,
  };
}

export async function recalculateTodayPoints() {
  const user = await currentUser();
  const date = new Date().toISOString().slice(0, 10);

  const { error: duplicateError } = await supabase.rpc(
    "find_my_health_workout_duplicates"
  );
  if (duplicateError) throw duplicateError;

  const { data: passivePoints, error } = await supabase.rpc(
    "calculate_passive_activity_points",
    { p_user_id: user.id, p_date: date }
  );
  if (error) throw error;

  return Number(passivePoints || 0);
}

export async function getLeaderboard({ days = 30, limit = 50 } = {}) {
  const from = new Date(Date.now() - (Math.max(1, days) - 1) * 86400000);
  from.setHours(0, 0, 0, 0);

  const [activityResult, passiveResult, profilesResult] = await Promise.all([
    supabase
      .from("activities")
      .select("user_id,points,started_at,verified")
      .gte("started_at", from.toISOString())
      .eq("verified", true),
    supabase
      .from("passive_activity_points")
      .select("user_id,passive_points,activity_date")
      .gte("activity_date", from.toISOString().slice(0, 10)),
    supabase
      .from("profiles")
      .select("id,full_name,avatar_url,department,location"),
  ]);

  if (activityResult.error) throw activityResult.error;
  if (passiveResult.error) throw passiveResult.error;
  if (profilesResult.error) throw profilesResult.error;

  const totals = new Map();
  for (const item of activityResult.data || []) {
    totals.set(item.user_id, (totals.get(item.user_id) || 0) + Number(item.points || 0));
  }
  for (const item of passiveResult.data || []) {
    totals.set(item.user_id, (totals.get(item.user_id) || 0) + Number(item.passive_points || 0));
  }

  const profiles = new Map(
    (profilesResult.data || []).map((profile) => [profile.id, profile])
  );

  return [...totals.entries()]
    .map(([userId, points]) => ({
      userId,
      points,
      profile: profiles.get(userId) || null,
    }))
    .sort((a, b) => b.points - a.points)
    .slice(0, Math.max(1, Math.min(200, Number(limit) || 50)))
    .map((item, index) => ({ ...item, rank: index + 1 }));
}
