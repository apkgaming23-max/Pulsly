import { supabase } from "./supabase";

export const DEFAULT_PRIVACY = Object.freeze({
  profile_visibility: "members",
  wall_default_visibility: "members",
  share_route_default: false,
  hide_route_start: true,
  hide_route_end: true,
  privacy_radius_meters: 200,
  share_heart_rate_default: false,
  share_vo2max_default: false,
  share_health_stats_default: false,
});

async function currentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("Du måste vara inloggad i Pulsly.");
  return user;
}

export async function getPrivacySettings() {
  const user = await currentUser();
  const { data, error } = await supabase
    .from("privacy_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data || { user_id: user.id, ...DEFAULT_PRIVACY };
}

export async function savePrivacySettings(values = {}) {
  const user = await currentUser();
  const visibility = ["private", "members", "public"].includes(values.wall_default_visibility)
    ? values.wall_default_visibility
    : DEFAULT_PRIVACY.wall_default_visibility;
  const profileVisibility = ["private", "members", "public"].includes(values.profile_visibility)
    ? values.profile_visibility
    : DEFAULT_PRIVACY.profile_visibility;
  const radius = Math.max(0, Math.min(5000, Number(values.privacy_radius_meters ?? DEFAULT_PRIVACY.privacy_radius_meters)));

  const payload = {
    user_id: user.id,
    profile_visibility: profileVisibility,
    wall_default_visibility: visibility,
    share_route_default: Boolean(values.share_route_default),
    hide_route_start: values.hide_route_start !== false,
    hide_route_end: values.hide_route_end !== false,
    privacy_radius_meters: radius,
    share_heart_rate_default: Boolean(values.share_heart_rate_default),
    share_vo2max_default: Boolean(values.share_vo2max_default),
    share_health_stats_default: Boolean(values.share_health_stats_default),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("privacy_settings")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMyHealthData() {
  const { error } = await supabase.rpc("delete_my_health_data");
  if (error) throw error;
}
