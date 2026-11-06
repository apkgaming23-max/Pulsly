import { supabase } from "./supabase";

async function requireUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("Du måste vara inloggad i Pulsly.");
  return user;
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value).replace(/"/g, '""');
  return /[",\n]/.test(text) ? `"${text}"` : text;
}

function toCsv(rows, columns) {
  const header = columns.map(([key, label]) => csvCell(label || key)).join(",");
  const body = rows.map((row) =>
    columns.map(([key]) => csvCell(row[key])).join(",")
  );
  return [header, ...body].join("\n");
}

export function downloadTextFile({ content, fileName, mimeType = "text/plain;charset=utf-8" }) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function exportMyActivitiesCsv({ limit = 5000 } = {}) {
  const user = await requireUser();
  const { data, error } = await supabase
    .from("activities")
    .select("activity_type, started_at, ended_at, duration_seconds, distance_meters, steps, base_points, multiplier, points, verified, verification_source")
    .eq("user_id", user.id)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  const csv = toCsv(data || [], [
    ["activity_type", "Aktivitet"],
    ["started_at", "Start"],
    ["ended_at", "Slut"],
    ["duration_seconds", "Tid sekunder"],
    ["distance_meters", "Distans meter"],
    ["steps", "Steg"],
    ["base_points", "Grundpoäng"],
    ["multiplier", "Multiplikator"],
    ["points", "Poäng"],
    ["verified", "Verifierad"],
    ["verification_source", "Verifieringskälla"],
  ]);

  return csv;
}

export async function exportMyHealthCsv({ days = 90 } = {}) {
  const user = await requireUser();
  const since = new Date();
  since.setDate(since.getDate() - Math.max(1, Number(days)));

  const { data, error } = await supabase
    .from("health_daily_summary")
    .select("health_date, steps, active_minutes, distance_meters, active_calories, resting_heart_rate, source, synced_at")
    .eq("user_id", user.id)
    .gte("health_date", since.toISOString().slice(0, 10))
    .order("health_date", { ascending: false });
  if (error) throw error;

  return toCsv(data || [], [
    ["health_date", "Datum"],
    ["steps", "Steg"],
    ["active_minutes", "Aktiva minuter"],
    ["distance_meters", "Distans meter"],
    ["active_calories", "Aktiva kalorier"],
    ["resting_heart_rate", "Vilopuls"],
    ["source", "Källa"],
    ["synced_at", "Synkad"],
  ]);
}

export async function exportMyVo2Csv({ limit = 500 } = {}) {
  const user = await requireUser();
  const { data, error } = await supabase
    .from("vo2max_samples")
    .select("vo2max_ml_kg_min, recorded_at, source")
    .eq("user_id", user.id)
    .order("recorded_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return toCsv(data || [], [
    ["recorded_at", "Datum"],
    ["vo2max_ml_kg_min", "VO2 max ml/kg/min"],
    ["source", "Källa"],
  ]);
}

export async function downloadMyActivitiesCsv() {
  const content = await exportMyActivitiesCsv();
  downloadTextFile({ content, fileName: "pulsly-aktiviteter.csv", mimeType: "text/csv;charset=utf-8" });
}

export async function downloadMyHealthCsv() {
  const content = await exportMyHealthCsv();
  downloadTextFile({ content, fileName: "pulsly-halsa.csv", mimeType: "text/csv;charset=utf-8" });
}
