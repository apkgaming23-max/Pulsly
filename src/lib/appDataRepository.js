import { supabase } from "./supabase";
import { getAppBootstrap } from "./settingsRepository";
import { getHealthOverview } from "./healthRepository";
import { getMyActivities, getMyEvents, getWallPosts } from "./activityRepository";
import { getLeaderboard, getMyPointsSummary } from "./pointsRepository";
import { getChallenges } from "./challengeRepository";
import { getTeams } from "./profileRepository";
import { getMyNotifications } from "./notificationRepository";

/**
 * Central laddare för Pulsly.
 * Nästa samlade App.jsx kan använda denna istället för att själv
 * anropa många repositories vid start och sidbyte.
 */
export async function loadPulslyBootstrap() {
  const bootstrap = await getAppBootstrap();

  const [activities, events, wall, points] = await Promise.all([
    getMyActivities(100),
    getMyEvents(),
    getWallPosts(50),
    getMyPointsSummary({ days: 30 }),
  ]);

  return {
    ...bootstrap,
    activities,
    events,
    wall,
    points,
  };
}

export async function loadPulslyHome() {
  const [activities, wall, events, points] = await Promise.all([
    getMyActivities(20),
    getWallPosts(5),
    getMyEvents(),
    getMyPointsSummary({ days: 30 }),
  ]);

  return {
    activities,
    wall,
    events,
    points,
  };
}

export async function loadPulslyHealth() {
  return getHealthOverview({ historyDays: 30 });
}

export async function loadPulslyChallenges() {
  return getChallenges();
}

export async function loadPulslyLeaderboard() {
  const [leaderboard, points] = await Promise.all([
    getLeaderboard({ days: 30, limit: 100 }),
    getMyPointsSummary({ days: 30 }),
  ]);

  return { leaderboard, points };
}

export async function loadPulslyTeams() {
  return getTeams();
}

export async function loadPulslyNotifications() {
  return getMyNotifications({ limit: 100 });
}

/**
 * Enkel health check som nästa release kan använda efter login.
 * Den ändrar ingen data.
 */
export async function checkPulslyConnection() {
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) {
    return {
      authenticated: false,
      database: false,
      userId: null,
    };
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  return {
    authenticated: true,
    database: !profileError,
    userId: user.id,
    error: profileError?.message || null,
  };
}
