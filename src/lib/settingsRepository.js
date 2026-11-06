import { supabase } from "./supabase";

const DEFAULTS = Object.freeze({
  voice_coach_enabled: true,
  voice_interval_meters: 1000,
  voice_distance: true,
  voice_total_time: true,
  voice_split_time: true,
  voice_average_pace: true,
  voice_points: false,
  voice_speed: true,
  voice_language: "sv-SE",
  auto_pause: false,
  distance_unit: "km",
});

async function currentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("Du måste vara inloggad i Pulsly.");
  return user;
}

export async function getMySettings() {
  const user = await currentUser();
  const { data, error } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return { user_id: user.id, ...DEFAULTS, ...(data || {}) };
}

export async function saveMySettings(values = {}) {
  const user = await currentUser();
  const current = await getMySettings();
  const interval = Math.max(100, Math.min(10000, Number(values.voice_interval_meters ?? current.voice_interval_meters)));
  const distanceUnit = ["km", "mi"].includes(values.distance_unit) ? values.distance_unit : current.distance_unit;

  const payload = {
    ...current,
    ...values,
    user_id: user.id,
    voice_interval_meters: interval,
    distance_unit: distanceUnit,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("user_settings")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function resetMySettings() {
  return saveMySettings(DEFAULTS);
}

export async function getAppBootstrap() {
  const user = await currentUser();
  const [profile, settings, privacy, unread] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("privacy_settings").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("read", false),
  ]);
  for (const result of [profile, settings, privacy, unread]) {
    if (result.error) throw result.error;
  }
  return {
    user,
    profile: profile.data || null,
    settings: { user_id: user.id, ...DEFAULTS, ...(settings.data || {}) },
    privacy: privacy.data || null,
    unreadNotifications: Number(unread.count || 0),
  };
}
