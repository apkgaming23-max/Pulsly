import { supabase } from "./supabase";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days) {
  return new Date(Date.now() - Math.max(0, days - 1) * 86400000)
    .toISOString()
    .slice(0, 10);
}

async function getCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  if (!user) throw new Error("Du måste vara inloggad i Pulsly.");

  return user;
}

export async function getHealthOverview({ historyDays = 30 } = {}) {
  const user = await getCurrentUser();
  const today = todayIso();
  const fromDate = daysAgoIso(historyDays);

  const [
    todayResult,
    historyResult,
    metricsResult,
    providerResult,
    passiveResult,
    workoutResult,
    vo2Result,
    syncResult,
  ] = await Promise.all([
    supabase
      .from("my_health_dashboard")
      .select("*")
      .eq("user_id", user.id)
      .eq("health_date", today)
      .maybeSingle(),

    supabase
      .from("my_health_dashboard")
      .select("*")
      .eq("user_id", user.id)
      .gte("health_date", fromDate)
      .order("health_date", { ascending: true }),

    supabase
      .from("my_latest_health_metrics")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle(),

    supabase
      .from("my_health_provider_status")
      .select("*")
      .eq("user_id", user.id)
      .order("last_sync_at", { ascending: false }),

    supabase
      .from("passive_activity_points")
      .select("*")
      .eq("user_id", user.id)
      .eq("activity_date", today)
      .maybeSingle(),

    supabase
      .from("my_unique_imported_workouts")
      .select("*")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(30),

    supabase
      .from("vo2max_samples")
      .select("*")
      .eq("user_id", user.id)
      .order("recorded_at", { ascending: false })
      .limit(30),

    supabase
      .from("health_sync_log")
      .select("*")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(20),
  ]);

  const allResults = [
    todayResult,
    historyResult,
    metricsResult,
    providerResult,
    passiveResult,
    workoutResult,
    vo2Result,
    syncResult,
  ];

  const failure = allResults.find((result) => result.error);
  if (failure?.error) throw failure.error;

  return {
    today: todayResult.data || null,
    history: historyResult.data || [],
    latestMetrics: metricsResult.data || null,
    providers: providerResult.data || [],
    passivePoints: passiveResult.data || null,
    workouts: workoutResult.data || [],
    vo2History: vo2Result.data || [],
    syncHistory: syncResult.data || [],
  };
}

export async function getWorkoutDetails(workoutId) {
  const user = await getCurrentUser();

  const [workoutResult, heartResult, routeResult] = await Promise.all([
    supabase
      .from("my_unique_imported_workouts")
      .select("*")
      .eq("user_id", user.id)
      .eq("id", workoutId)
      .maybeSingle(),

    supabase
      .from("heart_rate_samples")
      .select("id,bpm,recorded_at,source,provider")
      .eq("user_id", user.id)
      .eq("workout_id", workoutId)
      .order("recorded_at", { ascending: true }),

    supabase
      .from("imported_workout_routes")
      .select(
        "id,route_order,latitude,longitude,altitude_meters,accuracy_meters,recorded_at"
      )
      .eq("user_id", user.id)
      .eq("workout_id", workoutId)
      .order("route_order", { ascending: true }),
  ]);

  if (workoutResult.error) throw workoutResult.error;
  if (heartResult.error) throw heartResult.error;
  if (routeResult.error) throw routeResult.error;

  const heart = heartResult.data || [];
  const bpmValues = heart
    .map((sample) => Number(sample.bpm))
    .filter((value) => Number.isFinite(value) && value > 0);

  const calculatedAverageHeartRate = bpmValues.length
    ? Math.round(
        bpmValues.reduce((sum, value) => sum + value, 0) / bpmValues.length
      )
    : null;

  const calculatedMaxHeartRate = bpmValues.length
    ? Math.max(...bpmValues)
    : null;

  return {
    workout: workoutResult.data || null,
    heartRateSamples: heart,
    route: routeResult.data || [],
    calculatedAverageHeartRate,
    calculatedMaxHeartRate,
  };
}

export async function recalculatePassivePoints(date = todayIso()) {
  const user = await getCurrentUser();

  const { error: duplicateError } = await supabase.rpc(
    "find_my_health_workout_duplicates"
  );
  if (duplicateError) throw duplicateError;

  const { data, error } = await supabase.rpc(
    "calculate_passive_activity_points",
    {
      p_user_id: user.id,
      p_date: date,
    }
  );

  if (error) throw error;
  return Number(data || 0);
}

export async function getProviderStatus() {
  const user = await getCurrentUser();

  const { data, error } = await supabase
    .from("my_health_provider_status")
    .select("*")
    .eq("user_id", user.id)
    .order("last_sync_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getHealthSyncHistory(limit = 20) {
  const user = await getCurrentUser();

  const { data, error } = await supabase
    .from("health_sync_log")
    .select("*")
    .eq("user_id", user.id)
    .order("started_at", { ascending: false })
    .limit(Math.max(1, Math.min(100, Number(limit) || 20)));

  if (error) throw error;
  return data || [];
}
