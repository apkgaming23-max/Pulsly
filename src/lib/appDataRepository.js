import { getMyProfile, getTeams } from "./profileRepository";
import { getMyNotifications, getUnreadNotificationCount } from "./notificationRepository";
import { getChallenges } from "./challengeRepository";
import { getMyPointsSummary, getLeaderboard } from "./pointsRepository";
import { getPrivacySettings } from "./privacyRepository";
import { getMyAdminRole } from "./adminRepository";
import { supabase } from "./supabase";

async function requiredUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("Du måste vara inloggad i Pulsly.");
  return user;
}

async function safe(label, callback, fallback) {
  try {
    return await callback();
  } catch (error) {
    console.error(`Pulsly bootstrap: ${label}`, error);
    return fallback;
  }
}

export async function getCoreAppData() {
  const user = await requiredUser();

  const [profile, privacy, unreadNotifications, points, adminRole] = await Promise.all([
    safe("profil", () => getMyProfile(), null),
    safe("integritet", () => getPrivacySettings(), null),
    safe("olästa notiser", () => getUnreadNotificationCount(), 0),
    safe("poäng", () => getMyPointsSummary(), null),
    safe("adminroll", () => getMyAdminRole(), "user"),
  ]);

  return {
    user,
    profile,
    privacy,
    unreadNotifications: Number(unreadNotifications || 0),
    points,
    adminRole,
    isAdmin: ["admin", "superuser"].includes(adminRole),
    isSuperuser: adminRole === "superuser",
  };
}

export async function getHomeData() {
  const user = await requiredUser();
  const today = new Date().toISOString().slice(0, 10);

  const [activitiesResult, passiveResult, eventsResult, notifications] = await Promise.all([
    supabase
      .from("activities")
      .select("id,activity_type,started_at,duration_seconds,distance_meters,steps,points,verified,is_group_activity,multiplier")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(20),
    supabase
      .from("passive_activity_points")
      .select("*")
      .eq("user_id", user.id)
      .eq("activity_date", today)
      .maybeSingle(),
    supabase
      .from("group_events")
      .select("id,title,activity_type,starts_at,location_name,status")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(5),
    safe("notiser", () => getMyNotifications({ limit: 5 }), []),
  ]);

  if (activitiesResult.error) throw activitiesResult.error;
  if (passiveResult.error) throw passiveResult.error;
  if (eventsResult.error) throw eventsResult.error;

  const activities = activitiesResult.data || [];
  const totals = activities.reduce(
    (acc, item) => {
      acc.points += Number(item.points || 0);
      acc.steps += Number(item.steps || 0);
      acc.minutes += Math.round(Number(item.duration_seconds || 0) / 60);
      acc.distanceKm += Number(item.distance_meters || 0) / 1000;
      return acc;
    },
    { points: 0, steps: 0, minutes: 0, distanceKm: 0 }
  );

  totals.passivePoints = Number(passiveResult.data?.passive_points || 0);
  totals.pointsWithPassive = totals.points + totals.passivePoints;

  return {
    activities,
    recentActivity: activities[0] || null,
    totals,
    passive: passiveResult.data || null,
    upcomingEvents: eventsResult.data || [],
    notifications,
  };
}

export async function getCommunityData() {
  const [challenges, teams, leaderboard] = await Promise.all([
    safe("utmaningar", () => getChallenges(), []),
    safe("lag", () => getTeams(), []),
    safe("topplista", () => getLeaderboard(), []),
  ]);

  return { challenges, teams, leaderboard };
}

export async function getNotificationCenterData({ limit = 50 } = {}) {
  const [items, unreadCount] = await Promise.all([
    safe("notiscenter", () => getMyNotifications({ limit }), []),
    safe("olästa notiser", () => getUnreadNotificationCount(), 0),
  ]);

  return {
    items,
    unreadCount: Number(unreadCount || 0),
  };
}

export async function refreshAllAppData() {
  const [core, home, community] = await Promise.all([
    getCoreAppData(),
    getHomeData(),
    getCommunityData(),
  ]);

  return {
    loadedAt: new Date().toISOString(),
    core,
    home,
    community,
  };
}
