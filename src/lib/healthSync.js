import { Capacitor } from "@capacitor/core";
import { Health } from "@capgo/capacitor-health";
import { supabase } from "./supabase";

const ANDROID_READ_TYPES = ["steps", "distance", "calories", "heartRate"];
const IOS_BASE_READ_TYPES = [
  "steps",
  "distance",
  "calories",
  "heartRate",
  "restingHeartRate",
  "exerciseTime",
];
const IOS_OPTIONAL_READ_TYPES = ["vo2Max"];

const platform = () => Capacitor.getPlatform();
const providerForPlatform = () =>
  platform() === "ios" ? "apple_health" : "health_connect";
const readTypesForPlatform = () =>
  platform() === "android" ? ANDROID_READ_TYPES : IOS_BASE_READ_TYPES;

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

const numeric = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const sampleId = (sample, dataType, provider) => {
  const nativeId = sample?.id || sample?.uuid || sample?.externalId || sample?.recordId;
  if (nativeId) return String(nativeId);
  const when = sample?.startDate || sample?.recordedAt || sample?.endDate || "";
  const value = sample?.value ?? "";
  return `${provider}:${dataType}:${when}:${value}`;
};

const sumSamples = (samples = []) =>
  samples.reduce((total, sample) => total + numeric(sample?.value), 0);

const latestValue = (samples = []) => {
  if (!samples.length) return null;
  const sorted = [...samples].sort(
    (a, b) =>
      new Date(b.startDate || b.recordedAt || 0) -
      new Date(a.startDate || a.recordedAt || 0)
  );
  const value = numeric(sorted[0]?.value);
  return value || null;
};

function friendlyHealthError(error) {
  const raw = String(error?.message || error || "Okänt fel");
  if (/unsupported data type/i.test(raw)) {
    return "Den installerade Health Connect-versionen stöder inte en av de begärda datatyperna.";
  }
  if (/not implemented/i.test(raw)) {
    return "Den här Health Connect-funktionen stöds inte av den installerade Android-versionen.";
  }
  return raw;
}

async function safeRead(dataType, startDate, endDate, limit = 10000) {
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
}

async function authorizationState() {
  if (!Capacitor.isNativePlatform()) {
    return { available: false, authorized: false, status: "web" };
  }

  let availability;
  try {
    availability = await Health.isAvailable();
  } catch (error) {
    return {
      available: false,
      authorized: false,
      status: "unavailable",
      reason: friendlyHealthError(error),
    };
  }

  if (!availability?.available) {
    return {
      available: false,
      authorized: false,
      status: "unavailable",
      reason: availability?.reason || "Health Connect eller HealthKit är inte tillgängligt.",
    };
  }

  try {
    const result = await Health.checkAuthorization({ read: readTypesForPlatform(), write: [] });
    const raw = result?.granted ?? result?.authorized ?? result?.hasAccess;
    const authorized = raw === true;
    return {
      available: true,
      authorized,
      status: authorized ? "connected" : "permission_required",
      authorization: result,
    };
  } catch (error) {
    // En saknad/annorlunda checkAuthorization-implementation får aldrig märkas som ansluten.
    return {
      available: true,
      authorized: false,
      status: "permission_required",
      reason: friendlyHealthError(error),
    };
  }
}

function normaliseWorkout(workout, userId, provider) {
  const start = workout.startDate || workout.startTime || workout.startedAt;
  const end = workout.endDate || workout.endTime || workout.endedAt;
  const durationSeconds =
    numeric(workout.durationSeconds) ||
    (start && end ? Math.max(0, Math.round((new Date(end) - new Date(start)) / 1000)) : 0);
  const externalId = String(
    workout.id ||
      workout.uuid ||
      workout.externalId ||
      `${provider}:${start || Date.now()}:${workout.workoutType || workout.activityType || "workout"}`
  );

  return {
    user_id: userId,
    provider,
    external_id: externalId,
    activity_type: workout.workoutType || workout.activityType || workout.type || "Träningspass",
    started_at: start || new Date().toISOString(),
    ended_at: end || null,
    duration_seconds: durationSeconds,
    distance_meters: numeric(workout.distanceMeters ?? workout.distance ?? workout.totalDistance),
    steps: Math.round(numeric(workout.steps)),
    active_calories: numeric(workout.activeCalories ?? workout.calories ?? workout.energyBurned),
    average_heart_rate: Math.round(numeric(workout.averageHeartRate ?? workout.avgHeartRate)) || null,
    max_heart_rate: Math.round(numeric(workout.maxHeartRate)) || null,
    average_speed_kmh: numeric(workout.averageSpeedKmh ?? workout.averageSpeed) || null,
    average_pace_seconds_per_km: Math.round(numeric(workout.averagePaceSecondsPerKm)) || null,
    elevation_gain_meters: numeric(workout.elevationGainMeters ?? workout.elevationGain) || null,
    has_route: Boolean(workout.hasRoute || workout.route?.length || workout.routePoints?.length),
  };
}

