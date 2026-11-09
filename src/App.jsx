import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, BarChart3, Bell, Bike, CalendarDays, Check, CheckCircle2, Clock, Footprints, Search,
  Heart, Home, LogOut, MapPin, MessageCircle, Mic, MicOff, Pause, Play,
  Plus, RefreshCw, Route, Send, Share2, ShieldCheck, Smartphone, Square,
  Settings, Timer, Trophy, User, Users, Watch, X, Zap,
} from "lucide-react";
import Auth from "./Auth";
import { supabase } from "./lib/supabase";
import { isNativeHealthAvailable, requestHealthAccess, syncNativeHealth } from "./lib/healthSync";
import { getChallenges, joinChallenge, leaveChallenge, getChallengeProgress } from "./lib/challengeRepository";
import { getLeaderboard, getMyPointsSummary, recalculateTodayPoints } from "./lib/pointsRepository";
import { getMyNotifications, getUnreadNotificationCount, markNotificationRead, markAllNotificationsRead, subscribeToMyNotifications } from "./lib/notificationRepository";
import { getTeams, joinTeam, leaveTeam, getTeamMembers } from "./lib/profileRepository";
import { getPrivacySettings, savePrivacySettings, deleteMyHealthData } from "./lib/privacyRepository";
import { globalSearch } from "./lib/searchRepository";
import { downloadMyActivitiesCsv, downloadMyHealthCsv, exportMyVo2Csv, downloadTextFile } from "./lib/exportRepository";
import { getMyAdminRole, getAdminOverview, getAdminUsers, getHealthSyncFailures } from "./lib/adminRepository";

const TYPES = [
  { id: "walk", name: "Promenad", icon: Footprints, ppm: 10, pace: true },
  { id: "powerwalk", name: "Powerwalk", icon: Footprints, ppm: 12, pace: true },
  { id: "jogging", name: "Jogging", icon: Activity, ppm: 14, pace: true },
  { id: "running", name: "Löpning", icon: Activity, ppm: 15, pace: true },
  { id: "cycling", name: "Cykling", icon: Bike, ppm: 12, pace: false },
];
const EMPTY_EVENT = { title: "", description: "", activityType: "Jogging", startsAt: "", locationName: "" };

const fmtTime = (s = 0) => {
  const v = Math.max(0, Math.round(Number(s) || 0));
  return [Math.floor(v / 3600), Math.floor((v % 3600) / 60), v % 60]
    .map((n) => String(n).padStart(2, "0")).join(":");
};
const fmtPace = (s) => !s || !Number.isFinite(Number(s)) ? "--:--" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const fmtDate = (v) => v ? new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(v)) : "";
const initials = (v = "PU") => v.split(" ").filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase();
const haversine = (a, b) => {
  const R = 6371, dLat = (b.latitude - a.latitude) * Math.PI / 180, dLon = (b.longitude - a.longitude) * Math.PI / 180;
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * Math.PI / 180) * Math.cos(b.latitude * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
};

function Card({ children, className = "" }) { return <div className={`card ${className}`}>{children}</div>; }
function Metric({ icon: Icon, label, value }) { return <div className="metric"><Icon size={19}/><strong>{value}</strong><span>{label}</span></div>; }
function MapBox({ points = [], active = false }) {
  return <div className="mapbox"><div className="mapgrid"/><svg viewBox="0 0 600 300" preserveAspectRatio="none"><path d="M60 245 C130 200 150 230 220 175 S330 160 380 115 S465 105 535 58" fill="none" stroke="#10b981" strokeWidth="9" strokeLinecap="round"/><circle cx="60" cy="245" r="10" fill="white" stroke="#10b981" strokeWidth="6"/><circle cx="535" cy="58" r="12" fill={active ? "#10b981" : "#0f172a"} stroke="white" strokeWidth="5"/></svg><span className="maptag"><MapPin size={15}/>{active ? "GPS aktiv" : "Aktivitetsrutt"}</span><span className="mapcount">{points.length} punkter</span></div>;
}
function Verification({ summary, mine, loading, onRecheck }) {
  if (!summary) return null;
  const done = summary.status === "completed" || Number(summary.verified_participants || 0) >= Number(summary.minimum_participants || 2);
  return <div className={`verify ${done ? "done" : ""}`}>
    <div className="verifyTitle">{done ? <CheckCircle2 size={19}/> : <RefreshCw size={19}/>}<strong>{done ? "Gemensam aktivitet verifierad" : "Verifiering pågår"}</strong></div>
    <div className="verifyGrid">
      <div><b>{summary.accepted_participants || 0}</b><span>Anmälda</span></div>
      <div><b>{summary.submitted_activities || 0}</b><span>Aktiviteter</span></div>
      <div><b>{summary.verified_participants || 0}</b><span>Verifierade</span></div>
      <div><b>{summary.pending_verification || 0}</b><span>Väntar</span></div>
    </div>
    {mine && <div className="mine"><strong>Din aktivitet</strong>{mine.verification_status === "verified" ? <><span className="bonus"><CheckCircle2 size={15}/> Gruppbonus 1,5×</span><small>Grundpoäng {Number(mine.base_points || 0).toLocaleString("sv-SE")} · Totalt {Number(mine.final_points || 0).toLocaleString("sv-SE")} p</small></> : <span>{mine.verification_status === "not_verified" ? "Inte verifierad som gemensam" : mine.verification_status === "waiting_for_activity" ? "Väntar på din aktivitet" : "Väntar på andra deltagare"}</span>}</div>}
    {!done && <button className="dark full" disabled={loading} onClick={onRecheck}><RefreshCw size={17} className={loading ? "spin" : ""}/>{loading ? "Kontrollerar..." : "Kontrollera igen"}</button>}
  </div>;
}

