import { Capacitor } from "@capacitor/core";
import { Health } from "@capgo/capacitor-health";
import { supabase } from "./supabase";

const IOS_BASE_READ_TYPES = [
  "steps",
  "distance",
  "calories",
  "heartRate",
  "restingHeartRate",
  "exerciseTime",
];

const IOS_OPTIONAL_READ_TYPES = ["vo2Max"];

// Verifierade mot den Android/Health Connect-version som faktiskt körs i Pulsly.
// Workouts ska INTE skickas till requestAuthorization/readSamples.
const ANDROID_READ_TYPES = ["steps", "distance", "calories", "heartRate"];

const isAndroid = () => Capacitor.getPlatform() === "android";
const isIOS = () => Capacitor.getPlatform() === "ios";

const providerForPlatform = () =>
  isIOS() ? "apple_health" : "health_connect";

const authorizationTypesForPlatform = () =>
  isAndroid() ? ANDROID_READ_TYPES : IOS_BASE_READ_TYPES;

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
  const nativeId =
    sample?.id || sample?.uuid || sample?.externalId || sample?.recordId;

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

const isUnsupportedDataTypeError = (error) =>
  /unsupported\s+data\s+type/i.test(String(error?.message || error || ""));

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

async function safeQueryWorkouts(startDate, endDate) {
  try {
    const result = await Health.queryWorkouts({
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      limit: 500,
    });
    return { supported: true, workouts: result?.workouts || [] };
  } catch (error) {
    // Workout-query får aldrig stoppa steg/puls-synken.
    console.warn("Pulsly kunde inte läsa träningspass från Health:", error);
    return {
      supported: false,
      workouts: [],
      reason: error?.message || "Träningspass stöds inte av denna Health-version.",
    };
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
      `${provider}:${start || Date.now()}:${
        workout.workoutType || workout.activityType || "workout"
      }`
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
    distance_meters: numeric(
      workout.distanceMeters ?? workout.distance ?? workout.totalDistance
    ),
    steps: Math.round(numeric(workout.steps)),
    active_calories: numeric(
      workout.activeCalories ?? workout.calories ?? workout.energyBurned
    ),
    average_heart_rate:
      Math.round(numeric(workout.averageHeartRate ?? workout.avgHeartRate)) || null,
    max_heart_rate: Math.round(numeric(workout.maxHeartRate)) || null,
    average_speed_kmh:
      numeric(workout.averageSpeedKmh ?? workout.averageSpeed) || null,
    average_pace_seconds_per_km:
      Math.round(numeric(workout.averagePaceSecondsPerKm)) || null,
    elevation_gain_meters:
      numeric(workout.elevationGainMeters ?? workout.elevationGain) || null,
    has_route: Boolean(
      workout.hasRoute || workout.route?.length || workout.routePoints?.length
    ),
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

export async function isNativeHealthAvailable() {
  if (!Capacitor.isNativePlatform()) {
    return {
      available: false,
      reason:
        "Pulsly körs i webbläsaren. HealthKit och Health Connect kräver mobilappen.",
    };
  }

  try {
    const result = await Health.isAvailable();
    if (typeof result === "boolean") return { available: result };
    return result;
  } catch (error) {
    return {
      available: false,
      reason: error?.message || "Hälsotjänsten kunde inte kontrolleras.",
    };
  }
}

export async function requestHealthAccess() {
  const availability = await isNativeHealthAvailable();
  if (!availability?.available) {
    throw new Error(
      availability?.reason ||
        "HealthKit eller Health Connect är inte tillgängligt."
    );
  }

  if (isAndroid()) {
    // Viktigt: workouts, restingHeartRate, exerciseTime och vo2Max skickas
    // inte till v7.2.15 på Android eftersom de har gett unsupported-data-type.
    await Health.requestAuthorization({
      read: ANDROID_READ_TYPES,
      write: [],
    });
    return { read: [...ANDROID_READ_TYPES] };
  }

  let read = [...IOS_BASE_READ_TYPES];
  try {
    await Health.requestAuthorization({
      read: [...IOS_BASE_READ_TYPES, ...IOS_OPTIONAL_READ_TYPES],
      write: [],
    });
    read = [...IOS_BASE_READ_TYPES, ...IOS_OPTIONAL_READ_TYPES];
  } catch (error) {
    console.warn("VO2 max kunde inte begäras. Pulsly fortsätter med basdata.", error);
    await Health.requestAuthorization({ read: IOS_BASE_READ_TYPES, write: [] });
  }

  return { read };
}

export async function openNativeHealthSettings() {
  if (!Capacitor.isNativePlatform()) {
    return {
      success: false,
      message: "Hälsobehörigheter kan bara hanteras i Pulsly-appen.",
    };
  }

  if (isAndroid()) {
    // @capgo/capacitor-health 7.2.15 i den installerade APK:n har visat att
    // openHealthConnectSettings inte är implementerad. Försök bara om den
    // fungerar, annars öppna behörighetsdialogen på nytt med verifierade typer.
    try {
      if (typeof Health.openHealthConnectSettings === "function") {
        await Health.openHealthConnectSettings();
        return { success: true, openedSettings: true };
      }
    } catch (error) {
      console.warn("Direktöppning av Health Connect stöds inte i denna version:", error);
    }

    try {
      await Health.requestAuthorization({
        read: ANDROID_READ_TYPES,
        write: [],
      });
      return {
        success: true,
        openedSettings: false,
        message:
          "Health Connect-behörigheterna har kontrollerats. Ändra enskilda behörigheter i Androids Health Connect-inställningar vid behov.",
      };
    } catch (error) {
      if (isUnsupportedDataTypeError(error)) {
        throw new Error(
          "Health Connect-versionen på telefonen stöder inte någon av Pulslys begärda hälsotyper."
        );
      }
      throw error;
    }
  }

  // iOS hanterar HealthKit-behörigheter via authorization-dialogen.
  await requestHealthAccess();
  return { success: true, openedSettings: false };
}

export async function syncNativeHealth({ days = 7 } = {}) {
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

  const provider = providerForPlatform();
  let syncLogId = null;

  try {
    const availability = await isNativeHealthAvailable();
    if (!availability?.available) {
      throw new Error(
        availability?.reason ||
          "HealthKit eller Health Connect är inte tillgängligt."
      );
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

      const baseReads = [
        safeRead("steps", start, end),
        safeRead("distance", start, end),
        safeRead("calories", start, end),
      ];

      if (isIOS()) {
        baseReads.push(
          safeRead("exerciseTime", start, end),
          safeRead("restingHeartRate", start, end, 1000)
        );
      }

      const results = await Promise.all(baseReads);
      const steps = results[0] || [];
      const distance = results[1] || [];
      const calories = results[2] || [];
      const exerciseTime = isIOS() ? results[3] || [] : [];
      const restingHeartRate = isIOS() ? results[4] || [] : [];

      dailyRows.push({
        user_id: user.id,
        health_date: start.toISOString().slice(0, 10),
        steps: Math.round(sumSamples(steps)),
        active_minutes: isIOS() ? Math.round(sumSamples(exerciseTime)) : 0,
        distance_meters: Math.round(sumSamples(distance)),
        active_calories: Number(sumSamples(calories).toFixed(2)),
        resting_heart_rate: isIOS() ? latestValue(restingHeartRate) : null,
        source: provider,
        synced_at: new Date().toISOString(),
      });
    }

    const { error: dailyError } = await supabase
      .from("health_daily_summary")
      .upsert(dailyRows, { onConflict: "user_id,health_date,source" });
    if (dailyError) throw dailyError;

    // Workouts är ett separat API. Det ligger aldrig i requestAuthorization.
    const workoutQuery = await safeQueryWorkouts(firstDay, now);
    const workouts = workoutQuery.workouts.map((workout) =>
      normaliseWorkout(workout, user.id, provider)
    );

    if (workouts.length) {
      const { error } = await supabase
        .from("imported_workouts")
        .upsert(workouts, { onConflict: "user_id,provider,external_id" });
      if (error) throw error;
    }

    // Workout-deduplicering ska inte blockera vanlig Health Connect-synk om
    // workout-API:t inte stöds i pluginversionen.
    if (workoutQuery.supported) {
      const { error: duplicateError } = await supabase.rpc(
        "find_my_health_workout_duplicates"
      );
      if (duplicateError) {
        console.warn("Workout-deduplicering kunde inte köras:", duplicateError);
      }
    }

    const heartSamples = await safeRead("heartRate", firstDay, now, 50000);
    const heartRows = heartSamples
      .map((sample) => ({
        user_id: user.id,
        workout_id: null,
        bpm: Math.round(numeric(sample.value)),
        recorded_at:
          sample.startDate || sample.recordedAt || new Date().toISOString(),
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
    if (isIOS()) {
      const vo2Samples = await safeRead("vo2Max", firstDay, now, 1000);
      const vo2Rows = vo2Samples
        .map((sample) => ({
          user_id: user.id,
          vo2max_ml_kg_min: numeric(sample.value),
          recorded_at:
            sample.startDate || sample.recordedAt || new Date().toISOString(),
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

    const warnings = [];
    if (!workoutQuery.supported && workoutQuery.reason) {
      warnings.push(workoutQuery.reason);
    }

    await finishSyncLog(syncLogId, {
      status: warnings.length ? "partial" : "success",
      imported_daily_records: dailyRows.length,
      imported_workouts: workouts.length,
      imported_heart_samples: importedHeartSamples,
      imported_vo2_samples: importedVo2Samples,
      imported_route_points: 0,
      message: warnings.length
        ? `Health-synk slutförd med begränsningar: ${warnings.join("; ")}`
        : "Health-synk slutförd",
    });

    return {
      provider,
      syncedDays: dailyRows.length,
      importedWorkouts: workouts.length,
      importedHeartSamples,
      importedVo2Samples,
      importedRoutePoints: 0,
      passivePoints: numeric(passivePoints),
      warnings,
    };
  } catch (error) {
    await finishSyncLog(syncLogId, {
      status: "failed",
      message: error?.message || "Okänt synkfel",
    });
    throw error;
  }
}
