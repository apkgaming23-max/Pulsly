import { supabase } from "./supabase";

async function currentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("Du måste vara inloggad i Pulsly.");
  return user;
}

export async function createGroupEvent(values = {}) {
  const user = await currentUser();
  const title = String(values.title || "").trim();
  const startsAt = values.starts_at || values.startsAt;

  if (!title) throw new Error("Eventet måste ha ett namn.");
  if (!startsAt) throw new Error("Eventet måste ha en starttid.");

  const start = new Date(startsAt);
  if (!Number.isFinite(start.getTime()) || start <= new Date()) {
    throw new Error("Starttiden måste ligga i framtiden.");
  }

  const { data: event, error } = await supabase
    .from("group_events")
    .insert({
      created_by: user.id,
      title,
      description: String(values.description || "").trim() || null,
      activity_type: values.activity_type || values.activityType || "Jogging",
      event_date: start.toISOString().slice(0, 10),
      starts_at: start.toISOString(),
      ends_at: null,
      join_deadline: null,
      location_name: String(values.location_name || values.locationName || "").trim() || null,
      minimum_participants: Math.max(2, Number(values.minimum_participants || 2)),
      status: "open",
    })
    .select("*")
    .single();

  if (error) throw error;

  const { error: joinError } = await supabase.rpc("join_group_event", {
    p_event_id: event.id,
  });
  if (joinError) throw joinError;

  return event;
}

export async function inviteMembersToEvent(eventId, userIds = []) {
  const user = await currentUser();
  const uniqueIds = [...new Set(userIds)].filter((id) => id && id !== user.id);
  if (!uniqueIds.length) return [];

  const rows = uniqueIds.map((invitedUserId) => ({
    event_id: eventId,
    invited_user_id: invitedUserId,
    invited_by: user.id,
    status: "invited",
  }));

  const { data, error } = await supabase
    .from("group_event_invites")
    .upsert(rows, { onConflict: "event_id,invited_user_id", ignoreDuplicates: true })
    .select("*");

  if (error) throw error;
  return data || [];
}

export async function getEventParticipants(eventId) {
  const { data: invites, error } = await supabase
    .from("group_event_invites")
    .select("id,invited_user_id,status,invited_at,responded_at")
    .eq("event_id", eventId)
    .order("invited_at", { ascending: true });

  if (error) throw error;

  const ids = (invites || []).map((item) => item.invited_user_id);
  if (!ids.length) return [];

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id,full_name,avatar_url,department,location")
    .in("id", ids);

  if (profileError) throw profileError;
  const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));

  const { data: matches, error: matchError } = await supabase
    .from("event_activity_matches")
    .select("user_id,activity_id,verification_status,verification_score,group_bonus_awarded")
    .eq("event_id", eventId);

  if (matchError) throw matchError;
  const matchMap = new Map((matches || []).map((match) => [match.user_id, match]));

  return (invites || []).map((invite) => ({
    ...invite,
    profile: profileMap.get(invite.invited_user_id) || null,
    verification: matchMap.get(invite.invited_user_id) || null,
  }));
}

export async function respondToEventInvite(inviteId, response) {
  if (!["accepted", "declined"].includes(response)) {
    throw new Error("Svaret måste vara accepted eller declined.");
  }

  const { error } = await supabase.rpc("respond_to_group_event", {
    p_invite_id: inviteId,
    p_response: response,
  });
  if (error) throw error;
}

export async function joinOpenEvent(eventId) {
  const { error } = await supabase.rpc("join_group_event", {
    p_event_id: eventId,
  });
  if (error) throw error;
}

export async function cancelMyEvent(eventId) {
  const user = await currentUser();

  const { data, error } = await supabase
    .from("group_events")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", eventId)
    .eq("created_by", user.id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function getUpcomingEvents({ limit = 50 } = {}) {
  const { data, error } = await supabase
    .from("group_events")
    .select("*")
    .neq("status", "cancelled")
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(Math.max(1, Math.min(200, Number(limit) || 50)));

  if (error) throw error;
  return data || [];
}