export default function App() {
  const [session, setSession] = useState(null), [profile, setProfile] = useState(null), [loading, setLoading] = useState(true);
  const [page, setPage] = useState("home"), [toast, setToast] = useState(""), [error, setError] = useState("");
  const [activities, setActivities] = useState([]), [posts, setPosts] = useState([]), [events, setEvents] = useState([]), [invites, setInvites] = useState([]);
  const [healthToday, setHealthToday] = useState(null), [healthHistory, setHealthHistory] = useState([]), [workouts, setWorkouts] = useState([]), [vo2Samples, setVo2Samples] = useState([]), [heartSamples, setHeartSamples] = useState([]), [passivePoints, setPassivePoints] = useState(null), [selectedWorkout, setSelectedWorkout] = useState(null), [workoutHeart, setWorkoutHeart] = useState([]), [workoutRoute, setWorkoutRoute] = useState([]), [healthSyncing, setHealthSyncing] = useState(false), [nativeHealth, setNativeHealth] = useState({ available: false, connected: false, checked: false, reason: "" });
  const [summaries, setSummaries] = useState({}), [mine, setMine] = useState({}), [checking, setChecking] = useState(null), [settings, setSettings] = useState(null);
  const [challenges, setChallenges] = useState([]), [challengeMemberships, setChallengeMemberships] = useState([]), [challengeProgress, setChallengeProgress] = useState({});
  const [leaderboard, setLeaderboard] = useState([]), [myPoints, setMyPoints] = useState(null);
  const [notifications, setNotifications] = useState([]), [unreadCount, setUnreadCount] = useState(0);
  const [teams, setTeams] = useState([]), [teamMemberships, setTeamMemberships] = useState([]), [teamMembers, setTeamMembers] = useState({});
  const [privacy, setPrivacy] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState({ people: [], events: [], challenges: [], teams: [] });
  const [searching, setSearching] = useState(false);
  const [adminAccess, setAdminAccess] = useState({ role: "user", isAdmin: false, isSuperuser: false });
  const [adminOverview, setAdminOverview] = useState(null);
  const [adminUsers, setAdminUsers] = useState([]);
  const [healthSyncFailures, setHealthSyncFailures] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [tracking, setTracking] = useState(false), [paused, setPaused] = useState(false), [type, setType] = useState(TYPES[0]);
  const [seconds, setSeconds] = useState(0), [distance, setDistance] = useState(0), [positions, setPositions] = useState([]), [splits, setSplits] = useState([]), [eventId, setEventId] = useState("");
  const [eventModal, setEventModal] = useState(false), [eventForm, setEventForm] = useState(EMPTY_EVENT);
  const [shareModal, setShareModal] = useState(false), [completed, setCompleted] = useState(null), [shareText, setShareText] = useState(""), [shareVisibility, setShareVisibility] = useState("members"), [shareRoute, setShareRoute] = useState(false);
  const [importShareWorkout, setImportShareWorkout] = useState(null), [importShareText, setImportShareText] = useState(""), [importShareVisibility, setImportShareVisibility] = useState("members"), [importShareRoute, setImportShareRoute] = useState(false);
  const watch = useRef(null), lastPos = useRef(null), lastAnnounced = useRef(0), lastSplit = useRef(0);

  const fullName = profile?.full_name || session?.user?.user_metadata?.full_name || session?.user?.email || "Pulsly-användare";
  const pace = distance > 0 ? seconds / distance : 0;
  const speed = seconds > 0 ? distance / (seconds / 3600) : 0;
  const livePoints = Math.floor(seconds / 60 * type.ppm);
  const totals = useMemo(() => activities.reduce((r, a) => ({ points: r.points + Number(a.points || 0), steps: r.steps + Number(a.steps || 0), minutes: r.minutes + Math.round(Number(a.duration_seconds || 0) / 60), distance: r.distance + Number(a.distance_meters || 0) / 1000 }), { points: 0, steps: 0, minutes: 0, distance: 0 }), [activities]);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => { if (!mounted) return; setSession(data.session); if (data.session?.user) await loadAll(data.session.user.id); setLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (evt, next) => { if (evt === "PASSWORD_RECOVERY") return; setSession(next); if (next?.user) await loadAll(next.user.id); else { setProfile(null); setActivities([]); setEvents([]); setPosts([]); } setLoading(false); });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!session?.user?.id) return undefined;
    return subscribeToMyNotifications(session.user.id, async () => {
      await loadNotifications();
    });
  }, [session?.user?.id]);
  useEffect(() => {
    if (page === "challenges") loadChallengesPage();
    if (page === "leaderboard") loadLeaderboardPage();
    if (page === "notifications") loadNotifications();
    if (page === "teams") loadTeamsPage();
    if (page === "privacy") loadPrivacyPage();
    if (page === "admin") loadAdminPage();
  }, [page]);
  useEffect(() => { if (!tracking || paused) return; const id = setInterval(() => setSeconds((v) => v + 1), 1000); return () => clearInterval(id); }, [tracking, paused]);
  useEffect(() => { if (page === "events" && session?.user) loadEvents(session.user.id); if (page === "health" && session?.user) { loadHealth(session.user.id); checkNativeHealth(); } }, [page]);
  useEffect(() => {
    if (!tracking || paused) return;
    const interval = Number(settings?.voice_interval_meters || 1000), meters = distance * 1000;
    if (Math.floor(meters / interval) <= Math.floor(lastAnnounced.current / interval)) return;
    const splitSeconds = seconds - lastSplit.current, number = Math.floor(meters / interval);
    const split = { split_number: number, distance_meters: interval, elapsed_seconds: seconds, split_seconds: splitSeconds, pace_seconds_per_km: splitSeconds / (interval / 1000), average_speed_kmh: speed };
    setSplits((v) => [...v, split]); lastSplit.current = seconds; lastAnnounced.current = meters; speakSplit(number, splitSeconds);
  }, [distance, seconds, tracking, paused, settings]);
  useEffect(() => () => stopGps(), []);

  const ok = (m) => { setToast(m); setTimeout(() => setToast(""), 3500); };
  const fail = (m) => { setError(m); setTimeout(() => setError(""), 5500); };
  async function loadAll(uid) { await Promise.all([loadProfile(uid), loadActivities(uid), loadSettings(uid), loadEvents(uid), loadPosts(), loadHealth(uid)]); }
  async function loadProfile(uid) {
    const { data } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
    if (data) setProfile(data);
    try { setAdminAccess(await getMyAdminRole()); } catch { setAdminAccess({ role: "user", isAdmin: false, isSuperuser: false }); }
  }
  async function loadActivities(uid) { const { data, error } = await supabase.from("activities").select("*").eq("user_id", uid).order("started_at", { ascending: false }).limit(100); if (error) console.error(error); else setActivities(data || []); }
  async function loadSettings(uid) { const { data } = await supabase.from("user_settings").select("*").eq("user_id", uid).maybeSingle(); setSettings(data || { user_id: uid, voice_coach_enabled: true, voice_interval_meters: 1000, voice_total_time: true, voice_split_time: true, voice_average_pace: true, voice_speed: true, voice_language: "sv-SE" }); }
  async function loadEvents(uid) {
    const [er, ir] = await Promise.all([supabase.from("group_events").select("*").order("starts_at"), supabase.from("group_event_invites").select("*, group_events(*)").eq("invited_user_id", uid).order("invited_at", { ascending: false })]);
    if (er.error) return fail(er.error.message); const next = er.data || []; setEvents(next); setInvites(ir.data || []);
    if (!next.length) { setSummaries({}); setMine({}); return; }
    const ids = next.map((e) => e.id), { data: sums } = await supabase.from("group_event_live_summary").select("*").in("event_id", ids);
    setSummaries(Object.fromEntries((sums || []).map((s) => [s.event_id, s])));
    const personal = {};
    for (const e of next) { const { data } = await supabase.rpc("get_my_group_event_status", { p_event_id: e.id }); if (data) personal[e.id] = data; }
    setMine(personal);
  }

  async function loadHealth(uid) {
    const today = new Date().toISOString().slice(0, 10);
    const fromDate = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
    const [dashboard, historyResult, workoutResult, vo2Result, heartResult, passiveResult] = await Promise.all([
      supabase.from("my_health_dashboard").select("*").eq("user_id", uid).eq("health_date", today).maybeSingle(),
      supabase.from("my_health_dashboard").select("*").eq("user_id", uid).gte("health_date", fromDate).order("health_date", { ascending: true }),
      supabase.from("imported_workouts").select("*").eq("user_id", uid).order("started_at", { ascending: false }).limit(20),
      supabase.from("vo2max_samples").select("*").eq("user_id", uid).order("recorded_at", { ascending: false }).limit(20),
      supabase.from("heart_rate_samples").select("*").eq("user_id", uid).order("recorded_at", { ascending: false }).limit(240),
      supabase.from("passive_activity_points").select("*").eq("user_id", uid).eq("activity_date", today).maybeSingle(),
    ]);
    if (dashboard.error) console.error(dashboard.error);
    if (historyResult.error) console.error(historyResult.error);
    setHealthToday(dashboard.data || null);
    setHealthHistory(historyResult.data || []);
    setWorkouts(workoutResult.data || []);
    setVo2Samples(vo2Result.data || []);
    setHeartSamples(heartResult.data || []);
    setPassivePoints(passiveResult.data || null);
  }
  async function checkNativeHealth() {
    const result = await isNativeHealthAvailable();
    setNativeHealth((current) => ({
      ...current,
      available: Boolean(result?.available),
      connected: false,
      checked: true,
      reason: result?.reason || "",
    }));
    return result;
  }
  async function connectHealth() {
    setHealthSyncing(true);
    try {
      await requestHealthAccess();
      const availability = await checkNativeHealth();
      if (!availability?.available) throw new Error(availability?.reason || "Health Connect är inte tillgängligt.");
      ok("Behörighetsförfrågan är klar. Tryck Synka nu för att verifiera åtkomsten.");
    } catch (e) { fail(e.message || "Hälsobehörighet kunde inte aktiveras."); }
    finally { setHealthSyncing(false); }
  }
  async function openWorkoutDetails(workout) {
    setSelectedWorkout(workout);
    const [heartResult, routeResult] = await Promise.all([
      supabase.from("heart_rate_samples").select("*").eq("user_id", session.user.id).eq("workout_id", workout.id).order("recorded_at", { ascending: true }),
      supabase.from("imported_workout_routes").select("*").eq("user_id", session.user.id).eq("workout_id", workout.id).order("route_order", { ascending: true }),
    ]);
    setWorkoutHeart(heartResult.data || []);
    setWorkoutRoute(routeResult.data || []);
  }
  function closeWorkoutDetails() { setSelectedWorkout(null); setWorkoutHeart([]); setWorkoutRoute([]); }
  async function syncHealthData() {
    setHealthSyncing(true);
    try {
      const result = await syncNativeHealth({ days: 7 });
      await loadHealth(session.user.id);
      setNativeHealth((current) => ({ ...current, available: true, connected: true, checked: true, reason: "" }));
      ok(`Synk klar: ${result.importedWorkouts} pass, ${result.importedHeartSamples} pulsmätningar, ${result.passivePoints} passiva poäng.`);
    } catch (e) { fail(e.message || "Hälsosynk misslyckades."); }
    finally { setHealthSyncing(false); }
  }

  async function loadChallengesPage() {
    try {
      const data = await getChallenges();
      setChallenges(data.challenges); setChallengeMemberships(data.myMemberships);
      const progress = {};
      for (const item of data.challenges) { try { progress[item.id] = await getChallengeProgress(item.id); } catch {} }
      setChallengeProgress(progress);
    } catch (e) { fail(e.message); }
  }
  async function toggleChallenge(id, joined) { try { if (joined) await leaveChallenge(id); else await joinChallenge(id); await loadChallengesPage(); ok(joined ? "Du lämnade utmaningen." : "Du gick med i utmaningen."); } catch (e) { fail(e.message); } }
  async function loadLeaderboardPage() { try { const [board, summary] = await Promise.all([getLeaderboard({ days: 30 }), getMyPointsSummary({ days: 30 })]); setLeaderboard(board); setMyPoints(summary); } catch (e) { fail(e.message); } }
  async function refreshPoints() { try { await recalculateTodayPoints(); await loadLeaderboardPage(); ok("Poängen har räknats om."); } catch (e) { fail(e.message); } }
  async function loadNotifications() { try { const [items, count] = await Promise.all([getMyNotifications(), getUnreadNotificationCount()]); setNotifications(items); setUnreadCount(count); } catch (e) { console.error(e); } }
  async function openNotification(item) { try { if (!item.read) await markNotificationRead(item.id); await loadNotifications(); if (item.entity_type === "group_event") setPage("events"); else if (item.type === "health_sync") setPage("health"); } catch (e) { fail(e.message); } }
  async function readAllNotifications() { try { await markAllNotificationsRead(); await loadNotifications(); } catch (e) { fail(e.message); } }
  async function loadTeamsPage() { try { const data = await getTeams(); setTeams(data.teams); setTeamMemberships(data.myMemberships); const members = {}; for (const team of data.teams) { try { members[team.id] = await getTeamMembers(team.id); } catch {} } setTeamMembers(members); } catch (e) { fail(e.message); } }
  async function toggleTeam(id, joined) { try { if (joined) await leaveTeam(id); else await joinTeam(id); await loadTeamsPage(); ok(joined ? "Du lämnade laget." : "Du gick med i laget."); } catch (e) { fail(e.message); } }
  async function loadPrivacyPage() { try { setPrivacy(await getPrivacySettings()); } catch (e) { fail(e.message); } }
  async function persistPrivacy(change) { try { const next = { ...(privacy || {}), ...change }; setPrivacy(await savePrivacySettings(next)); ok("Integritetsinställningen sparades."); } catch (e) { fail(e.message); } }
  async function removeHealthData() { if (!window.confirm("Radera all importerad health- och smartwatch-data?")) return; try { await deleteMyHealthData(); await loadHealth(session.user.id); ok("Importerad hälsodata raderades."); } catch (e) { fail(e.message); } }

  async function loadPosts() {
    const { data, error } = await supabase.from("activity_posts").select("*, profiles(full_name,avatar_url), activities(activity_type,duration_seconds,distance_meters,steps,points,verified,average_pace_seconds_per_km,average_speed_kmh,started_at,event_id), activity_post_likes(user_id), activity_post_comments(id,comment,created_at,user_id)").in("visibility", ["members", "public"]).order("created_at", { ascending: false }).limit(50);
    if (error) console.error(error); else setPosts(data || []);
  }

  function stopGps() { if (watch.current !== null && navigator.geolocation) { navigator.geolocation.clearWatch(watch.current); watch.current = null; } }
  function speak(text) { if (!settings?.voice_coach_enabled || !("speechSynthesis" in window)) return; speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = settings.voice_language || "sv-SE"; u.rate = .95; speechSynthesis.speak(u); }
  function speakSplit(n, splitSeconds) { let t = `${n} kilometer.`; if (settings?.voice_total_time) t += ` Total tid ${Math.floor(seconds / 60)} minuter och ${seconds % 60} sekunder.`; if (settings?.voice_split_time) t += ` Senaste kilometer ${Math.floor(splitSeconds / 60)} minuter och ${Math.round(splitSeconds % 60)} sekunder.`; if (settings?.voice_average_pace && type.pace) t += ` Genomsnittstempo ${fmtPace(pace).replace(":", " minuter och ")} sekunder per kilometer.`; speak(t); }
  function startTracking() {
    if (!navigator.geolocation) return fail("GPS stöds inte på denna enhet.");
    setTracking(true); setPaused(false); setSeconds(0); setDistance(0); setPositions([]); setSplits([]); lastPos.current = null; lastAnnounced.current = 0; lastSplit.current = 0; speak(`${type.name} startad.`);
    watch.current = navigator.geolocation.watchPosition(({ coords }) => { const p = { latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy, recordedAt: new Date().toISOString() }; if (lastPos.current && coords.accuracy <= 80) { const d = haversine(lastPos.current, p); if (d > 0 && d < .5) setDistance((v) => v + d); } lastPos.current = p; setPositions((v) => [...v, p]); }, () => fail("Tillåt exakt plats för Pulsly."), { enableHighAccuracy: true, maximumAge: 2000, timeout: 12000 });
  }
  async function finishActivity() {
    stopGps(); const ended = new Date(), started = new Date(ended.getTime() - seconds * 1000), duration = Math.max(seconds, 60), base = Math.max(1, Math.round(duration / 60)) * type.ppm;
    try {
      const { data: activity, error } = await supabase.from("activities").insert({ user_id: session.user.id, activity_type: type.name, source: "gps", started_at: started.toISOString(), ended_at: ended.toISOString(), duration_seconds: duration, distance_meters: Math.round(distance * 1000), steps: 0, base_points: base, multiplier: 1, is_group_activity: false, verified: positions.length >= 2, verification_source: "GPS", event_id: eventId || null, average_pace_seconds_per_km: type.pace && distance > 0 ? Math.round(pace) : null, average_speed_kmh: seconds > 0 ? Number(speed.toFixed(2)) : null }).select().single();
      if (error) throw error;
      if (positions.length) await supabase.from("activity_routes").insert(positions.map((p) => ({ activity_id: activity.id, user_id: session.user.id, latitude: p.latitude, longitude: p.longitude, accuracy_meters: p.accuracy, recorded_at: p.recordedAt })));
      if (splits.length) await supabase.from("activity_splits").insert(splits.map((s) => ({ ...s, activity_id: activity.id, user_id: session.user.id })));
      if (eventId) { await supabase.from("event_activity_matches").upsert({ event_id: eventId, user_id: session.user.id, activity_id: activity.id, verification_status: "pending", group_bonus_awarded: false }, { onConflict: "event_id,user_id" }); await supabase.rpc("recheck_my_group_event", { p_event_id: eventId }); }
      setCompleted({ ...activity, savedPositions: [...positions], savedSplits: [...splits] }); setShareModal(true); await loadActivities(session.user.id); if (eventId) await loadEvents(session.user.id); ok(eventId ? "Aktiviteten sparades och gruppen kontrolleras." : `Aktiviteten sparades. +${base} poäng.`);
    } catch (e) { fail(e.message || "Aktiviteten kunde inte sparas."); }
    finally { setTracking(false); setPaused(false); setSeconds(0); setDistance(0); setPositions([]); setSplits([]); setEventId(""); }
  }

  async function createEvent(e) { e.preventDefault(); try { const starts = new Date(eventForm.startsAt); if (!eventForm.title || !eventForm.startsAt || starts <= new Date()) throw new Error("Ange namn och en framtida starttid."); const { data, error } = await supabase.from("group_events").insert({ created_by: session.user.id, title: eventForm.title.trim(), description: eventForm.description.trim() || null, activity_type: eventForm.activityType, event_date: starts.toISOString().slice(0, 10), starts_at: starts.toISOString(), ends_at: null, join_deadline: null, location_name: eventForm.locationName.trim() || null, status: "open" }).select().single(); if (error) throw error; const joined = await supabase.rpc("join_group_event", { p_event_id: data.id }); if (joined.error) throw joined.error; setEventModal(false); setEventForm(EMPTY_EVENT); await loadEvents(session.user.id); ok("Eventet skapades och du är anmäld."); } catch (e2) { fail(e2.message); } }
  async function joinEvent(id) { const { error } = await supabase.rpc("join_group_event", { p_event_id: id }); if (error) return fail(error.message); await loadEvents(session.user.id); ok("Du är anmäld."); }
  async function recheck(id) { setChecking(id); const { data, error } = await supabase.rpc("recheck_my_group_event", { p_event_id: id }); if (error) fail(error.message); else { await loadEvents(session.user.id); ok(Number(data?.verified_participants || 0) >= 2 ? "Gruppbonus uppdaterad." : "Väntar på fler matchande aktiviteter."); } setChecking(null); }
  function openImportedShare(workout) {
    setImportShareWorkout(workout);
    setImportShareText("");
    setImportShareVisibility("members");
    setImportShareRoute(Boolean(workout.has_route));
    closeWorkoutDetails();
  }
  async function publishImportedWorkout() {
    if (!importShareWorkout) return;
    try {
      const started = new Date(importShareWorkout.started_at);
      const ended = importShareWorkout.ended_at ? new Date(importShareWorkout.ended_at) : new Date(started.getTime() + Number(importShareWorkout.duration_seconds || 0) * 1000);
      const minutes = Math.max(1, Math.round(Number(importShareWorkout.duration_seconds || 0) / 60));
      const typeMatch = TYPES.find((t) => t.name.toLowerCase() === String(importShareWorkout.activity_type || "").toLowerCase());
      const { data: activity, error: activityError } = await supabase.from("activities").insert({
        user_id: session.user.id, activity_type: importShareWorkout.activity_type || "Importerat träningspass", source: importShareWorkout.provider, started_at: started.toISOString(), ended_at: ended.toISOString(), duration_seconds: Number(importShareWorkout.duration_seconds || 0), distance_meters: Number(importShareWorkout.distance_meters || 0), steps: Number(importShareWorkout.steps || 0), base_points: minutes * (typeMatch?.ppm || 10), multiplier: 1, is_group_activity: false, verified: true, verification_source: importShareWorkout.provider, average_pace_seconds_per_km: importShareWorkout.average_pace_seconds_per_km || null, average_speed_kmh: importShareWorkout.average_speed_kmh || null, calories: Math.round(Number(importShareWorkout.active_calories || 0)), elevation_gain_meters: importShareWorkout.elevation_gain_meters || null, parent_health_record_id: importShareWorkout.external_id
      }).select().single();
      if (activityError) throw activityError;
      const { data: post, error: postError } = await supabase.from("activity_posts").insert({ activity_id: activity.id, user_id: session.user.id, message: importShareText.trim() || null, visibility: importShareVisibility, share_route: Boolean(importShareRoute), hide_route_start: true, hide_route_end: true, privacy_radius_meters: 200, share_splits: true, share_points: true, share_pace: true }).select().single();
      if (postError) throw postError;
      if (importShareRoute) {
        const { data: routeRows, error: routeReadError } = await supabase.from("imported_workout_routes").select("*").eq("user_id", session.user.id).eq("workout_id", importShareWorkout.id).order("route_order", { ascending: true });
        if (routeReadError) throw routeReadError;
        const safeRows = (routeRows || []).length > 10 ? routeRows.slice(2, -2) : (routeRows || []);
        if (safeRows.length) { const { error: routeWriteError } = await supabase.from("activity_post_routes").insert(safeRows.map((point, index) => ({ post_id: post.id, activity_id: activity.id, user_id: session.user.id, route_order: index, latitude: point.latitude, longitude: point.longitude }))); if (routeWriteError) throw routeWriteError; }
      }
      setImportShareWorkout(null);
      await Promise.all([loadActivities(session.user.id), loadPosts()]);
      setPage("wall");
      ok("Det importerade träningspasset publicerades på väggen.");
    } catch (e) { fail(e.message || "Det importerade passet kunde inte publiceras."); }
  }
  async function publish() { if (!completed) return; try { const { data: post, error } = await supabase.from("activity_posts").insert({ activity_id: completed.id, user_id: session.user.id, message: shareText.trim() || null, visibility: shareVisibility, share_route: shareRoute, hide_route_start: true, hide_route_end: true, privacy_radius_meters: 200, share_splits: true, share_points: true, share_pace: true }).select().single(); if (error) throw error; if (shareRoute && completed.savedPositions?.length) await supabase.from("activity_post_routes").insert(completed.savedPositions.slice(2, -2).map((p, i) => ({ post_id: post.id, activity_id: completed.id, user_id: session.user.id, route_order: i, latitude: p.latitude, longitude: p.longitude }))); setShareModal(false); setCompleted(null); setShareText(""); setShareRoute(false); await loadPosts(); setPage("wall"); ok("Aktiviteten publicerades."); } catch (e) { fail(e.message); } }
  async function saveVoice(change) { const next = { ...settings, ...change, user_id: session.user.id, updated_at: new Date().toISOString() }; setSettings(next); const { error } = await supabase.from("user_settings").upsert(next, { onConflict: "user_id" }); if (error) fail(error.message); else ok("Röstinställningen sparades."); }
  async function runGlobalSearch(event) {
    event?.preventDefault?.();
    const q = searchQuery.trim();
    if (q.length < 2) { setSearchResults({ people: [], events: [], challenges: [], teams: [] }); return; }
    setSearching(true);
    try { setSearchResults(await globalSearch(q)); } catch (e) { fail(e.message); } finally { setSearching(false); }
  }

  async function loadAdminPage() {
    if (!adminAccess?.isAdmin) return;
    setAdminLoading(true);
    try {
      const [overview, users, failures] = await Promise.all([
        getAdminOverview(),
        getAdminUsers({ limit: 100 }),
        getHealthSyncFailures({ limit: 25 }),
      ]);
      setAdminOverview(overview);
      setAdminUsers(users);
      setHealthSyncFailures(failures);
    } catch (e) { fail(e.message); } finally { setAdminLoading(false); }
  }

  async function downloadActivities() { try { await downloadMyActivitiesCsv(); ok("Aktivitetsfilen skapades."); } catch (e) { fail(e.message); } }
  async function downloadHealth() { try { await downloadMyHealthCsv(); ok("Halsofilen skapades."); } catch (e) { fail(e.message); } }
  async function downloadVo2() {
    try {
      const content = await exportMyVo2Csv();
      downloadTextFile({ content, fileName: "pulsly-vo2max.csv", mimeType: "text/csv;charset=utf-8" });
      ok("VO2 max-filen skapades.");
    } catch (e) { fail(e.message); }
  }

  async function signOut() { stopGps(); speechSynthesis?.cancel(); await supabase.auth.signOut(); setSession(null); }

  const joinedIds = new Set(invites.filter((i) => i.status === "accepted").map((i) => i.event_id));
  const selectableEvents = events.filter((e) => joinedIds.has(e.id) && new Date(e.starts_at) > new Date());
  const menuGroups = [
    {
      id: "home",
      label: "Hem",
      icon: Home,
      defaultPage: "home",
      pages: ["home", "notifications", "leaderboard"],
      items: [
        ["home", "Översikt", Home],
        ["notifications", `Notiser${unreadCount ? ` (${unreadCount})` : ""}`, Bell],
        ["leaderboard", "Topplista", BarChart3],
      ],
    },
    {
      id: "activity",
      label: "Aktivitet",
      icon: Activity,
      defaultPage: "track",
      pages: ["track", "events"],
      items: [
        ["track", "Spåra", MapPin],
        ["events", "Event", CalendarDays],
      ],
    },
    {
      id: "community",
      label: "Gemenskap",
      icon: Users,
      defaultPage: "wall",
      pages: ["wall", "challenges", "teams", "leaderboard"],
      items: [
        ["wall", "Vägg", Share2],
        ["challenges", "Utmaningar", Trophy],
        ["teams", "Lag", Users],
        ["leaderboard", "Topplista", BarChart3],
      ],
    },
    {
      id: "me",
      label: "Jag",
      icon: User,
      defaultPage: "profile",
      pages: ["profile", "health", "privacy", "search", "data", "admin"],
      items: [
        ["profile", "Profil", User],
        ["health", "Hälsa", Heart],
        ["privacy", "Integritet", Settings],
        ["search", "Sok", Search],
        ["data", "Mina data", BarChart3],
        ...(adminAccess?.isAdmin ? [["admin", "Admin", ShieldCheck]] : []),
      ],
    },
  ];

  const activeGroup =
    menuGroups.find((group) => group.pages.includes(page)) || menuGroups[0];

  if (loading) return <div className="loading"><Activity size={46}/><h2>Laddar Pulsly...</h2></div>;
  if (!session) return <Auth/>;

  return <div className="app">
    {toast && <div className="toast ok"><CheckCircle2 size={18}/>{toast}</div>}
    {error && <div className="toast bad">{error}</div>}
    <header><button className="brand" onClick={() => setPage("home")}><span><Activity size={23}/></span>Pulsly</button><nav>{menuGroups.map((group) => { const Icon = group.icon; return <button key={group.id} className={activeGroup.id === group.id ? "active" : ""} onClick={() => setPage(group.defaultPage)}><Icon size={17}/>{group.label}</button>; })}</nav><div className="headerActions"><button className="notificationBell" onClick={() => setPage("search")} aria-label="Sok"><Search size={20}/></button><button className="notificationBell" onClick={() => setPage("notifications")} aria-label="Notiser"><Bell size={20}/>{unreadCount > 0 && <span>{unreadCount > 99 ? "99+" : unreadCount}</span>}</button><button className="avatar" onClick={() => setPage("profile")}>{initials(fullName)}</button></div></header>
    <div className="subnav">{activeGroup.items.map(([id,label,Icon]) => <button key={id} className={page === id ? "active" : ""} onClick={() => setPage(id)}><Icon size={16}/>{label}</button>)}</div>
    <main>
      {page === "home" && <><Title eyebrow="PULSLY" title={`Hej ${fullName.includes("@") ? "där" : fullName.split(" ")[0]}! 👋`} text="All verifierad aktivitet räknas. Ingen daglig poänggräns." action={<button className="dark" onClick={() => setPage("track")}><Play size={18}/>Starta aktivitet</button>}/><Card><div className="verified"><ShieldCheck size={18}/>Din aktivitetsöversikt</div><div className="metrics four"><Metric icon={Footprints} label="Steg" value={totals.steps.toLocaleString("sv-SE")}/><Metric icon={Timer} label="Aktiv tid" value={`${totals.minutes} min`}/><Metric icon={Route} label="Distans" value={`${totals.distance.toFixed(1)} km`}/><Metric icon={Zap} label="Poäng" value={totals.points.toLocaleString("sv-SE")}/></div></Card><div className="grid two"><Card><h2>Aktivitetsvägg</h2>{posts.length ? posts.slice(0, 3).map((p) => <div className="row" key={p.id}><div><b>{p.profiles?.full_name || "Pulsly-medlem"}</b><span>{p.activities?.activity_type}</span></div><ChevronRight/></div>) : <Empty icon={Share2} text="Inga inlägg ännu"/>}</Card><Card><h2>Kommande event</h2>{events.filter((e) => new Date(e.starts_at) > new Date()).slice(0, 3).map((e) => <div className="row" key={e.id}><div><b>{e.title}</b><span>{fmtDate(e.starts_at)}</span></div><span className="pill">{e.activity_type}</span></div>)}</Card></div></>}

      {page === "track" && <><Title eyebrow="LIVE TRACKING" title="Spåra aktivitet" text="GPS, distans, tempo och kilometertider registreras live."/><div className="grid track"><Card><MapBox points={positions} active={tracking && !paused}/>{splits.length > 0 && <div className="splits"><h3>Kilometertider</h3>{splits.map((s) => <div key={s.split_number}><b>{s.split_number} km</b><span>{fmtPace(s.pace_seconds_per_km)}/km</span><span>{fmtTime(s.elapsed_seconds)}</span></div>)}</div>}</Card><Card><h2>Välj aktivitet</h2><div className="types">{TYPES.map((t) => { const I = t.icon; return <button key={t.id} disabled={tracking} className={type.id === t.id ? "sel" : ""} onClick={() => setType(t)}><I size={21}/>{t.name}</button>; })}</div><label>Gruppevent<select disabled={tracking} value={eventId} onChange={(e) => setEventId(e.target.value)}><option value="">Ingen gruppaktivitet</option>{selectableEvents.map((e) => <option key={e.id} value={e.id}>{e.title} · {e.activity_type}</option>)}</select></label><div className="timer">{fmtTime(seconds)}<span>Aktiv tid</span></div><div className="metrics three"><Metric icon={Route} label="Distans" value={`${distance.toFixed(2)} km`}/><Metric icon={Clock} label={type.pace ? "Tempo" : "Hastighet"} value={type.pace ? `${fmtPace(pace)}/km` : `${speed.toFixed(1)} km/h`}/><Metric icon={Zap} label="Grundpoäng" value={livePoints}/></div>{eventId && <div className="notice"><Users size={18}/>1,5× tilldelas efter verifierad gruppaktivitet.</div>}{!tracking ? <button className="dark full" onClick={startTracking}><Play size={19}/>Starta GPS</button> : <div className="actions"><button className="light" onClick={() => setPaused((v) => !v)}>{paused ? <Play/> : <Pause/>}{paused ? "Fortsätt" : "Pausa"}</button><button className="danger" onClick={finishActivity}><Square/>Avsluta</button></div>}</Card></div></>}

      {page === "events" && <><Title eyebrow="GEMENSAM AKTIVITET" title="Event" text="Anmäl före start. Pulsly verifierar aktiviteterna automatiskt." action={<button className="dark" onClick={() => setEventModal(true)}><Plus size={18}/>Skapa event</button>}/><div className="grid events">{events.map((e) => { const invite = invites.find((i) => i.event_id === e.id), joined = invite?.status === "accepted", started = new Date(e.starts_at) <= new Date(), sum = summaries[e.id]; return <Card key={e.id}><div className="eventTop"><span className="eventIcon"><CalendarDays/></span><span className="pill">{sum?.status === "completed" ? "Verifierat" : started ? "Startat" : "Öppet"}</span></div><h2>{e.title}</h2><p>{e.description || e.activity_type}</p><div className="details"><span><Clock size={16}/>{fmtDate(e.starts_at)}</span><span><Activity size={16}/>{e.activity_type}</span><span><MapPin size={16}/>{e.location_name || "Plats ej angiven"}</span></div>{joined ? <div className="joined"><CheckCircle2 size={17}/>Du är anmäld</div> : !started ? <button className="dark full" onClick={() => joinEvent(e.id)}>Gå med</button> : <div className="closed">Anmälan stängd</div>}{started && joined && <Verification summary={sum} mine={mine[e.id]} loading={checking === e.id} onRecheck={() => recheck(e.id)}/>}</Card>; })}</div></>}

      {page === "wall" && <><Title eyebrow="AKTIVITETSVÄGG" title="Pulsly-väggen" text="Dela aktivitet, resultat och valfri GPS-rutt." action={<button className="light" onClick={loadPosts}><RefreshCw size={18}/>Uppdatera</button>}/><div className="wall">{posts.length ? posts.map((p) => { const a = p.activities || {}; return <Card key={p.id}><div className="posthead"><div className="postavatar">{initials(p.profiles?.full_name)}</div><div><b>{p.profiles?.full_name || "Pulsly-medlem"}</b><span>{fmtDate(p.created_at)}</span></div>{a.verified && <ShieldCheck className="green"/>}</div>{p.message && <p>{p.message}</p>}<h2>{a.activity_type}</h2><div className="metrics three"><Metric icon={Route} label="Distans" value={`${(Number(a.distance_meters || 0) / 1000).toFixed(2)} km`}/><Metric icon={Timer} label="Tid" value={fmtTime(a.duration_seconds)}/><Metric icon={Zap} label="Poäng" value={Number(a.points || 0).toLocaleString("sv-SE")}/></div>{p.share_route && <MapBox/>}<div className="postactions"><button><Heart size={20}/>{p.activity_post_likes?.length || 0}</button><button><MessageCircle size={20}/>{p.activity_post_comments?.length || 0}</button></div></Card>; }) : <Card><Empty icon={Share2} text="Väggen är tom"/></Card>}</div></>}


      {page === "health" && <><Title eyebrow="HÄLSA OCH SMARTWATCH" title="Din hälsa" text="Steg, aktiv tid, puls, VO₂ max, importerade pass och passiv rörelsebonus." action={<div className="healthActions">{!nativeHealth.connected && <button className="light" disabled={healthSyncing || !nativeHealth.available} onClick={connectHealth}><Heart size={18}/>Anslut hälsodata</button>}<button className="light" disabled={healthSyncing || !nativeHealth.available} onClick={syncHealthData}><RefreshCw size={18} className={healthSyncing ? "spin" : ""}/>{healthSyncing ? "Synkar..." : "Synka nu"}</button></div>}/><Card className="healthStatus"><div className="healthStatusRow"><div><b>{nativeHealth.connected ? "Hälsodata verifierad" : nativeHealth.available ? "Health Connect tillgängligt" : "Hälsodata behöver mobilappen"}</b><span>{nativeHealth.connected ? "Pulsly har verifierat åtkomsten genom en lyckad synkning." : nativeHealth.available ? "Tryck Anslut hälsodata och därefter Synka nu. Pulsly visar inte ansluten förrän en synkning lyckats." : (nativeHealth.reason || "Öppna Pulsly som iPhone- eller Android-app för automatisk synk.")}</span></div><span className={`connectionDot ${nativeHealth.connected ? "connected" : ""}`}/></div>{nativeHealth.available && !nativeHealth.connected && <div className="notice"><Heart size={18}/>Ändra behörigheter i Android via Health Connect → Appbehörigheter → Pulsly.</div>}</Card><div className="metrics four"><Metric icon={Footprints} label="Steg idag" value={Number(healthToday?.steps || 0).toLocaleString("sv-SE")}/><Metric icon={Timer} label="Aktiv tid" value={`${Number(healthToday?.active_minutes || 0)} min`}/><Metric icon={Route} label="Distans" value={`${(Number(healthToday?.distance_meters || 0) / 1000).toFixed(1)} km`}/><Metric icon={Zap} label="Passiv bonus" value={`${Number(passivePoints?.passive_points || healthToday?.passive_points || 0).toLocaleString("sv-SE")} p`}/></div><div className="grid healthgrid"><Card><h2>Hjärta och kondition</h2><div className="metrics three"><Metric icon={Heart} label="Vilopuls" value={healthToday?.resting_heart_rate ? `${healthToday.resting_heart_rate} bpm` : "Saknas"}/><Metric icon={Activity} label="Senaste VO₂ max" value={vo2Samples[0]?.vo2max_ml_kg_min ? `${Number(vo2Samples[0].vo2max_ml_kg_min).toFixed(1)} ml/kg/min` : "Saknas"}/><Metric icon={Zap} label="Aktiva kalorier" value={`${Math.round(Number(healthToday?.active_calories || 0))} kcal`}/></div><HeartChart samples={heartSamples}/></Card><Card><h2>Passiv rörelse</h2><p>Pulsly räknar bort steg och minuter som redan hör till belönade träningspass.</p><div className="passive"><span><b>{Number(passivePoints?.total_steps || 0).toLocaleString("sv-SE")}</b> totalsteg</span><span><b>{Number(passivePoints?.workout_steps_removed || 0).toLocaleString("sv-SE")}</b> steg i träningspass borttagna</span><span><b>{Number(passivePoints?.rewarded_steps || 0).toLocaleString("sv-SE")}</b> bonusgrundande steg</span><span><b>{Number(passivePoints?.passive_points || 0).toLocaleString("sv-SE")} p</b> passiv bonus</span></div></Card></div><Card className="healthWorkouts"><h2>Importerade träningspass</h2>{workouts.length ? workouts.map((w) => <button type="button" className="workout" key={w.id} onClick={() => openWorkoutDetails(w)}><div className="workoutIcon"><Watch/></div><div><b>{w.activity_type}</b><span>{fmtDate(w.started_at)} · {fmtTime(w.duration_seconds)}</span><span>{(Number(w.distance_meters || 0) / 1000).toFixed(2)} km · {w.average_heart_rate ? `${w.average_heart_rate} bpm` : "Ingen puls"}</span></div><div className="workoutRight"><b>{w.provider}</b>{w.has_route && <span><MapPin size={14}/> Rutt</span>}</div></button>) : <Empty icon={Watch} text="Inga importerade träningspass ännu"/>}</Card><Card className="healthHistory"><h2>30 dagars historik</h2><HealthHistoryChart rows={healthHistory}/><div className="historyTotals"><span><b>{healthHistory.reduce((sum, row) => sum + Number(row.steps || 0), 0).toLocaleString("sv-SE")}</b> steg</span><span><b>{healthHistory.reduce((sum, row) => sum + Number(row.active_minutes || 0), 0).toLocaleString("sv-SE")}</b> aktiva minuter</span><span><b>{healthHistory.reduce((sum, row) => sum + Number(row.passive_points || 0), 0).toLocaleString("sv-SE")} p</b> passiv bonus</span></div></Card><Card><h2>Anslutningar</h2><HealthRow icon={Smartphone} name="Apple Health och Apple Watch" text="Kräver Pulsly iOS-app och HealthKit-behörighet"/><HealthRow icon={Activity} name="Health Connect och Samsung Watch" text="Kräver Pulsly Android-app och Health Connect-behörighet"/><HealthRow icon={Watch} name="Garmin Connect" text="Kräver godkänd Garmin Health API-anslutning"/></Card></>}

      {page === "challenges" && <><Title eyebrow="UTMANINGAR" title="Utmaningar" text="Gå med och följ framsteg från verifierade aktiviteter."/><div className="grid events">{challenges.length ? challenges.map((item) => { const joined = challengeMemberships.some((m) => m.challenge_id === item.id); const totals = challengeProgress[item.id]?.totals; return <Card key={item.id}><Trophy className="green"/><h2>{item.name || item.title}</h2><p>{item.description || "Pulsly-utmaning"}</p>{totals && <div className="metrics three"><Metric icon={Zap} label="Poäng" value={totals.points}/><Metric icon={Route} label="Distans" value={`${(totals.distanceMeters/1000).toFixed(1)} km`}/><Metric icon={Timer} label="Aktiv tid" value={`${totals.activeMinutes} min`}/></div>}<button className={joined ? "light full" : "dark full"} onClick={() => toggleChallenge(item.id, joined)}>{joined ? "Lämna utmaning" : "Gå med"}</button></Card>; }) : <Card><Empty icon={Trophy} text="Inga utmaningar ännu"/></Card>}</div></>}
      {page === "leaderboard" && <><Title eyebrow="TOPPLISTA" title="Mest aktiva" text="Verifierade aktivitets-, grupp- och passivpoäng senaste 30 dagarna." action={<button className="light" onClick={refreshPoints}><RefreshCw size={18}/>Räkna om</button>}/>{myPoints && <div className="metrics four"><Metric icon={Zap} label="Totalt" value={myPoints.totalPoints.toLocaleString("sv-SE")}/><Metric icon={Activity} label="Aktivitet" value={myPoints.activePoints.toLocaleString("sv-SE")}/><Metric icon={Footprints} label="Passivt" value={myPoints.passivePoints.toLocaleString("sv-SE")}/><Metric icon={Users} label="Gruppbonus" value={myPoints.groupBonusExtra.toLocaleString("sv-SE")}/></div>}<Card className="leaderCard">{leaderboard.map((item) => <div className="leaderRow" key={item.userId}><b>#{item.rank}</b><div className="postavatar">{initials(item.profile?.full_name)}</div><span><strong>{item.profile?.full_name || "Pulsly-medlem"}</strong><small>{item.profile?.department || ""}</small></span><strong>{item.points.toLocaleString("sv-SE")} p</strong></div>)}</Card></>}
      {page === "teams" && <><Title eyebrow="LAG" title="Pulsly-lag" text="Gå med i ett lag och bygg gemensam aktivitet."/><div className="grid events">{teams.map((team) => { const joined = teamMemberships.some((m) => m.team_id === team.id); return <Card key={team.id}><Users className="green"/><h2>{team.name}</h2><p>{team.description || "Pulsly-lag"}</p><span>{teamMembers[team.id]?.length || 0} medlemmar</span><button className={joined ? "light full" : "dark full"} onClick={() => toggleTeam(team.id, joined)}>{joined ? "Lämna lag" : "Gå med i laget"}</button></Card>; })}</div></>}
      {page === "notifications" && <><Title eyebrow="NOTISER" title="Notiscenter" text={`${unreadCount} olästa notiser`} action={<button className="light" onClick={readAllNotifications}>Markera alla lästa</button>}/><Card>{notifications.length ? notifications.map((item) => <button className={`notificationRow ${item.read ? "" : "unread"}`} key={item.id} onClick={() => openNotification(item)}><Bell size={19}/><span><b>{item.title}</b><small>{item.message}</small></span><small>{fmtDate(item.created_at)}</small></button>) : <Empty icon={Bell} text="Inga notiser"/>}</Card></>}
      {page === "search" && <>
        <Title eyebrow="SOK" title="Sok i Pulsly" text="Sok efter medlemmar, event, utmaningar och lag."/>
        <Card>
          <form onSubmit={runGlobalSearch} className="section">
            <input style={{flex:1}} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Skriv minst 2 tecken..."/>
            <button className="dark" disabled={searching}><Search size={18}/>{searching ? "Soker..." : "Sok"}</button>
          </form>
        </Card>
        <div className="grid two" style={{marginTop:16}}>
          <Card><h2>Personer</h2>{searchResults.people?.length ? searchResults.people.map((p) => <div className="mini-row" key={p.id}><div><b>{p.full_name || "Pulsly-medlem"}</b><small>{[p.department,p.location].filter(Boolean).join(" · ")}</small></div></div>) : <p>Inga resultat.</p>}</Card>
          <Card><h2>Event</h2>{searchResults.events?.length ? searchResults.events.map((e) => <button className="mini-row searchRow" key={e.id} onClick={() => setPage("events")}><div><b>{e.title}</b><small>{fmtDate(e.starts_at)} · {e.activity_type}</small></div><ChevronRight/></button>) : <p>Inga resultat.</p>}</Card>
          <Card><h2>Utmaningar</h2>{searchResults.challenges?.length ? searchResults.challenges.map((c) => <button className="mini-row searchRow" key={c.id} onClick={() => setPage("challenges")}><div><b>{c.title}</b><small>{c.challenge_type || "Utmaning"}</small></div><ChevronRight/></button>) : <p>Inga resultat.</p>}</Card>
          <Card><h2>Lag</h2>{searchResults.teams?.length ? searchResults.teams.map((t) => <button className="mini-row searchRow" key={t.id} onClick={() => setPage("teams")}><div><b>{t.name}</b><small>{t.description || "Pulsly-lag"}</small></div><ChevronRight/></button>) : <p>Inga resultat.</p>}</Card>
        </div>
      </>}

      {page === "data" && <>
        <Title eyebrow="MINA DATA" title="Ladda ner mina Pulsly-data" text="Exportera dina egna aktivitets- och halsodata som CSV."/>
        <div className="grid two">
          <Card><h2>Aktiviteter</h2><p>Verifierade aktiviteter, distans, steg, poang och gruppmultiplikator.</p><button className="dark full" onClick={downloadActivities}>Ladda ner aktiviteter</button></Card>
          <Card><h2>Halsa</h2><p>Steg, aktiva minuter, distans, kalorier och vilopuls.</p><button className="dark full" onClick={downloadHealth}>Ladda ner halsodata</button></Card>
          <Card><h2>VO2 max</h2><p>Din importerade VO2 max-historik fran anslutna enheter.</p><button className="light full" onClick={downloadVo2}>Ladda ner VO2 max</button></Card>
        </div>
      </>}

      {page === "admin" && adminAccess?.isAdmin && <>
        <Title eyebrow="ADMIN" title="Pulsly administration" text={`Inloggad som ${adminAccess.role}.`}/>
        {adminLoading ? <Card><p>Laddar adminoversikt...</p></Card> : <>
          <div className="home-metrics">
            <Metric icon={User} label="Anvandare" value={adminOverview?.users || 0}/>
            <Metric icon={Activity} label="Aktiviteter" value={adminOverview?.activities || 0}/>
            <Metric icon={CalendarDays} label="Event" value={adminOverview?.events || 0}/>
            <Metric icon={Users} label="Lag" value={adminOverview?.teams || 0}/>
          </div>
          <div className="grid two" style={{marginTop:16}}>
            <Card><h2>Senaste anvandare</h2>{adminUsers.slice(0,20).map((u) => <div className="mini-row" key={u.id}><div><b>{u.full_name || "Pulsly-medlem"}</b><small>{u.role} · {u.department || "Ingen avdelning"}</small></div></div>)}</Card>
            <Card><h2>Health-synkfel</h2>{healthSyncFailures.length ? healthSyncFailures.map((f) => <div className="mini-row" key={f.id}><div><b>{f.provider}</b><small>{f.status} · {f.message || "Ingen detalj"}</small></div></div>) : <p>Inga registrerade synkfel.</p>}</Card>
          </div>
        </>}
      </>}

      {page === "privacy" && <><Title eyebrow="INTEGRITET" title="Integritet och delning" text="Du bestämmer vad som delas från aktiviteter och hälsodata."/><div className="grid two"><Card><h2>Standarddelning</h2><label>Profilsynlighet<select value={privacy?.profile_visibility || "members"} onChange={(e) => persistPrivacy({ profile_visibility:e.target.value })}><option value="private">Privat</option><option value="members">Pulsly-medlemmar</option><option value="public">Offentlig</option></select></label><label>Aktivitetsinlägg<select value={privacy?.wall_default_visibility || "members"} onChange={(e) => persistPrivacy({ wall_default_visibility:e.target.value })}><option value="private">Privat</option><option value="members">Pulsly-medlemmar</option><option value="public">Offentligt</option></select></label><label>Integritetsradie<input type="number" min="0" max="5000" value={privacy?.privacy_radius_meters ?? 200} onChange={(e) => persistPrivacy({ privacy_radius_meters:Number(e.target.value) })}/></label></Card><Card><h2>Känslig hälsodata</h2>{[["share_route_default","Dela GPS-rutt som standard"],["share_heart_rate_default","Dela puls som standard"],["share_vo2max_default","Dela VO₂ max som standard"],["share_health_stats_default","Dela hälsostatistik som standard"]].map(([key,label]) => <button className="privacyToggle" key={key} onClick={() => persistPrivacy({ [key]:!privacy?.[key] })}><span>{label}</span><span className={`switch ${privacy?.[key] ? "on" : ""}`}><i/></span></button>)}<button className="danger full" onClick={removeHealthData}>Radera importerad hälsodata</button></Card></div></>}
      {page === "profile" && <><Title eyebrow="MIN PROFIL" title={fullName} text={session.user.email}/><div className="grid profile"><Card className="center"><div className="bigavatar">{initials(fullName)}</div><h2>{fullName}</h2><p>{profile?.department || "Pulsly-medlem"}</p><button className="logout full" onClick={signOut}><LogOut size={18}/>Logga ut</button></Card><Card><div className="section"><div><h2>Röstcoach</h2><p>Distans, tid och tempo under aktiviteten.</p></div><button className={`voice ${settings?.voice_coach_enabled ? "on" : ""}`} onClick={() => saveVoice({ voice_coach_enabled: !settings?.voice_coach_enabled })}>{settings?.voice_coach_enabled ? <Mic/> : <MicOff/>}</button></div><label>Läs upp varje<select value={settings?.voice_interval_meters || 1000} onChange={(e) => saveVoice({ voice_interval_meters: Number(e.target.value) })}><option value={500}>500 meter</option><option value={1000}>1 kilometer</option><option value={2000}>2 kilometer</option></select></label><div className="settings">{[["voice_total_time", "Total tid"], ["voice_split_time", "Senaste kilometertid"], ["voice_average_pace", "Genomsnittstempo"], ["voice_speed", "Hastighet vid cykling"]].map(([key, label]) => <button key={key} onClick={() => saveVoice({ [key]: !settings?.[key] })}><span>{label}</span><span className={`switch ${settings?.[key] ? "on" : ""}`}><i/></span></button>)}</div><button className="light full" onClick={() => speak("Pulsly röstcoach. En kilometer. Total tid fem minuter och fyrtiotvå sekunder.")}><Mic size={18}/>Testa röstcoach</button></Card><Card><h2>Hälsoanslutningar</h2><HealthRow icon={Smartphone} name="Apple Health" text="iPhone"/><HealthRow icon={Activity} name="Health Connect" text="Android och Samsung Watch"/><HealthRow icon={Watch} name="Garmin Connect" text="Planerad integration"/></Card></div></>}
    </main>

    <div className="mobile">{menuGroups.map((group) => { const Icon = group.icon; return <button key={group.id} className={activeGroup.id === group.id ? "active" : ""} onClick={() => setPage(group.defaultPage)}><Icon size={20}/><span>{group.label}</span></button>; })}</div>

    {selectedWorkout && <div className="backdrop"><div className="modal workoutModal"><button className="close" onClick={closeWorkoutDetails}><X/></button><Activity className="green" size={32}/><h2>{selectedWorkout.activity_type}</h2><p>{fmtDate(selectedWorkout.started_at)} · {selectedWorkout.provider}</p><div className="metrics three"><Metric icon={Route} label="Distans" value={`${(Number(selectedWorkout.distance_meters || 0) / 1000).toFixed(2)} km`}/><Metric icon={Timer} label="Tid" value={fmtTime(selectedWorkout.duration_seconds)}/><Metric icon={Heart} label="Snittpuls" value={selectedWorkout.average_heart_rate ? `${selectedWorkout.average_heart_rate} bpm` : "Saknas"}/><Metric icon={Zap} label="Kalorier" value={`${Math.round(Number(selectedWorkout.active_calories || 0))} kcal`}/><Metric icon={Heart} label="Maxpuls" value={selectedWorkout.max_heart_rate ? `${selectedWorkout.max_heart_rate} bpm` : "Saknas"}/><Metric icon={Activity} label="Höjdmeter" value={selectedWorkout.elevation_gain_meters ? `${Math.round(Number(selectedWorkout.elevation_gain_meters))} m` : "Saknas"}/></div><h3>Pulskurva</h3><HeartChart samples={workoutHeart}/><h3>Komplett rutt</h3>{workoutRoute.length ? <ImportedRouteMap points={workoutRoute}/> : <div className="empty routeEmpty"><MapPin size={36}/><b>Ingen importerad rutt för passet</b></div>}<button className="dark full" onClick={() => openImportedShare(selectedWorkout)}><Share2 size={18}/>Dela passet på väggen</button></div></div>}
    {importShareWorkout && <div className="backdrop"><div className="modal"><button className="close" onClick={() => setImportShareWorkout(null)}><X/></button><Share2 className="green" size={32}/><h2>Dela importerat träningspass</h2><p>{importShareWorkout.activity_type} · {(Number(importShareWorkout.distance_meters || 0) / 1000).toFixed(2)} km · {fmtTime(importShareWorkout.duration_seconds)}</p><textarea value={importShareText} placeholder="Skriv något om passet..." onChange={(e) => setImportShareText(e.target.value)}/><label>Synlighet<select value={importShareVisibility} onChange={(e) => setImportShareVisibility(e.target.value)}><option value="private">Privat</option><option value="members">Pulsly-medlemmar</option><option value="public">Offentligt</option></select></label><button className={`choice ${importShareRoute ? "selected" : ""}`} disabled={!importShareWorkout.has_route} onClick={() => setImportShareRoute((v) => !v)}><MapPin/><span><b>Dela GPS-rutt</b><small>{importShareWorkout.has_route ? "Start och slut döljs innan publicering." : "Det här passet saknar importerad rutt."}</small></span>{importShareRoute && <Check/>}</button><div className="modalactions"><button className="light" onClick={() => setImportShareWorkout(null)}>Avbryt</button><button className="dark" onClick={publishImportedWorkout}><Send size={18}/>Publicera</button></div></div></div>}
    {eventModal && <div className="backdrop"><form className="modal" onSubmit={createEvent}><button type="button" className="close" onClick={() => setEventModal(false)}><X/></button><CalendarDays className="green" size={32}/><h2>Skapa event</h2><label>Namn<input required value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}/></label><label>Aktivitet<select value={eventForm.activityType} onChange={(e) => setEventForm({ ...eventForm, activityType: e.target.value })}>{TYPES.map((t) => <option key={t.id}>{t.name}</option>)}</select></label><label>Starttid<input type="datetime-local" required value={eventForm.startsAt} onChange={(e) => setEventForm({ ...eventForm, startsAt: e.target.value })}/></label><label>Mötesplats<input value={eventForm.locationName} onChange={(e) => setEventForm({ ...eventForm, locationName: e.target.value })}/></label><label>Beskrivning<textarea value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}/></label><button className="dark full">Skapa event och anmäl mig</button></form></div>}

    {shareModal && completed && <div className="backdrop"><div className="modal"><button className="close" onClick={() => { setShareModal(false); setCompleted(null); }}><X/></button><Share2 className="green" size={32}/><h2>Dela aktiviteten?</h2><textarea value={shareText} placeholder="Skriv något..." onChange={(e) => setShareText(e.target.value)}/><label>Synlighet<select value={shareVisibility} onChange={(e) => setShareVisibility(e.target.value)}><option value="private">Privat</option><option value="members">Pulsly-medlemmar</option><option value="public">Offentligt</option></select></label><button className={`choice ${shareRoute ? "selected" : ""}`} onClick={() => setShareRoute((v) => !v)}><MapPin/><span><b>Dela GPS-rutt</b><small>Start och slut döljs.</small></span>{shareRoute && <Check/>}</button><div className="modalactions"><button className="light" onClick={() => { setShareModal(false); setCompleted(null); }}>Behåll privat</button><button className="dark" onClick={publish}><Send size={18}/>Publicera</button></div></div></div>}

    <style>{CSS}</style>
  </div>;
}

