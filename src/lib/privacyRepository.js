import { supabase } from "./supabase";

async function requireUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("Du måste vara inloggad i Pulsly.");
  return user;
}

const DEFAULT_PRIVACY = Object.freeze({
  profile_visibility: "members",
  post_visibility: "members",
  share_route_default: false,
  hide_route_start: true,
  hide_route_end: true,
  privacy_radius_meters: 200,
  share_heart_rate: false,
  share_vo2max: false,
  share_health_stats: false,
});

export async function getMyPrivacySettings() {
  const user = await requireUser();
  const { data, error } = await supabase
    .from("privacy_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return { user_id: user.id, ...DEFAULT_PRIVACY, ...(data || {}) };
}

export async function saveMyPrivacySettings(values = {}) {
  const user = await requireUser();
  const current = await getMyPrivacySettings();
  const radius = Math.max(0, Math.min(5000, Number(values.privacy_radius_meters ?? current.privacy_radius_meters) || 0));

  const payload = {
    ...current,
    ...values,
    user_id: user.id,
    privacy_radius_meters: radius,
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

function haversineMeters(a, b) {
  const radius = 6371000;
  const rad = (value) => (value * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const lat1 = rad(a.latitude);
  const lat2 = rad(b.latitude);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function removeFromStart(points, radiusMeters) {
  if (points.length < 2 || radiusMeters <= 0) return points;
  let distance = 0;
  for (let i = 1; i < points.length; i += 1) {
    distance += haversineMeters(points[i - 1], points[i]);
    if (distance >= radiusMeters) return points.slice(i);
  }
  return [];
}

export async function buildShareableActivityRoute(activityId, overrides = {}) {
  const user = await requireUser();
  const privacy = { ...(await getMyPrivacySettings()), ...overrides };

  const { data, error } = await supabase
    .from("activity_routes")
    .select("latitude, longitude, accuracy_meters, altitude_meters, recorded_at")
    .eq("activity_id", activityId)
    .eq("user_id", user.id)
    .order("recorded_at", { ascending: true });
  if (error) throw error;

  let points = data || [];
  const radius = Math.max(0, Number(privacy.privacy_radius_meters) || 0);

  if (privacy.hide_route_start) points = removeFromStart(points, radius);
  if (privacy.hide_route_end) points = [...removeFromStart([...points].reverse(), radius)].reverse();

  return points;
}

export async function replaceSharedActivityRoute(postId, activityId, overrides = {}) {
  const user = await requireUser();
  const points = await buildShareableActivityRoute(activityId, overrides);

  const { error: deleteError } = await supabase
    .from("activity_post_routes")
    .delete()
    .eq("post_id", postId)
    .eq("user_id", user.id);
  if (deleteError) throw deleteError;

  if (!points.length) return { inserted: 0 };

  const rows = points.map((point, route_order) => ({
    post_id: postId,
    activity_id: activityId,
    user_id: user.id,
    route_order,
    latitude: point.latitude,
    longitude: point.longitude,
  }));

  const { error } = await supabase.from("activity_post_routes").insert(rows);
  if (error) throw error;
  return { inserted: rows.length };
}

export async function removeSharedActivityRoute(postId) {
  const user = await requireUser();
  const { error } = await supabase
    .from("activity_post_routes")
    .delete()
    .eq("post_id", postId)
    .eq("user_id", user.id);
  if (error) throw error;
  return true;
}

export async function deleteMyImportedHealthData() {
  const user = await requireUser();
  const { error } = await supabase.rpc("delete_my_imported_health_data", { p_user_id: user.id });
  if (error) throw error;
  return true;
}


// Bakåtkompatibla exportnamn som används av nuvarande App.jsx.
export const getPrivacySettings = getMyPrivacySettings;
export const savePrivacySettings = saveMyPrivacySettings;
export const deleteMyHealthData = deleteMyImportedHealthData;
