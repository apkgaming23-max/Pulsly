import { supabase } from "./supabase";

async function currentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("Du måste vara inloggad i Pulsly.");
  return user;
}

export async function getMyActivities(limit = 100) {
  const user = await currentUser();
  const { data, error } = await supabase
    .from("activities")
    .select("*")
    .eq("user_id", user.id)
    .order("started_at", { ascending: false })
    .limit(Math.max(1, Math.min(500, Number(limit) || 100)));
  if (error) throw error;
  return data || [];
}

export async function getMyActivityDetails(activityId) {
  const user = await currentUser();
  const [activity, route, splits, eventMatch] = await Promise.all([
    supabase.from("activities").select("*").eq("id", activityId).eq("user_id", user.id).maybeSingle(),
    supabase.from("activity_routes").select("*").eq("activity_id", activityId).eq("user_id", user.id).order("recorded_at"),
    supabase.from("activity_splits").select("*").eq("activity_id", activityId).eq("user_id", user.id).order("split_number"),
    supabase.from("event_activity_matches").select("*").eq("activity_id", activityId).eq("user_id", user.id).maybeSingle(),
  ]);
  if (activity.error) throw activity.error;
  if (route.error) throw route.error;
  if (splits.error) throw splits.error;
  if (eventMatch.error) throw eventMatch.error;
  return {
    activity: activity.data || null,
    route: route.data || [],
    splits: splits.data || [],
    eventMatch: eventMatch.data || null,
  };
}

export async function getMyEvents() {
  const user = await currentUser();
  const [events, invites, summary] = await Promise.all([
    supabase.from("group_events").select("*").order("starts_at", { ascending: true }),
    supabase.from("group_event_invites").select("*,group_events(*)").eq("invited_user_id", user.id).order("invited_at", { ascending: false }),
    supabase.from("group_event_live_summary").select("*"),
  ]);
  if (events.error) throw events.error;
  if (invites.error) throw invites.error;
  if (summary.error) throw summary.error;
  return {
    events: events.data || [],
    invites: invites.data || [],
    summaries: Object.fromEntries((summary.data || []).map((row) => [row.event_id, row])),
  };
}

export async function joinEvent(eventId) {
  const { error } = await supabase.rpc("join_group_event", { p_event_id: eventId });
  if (error) throw error;
}

export async function recheckEvent(eventId) {
  const { data, error } = await supabase.rpc("recheck_my_group_event", { p_event_id: eventId });
  if (error) throw error;
  return data;
}

export async function getMyEventStatus(eventId) {
  const { data, error } = await supabase.rpc("get_my_group_event_status", { p_event_id: eventId });
  if (error) throw error;
  return data;
}

export async function getWallPosts(limit = 50) {
  const { data, error } = await supabase
    .from("activity_posts")
    .select(`
      *,
      profiles(full_name,avatar_url),
      activities(activity_type,duration_seconds,distance_meters,steps,points,verified,average_pace_seconds_per_km,average_speed_kmh,started_at,event_id),
      activity_post_likes(user_id),
      activity_post_comments(id,comment,created_at,user_id)
    `)
    .in("visibility", ["members", "public"])
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(200, Number(limit) || 50)));
  if (error) throw error;
  return data || [];
}

export async function togglePostLike(postId) {
  const user = await currentUser();
  const { data: existing, error: lookupError } = await supabase
    .from("activity_post_likes")
    .select("post_id")
    .eq("post_id", postId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) {
    const { error } = await supabase.from("activity_post_likes").delete().eq("post_id", postId).eq("user_id", user.id);
    if (error) throw error;
    return false;
  }
  const { error } = await supabase.from("activity_post_likes").insert({ post_id: postId, user_id: user.id });
  if (error) throw error;
  return true;
}

export async function addPostComment(postId, comment) {
  const user = await currentUser();
  const text = String(comment || "").trim();
  if (!text) throw new Error("Kommentaren är tom.");
  const { data, error } = await supabase
    .from("activity_post_comments")
    .insert({ post_id: postId, user_id: user.id, comment: text })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