function Title({ eyebrow, title, text, action }) { return <section className="title"><div><span>{eyebrow}</span><h1>{title}</h1><p>{text}</p></div>{action}</section>; }
function Empty({ icon: Icon, text }) { return <div className="empty"><Icon size={38}/><b>{text}</b></div>; }
function ImportedRouteMap({ points }) {
  if (!points?.length) return null;
  const lats = points.map((p) => Number(p.latitude)), lons = points.map((p) => Number(p.longitude));
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const latRange = Math.max(0.000001, maxLat - minLat), lonRange = Math.max(0.000001, maxLon - minLon);
  const poly = points.map((p) => `${20 + ((Number(p.longitude) - minLon) / lonRange) * 560},${280 - ((Number(p.latitude) - minLat) / latRange) * 250}`).join(" ");
  return <div className="importedRoute"><svg viewBox="0 0 600 300" preserveAspectRatio="none"><polyline points={poly} fill="none" stroke="#10b981" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"/></svg><span><MapPin size={15}/> {points.length} GPS-punkter</span></div>;
}
function HealthHistoryChart({ rows }) {
  const data = rows || [];
  if (!data.length) return <div className="empty chartEmpty"><BarChart3 size={36}/><b>Ingen historik ännu</b></div>;
  const maxSteps = Math.max(1, ...data.map((row) => Number(row.steps || 0)));
  return <div className="historyChart">{data.map((row) => <div key={row.health_date} className="historyBar" title={`${row.health_date}: ${Number(row.steps || 0).toLocaleString("sv-SE")} steg`}><i style={{ height: `${Math.max(4, Number(row.steps || 0) / maxSteps * 100)}%` }}/></div>)}</div>;
}
function HeartChart({ samples }) {
  const values = (samples || []).slice().reverse().slice(-60);
  if (!values.length) return <div className="empty chartEmpty"><Heart size={36}/><b>Ingen pulskurva ännu</b></div>;
  const bpms = values.map((x) => Number(x.bpm));
  const min = Math.min(...bpms), max = Math.max(...bpms), range = Math.max(1, max - min);
  const points = bpms.map((bpm, i) => `${(i / Math.max(1, bpms.length - 1)) * 600},${180 - ((bpm - min) / range) * 140}`).join(" ");
  return <div className="heartChart"><div><span>Min {min} bpm</span><span>Max {max} bpm</span></div><svg viewBox="0 0 600 200" preserveAspectRatio="none"><polyline fill="none" stroke="#e11d48" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" points={points}/></svg></div>;
}
function HealthRow({ icon: Icon, name, text }) { return <div className="health"><Icon/><div><b>{name}</b><span>{text}</span></div></div>; }

