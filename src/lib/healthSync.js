import { Capacitor } from "@capacitor/core";
import { Health } from "@capgo/capacitor-health";
import { supabase } from "./supabase";

// Android v7.2.15: keep authorization/readSamples to the data types
// verified to work in Pulsly. Workouts are queried separately.
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

const providerForPlatform = () =>
  Capacitor.getPlatform() === "ios" ? "apple_health" : "health_connect";

const readTypesForPlatform = () =>
  Capacitor.getPlatform() === "android"
    ? ANDROID_READ_TYPES
    : IOS_BASE_READ_TYPES;

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

const authResultIsGranted = (result) => {
  if (!result || typeof result !== "object") return false;
  if (typeof result.authorized === "boolean") return result.authorized;
  if (typeof result.granted === "boolean") return result.granted;
  if (typeof result.isAuthorized === "boolean") return result.isAuthorized;

  const statuses = result.statuses || result.permissions || result.read;
  if (statuses && typeof statuses === "object" && !Array.isArray(statuses)) {
    const values = Object.values(statuses);
    if (!values.length) return false;
    return values.every((value) => {
      if (typeof value === "boolean") return value;
      const text = String(value).toLowerCase();
      return ["granted", "authorized", "allowed", "true"].includes(text);
    });
  }
  return false;
};

async function getNativeAvailability() {
  if (!Capacitor.isNativePlatform()) {
    return {
      available: false,
      reason: "Pulsly körs i webbläsaren. HealthKit och Health Connect kräver mobilappen.",
    };
  }
  try {
    const result = await Health.isAvailable();
    return {
      available: Boolean(result?.available ?? result?.isAvailable ?? result),
      reason: result?.reason,
    };
  } catch (error) {
    return {
      available: false,
      reason: error?.message || "Hälsotjänsten kunde inte kontrolleras.",
    };
  }
}

export async function getNativeHealthAuthorizationStatus() {
  const availability = await getNativeAvailability();
  if (!availability.available) return { ...availability, authorized: false };

  try {
    if (typeof Health.checkAuthorization !== "function") {
      return { available: true, authorized: false, canCheckAuthorization: false };
    }
    const result = await Health.checkAuthorization({
      read: readTypesForPlatform(),
      write: [],
    });
    return {
      available: true,
      authorized: authResultIsGranted(result),
      canCheckAuthorization: true,
      details: result,
    };
  } catch (error) {
    console.warn("Pulsly kunde inte kontrollera Health-behörigheter:", error);
    return {
      available: true,
      authorized: false,
      canCheckAuthorization: false,
      reason: error?.message || "Behörighetsstatus kunde inte kontrolleras.",
    };
  }
}

// Backward-compatible export used by the current App.jsx.
// "available" now means actually authorized, not merely that Health Connect exists.
export async function isNativeHealthAvailable() {
  const status = await getNativeHealthAuthorizationStatus();
  return {
    ...status,
    nativeAvailable: status.available,
    available: Boolean(status.available && status.authorized),
  };
}

export async function requestHealthAccess() {
  const availability = await getNativeAvailability();
  if (!availability.available) {
    throw new Error(
      availability.reason || "HealthKit eller Health Connect är inte tillgängligt."
    );
  }

  const platform = Capacitor.getPlatform();
  if (platform === "android") {
    await Health.requestAuthorization({ read: ANDROID_READ_TYPES, write: [] });
    return { read: ANDROID_READ_TYPES };
  }

  let optional = [];
  try {
    await Health.requestAuthorization({
      read: [...IOS_BASE_READ_TYPES, ...IOS_OPTIONAL_READ_TYPES],
      write: [],
    });
    optional = IOS_OPTIONAL_READ_TYPES;
  } catch (error) {
    console.warn("VO2 max kunde inte begäras. Pulsly fortsätter med basdata.", error);
    await Health.requestAuthorization({ read: IOS_BASE_READ_TYPES, write: [] });
  }
  return { read: [...IOS_BASE_READ_TYPES, ...optional] };
}

