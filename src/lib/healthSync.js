import { Capacitor } from "@capacitor/core";
import { Health } from "@capgo/capacitor-health";
import { supabase } from "./supabase";

const READ_TYPES = [
  "steps",
  "distance",
  "calories",
  "heartRate",
  "restingHeartRate",
  "exerciseTime",
  "workouts",
];

const dayStart = (date = new Date()) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

const dayEnd = (date = new Date()) => {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
};

const numberValue = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const sumSamples = (samples = []) =>
  samples.reduce((total, sample) => total + numberValue(sample.value), 0);

const latestValue = (samples = []) => {
  if (!samples.length) return null;

  const sorted = [...samples].sort(
    (first, second) =>
      new Date(second.startDate || second.recordedAt || 0) -
      new Date(first.startDate || first.recordedAt || 0)
  );

  return numberValue(sorted[0]?.value) || null;
};

const safeRead = async (dataType, startDate, endDate, limit = 10000) => {
  try {
    const result = await Health.readSamples({
      dataType,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      limit,
    });

    return result?.samples || [];
  } catch (error) {
    console.warn(`Pulsly kunde inte läsa ${dataType}:`, error);
    return [];
  }
};

const normaliseWorkout = (workout, userId, provider) => {
  const start = workout.startDate || workout.startTime || workout.startedAt;
  const end = workout.endDate || workout.endTime || workout.endedAt;
  const durationSeconds =
    numberValue(workout.durationSeconds) ||
    (start && end
      ? Math.max(0, Math.round((new Date(end) - new Date(start)) / 1000))
      : 0);

  const externalId = String(
    workout.id ||
      workout.uuid ||
      workout.externalId ||
      `${provider}-${start || Date.now()}-${workout.workoutType || workout.activityType || "workout"}`
  );

  return {
    user_id: userId,
    provider,
    external_id: externalId,
    activity_type:
      workout.workoutType ||
      workout.activityType ||
      workout.type ||
      "Träningspass",
    started_at: start || new Date().toISOString(),
    ended_at: end || null,
    duration_seconds: durationSeconds,
    distance_meters: numberValue(
      workout.distanceMeters ?? workout.distance ?? workout.totalDistance
    ),
    steps: Math.round(numberValue(workout.steps)),
    active_calories: numberValue(
      workout.activeCalories ?? workout.calories ?? workout.energyBurned
    ),
    average_heart_rate:
      Math.round(
        numberValue(workout.averageHeartRate ?? workout.avgHeartRate)
      ) || null,
    max_heart_rate:
      Math.round(numberValue(workout.maxHeartRate)) || null,
    average_speed_kmh:
      numberValue(workout.averageSpeedKmh ?? workout.averageSpeed) || null,
    average_pace_seconds_per_km:
      Math.round(numberValue(workout.averagePaceSecondsPerKm)) || null,
    elevation_gain_meters:
      numberValue(workout.elevationGainMeters ?? workout.elevationGain) || null,
    has_route: Boolean(
      workout.hasRoute || workout.route?.length || workout.routePoints?.length
    ),
  };
};

const providerForPlatform = () =>
  Capacitor.getPlatform() === "ios" ? "apple_health" : "health_connect";

export const isNativeHealthAvailable = async () => {
  if (!Capacitor.isNativePlatform()) {
    return {
      available: false,
      reason: "Pulsly körs i webbläsaren. Hälsodata kräver mobilappen.",
    };
  }

  try {
    return await Health.isAvailable();
  } catch (error) {
    return {
      available: false,
      reason: error?.message || "Hälsotjänsten kunde inte kontrolleras.",
    };
  }
};

export const requestHealthAccess = async () => {
  const availability = await isNativeHealthAvailable();

  if (!availability.available) {
    throw new Error(
      availability.reason || "HealthKit eller Health Connect är inte tillgängligt."
    );
  }

  return Health.requestAuthorization({
    read: READ_TYPES,
    write: [],
  });
};

export const openNativeHealthSettings = async () => {
  if (Capacitor.getPlatform() === "android") {
    await Health.openHealthConnectSettings();
  }
};