const CSS = `
:root{color:#0f172a;background:#eff5f2}*{box-sizing:border-box}.app{min-height:100vh;padding-bottom:90px}.loading{min-height:100vh;display:grid;place-content:center;justify-items:center;color:#10b981;background:#eff5f2}button,input,select,textarea{font:inherit}button{cursor:pointer}header{height:68px;padding:0 24px;position:sticky;top:0;z-index:30;display:flex;align-items:center;justify-content:space-between;background:#fffffff2;border-bottom:1px solid #e2e8f0;backdrop-filter:blur(18px)}.brand{border:0;background:transparent;display:flex;align-items:center;gap:10px;font-size:22px;font-weight:950}.brand>span{width:39px;height:39px;display:grid;place-items:center;border-radius:13px;color:white;background:linear-gradient(135deg,#10b981,#14b8a6)}nav{display:flex;gap:3px;padding:4px;border-radius:14px;background:#f1f5f9}nav button{border:0;padding:9px 12px;display:flex;gap:7px;align-items:center;border-radius:10px;color:#64748b;background:transparent;font-weight:800}nav button.active{color:#059669;background:white}.avatar{width:42px;height:42px;border:0;border-radius:50%;color:white;background:#0f172a;font-size:11px;font-weight:900}main{width:min(1180px,calc(100% - 28px));margin:auto;padding:32px 0}.title{display:flex;align-items:end;justify-content:space-between;gap:20px;margin-bottom:24px}.title span{color:#059669;font-size:12px;font-weight:900;letter-spacing:.1em}.title h1{margin:4px 0;font-size:clamp(31px,5vw,44px)}.title p,.card p{color:#64748b}.card{padding:24px;border-radius:26px;background:white;box-shadow:0 4px 18px #0f172a0d}.card h2{margin-top:0}.grid{display:grid;gap:20px;margin-top:20px}.grid.two{grid-template-columns:1.2fr .8fr}.grid.track{grid-template-columns:1fr 400px}.grid.events{grid-template-columns:repeat(2,1fr)}.grid.profile{grid-template-columns:320px 1fr;align-items:start}.metrics{display:grid;gap:10px;margin-top:18px}.metrics.four{grid-template-columns:repeat(4,1fr)}.metrics.three{grid-template-columns:repeat(3,1fr)}.metric{min-width:0;padding:14px;display:flex;flex-direction:column;gap:4px;border-radius:17px;background:#f8fafc}.metric svg,.green{color:#10b981}.metric strong{font-size:18px}.metric span{color:#94a3b8;font-size:11px}.verified{display:flex;gap:7px;align-items:center;color:#059669;font-weight:900}.dark,.light,.danger,.logout{border:0;padding:12px 17px;display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:12px;font-weight:900}.dark{color:white;background:#0f172a}.light{color:#0f172a;background:#f1f5f9}.danger{color:white;background:#e11d48}.logout{color:#be123c;background:#fff1f2}.full{width:100%;margin-top:16px}.row{padding:13px 0;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #f1f5f9}.row>div{display:flex;flex-direction:column}.row span{color:#64748b;font-size:12px}.pill{padding:5px 9px;border-radius:999px;color:#047857;background:#ecfdf5;font-size:10px;font-weight:900}.types{display:grid;grid-template-columns:1fr 1fr;gap:8px}.types button{min-height:76px;border:1px solid #e2e8f0;border-radius:15px;background:white;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;font-weight:900}.types button.sel{border-color:#10b981;color:#047857;background:#ecfdf5}label{display:flex;flex-direction:column;gap:7px;margin-top:16px;color:#334155;font-size:13px;font-weight:900}input,select,textarea{width:100%;border:1px solid #e2e8f0;border-radius:12px;padding:12px;outline:0;background:white}textarea{min-height:95px;resize:vertical}.timer{margin:28px 0 17px;text-align:center;font-size:45px;font-weight:950}.timer span{display:block;color:#94a3b8;font-size:12px}.notice{margin-top:15px;padding:13px;display:flex;gap:9px;border-radius:13px;color:#6d28d9;background:#f5f3ff;font-size:12px}.actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}.mapbox{height:320px;position:relative;overflow:hidden;border-radius:22px;background:#e7eee9}.mapgrid{position:absolute;inset:-50px;opacity:.5;background-image:linear-gradient(#bdcbc2 1px,transparent 1px),linear-gradient(90deg,#bdcbc2 1px,transparent 1px);background-size:42px 42px;transform:rotate(-7deg)}.mapbox svg{position:absolute;inset:0;width:100%;height:100%}.maptag,.mapcount{position:absolute;padding:8px 11px;border-radius:10px;background:white;font-size:12px;font-weight:900}.maptag{top:14px;left:14px;display:flex;gap:6px}.mapcount{right:14px;bottom:14px}.splits{margin-top:20px}.splits>div{padding:11px 0;display:grid;grid-template-columns:1fr auto auto;gap:18px;border-bottom:1px solid #f1f5f9}.eventTop{display:flex;justify-content:space-between;align-items:center}.eventIcon{width:48px;height:48px;display:grid;place-items:center;border-radius:15px;color:#059669;background:#ecfdf5}.details{display:grid;gap:9px;margin-top:16px}.details span{display:flex;gap:8px;align-items:center;color:#64748b;font-size:13px}.joined,.closed{margin-top:15px;padding:11px;display:flex;justify-content:center;gap:7px;border-radius:12px;font-size:12px;font-weight:900}.joined{color:#047857;background:#ecfdf5}.closed{color:#64748b;background:#f1f5f9}.verify{margin-top:17px;padding:15px;border:1px solid #e2e8f0;border-radius:16px;background:#f8fafc}.verify.done{border-color:#a7f3d0;background:#ecfdf5}.verifyTitle{display:flex;align-items:center;gap:8px;margin-bottom:14px}.verifyGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.verifyGrid div{padding:9px 5px;display:flex;flex-direction:column;text-align:center;border-radius:10px;background:white}.verifyGrid span{font-size:9px;color:#94a3b8}.mine{margin-top:14px;padding-top:13px;border-top:1px solid #e2e8f0;display:grid;gap:8px}.bonus{display:flex;gap:6px;align-items:center;color:#047857;font-weight:900}.wall{width:min(760px,100%);margin:auto;display:grid;gap:20px}.posthead{display:flex;align-items:center;gap:12px}.posthead>div:nth-child(2){flex:1;display:flex;flex-direction:column}.postavatar,.bigavatar{display:grid;place-items:center;border-radius:50%;color:white;background:#0f172a;font-weight:950}.postavatar{width:45px;height:45px;font-size:11px}.bigavatar{width:96px;height:96px;margin:auto;font-size:25px}.postactions{display:flex;gap:10px;padding-top:14px;border-top:1px solid #f1f5f9}.postactions button{border:0;background:transparent}.center{text-align:center}.section{display:flex;justify-content:space-between;align-items:start}.voice{width:44px;height:44px;border:0;border-radius:14px;background:#f1f5f9}.voice.on{color:white;background:#10b981}.settings button{width:100%;padding:14px 0;border:0;border-bottom:1px solid #f1f5f9;background:transparent;display:flex;justify-content:space-between;font-weight:800}.switch{width:43px;height:24px;padding:3px;display:flex;border-radius:999px;background:#cbd5e1}.switch i{width:18px;height:18px;border-radius:50%;background:white;transition:.2s}.switch.on{background:#10b981}.switch.on i{transform:translateX(19px)}.health{padding:15px 0;display:flex;gap:13px;align-items:center;border-bottom:1px solid #f1f5f9}.health>div{display:flex;flex-direction:column}.health span{color:#94a3b8;font-size:12px}.empty{min-height:140px;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:8px;color:#94a3b8}.backdrop{position:fixed;inset:0;z-index:100;padding:18px;display:grid;place-items:center;background:#0f172a94;backdrop-filter:blur(5px)}.modal{width:min(540px,100%);max-height:calc(100vh - 36px);overflow:auto;position:relative;padding:28px;border-radius:27px;background:white}.close{width:39px;height:39px;position:absolute;right:17px;top:17px;border:0;border-radius:12px;background:#f1f5f9}.choice{width:100%;margin-top:12px;padding:14px;display:flex;align-items:center;gap:12px;border:1px solid #e2e8f0;border-radius:14px;background:white;text-align:left}.choice.selected{border-color:#10b981;color:#047857;background:#ecfdf5}.choice span{flex:1;display:flex;flex-direction:column}.modalactions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:20px}.toast{position:fixed;z-index:200;top:16px;left:50%;transform:translateX(-50%);max-width:calc(100vw - 30px);padding:12px 17px;border-radius:13px;color:white}.toast.ok{background:#0f172a}.toast.bad{background:#be123c}.spin{animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.mobile{display:none}
.healthActions{display:flex;gap:8px;flex-wrap:wrap}.healthStatus{margin-bottom:18px}.healthStatusRow{display:flex;align-items:center;justify-content:space-between;gap:14px}.healthStatusRow>div{display:flex;flex-direction:column;gap:5px}.healthStatusRow span{color:#64748b;font-size:12px}.connectionDot{width:14px;height:14px;border-radius:50%;background:#cbd5e1;box-shadow:0 0 0 5px #f1f5f9}.connectionDot.connected{background:#10b981;box-shadow:0 0 0 5px #d1fae5}.grid.healthgrid{grid-template-columns:1.2fr .8fr}.heartChart{margin-top:18px;padding:14px;border-radius:16px;background:#fff1f2}.heartChart>div{display:flex;justify-content:space-between;color:#9f1239;font-size:12px;font-weight:800}.heartChart svg{width:100%;height:190px;margin-top:8px}.chartEmpty{min-height:220px}.passive{display:grid;gap:10px;margin-top:15px}.passive span{padding:12px;display:flex;justify-content:space-between;border-radius:12px;background:#f8fafc;color:#64748b}.passive b{color:#0f172a}.healthWorkouts{margin-top:20px}.workout{padding:14px 0;display:flex;align-items:center;gap:13px;border-bottom:1px solid #f1f5f9}.workoutIcon{width:44px;height:44px;display:grid;place-items:center;border-radius:13px;color:#059669;background:#ecfdf5}.workout>div:nth-child(2){flex:1;display:flex;flex-direction:column;gap:3px}.workout span{color:#64748b;font-size:12px}.workoutRight{display:flex;flex-direction:column;align-items:flex-end;gap:4px}.workoutRight span{display:flex;align-items:center;gap:4px}.healthgrid+.healthWorkouts{margin-top:20px}
.healthHistory{margin-top:20px}.historyChart{height:190px;display:flex;align-items:flex-end;gap:4px;padding:16px 10px 0;border-radius:16px;background:#f8fafc}.historyBar{height:100%;flex:1;display:flex;align-items:flex-end}.historyBar i{width:100%;min-height:4px;border-radius:5px 5px 2px 2px;background:linear-gradient(180deg,#10b981,#14b8a6)}.historyTotals{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}.historyTotals span{padding:10px;display:flex;flex-direction:column;border-radius:12px;background:#f8fafc;color:#64748b;font-size:11px}.historyTotals b{color:#0f172a;font-size:16px}
.workout{width:100%;border:0;background:transparent;text-align:left;color:inherit}.workout:hover{background:#f8fafc}.workoutModal{width:min(760px,100%)}.workoutModal h3{margin:22px 0 10px}.importedRoute{height:330px;position:relative;overflow:hidden;border-radius:18px;background:linear-gradient(135deg,#e8f5ee,#dcebe4)}.importedRoute svg{width:100%;height:100%}.importedRoute span{position:absolute;left:12px;bottom:12px;padding:8px 10px;display:flex;align-items:center;gap:5px;border-radius:10px;background:white;font-size:12px;font-weight:800}.routeEmpty{min-height:170px}
.leaderCard{margin-top:20px}.leaderRow{padding:12px 0;display:flex;align-items:center;gap:12px;border-bottom:1px solid #f1f5f9}.leaderRow>span{flex:1;display:flex;flex-direction:column}.leaderRow small{color:#94a3b8}.notificationRow{width:100%;padding:14px 8px;border:0;border-bottom:1px solid #f1f5f9;background:white;display:flex;align-items:center;gap:12px;text-align:left}.notificationRow.unread{background:#ecfdf5}.notificationRow>span{flex:1;display:flex;flex-direction:column;gap:4px}.notificationRow small{color:#64748b}.privacyToggle{width:100%;padding:14px 0;border:0;border-bottom:1px solid #f1f5f9;background:white;display:flex;justify-content:space-between;align-items:center;font-weight:800}
@media(max-width:900px){header nav{display:none}.grid.two,.grid.track,.grid.events,.grid.profile,.grid.healthgrid{grid-template-columns:1fr}.mobile{position:fixed;z-index:50;left:0;right:0;bottom:0;display:flex;justify-content:space-around;padding:8px 2px calc(8px + env(safe-area-inset-bottom));border-top:1px solid #e2e8f0;background:#fffffff5}.mobile button{border:0;background:transparent;color:#94a3b8;display:flex;flex-direction:column;align-items:center;gap:3px;font-size:10px;font-weight:900}.mobile button.active{color:#059669}}
@media(max-width:640px){header{padding:0 14px}main{width:calc(100% - 24px);padding:22px 0}.title{flex-direction:column;align-items:stretch}.metrics.four{grid-template-columns:1fr 1fr}.card{padding:18px}.verifyGrid{grid-template-columns:1fr 1fr}.mapbox{height:260px}.modalactions{grid-template-columns:1fr}}
.avatar{width:42px;height:42px;border:0;border-radius:50%;background:#0f172a;color:#fff;font-weight:900}.headerActions{display:flex;align-items:center;gap:8px}.notificationBell{width:42px;height:42px;border:0;border-radius:13px;background:#f1f5f9;color:#475569;display:grid;place-items:center;position:relative}.notificationBell span{position:absolute;right:-4px;top:-5px;min-width:19px;height:19px;padding:0 5px;border-radius:999px;background:#e11d48;color:#fff;font-size:10px;font-weight:900;display:grid;place-items:center}.subnav{max-width:1180px;margin:12px auto 0;padding:0 14px;display:flex;gap:8px;overflow-x:auto;scrollbar-width:none}.subnav::-webkit-scrollbar{display:none}.subnav button{flex:0 0 auto;border:1px solid #e2e8f0;background:#fff;color:#64748b;border-radius:12px;padding:9px 13px;display:flex;align-items:center;gap:6px;font-weight:800}.subnav button.active{background:#ecfdf5;border-color:#10b981;color:#047857}`;