async function startSyncLog(userId, provider) {
  const { data, error } = await supabase
    .from("health_sync_log")
    .insert({ user_id: userId, provider, status: "running" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function finishSyncLog(id, values) {
  if (!id) return;
  await supabase
    .from("health_sync_log")
    .update({ finished_at: new Date().toISOString(), ...values })
    .eq("id", id);
}

export async function getNativeHealthStatus() {
  return authorizationState();
}

export async function isNativeHealthAvailable() {
  const state = await authorizationState();
  return {
    available: state.available,
    authorized: state.authorized,
    connected: state.authorized,
    status: state.status,
    reason: state.reason,
  };
}

export async function requestHealthAccess() {
  if (!Capacitor.isNativePlatform()) {
    throw new Error("Health Connect och HealthKit kräver Pulsly-appen på en telefon.");
  }

  const availability = await Health.isAvailable();
  if (!availability?.available) {
    throw new Error(availability?.reason || "Health Connect eller HealthKit är inte tillgängligt.");
  }

  const read = readTypesForPlatform();

  if (platform() === "ios") {
    try {
      await Health.requestAuthorization({
        read: [...read, ...IOS_OPTIONAL_READ_TYPES],
        write: [],
      });
      return { read: [...read, ...IOS_OPTIONAL_READ_TYPES] };
    } catch (error) {
      console.warn("VO2 max kunde inte begäras. Pulsly fortsätter med basdata.", error);
    }
  }

  try {
    await Health.requestAuthorization({ read, write: [] });
    return { read };
  } catch (error) {
    throw new Error(friendlyHealthError(error));
  }
}

export async function openNativeHealthSettings() {
  if (!Capacitor.isNativePlatform()) {
    return {
      opened: false,
      message: "Health-behörigheter hanteras i mobilappen.",
    };
  }

  if (platform() === "android") {
    try {
      if (typeof Health.openHealthConnectSettings === "function") {
        await Health.openHealthConnectSettings();
        return { opened: true };
      }
    } catch (error) {
      console.warn("Direktöppning av Health Connect stöds inte i denna pluginversion.", error);
    }

    // v7.2.15 på den testade Android-enheten implementerar inte settings-anropet.
    // Begär behörighet igen i stället för att misslyckas tyst.
    try {
      await requestHealthAccess();
      const status = await authorizationState();
      return {
        opened: false,
        requested: true,
        status,
        message: status.authorized
          ? "Pulsly har hälsobehörighet. Ändra detaljer i Health Connect under Appbehörigheter → Pulsly."
          : "Öppna Health Connect → Appbehörigheter → Pulsly för att ge eller ändra behörigheter.",
      };
    } catch (error) {
      return {
        opened: false,
        requested: false,
        message: "Öppna Health Connect → Appbehörigheter → Pulsly för att ge eller ändra behörigheter.",
        error: friendlyHealthError(error),
      };
    }
  }

  return {
    opened: false,
    message: "Hantera Apple Health-behörigheter i Inställningar → Hälsa → Dataåtkomst och enheter → Pulsly.",
  };
}

export async function syncNativeHealth({ days = 7 } = {}) {
  if (!Capacitor.isNativePlatform()) {
    throw new Error("Automatisk Health-synk fungerar endast i Pulslys iPhone- eller Android-app.");
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error("Du måste vara inloggad för att synka hälsodata.");

  const provider = providerForPlatform();
  let syncLogId = null;

  try {
    await requestHealthAccess();
    syncLogId = await startSyncLog(user.id, provider);

    const now = new Date();
    const firstDay = dayStart(new Date(now.getTime() - (days - 1) * 86400000));
    const dailyRows = [];

    for (let offset = 0; offset < days; offset += 1) {
      const target = new Date(firstDay.getTime() + offset * 86400000);
      const start = dayStart(target);
      const candidateEnd = dayEnd(target);
      const end = candidateEnd > now ? now : candidateEnd;

      const [steps, distance, calories, exerciseTime, restingHeartRate] = await Promise.all([
        safeRead("steps", start, end),
        safeRead("distance", start, end),
        safeRead("calories", start, end),
        platform() === "ios" ? safeRead("exerciseTime", start, end) : Promise.resolve([]),
        platform() === "ios" ? safeRead("restingHeartRate", start, end, 1000) : Promise.resolve([]),
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
      .upsert(dailyRows, { onConflict: "user_id,health_date,source" });
    if (dailyError) throw dailyError;

    let workouts = [];
    try {
      const workoutResult = await Health.queryWorkouts({
        startDate: firstDay.toISOString(),
        endDate: now.toISOString(),
        limit: 500,
      });
      workouts = (workoutResult?.workouts || []).map((workout) =>
        normaliseWorkout(workout, user.id, provider)
      );
      if (workouts.length) {
        const { error } = await supabase
          .from("imported_workouts")
          .upsert(workouts, { onConflict: "user_id,provider,external_id" });
        if (error) throw error;
      }
    } catch (error) {
      console.warn("Workout-import stöds inte fullt ut på denna Android/Health-version.", error);
      workouts = [];
    }

    const { error: duplicateError } = await supabase.rpc("find_my_health_workout_duplicates");
    if (duplicateError) console.warn("Dublettkontroll kunde inte köras:", duplicateError);

    const heartSamples = await safeRead("heartRate", firstDay, now, 50000);
    const heartRows = heartSamples
      .map((sample) => ({
        user_id: user.id,
        workout_id: null,
        bpm: Math.round(numeric(sample.value)),
        recorded_at: sample.startDate || sample.recordedAt || new Date().toISOString(),
        source: provider,
        provider,
        external_id: sampleId(sample, "heartRate", provider),
      }))
      .filter((row) => row.bpm > 0 && row.bpm < 300);

    let importedHeartSamples = 0;
    for (let index = 0; index < heartRows.length; index += 1000) {
      const chunk = heartRows.slice(index, index + 1000);
      const { data, error } = await supabase
        .from("heart_rate_samples")
        .upsert(chunk, { onConflict: "user_id,provider,external_id", ignoreDuplicates: true })
        .select("id");
      if (error) throw error;
      importedHeartSamples += data?.length || 0;
    }

    let importedVo2Samples = 0;
    if (platform() === "ios") {
      const vo2Samples = await safeRead("vo2Max", firstDay, now, 1000);
      const vo2Rows = vo2Samples
        .map((sample) => ({
          user_id: user.id,
          vo2max_ml_kg_min: numeric(sample.value),
          recorded_at: sample.startDate || sample.recordedAt || new Date().toISOString(),
          source: provider,
          external_id: sampleId(sample, "vo2Max", provider),
        }))
        .filter((row) => row.vo2max_ml_kg_min > 0);
      if (vo2Rows.length) {
        const { data, error } = await supabase
          .from("vo2max_samples")
          .upsert(vo2Rows, { onConflict: "user_id,source,external_id", ignoreDuplicates: true })
          .select("id");
        if (error) throw error;
        importedVo2Samples = data?.length || 0;
      }
    }

    const today = dayStart(now).toISOString().slice(0, 10);
    const { data: passivePoints, error: passiveError } = await supabase.rpc(
      "calculate_passive_activity_points",
      { p_user_id: user.id, p_date: today }
    );
    if (passiveError) throw passiveError;

    const syncedAt = new Date().toISOString();
    const { error: providerError } = await supabase
      .from("health_providers")
      .upsert(
        { user_id: user.id, provider, enabled: true, last_sync_at: syncedAt, updated_at: syncedAt },
        { onConflict: "user_id,provider" }
      );
    if (providerError) throw providerError;

    await finishSyncLog(syncLogId, {
      status: "success",
      imported_daily_records: dailyRows.length,
      imported_workouts: workouts.length,
      imported_heart_samples: importedHeartSamples,
      imported_vo2_samples: importedVo2Samples,
      imported_route_points: 0,
      message: "Health-synk slutförd",
    });

    return {
      provider,
      syncedAt,
      syncedDays: dailyRows.length,
      importedWorkouts: workouts.length,
      importedHeartSamples,
      importedVo2Samples,
      importedRoutePoints: 0,
      passivePoints: numeric(passivePoints),
    };
  } catch (error) {
    const message = friendlyHealthError(error);
    await finishSyncLog(syncLogId, { status: "failed", message });
    throw new Error(message);
  }
}