export async function openNativeHealthSettings() {
  if (!Capacitor.isNativePlatform()) {
    return {
      opened: false,
      message: "Health-inställningar finns bara i Pulslys mobilapp.",
    };
  }

  if (Capacitor.getPlatform() === "android") {
    try {
      if (typeof Health.openHealthConnectSettings === "function") {
        await Health.openHealthConnectSettings();
        return { opened: true };
      }
    } catch (error) {
      console.warn("Direktöppning av Health Connect stöds inte av pluginversionen:", error);
    }

    // v7.2.15 on the tested Android device does not implement the settings helper.
    // Re-requesting the supported permissions gives the user a native permission
    // prompt when Android allows it. If Android has nothing to show, return a
    // clear UI message instead of failing silently.
    try {
      await Health.requestAuthorization({ read: ANDROID_READ_TYPES, write: [] });
      const status = await getNativeHealthAuthorizationStatus();
      return {
        opened: false,
        permissionRequested: true,
        authorized: status.authorized,
        message: status.authorized
          ? "Behörighet är redan beviljad. Ändra den i Health Connect > Appbehörigheter > Pulsly."
          : "Öppna Health Connect > Appbehörigheter > Pulsly för att välja vilka hälsodata Pulsly får läsa.",
      };
    } catch (error) {
      return {
        opened: false,
        permissionRequested: false,
        authorized: false,
        message:
          "Öppna Health Connect > Appbehörigheter > Pulsly för att ändra behörigheterna.",
      };
    }
  }

  return {
    opened: false,
    message: "Hantera HealthKit-behörigheter i iPhone-inställningarna eller appen Hälsa.",
  };
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

function normaliseWorkout(workout, userId, provider) {
  const start = workout.startDate || workout.startTime || workout.startedAt;
  const end = workout.endDate || workout.endTime || workout.endedAt;
  const durationSeconds =
    numeric(workout.durationSeconds) ||
    (start && end
      ? Math.max(0, Math.round((new Date(end) - new Date(start)) / 1000))
      : 0);
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
    activity_type:
      workout.workoutType || workout.activityType || workout.type || "Träningspass",
    started_at: start || new Date().toISOString(),
    ended_at: end || null,
    duration_seconds: durationSeconds,
    distance_meters: numeric(workout.distanceMeters ?? workout.distance ?? workout.totalDistance),
    steps: Math.round(numeric(workout.steps)),
    active_calories: numeric(workout.activeCalories ?? workout.calories ?? workout.energyBurned),
    average_heart_rate:
      Math.round(numeric(workout.averageHeartRate ?? workout.avgHeartRate)) || null,
    max_heart_rate: Math.round(numeric(workout.maxHeartRate)) || null,
    average_speed_kmh: numeric(workout.averageSpeedKmh ?? workout.averageSpeed) || null,
    average_pace_seconds_per_km:
      Math.round(numeric(workout.averagePaceSecondsPerKm)) || null,
    elevation_gain_meters:
      numeric(workout.elevationGainMeters ?? workout.elevationGain) || null,
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

export async function syncNativeHealth({ days = 7 } = {}) {
  if (!Capacitor.isNativePlatform()) {
    throw new Error("Automatisk Health-synk fungerar endast i Pulslys iPhone- eller Android-app.");
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error("Du måste vara inloggad för att synka hälsodata.");

  const provider = providerForPlatform();
  const platform = Capacitor.getPlatform();
  let syncLogId = null;

  try {
    const availability = await getNativeAvailability();
    if (!availability.available) {
      throw new Error(availability.reason || "HealthKit eller Health Connect är inte tillgängligt.");
    }

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
        platform === "ios" ? safeRead("exerciseTime", start, end) : Promise.resolve([]),
        platform === "ios" ? safeRead("restingHeartRate", start, end, 1000) : Promise.resolve([]),
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
      console.warn("Workout-import stöds inte fullt ut i denna pluginversion:", error);
      workouts = [];
    }

    const { error: duplicateError } = await supabase.rpc("find_my_health_workout_duplicates");
    if (duplicateError) throw duplicateError;

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
        .upsert(chunk, {
          onConflict: "user_id,provider,external_id",
          ignoreDuplicates: true,
        })
        .select("id");
      if (error) throw error;
      importedHeartSamples += data?.length || 0;
    }

    let importedVo2Samples = 0;
    if (platform === "ios") {
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
          .upsert(vo2Rows, {
            onConflict: "user_id,source,external_id",
            ignoreDuplicates: true,
          })
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
      syncedDays: dailyRows.length,
      importedWorkouts: workouts.length,
      importedHeartSamples,
      importedVo2Samples,
      importedRoutePoints: 0,
      passivePoints: numeric(passivePoints),
    };
  } catch (error) {
    await finishSyncLog(syncLogId, {
      status: "failed",
      message: error?.message || "Okänt synkfel",
    });
    throw error;
  }
}
