import { supabase } from "./supabase";

async function requireUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("Du måste vara inloggad i Pulsly.");
  return user;
}

function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function trimRoute(points, radiusMeters) {
  if (!Array.isArray(points) || points.length < 3 || radiusMeters <= 0) return points || [];

  let startIndex = 0;
  let fromStart = 0;
  for (let i = 1; i < points.length; i += 1) {
    fromStart += haversineMeters(points[i - 1], points[i]);
    if (fromStart >= radiusMeters) {
      startIndex = i;
      break;
    }
  }

  let endIndex = points.length - 1;
  let fromEnd = 0;
  for (let i = points.length - 2; i >= 0; i -= 1) {
    fromEnd += haversineMeters(points[i + 1], points[i]);
    if (fromEnd >= radiusMeters) {
      endIndex = i;
      break;
    }
  }

  if (startIndex >= endIndex) return [];
  return points.slice(startIndex, endIndex + 1);
}

export async function buildShareableRoute(activityId, {
  hideStart = true,
  hideEnd = true,
  privacyRadiusMeters = 200,
} = {}) {
  const user = await requireUser();
  const { data, error } = await supabase
    .from("activity_routes")
    .select("latitude, longitude, accuracy_meters, altitude_meters, recorded_at")
    .eq("activity_id", activityId)
    .eq("user_id", user.id)
    .order("recorded_at", { ascending: true });

  if (error) throw error;
  let points = data || [];

  if (hideStart && points.length) {
    points = trimRoute(points, Math.max(0, Number(privacyRadiusMeters) || 0));
  }

  if (hideEnd && points.length) {
    points = [...trimRoute([...points].reverse(), Math.max(0, Number(privacyRadiusMeters) || 0))].reverse();
  }

  return points;
}

export async function replaceSharedRoute(postId, activityId, options = {}) {
  const user = await requireUser();
  const points = await buildShareableRoute(activityId, options);

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

export async function removeSharedRoute(postId) {
  const user = await requireUser();
  const { error } = await supabase
    .from("activity_post_routes")
    .delete()
    .eq("post_id", postId)
    .eq("user_id", user.id);
  if (error) throw error;
  return true;
}
