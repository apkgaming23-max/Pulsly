import { supabase } from "./supabase";

async function currentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("Du måste vara inloggad i Pulsly.");
  return user;
}

export async function getMyNotifications({ limit = 100, unreadOnly = false } = {}) {
  const user = await currentUser();
  let query = supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(200, Number(limit) || 100)));

  if (unreadOnly) query = query.eq("read", false);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getUnreadNotificationCount() {
  const user = await currentUser();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("read", false);

  if (error) throw error;
  return Number(count || 0);
}

export async function markNotificationRead(notificationId) {
  const user = await currentUser();
  const { data, error } = await supabase
    .from("notifications")
    .update({ read: true, read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function markAllNotificationsRead() {
  const user = await currentUser();
  const { error } = await supabase
    .from("notifications")
    .update({ read: true, read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("read", false);

  if (error) throw error;
}

export async function getPendingEventInvites() {
  const user = await currentUser();
  const { data, error } = await supabase
    .from("group_event_invites")
    .select("*,group_events(*)")
    .eq("invited_user_id", user.id)
    .eq("status", "invited")
    .order("invited_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function respondToEventInvite(inviteId, response) {
  if (!["accepted", "declined"].includes(response)) {
    throw new Error("Ogiltigt svar på eventinbjudan.");
  }

  const { error } = await supabase.rpc("respond_to_group_event", {
    p_invite_id: inviteId,
    p_response: response,
  });

  if (error) throw error;
}

export function subscribeToMyNotifications(userId, onChange) {
  if (!userId) throw new Error("userId saknas för notisprenumeration.");

  const channel = supabase
    .channel(`pulsly-notifications-${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => onChange?.(payload)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