export const syncNativeHealth = async ({ days = 7 } = {}) => {
  if (!Capacitor.isNativePlatform()) {
    throw new Error(
      "Automatisk Health-synk fungerar endast i Pulslys iPhone- eller Android-app."
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Du måste vara inloggad för att synka hälsodata.");
  }

  const availability = await isNativeHealthAvailable();
  if (!availability.available) {
    throw new Error(
      availability.reason || "HealthKit eller Health Connect är inte tillgängligt."
    );
  }

  await requestHealthAccess();

  const provider = providerForPlatform();
  const now = new Date();
  const firstDay = dayStart(new Date(now.getTime() - (days - 1) * 86400000));

  const dailyRows = [];

  for (let dayOffset = 0; dayOffset < days; dayOffset += 1) {
    const target = new Date(firstDay.getTime() + dayOffset * 86400000);
    const start = dayStart(target);
    const end = dayEnd(target) > now ? now : dayEnd(target);

    const [steps, distance, calories, exerciseTime, restingHeartRate] =
      await Promise.all([
        safeRead("steps", start, end),
        safeRead("distance", start, end),
        safeRead("calories", start, end),
        safeRead("exerciseTime", start, end),
        safeRead("restingHeartRate", start, end, 1000),
      ]);

    dailyRows.push({
      user_id: user.id,
      health_date: start.toISOString().slice(0, 10),
      steps: Math.round(sumSamples(steps)),
      active_minutes: Math.round(sumSamples(exerciseTime)),
      distance_meters: Math.round(sumSamples(distance)),
      active_calories: Number(sumSamples(calories).toFixed(2)),
      resting_heart_rate: latestValue(restingHeartRate),
      source: provider,
      synced_at: new Date().toISOString(),
    });
  }

  const { error: dailyError } = await supabase
    .from("health_daily_summary")
    .upsert(dailyRows, {
      onConflict: "user_id,health_date,source",
    });

  if (dailyError) throw dailyError;

  const workoutResult = await Health.queryWorkouts({
    startDate: firstDay.toISOString(),
    endDate: now.toISOString(),
    limit: 500,
  });

  const normalisedWorkouts = (workoutResult?.workouts || []).map((workout) =>
    normaliseWorkout(workout, user.id, provider)
  );

  if (normalisedWorkouts.length) {
    const { error: workoutError } = await supabase
      .from("imported_workouts")
      .upsert(normalisedWorkouts, {
        onConflict: "user_id,provider,external_id",
      });

    if (workoutError) throw workoutError;
  }

  const heartSamples = await safeRead("heartRate", firstDay, now, 50000);
  const heartRows = heartSamples
    .map((sample) => ({
      user_id: user.id,
      workout_id: null,
      bpm: Math.round(numberValue(sample.value)),
      recorded_at:
        sample.startDate || sample.recordedAt || new Date().toISOString(),
      source: provider,
    }))
    .filter((row) => row.bpm > 0 && row.bpm < 300);

  if (heartRows.length) {
    const chunkSize = 1000;
    for (let index = 0; index < heartRows.length; index += chunkSize) {
      const { error: heartError } = await supabase
        .from("heart_rate_samples")
        .insert(heartRows.slice(index, index + chunkSize));

      if (heartError) throw heartError;
    }
  }

  const today = dayStart(now).toISOString().slice(0, 10);
  const { data: passivePoints, error: passiveError } = await supabase.rpc(
    "calculate_passive_activity_points",
    {
      p_user_id: user.id,
      p_date: today,
    }
  );

  if (passiveError) throw passiveError;

  const { error: providerError } = await supabase
    .from("health_providers")
    .upsert(
      {
        user_id: user.id,
        provider,
        enabled: true,
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id,provider",
      }
    );

  if (providerError) throw providerError;

  return {
    provider,
    syncedDays: dailyRows.length,
    importedWorkouts: normalisedWorkouts.length,
    importedHeartSamples: heartRows.length,
    passivePoints: numberValue(passivePoints),
  };
};
