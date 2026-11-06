import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  BarChart3,
  Bike,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Footprints,
  Heart,
  Home,
  LogOut,
  MapPin,
  MessageCircle,
  Mic,
  MicOff,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Route,
  Send,
  Settings,
  Share2,
  ShieldCheck,
  Smartphone,
  Square,
  Timer,
  Trophy,
  User,
  Users,
  Watch,
  X,
  Zap,
} from "lucide-react";

import Auth from "./Auth";
import { supabase } from "./lib/supabase";

const activityTypes = [
  {
    id: "walk",
    name: "Promenad",
    icon: Footprints,
    pointsPerMinute: 10,
    paceMode: true,
  },
  {
    id: "run",
    name: "Löpning",
    icon: Activity,
    pointsPerMinute: 15,
    paceMode: true,
  },
  {
    id: "bike",
    name: "Cykling",
    icon: Bike,
    pointsPerMinute: 12,
    paceMode: false,
  },
];

function Card({ children, className = "" }) {
  return <div className={`card ${className}`}>{children}</div>;
}

function formatDuration(totalSeconds) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(seconds).padStart(2, "0"),
  ].join(":");
}

function formatPace(secondsPerKilometer) {
  if (
    !Number.isFinite(secondsPerKilometer) ||
    secondsPerKilometer <= 0
  ) {
    return "--:--";
  }

  const minutes = Math.floor(secondsPerKilometer / 60);
  const seconds = Math.round(secondsPerKilometer % 60);

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatDate(value) {
  if (!value) return "";

  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function initials(value) {
  if (!value) return "PU";

  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function haversine(first, second) {
  const radius = 6371;

  const latitudeDifference =
    ((second.latitude - first.latitude) * Math.PI) / 180;

  const longitudeDifference =
    ((second.longitude - first.longitude) * Math.PI) / 180;

  const firstLatitude = (first.latitude * Math.PI) / 180;
  const secondLatitude = (second.latitude * Math.PI) / 180;

  const value =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDifference / 2) ** 2;

  return (
    radius *
    2 *
    Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
  );
}

function Metric({ icon: Icon, label, value }) {
  return (
    <div className="metric">
      <Icon size={19} />
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function AppMap({ positions, active = false }) {
  return (
    <div className="map">
      <div className="map-grid" />
      <div className="road road-a" />
      <div className="road road-b" />
      <div className="road road-c" />

      <svg
        className="route-svg"
        viewBox="0 0 600 320"
        preserveAspectRatio="none"
      >
        <path
          d="M70 255 C120 215 175 235 215 190 S305 170 350 135 S435 115 525 65"
          fill="none"
          stroke="#10b981"
          strokeWidth="9"
          strokeLinecap="round"
        />

        <circle
          cx="70"
          cy="255"
          r="10"
          fill="white"
          stroke="#10b981"
          strokeWidth="6"
        />

        <circle
          cx="525"
          cy="65"
          r="12"
          fill={active ? "#10b981" : "#0f172a"}
          stroke="white"
          strokeWidth="5"
        />
      </svg>

      <div className="map-badge">
        <MapPin size={15} />
        {active ? "GPS aktiv" : "Aktivitetsrutt"}
      </div>

      <div className="map-count">
        {positions?.length || 0} punkter
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [page, setPage] = useState("home");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [activities, setActivities] = useState([]);
  const [posts, setPosts] = useState([]);
  const [events, setEvents] = useState([]);
  const [invites, setInvites] = useState([]);
  const [settings, setSettings] = useState(null);

  const [tracking, setTracking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [activityType, setActivityType] = useState(activityTypes[0]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [distanceKilometers, setDistanceKilometers] = useState(0);
  const [positions, setPositions] = useState([]);
  const [splits, setSplits] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState("");

  const [completedActivity, setCompletedActivity] = useState(null);
  const [shareDialog, setShareDialog] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const [shareVisibility, setShareVisibility] = useState("members");
  const [shareRoute, setShareRoute] = useState(false);
  const [shareSplits, setShareSplits] = useState(true);

  const [eventDialog, setEventDialog] = useState(false);
  const [eventForm, setEventForm] = useState({
    title: "",
    description: "",
    activityType: "Löpning",
    startsAt: "",
    endsAt: "",
    joinDeadline: "",
    locationName: "",
  });

  const watchId = useRef(null);
  const lastPosition = useRef(null);
  const lastAnnouncedDistance = useRef(0);
  const lastSplitElapsed = useRef(0);

  const fullName =
    profile?.full_name ||
    session?.user?.user_metadata?.full_name ||
    session?.user?.email ||
    "Pulsly-användare";

  const firstName = fullName.includes("@")
    ? "där"
    : fullName.split(" ")[0];

  const averagePace =
    distanceKilometers > 0
      ? elapsedSeconds / distanceKilometers
      : 0;

  const currentSpeed =
    elapsedSeconds > 0
      ? distanceKilometers / (elapsedSeconds / 3600)
      : 0;

  const currentPoints = Math.floor(
    (elapsedSeconds / 60) * activityType.pointsPerMinute
  );

  const totals = useMemo(() => {
    return activities.reduce(
      (result, activity) => {
        result.points += Number(activity.points || 0);
        result.steps += Number(activity.steps || 0);
        result.minutes += Math.round(
          Number(activity.duration_seconds || 0) / 60
        );
        result.distance +=
          Number(activity.distance_meters || 0) / 1000;

        return result;
      },
      {
        points: 0,
        steps: 0,
        minutes: 0,
        distance: 0,
      }
    );
  }, [activities]);

  useEffect(() => {
    let mounted = true;

    async function initialise() {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      setSession(currentSession);

      if (currentSession?.user) {
        await loadAll(currentSession.user.id);
      }

      setAuthLoading(false);
    }

    initialise();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      async (event, nextSession) => {
        if (event === "PASSWORD_RECOVERY") return;

        setSession(nextSession);

        if (nextSession?.user) {
          await loadAll(nextSession.user.id);
        } else {
          setProfile(null);
          setActivities([]);
          setPosts([]);
          setEvents([]);
          setInvites([]);
        }

        setAuthLoading(false);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!tracking || paused) return;

    const timer = window.setInterval(() => {
      setElapsedSeconds((value) => value + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [tracking, paused]);

  useEffect(() => {
    if (!tracking || paused) return;

    const intervalMeters =
      Number(settings?.voice_interval_meters) || 1000;

    const currentMeters = distanceKilometers * 1000;
    const passedIntervals = Math.floor(currentMeters / intervalMeters);
    const previousIntervals = Math.floor(
      lastAnnouncedDistance.current / intervalMeters
    );

    if (passedIntervals <= previousIntervals) return;

    const splitSeconds =
      elapsedSeconds - lastSplitElapsed.current;

    const splitNumber = passedIntervals;

    const split = {
      split_number: splitNumber,
      distance_meters: intervalMeters,
      elapsed_seconds: elapsedSeconds,
      split_seconds: splitSeconds,
      pace_seconds_per_km:
        intervalMeters > 0
          ? splitSeconds / (intervalMeters / 1000)
          : null,
      average_speed_kmh:
        elapsedSeconds > 0
          ? distanceKilometers / (elapsedSeconds / 3600)
          : null,
    };

    setSplits((current) => [...current, split]);

    lastSplitElapsed.current = elapsedSeconds;
    lastAnnouncedDistance.current = currentMeters;

    speakSplit(splitNumber, splitSeconds);
  }, [
    distanceKilometers,
    elapsedSeconds,
    paused,
    settings,
    tracking,
  ]);

  useEffect(() => {
    return () => stopGpsWatcher();
  }, []);

  async function loadAll(userId) {
    await Promise.all([
      loadProfile(userId),
      loadActivities(userId),
      loadSettings(userId),
      loadEvents(userId),
      loadPosts(),
    ]);
  }

  async function loadProfile(userId) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (data) setProfile(data);
  }

  async function loadActivities(userId) {
    const { data, error } = await supabase
      .from("activities")
      .select("*")
      .eq("user_id", userId)
      .order("started_at", {
        ascending: false,
      })
      .limit(100);

    if (error) {
      console.error(error);
      return;
    }

    setActivities(data || []);
  }

  async function loadSettings(userId) {
    const { data } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    setSettings(
      data || {
        user_id: userId,
        voice_coach_enabled: true,
        voice_interval_meters: 1000,
        voice_distance: true,
        voice_total_time: true,
        voice_split_time: true,
        voice_average_pace: true,
        voice_speed: true,
      }
    );
  }

  async function loadEvents(userId) {
    const [
      { data: eventData },
      { data: inviteData },
    ] = await Promise.all([
      supabase
        .from("group_events")
        .select("*")
        .order("starts_at", {
          ascending: true,
        }),
      supabase
        .from("group_event_invites")
        .select(`
          *,
          group_events (*)
        `)
        .eq("invited_user_id", userId)
        .order("invited_at", {
          ascending: false,
        }),
    ]);

    setEvents(eventData || []);
    setInvites(inviteData || []);
  }

  async function loadPosts() {
    const { data, error } = await supabase
      .from("activity_posts")
      .select(`
        *,
        profiles (
          full_name,
          avatar_url
        ),
        activities (
          activity_type,
          duration_seconds,
          distance_meters,
          steps,
          points,
          verified,
          average_pace_seconds_per_km,
          average_speed_kmh,
          started_at,
          event_id
        ),
        activity_post_likes (
          user_id
        ),
        activity_post_comments (
          id,
          comment,
          created_at,
          user_id
        )
      `)
      .in("visibility", ["members", "public"])
      .order("created_at", {
        ascending: false,
      })
      .limit(50);

    if (error) {
      console.error(error);
      return;
    }

    setPosts(data || []);
  }

  function notify(value) {
    setMessage(value);
    window.setTimeout(() => setMessage(""), 3500);
  }

  function notifyError(value) {
    setErrorMessage(value);
    window.setTimeout(() => setErrorMessage(""), 5000);
  }

  function stopGpsWatcher() {
    if (
      watchId.current !== null &&
      navigator.geolocation
    ) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
  }

  function speak(text) {
    if (!settings?.voice_coach_enabled) return;
    if (!("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = settings?.voice_language || "sv-SE";
    utterance.rate = 0.95;
    utterance.pitch = 1;

    window.speechSynthesis.speak(utterance);
  }

  function speakSplit(splitNumber, splitSeconds) {
    if (!settings?.voice_coach_enabled) return;

    const totalMinutes = Math.floor(elapsedSeconds / 60);
    const totalSeconds = elapsedSeconds % 60;

    const splitMinutes = Math.floor(splitSeconds / 60);
    const splitRemainingSeconds = Math.round(splitSeconds % 60);

    const pace = formatPace(averagePace);

    let text = `${splitNumber} kilometer.`;

    if (settings.voice_total_time) {
      text += ` Total tid ${totalMinutes} minuter`;
      if (totalSeconds > 0) {
        text += ` och ${totalSeconds} sekunder`;
      }
      text += ".";
    }

    if (settings.voice_split_time) {
      text += ` Senaste kilometer ${splitMinutes} minuter`;
      if (splitRemainingSeconds > 0) {
        text += ` och ${splitRemainingSeconds} sekunder`;
      }
      text += ".";
    }

    if (
      settings.voice_average_pace &&
      activityType.paceMode
    ) {
      text += ` Genomsnittstempo ${pace.replace(
        ":",
        " minuter och "
      )} sekunder per kilometer.`;
    }

    if (
      settings.voice_speed &&
      !activityType.paceMode
    ) {
      text += ` Genomsnittshastighet ${currentSpeed.toFixed(
        1
      )} kilometer i timmen.`;
    }

    speak(text);
  }

  function startTracking() {
    if (!navigator.geolocation) {
      notifyError("GPS stöds inte av denna enhet.");
      return;
    }

    setTracking(true);
    setPaused(false);
    setElapsedSeconds(0);
    setDistanceKilometers(0);
    setPositions([]);
    setSplits([]);

    lastPosition.current = null;
    lastAnnouncedDistance.current = 0;
    lastSplitElapsed.current = 0;

    speak(
      `${activityType.name} startad. Röstcoach är ${
        settings?.voice_coach_enabled
          ? "aktiverad"
          : "avstängd"
      }.`
    );

    watchId.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const point = {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
          recordedAt: new Date().toISOString(),
        };

        if (
          lastPosition.current &&
          coords.accuracy <= 80
        ) {
          const segment = haversine(
            lastPosition.current,
            point
          );

          if (segment > 0 && segment < 0.5) {
            setDistanceKilometers(
              (current) => current + segment
            );
          }
        }

        lastPosition.current = point;

        setPositions((current) => [
          ...current,
          point,
        ]);
      },
      () => {
        notifyError(
          "GPS kunde inte startas. Tillåt exakt plats för Pulsly."
        );
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 12000,
      }
    );
  }

  async function finishActivity() {
    stopGpsWatcher();

    const endedAt = new Date();

    const startedAt = new Date(
      endedAt.getTime() - elapsedSeconds * 1000
    );

    const durationSeconds = Math.max(elapsedSeconds, 60);
    const minutes = Math.max(1, Math.round(durationSeconds / 60));
    const basePoints = minutes * activityType.pointsPerMinute;

    try {
      const { data: activity, error } = await supabase
        .from("activities")
        .insert({
          user_id: session.user.id,
          activity_type: activityType.name,
          source: "gps",
          started_at: startedAt.toISOString(),
          ended_at: endedAt.toISOString(),
          duration_seconds: durationSeconds,
          distance_meters: Math.round(
            distanceKilometers * 1000
          ),
          steps: 0,
          base_points: basePoints,
          multiplier: 1,
          is_group_activity: false,
          verified: positions.length >= 2,
          verification_source: "GPS",
          event_id: selectedEventId || null,
          average_pace_seconds_per_km:
            activityType.paceMode && distanceKilometers > 0
              ? Math.round(averagePace)
              : null,
          average_speed_kmh:
            elapsedSeconds > 0
              ? Number(currentSpeed.toFixed(2))
              : null,
        })
        .select()
        .single();

      if (error) throw error;

      if (positions.length > 0) {
        const routeRows = positions.map((point) => ({
          activity_id: activity.id,
          user_id: session.user.id,
          latitude: point.latitude,
          longitude: point.longitude,
          accuracy_meters: point.accuracy,
          recorded_at: point.recordedAt,
        }));

        const { error: routeError } = await supabase
          .from("activity_routes")
          .insert(routeRows);

        if (routeError) console.error(routeError);
      }

      if (splits.length > 0) {
        const splitRows = splits.map((split) => ({
          ...split,
          activity_id: activity.id,
          user_id: session.user.id,
        }));

        const { error: splitError } = await supabase
          .from("activity_splits")
          .insert(splitRows);

        if (splitError) console.error(splitError);
      }

      if (selectedEventId) {
        await supabase
          .from("event_activity_matches")
          .upsert(
            {
              event_id: selectedEventId,
              user_id: session.user.id,
              activity_id: activity.id,
              verification_status: "pending",
              group_bonus_awarded: false,
            },
            {
              onConflict: "event_id,user_id",
            }
          );
      }

      speak(
        `Aktiviteten är avslutad. Distans ${distanceKilometers.toFixed(
          2
        )} kilometer. Total tid ${Math.floor(
          durationSeconds / 60
        )} minuter.`
      );

      setCompletedActivity({
        ...activity,
        savedPositions: [...positions],
        savedSplits: [...splits],
      });

      setShareDialog(true);

      await loadActivities(session.user.id);

      notify(
        selectedEventId
          ? "Aktiviteten sparades. Gruppbonusen verifieras efter eventet."
          : `Aktiviteten sparades. +${basePoints} poäng.`
      );
    } catch (error) {
      console.error(error);

      notifyError(
        `Aktiviteten kunde inte sparas: ${
          error.message || "okänt fel"
        }`
      );
    } finally {
      setTracking(false);
      setPaused(false);
      setElapsedSeconds(0);
      setDistanceKilometers(0);
      setPositions([]);
      setSplits([]);
      setSelectedEventId("");

      lastPosition.current = null;
      lastAnnouncedDistance.current = 0;
      lastSplitElapsed.current = 0;
    }
  }

  async function publishActivity() {
    if (!completedActivity) return;

    try {
      const { data: post, error } = await supabase
        .from("activity_posts")
        .insert({
          activity_id: completedActivity.id,
          user_id: session.user.id,
          message: shareMessage.trim() || null,
          visibility: shareVisibility,
          share_route: shareRoute,
          hide_route_start: true,
          hide_route_end: true,
          privacy_radius_meters: 200,
          share_splits: shareSplits,
          share_points: true,
          share_pace: true,
        })
        .select()
        .single();

      if (error) throw error;

      if (
        shareRoute &&
        completedActivity.savedPositions?.length > 0
      ) {
        const allPoints = completedActivity.savedPositions;

        const pointsToShare =
          allPoints.length > 10
            ? allPoints.slice(2, -2)
            : allPoints;

        const rows = pointsToShare.map((point, index) => ({
          post_id: post.id,
          activity_id: completedActivity.id,
          user_id: session.user.id,
          route_order: index,
          latitude: point.latitude,
          longitude: point.longitude,
        }));

        const { error: routeError } = await supabase
          .from("activity_post_routes")
          .insert(rows);

        if (routeError) throw routeError;
      }

      setShareDialog(false);
      setShareMessage("");
      setShareRoute(false);
      setShareSplits(true);
      setCompletedActivity(null);

      await loadPosts();

      setPage("wall");
      notify("Aktiviteten publicerades på väggen.");
    } catch (error) {
      notifyError(
        `Inlägget kunde inte publiceras: ${
          error.message || "okänt fel"
        }`
      );
    }
  }

  async function respondToInvite(inviteId, response) {
    const { error } = await supabase.rpc(
      "respond_to_group_event",
      {
        p_invite_id: inviteId,
        p_response: response,
      }
    );

    if (error) {
      notifyError(error.message);
      return;
    }

    await loadEvents(session.user.id);

    notify(
      response === "accepted"
        ? "Du är nu anmäld till eventet."
        : "Du har avböjt eventet."
    );
  }

  async function createEvent(event) {
    event.preventDefault();

    try {
      if (
        !eventForm.title ||
        !eventForm.startsAt ||
        !eventForm.endsAt ||
        !eventForm.joinDeadline
      ) {
        throw new Error("Fyll i alla obligatoriska fält.");
      }

      const startsAt = new Date(eventForm.startsAt);
      const eventDate = startsAt.toISOString().slice(0, 10);

      const { error } = await supabase
        .from("group_events")
        .insert({
          created_by: session.user.id,
          title: eventForm.title.trim(),
          description: eventForm.description.trim() || null,
          activity_type: eventForm.activityType,
          event_date: eventDate,
          starts_at: startsAt.toISOString(),
          ends_at: new Date(eventForm.endsAt).toISOString(),
          join_deadline: new Date(
            eventForm.joinDeadline
          ).toISOString(),
          location_name:
            eventForm.locationName.trim() || null,
          status: "open",
        });

      if (error) throw error;

      setEventDialog(false);

      setEventForm({
        title: "",
        description: "",
        activityType: "Löpning",
        startsAt: "",
        endsAt: "",
        joinDeadline: "",
        locationName: "",
      });

      await loadEvents(session.user.id);

      notify("Eventet skapades.");
    } catch (error) {
      notifyError(error.message);
    }
  }

  async function joinOpenEvent(eventId) {
    try {
      const selectedEvent = events.find(
        (item) => item.id === eventId
      );

      if (!selectedEvent) return;

      const { error } = await supabase
        .from("group_event_invites")
        .insert({
          event_id: eventId,
          invited_user_id: session.user.id,
          invited_by: selectedEvent.created_by,
          status: "accepted",
          responded_at: new Date().toISOString(),
        });

      if (error) throw error;

      await loadEvents(session.user.id);
      notify("Du är nu anmäld till eventet.");
    } catch (error) {
      notifyError(error.message);
    }
  }

  async function toggleLike(post) {
    const hasLiked = post.activity_post_likes?.some(
      (like) => like.user_id === session.user.id
    );

    if (hasLiked) {
      await supabase
        .from("activity_post_likes")
        .delete()
        .eq("post_id", post.id)
        .eq("user_id", session.user.id);
    } else {
      await supabase
        .from("activity_post_likes")
        .insert({
          post_id: post.id,
          user_id: session.user.id,
        });
    }

    await loadPosts();
  }

  async function saveVoiceSettings(nextValues) {
    const nextSettings = {
      ...settings,
      ...nextValues,
      user_id: session.user.id,
      updated_at: new Date().toISOString(),
    };

    setSettings(nextSettings);

    const { error } = await supabase
      .from("user_settings")
      .upsert(nextSettings, {
        onConflict: "user_id",
      });

    if (error) {
      notifyError(error.message);
      return;
    }

    notify("Röstinställningarna sparades.");
  }

  async function signOut() {
    stopGpsWatcher();
    window.speechSynthesis?.cancel();

    await supabase.auth.signOut();

    setSession(null);
    setProfile(null);
    setPage("home");
  }

  const acceptedEventIds = new Set(
    invites
      .filter((invite) => invite.status === "accepted")
      .map((invite) => invite.event_id)
  );

  const upcomingAcceptedEvents = events.filter(
    (event) =>
      acceptedEventIds.has(event.id) &&
      new Date(event.ends_at) > new Date()
  );

  const navigation = [
    ["home", "Hem", Home],
    ["wall", "Vägg", Heart],
    ["track", "Spåra", MapPin],
    ["events", "Event", CalendarDays],
    ["profile", "Profil", User],
  ];

  if (authLoading) {
    return (
      <div className="loading-page">
        <Activity size={44} />
        <h2>Laddar Pulsly...</h2>
      </div>
    );
  }

  if (!session) {
    return <Auth />;
  }

  return (
    <div className="app">
      {message && (
        <div className="toast toast-success">
          <CheckCircle2 size={18} />
          {message}
        </div>
      )}

      {errorMessage && (
        <div className="toast toast-error">
          {errorMessage}
        </div>
      )}

      <header>
        <button className="logo" onClick={() => setPage("home")}>
          <span>
            <Activity size={23} />
          </span>
          Pulsly
        </button>

        <nav>
          {navigation.map(([id, label, Icon]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => setPage(id)}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </nav>

        <button
          className="avatar-button"
          onClick={() => setPage("profile")}
        >
          {initials(fullName)}
        </button>
      </header>

      <main>
        {page === "home" && (
          <>
            <section className="page-title">
              <div>
                <span className="eyebrow">PULSLY</span>
                <h1>Hej {firstName}! 👋</h1>

                <p>
                  All verifierad aktivitet räknas. Ingen daglig
                  poänggräns.
                </p>
              </div>

              <button
                className="primary"
                onClick={() => setPage("track")}
              >
                <Play size={18} />
                Starta aktivitet
              </button>
            </section>

            <Card>
              <div className="verified">
                <ShieldCheck size={18} />
                Din aktivitetsöversikt
              </div>

              <div className="home-metrics">
                <Metric
                  icon={Footprints}
                  label="Steg"
                  value={totals.steps.toLocaleString("sv-SE")}
                />

                <Metric
                  icon={Timer}
                  label="Aktiv tid"
                  value={`${totals.minutes} min`}
                />

                <Metric
                  icon={Route}
                  label="Distans"
                  value={`${totals.distance.toFixed(1)} km`}
                />

                <Metric
                  icon={Zap}
                  label="Poäng"
                  value={totals.points.toLocaleString("sv-SE")}
                />
              </div>
            </Card>

            <div className="dashboard-grid">
              <Card>
                <div className="section-header">
                  <div>
                    <h2>Aktivitetsvägg</h2>
                    <p>Se vad medlemmarna har delat.</p>
                  </div>

                  <button
                    className="icon-button"
                    onClick={() => setPage("wall")}
                  >
                    <ChevronRight />
                  </button>
                </div>

                {posts.length === 0 ? (
                  <div className="empty">
                    <Share2 size={34} />
                    <strong>Inga inlägg ännu</strong>
                    <span>
                      Avsluta en aktivitet och välj att dela den.
                    </span>
                  </div>
                ) : (
                  posts.slice(0, 2).map((post) => (
                    <div className="mini-post" key={post.id}>
                      <strong>
                        {post.profiles?.full_name || "Pulsly-medlem"}
                      </strong>

                      <span>
                        {post.activities?.activity_type} ·{" "}
                        {(
                          Number(
                            post.activities?.distance_meters || 0
                          ) / 1000
                        ).toFixed(2)}{" "}
                        km
                      </span>
                    </div>
                  ))
                )}
              </Card>

              <Card>
                <div className="section-header">
                  <div>
                    <h2>Kommande event</h2>
                    <p>Anmäl dig före start.</p>
                  </div>

                  <button
                    className="icon-button"
                    onClick={() => setPage("events")}
                  >
                    <ChevronRight />
                  </button>
                </div>

                {events.length === 0 ? (
                  <div className="empty small-empty">
                    <CalendarDays size={32} />
                    <strong>Inga event ännu</strong>
                  </div>
                ) : (
                  events.slice(0, 3).map((event) => (
                    <div className="event-row" key={event.id}>
                      <div>
                        <strong>{event.title}</strong>
                        <span>{formatDate(event.starts_at)}</span>
                      </div>

                      <span className="event-type">
                        {event.activity_type}
                      </span>
                    </div>
                  ))
                )}
              </Card>
            </div>
          </>
        )}

        {page === "track" && (
          <>
            <section className="page-title">
              <div>
                <span className="eyebrow">LIVE TRACKING</span>
                <h1>Spåra aktivitet</h1>

                <p>
                  Pulsly registrerar GPS, tid, distans, tempo och
                  kilometerpasseringar.
                </p>
              </div>
            </section>

            <div className="tracker-grid">
              <Card>
                <AppMap
                  positions={positions}
                  active={tracking && !paused}
                />

                {splits.length > 0 && (
                  <div className="splits">
                    <h3>Kilometertider</h3>

                    {splits.map((split) => (
                      <div key={split.split_number}>
                        <strong>{split.split_number} km</strong>
                        <span>
                          {formatPace(split.pace_seconds_per_km)}
                          /km
                        </span>
                        <span>
                          {formatDuration(split.elapsed_seconds)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card>
                <h2>Aktivitet</h2>

                <div className="activity-selector">
                  {activityTypes.map((type) => {
                    const Icon = type.icon;

                    return (
                      <button
                        key={type.id}
                        disabled={tracking}
                        className={
                          activityType.id === type.id
                            ? "selected"
                            : ""
                        }
                        onClick={() => setActivityType(type)}
                      >
                        <Icon size={21} />
                        {type.name}
                      </button>
                    );
                  })}
                </div>

                <label className="field">
                  Koppla till gruppevent

                  <select
                    disabled={tracking}
                    value={selectedEventId}
                    onChange={(event) =>
                      setSelectedEventId(event.target.value)
                    }
                  >
                    <option value="">
                      Ingen gruppaktivitet
                    </option>

                    {upcomingAcceptedEvents.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.title}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="timer">
                  {formatDuration(elapsedSeconds)}
                  <span>Aktiv tid</span>
                </div>

                <div className="tracker-metrics">
                  <Metric
                    icon={Route}
                    label="Distans"
                    value={`${distanceKilometers.toFixed(2)} km`}
                  />

                  <Metric
                    icon={Clock}
                    label="Tempo"
                    value={
                      activityType.paceMode
                        ? `${formatPace(averagePace)}/km`
                        : `${currentSpeed.toFixed(1)} km/h`
                    }
                  />

                  <Metric
                    icon={Zap}
                    label="Grundpoäng"
                    value={currentPoints}
                  />
                </div>

                {selectedEventId && (
                  <div className="pending-bonus">
                    <Users size={18} />

                    <span>
                      Eventaktivitet. 1,5× tilldelas först efter att
                      Pulsly verifierat minst två matchande deltagare.
                    </span>
                  </div>
                )}

                {!tracking ? (
                  <button
                    className="primary full"
                    onClick={startTracking}
                  >
                    <Play size={19} />
                    Starta GPS
                  </button>
                ) : (
                  <div className="tracking-actions">
                    <button
                      className="secondary"
                      onClick={() => setPaused((value) => !value)}
                    >
                      {paused ? <Play /> : <Pause />}
                      {paused ? "Fortsätt" : "Pausa"}
                    </button>

                    <button
                      className="danger"
                      onClick={finishActivity}
                    >
                      <Square size={18} />
                      Avsluta
                    </button>
                  </div>
                )}
              </Card>
            </div>
          </>
        )}

        {page === "events" && (
          <>
            <section className="page-title">
              <div>
                <span className="eyebrow">GEMENSAM AKTIVITET</span>
                <h1>Event</h1>

                <p>
                  Anmälan görs före start. Gruppbonus verifieras
                  automatiskt efter eventet.
                </p>
              </div>

              <button
                className="primary"
                onClick={() => setEventDialog(true)}
              >
                <Plus size={18} />
                Skapa event
              </button>
            </section>

            {invites.some((invite) => invite.status === "invited") && (
              <Card className="invite-card">
                <h2>Inbjudningar</h2>

                {invites
                  .filter((invite) => invite.status === "invited")
                  .map((invite) => (
                    <div className="invite-row" key={invite.id}>
                      <div>
                        <strong>
                          {invite.group_events?.title}
                        </strong>

                        <span>
                          {formatDate(
                            invite.group_events?.starts_at
                          )}
                        </span>
                      </div>

                      <div className="invite-actions">
                        <button
                          className="accept"
                          onClick={() =>
                            respondToInvite(invite.id, "accepted")
                          }
                        >
                          <Check size={18} />
                          Acceptera
                        </button>

                        <button
                          className="decline"
                          onClick={() =>
                            respondToInvite(invite.id, "declined")
                          }
                        >
                          <X size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
              </Card>
            )}

            <div className="event-grid">
              {events.map((event) => {
                const invite = invites.find(
                  (item) => item.event_id === event.id
                );

                return (
                  <Card key={event.id}>
                    <div className="event-card-top">
                      <span className="event-icon">
                        <CalendarDays />
                      </span>

                      <span className={`status ${event.status}`}>
                        {event.status}
                      </span>
                    </div>

                    <h2>{event.title}</h2>
                    <p>{event.description || event.activity_type}</p>

                    <div className="event-details">
                      <span>
                        <Clock size={16} />
                        {formatDate(event.starts_at)}
                      </span>

                      <span>
                        <MapPin size={16} />
                        {event.location_name || "Plats ej angiven"}
                      </span>

                      <span>
                        <Activity size={16} />
                        {event.activity_type}
                      </span>

                      <span>
                        <Users size={16} />
                        Minst {event.minimum_participants} deltagare
                      </span>
                    </div>

                    {invite?.status === "accepted" ? (
                      <div className="joined">
                        <CheckCircle2 size={18} />
                        Du är anmäld
                      </div>
                    ) : event.created_by === session.user.id ? (
                      <div className="created-by-me">
                        Du skapade eventet
                      </div>
                    ) : new Date(event.join_deadline) > new Date() ? (
                      <button
                        className="primary full"
                        onClick={() => joinOpenEvent(event.id)}
                      >
                        Gå med
                      </button>
                    ) : (
                      <div className="closed">Anmälan stängd</div>
                    )}
                  </Card>
                );
              })}
            </div>
          </>
        )}

        {page === "wall" && (
          <>
            <section className="page-title">
              <div>
                <span className="eyebrow">AKTIVITETSVÄGG</span>
                <h1>Pulsly-väggen</h1>

                <p>
                  Medlemmarna bestämmer själva om aktivitet och rutt
                  ska delas.
                </p>
              </div>

              <button className="secondary" onClick={loadPosts}>
                <RefreshCw size={18} />
                Uppdatera
              </button>
            </section>

            <div className="wall">
              {posts.length === 0 ? (
                <Card>
                  <div className="empty">
                    <Share2 size={42} />
                    <strong>Väggen är tom</strong>
                    <span>
                      Avsluta en aktivitet och välj Dela aktivitet.
                    </span>
                  </div>
                </Card>
              ) : (
                posts.map((post) => {
                  const activity = post.activities || {};
                  const likes = post.activity_post_likes || [];
                  const comments = post.activity_post_comments || [];

                  return (
                    <Card className="post" key={post.id}>
                      <div className="post-header">
                        <div className="post-avatar">
                          {initials(post.profiles?.full_name)}
                        </div>

                        <div>
                          <strong>
                            {post.profiles?.full_name ||
                              "Pulsly-medlem"}
                          </strong>

                          <span>{formatDate(post.created_at)}</span>
                        </div>

                        {activity.verified && (
                          <ShieldCheck
                            className="verified-icon"
                            size={21}
                          />
                        )}
                      </div>

                      {post.message && (
                        <p className="post-message">{post.message}</p>
                      )}

                      <h2>{activity.activity_type}</h2>

                      <div className="post-metrics">
                        <Metric
                          icon={Route}
                          label="Distans"
                          value={`${(
                            Number(activity.distance_meters || 0) /
                            1000
                          ).toFixed(2)} km`}
                        />

                        <Metric
                          icon={Timer}
                          label="Tid"
                          value={formatDuration(
                            activity.duration_seconds
                          )}
                        />

                        <Metric
                          icon={Clock}
                          label="Tempo"
                          value={
                            activity.average_pace_seconds_per_km
                              ? `${formatPace(
                                  activity.average_pace_seconds_per_km
                                )}/km`
                              : `${Number(
                                  activity.average_speed_kmh || 0
                                ).toFixed(1)} km/h`
                          }
                        />

                        <Metric
                          icon={Zap}
                          label="Poäng"
                          value={Number(
                            activity.points || 0
                          ).toLocaleString("sv-SE")}
                        />
                      </div>

                      {post.share_route && (
                        <AppMap positions={[]} active={false} />
                      )}

                      <div className="post-actions">
                        <button onClick={() => toggleLike(post)}>
                          <Heart
                            size={20}
                            fill={
                              likes.some(
                                (like) =>
                                  like.user_id === session.user.id
                              )
                                ? "currentColor"
                                : "none"
                            }
                          />

                          {likes.length}
                        </button>

                        <button>
                          <MessageCircle size={20} />
                          {comments.length}
                        </button>

                        <button>
                          <Share2 size={20} />
                          Dela
                        </button>
                      </div>
                    </Card>
                  );
                })
              )}
            </div>
          </>
        )}

        {page === "profile" && (
          <>
            <section className="page-title">
              <div>
                <span className="eyebrow">MIN PROFIL</span>
                <h1>{fullName}</h1>
                <p>{session.user.email}</p>
              </div>
            </section>

            <div className="profile-grid">
              <Card className="profile-card">
                <div className="large-avatar">
                  {initials(fullName)}
                </div>

                <h2>{fullName}</h2>

                <p>
                  {profile?.department || "Pulsly-medlem"}
                  {profile?.location
                    ? ` · ${profile.location}`
                    : ""}
                </p>

                <button className="logout" onClick={signOut}>
                  <LogOut size={18} />
                  Logga ut
                </button>
              </Card>

              <Card>
                <div className="section-header">
                  <div>
                    <h2>Röstcoach</h2>

                    <p>
                      Distans, tid och tempo läses upp under aktiviteten.
                    </p>
                  </div>

                  <button
                    className={`voice-toggle ${
                      settings?.voice_coach_enabled ? "enabled" : ""
                    }`}
                    onClick={() =>
                      saveVoiceSettings({
                        voice_coach_enabled:
                          !settings?.voice_coach_enabled,
                      })
                    }
                  >
                    {settings?.voice_coach_enabled ? (
                      <Mic />
                    ) : (
                      <MicOff />
                    )}
                  </button>
                </div>

                <label className="field">
                  Läs upp varje

                  <select
                    value={settings?.voice_interval_meters || 1000}
                    onChange={(event) =>
                      saveVoiceSettings({
                        voice_interval_meters: Number(
                          event.target.value
                        ),
                      })
                    }
                  >
                    <option value={500}>500 meter</option>
                    <option value={1000}>1 kilometer</option>
                    <option value={2000}>2 kilometer</option>
                  </select>
                </label>

                <div className="setting-list">
                  {[
                    ["voice_total_time", "Total tid"],
                    ["voice_split_time", "Senaste kilometertid"],
                    ["voice_average_pace", "Genomsnittstempo"],
                    ["voice_speed", "Hastighet vid cykling"],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() =>
                        saveVoiceSettings({
                          [key]: !settings?.[key],
                        })
                      }
                    >
                      <span>{label}</span>

                      <span
                        className={`switch ${
                          settings?.[key] ? "on" : ""
                        }`}
                      >
                        <i />
                      </span>
                    </button>
                  ))}
                </div>

                <button
              ssName="secondary full"
                  onClick={() =>
                    speak(
                      "Pulsly röstcoach. En kilometer. Total tid fem minuter och fyrtiotvå sekunder. Genomsnittstempo fem minuter och fyrtiotvå sekunder per kilometer."
                    )
                  }
                >
                  <Mic size={18} />
                  Testa röstcoach
                </button>
              </Card>

              <Card>
                <h2>Hälsoanslutningar</h2>

                <div className="health-service">
                  <Smartphone />
                  <div>
                    <strong>Apple Health</strong>
                    <span>Aktiveras i iPhone-appen</span>
                  </div>
                </div>

                <div className="health-service">
                  <Activity />
                  <div>
                    <strong>Health Connect</strong>
                    <span>Aktiveras i Android-appen</span>
                  </div>
                </div>

                <div className="health-service">
                  <Watch />
                  <div>
                    <strong>Garmin Connect</strong>
                    <span>Planerad integration</span>
                  </div>
                </div>
              </Card>
            </div>
          </>
        )}
      </main>

      <div className="mobile-nav">
        {navigation.map(([id, label, Icon]) => (
          <button
            key={id}
            className={page === id ? "active" : ""}
            onClick={() => setPage(id)}
          >
            <Icon size={20} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {shareDialog && completedActivity && (
        <div className="modal-backdrop">
          <div className="modal">
            <button
              className="modal-close"
              onClick={() => {
                setShareDialog(false);
                setCompletedActivity(null);
              }}
            >
              <X />
            </button>

            <Share2 size={32} className="modal-icon" />

            <h2>Dela aktiviteten?</h2>

            <p>
              Aktiviteten är privat tills du väljer att publicera den.
            </p>

            <textarea
              placeholder="Skriv något om aktiviteten..."
              value={shareMessage}
              onChange={(event) =>
                setShareMessage(event.target.value)
              }
            />

            <label className="field">
              Synlighet

              <select
                value={shareVisibility}
                onChange={(event) =>
                  setShareVisibility(event.target.value)
                }
              >
                <option value="private">Privat</option>
                <option value="members">Pulsly-medlemmar</option>
                <option value="public">Offentligt</option>
              </select>
            </label>

            <button
              className={`choice ${shareRoute ? "selected" : ""}`}
              onClick={() => setShareRoute((value) => !value)}
            >
              <MapPin />
              <span>
                <strong>Dela faktisk GPS-rutt</strong>
                <small>
                  Start och slut döljs med integritetsmarginal.
                </small>
              </span>
              {shareRoute && <Check />}
            </button>

            <button
              className={`choice ${shareSplits ? "selected" : ""}`}
              onClick={() => setShareSplits((value) => !value)}
            >
              <BarChart3 />
              <span>
                <strong>Dela kilometertider</strong>
                <small>Visa splits i aktivitetsinlägget.</small>
              </span>
              {shareSplits && <Check />}
            </button>

            <div className="modal-actions">
              <button
                className="secondary"
                onClick={() => {
                  setShareDialog(false);
                  setCompletedActivity(null);
                }}
              >
                Behåll privat
              </button>

              <button className="primary" onClick={publishActivity}>
                <Send size={18} />
                Publicera
              </button>
            </div>
          </div>
        </div>
      )}

      {eventDialog && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={createEvent}>
            <button
              type="button"
              className="modal-close"
              onClick={() => setEventDialog(false)}
            >
              <X />
            </button>

            <CalendarDays size={32} className="modal-icon" />

            <h2>Skapa event</h2>

            <label className="field">
              Namn
              <input
                value={eventForm.title}
                onChange={(event) =>
                  setEventForm({
                    ...eventForm,
                    title: event.target.value,
                  })
                }
                required
              />
            </label>

            <label className="field">
              Beskrivning
              <textarea
                value={eventForm.description}
                onChange={(event) =>
                  setEventForm({
                    ...eventForm,
                    description: event.target.value,
                  })
                }
              />
            </label>

            <label className="field">
              Aktivitet
              <select
                value={eventForm.activityType}
                onChange={(event) =>
                  setEventForm({
                    ...eventForm,
                    activityType: event.target.value,
                  })
                }
              >
                <option>Promenad</option>
                <option>Löpning</option>
                <option>Cykling</option>
              </select>
            </label>

            <div className="two-columns">
              <label className="field">
                Start
                <input
                  type="datetime-local"
                  value={eventForm.startsAt}
                  onChange={(event) =>
                    setEventForm({
                      ...eventForm,
                      startsAt: event.target.value,
                    })
                  }
                  required
                />
              </label>

              <label className="field">
                Slut
                <input
                  type="datetime-local"
                  value={eventForm.endsAt}
                  onChange={(event) =>
                    setEventForm({
                      ...eventForm,
                      endsAt: event.target.value,
                    })
                  }
                  required
                />
              </label>
            </div>

            <label className="field">
              Sista anmälningstid
              <input
                type="datetime-local"
                value={eventForm.joinDeadline}
                onChange={(event) =>
                  setEventForm({
                    ...eventForm,
                    joinDeadline: event.target.value,
                  })
                }
                required
              />
            </label>

            <label className="field">
              Mötesplats
              <input
                value={eventForm.locationName}
                onChange={(event) =>
                  setEventForm({
                    ...eventForm,
                    locationName: event.target.value,
                  })
                }
              />
            </label>

            <button className="primary full" type="submit">
              Skapa event
            </button>
          </form>
        </div>
      )}

      <style>{`
        :root {
          color: #0f172a;
          background: #eff5f2;
        }

        .app {
          min-height: 100vh;
          padding-bottom: 92px;
        }

        .loading-page {
          min-height: 100vh;
          display: grid;
          place-content: center;
          justify-items: center;
          background: #eff5f2;
          color: #10b981;
        }

        header {
          height: 68px;
          padding: 0 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          position: sticky;
          top: 0;
          z-index: 30;
          background: rgba(255, 255, 255, 0.94);
          border-bottom: 1px solid #e2e8f0;
          backdrop-filter: blur(18px);
        }

        button {
          font: inherit;
        }

        .logo {
          border: 0;
          background: transparent;
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 22px;
          font-weight: 950;
          color: #0f172a;
        }

        .logo > span {
          width: 39px;
          height: 39px;
          display: grid;
          place-items: center;
          border-radius: 13px;
          color: white;
          background: linear-gradient(135deg, #10b981, #14b8a6);
        }

        nav {
          display: flex;
          gap: 3px;
          padding: 4px;
          border-radius: 14px;
          background: #f1f5f9;
        }

        nav button {
          border: 0;
          background: transparent;
          padding: 9px 12px;
          display: flex;
          align-items: center;
          gap: 7px;
          border-radius: 10px;
          color: #64748b;
          font-weight: 800;
        }

        nav button.active {
          color: #059669;
          background: white;
          box-shadow: 0 2px 5px rgba(15, 23, 42, 0.08);
        }

        .avatar-button {
          width: 42px;
          height: 42px;
          border: 0;
          border-radius: 50%;
          background: #0f172a;
          color: white;
          font-size: 11px;
          font-weight: 900;
        }

        main {
          width: min(1180px, calc(100% - 28px));
          margin: auto;
          padding: 32px 0;
        }

        .page-title {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 24px;
        }

        .page-title h1 {
          margin: 4px 0;
          font-size: clamp(31px, 5vw, 44px);
          line-height: 1.05;
        }

        .page-title p,
        .card p {
          color: #64748b;
        }

        .eyebrow {
          color: #059669;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.1em;
        }

        .card {
          padding: 24px;
          background: white;
          border-radius: 26px;
          box-shadow: 0 4px 18px rgba(15, 23, 42, 0.05);
        }

        .card h2 {
          margin-top: 0;
        }

        .verified {
          display: flex;
          align-items: center;
          gap: 7px;
          color: #059669;
          font-weight: 900;
        }

        .home-metrics {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-top: 20px;
        }

        .metric {
          min-width: 0;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          border-radius: 17px;
          background: #f8fafc;
        }

        .metric svg {
          color: #10b981;
        }

        .metric strong {
          font-size: 18px;
        }

        .metric span {
          color: #94a3b8;
          font-size: 11px;
        }

        .dashboard-grid {
          display: grid;
          grid-template-columns: 1.2fr 0.8fr;
          gap: 20px;
          margin-top: 20px;
        }

        .tracker-grid {
          display: grid;
          grid-template-columns: 1fr 390px;
          gap: 20px;
        }

        .profile-grid {
          display: grid;
          grid-template-columns: 320px 1fr;
          gap: 20px;
          align-items: start;
        }

        .section-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 15px;
        }

        .section-header h2,
        .section-header p {
          margin-top: 0;
        }

        .icon-button,
        .voice-toggle {
          width: 44px;
          height: 44px;
          border: 0;
          border-radius: 14px;
          display: grid;
          place-items: center;
        }

        .icon-button {
          color: #059669;
          background: #ecfdf5;
        }

        .voice-toggle {
          color: #64748b;
          background: #f1f5f9;
        }

        .voice-toggle.enabled {
          color: white;
          background: #10b981;
        }

        .primary,
        .secondary,
        .danger,
        .accept,
        .decline,
        .logout {
          border: 0;
          padding: 12px 17px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border-radius: 12px;
          font-weight: 900;
        }

        .primary {
          color: white;
          background: #0f172a;
        }

        .secondary {
          color: #0f172a;
          background: #f1f5f9;
        }

        .danger {
          color: white;
          background: #e11d48;
        }

        .accept {
          color: white;
          background: #059669;
        }

        .decline {
          color: #be123c;
          background: #fff1f2;
        }

        .full {
          width: 100%;
          margin-top: 16px;
        }

        .map {
          height: 320px;
          position: relative;
          overflow: hidden;
          border-radius: 22px;
          background: #e7eee9;
        }

        .map-grid {
          position: absolute;
          inset: -50px;
          opacity: 0.5;
          background-image:
            linear-gradient(#bdcbc2 1px, transparent 1px),
            linear-gradient(90deg, #bdcbc2 1px, transparent 1px);
          background-size: 42px 42px;
          transform: rotate(-7deg);
        }

        .road {
          height: 13px;
          position: absolute;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.9);
        }

        .road-a {
          width: 92%;
          left: 8%;
          top: 25%;
          transform: rotate(14deg);
        }

        .road-b {
          width: 115%;
          left: -8%;
          top: 67%;
          transform: rotate(-8deg);
        }

        .road-c {
          width: 60%;
          left: 20%;
          top: 48%;
          transform: rotate(40deg);
        }

        .route-svg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }

        .map-badge,
        .map-count {
          position: absolute;
          padding: 8px 11px;
          border-radius: 10px;
          background: white;
          box-shadow: 0 3px 12px rgba(15, 23, 42, 0.1);
          font-size: 12px;
          font-weight: 900;
        }

        .map-badge {
          left: 14px;
          top: 14px;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .map-count {
          right: 14px;
          bottom: 14px;
        }

        .activity-selector {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }

        .activity-selector button {
          min-height: 88px;
          border: 1px solid #e2e8f0;
          border-radius: 15px;
          background: white;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          gap: 8px;
          font-weight: 900;
        }

        .activity-selector button.selected {
          color: #047857;
          background: #ecfdf5;
          border-color: #10b981;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 7px;
          margin-top: 16px;
          color: #334155;
          font-size: 13px;
          font-weight: 900;
        }

        .field input,
        .field select,
        textarea {
          width: 100%;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 12px;
          outline: 0;
          background: white;
          color: #0f172a;
        }

        textarea {
          min-height: 95px;
          resize: vertical;
        }

        .timer {
          margin: 28px 0 17px;
          text-align: center;
          font-size: 45px;
          font-weight: 950;
          font-variant-numeric: tabular-nums;
        }

        .timer span {
          display: block;
          margin-top: 3px;
          color: #94a3b8;
          font-size: 12px;
        }

        .tracker-metrics,
        .post-metrics {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }

        .post-metrics {
          grid-template-columns: repeat(4, 1fr);
          margin: 18px 0;
        }

        .tracking-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 16px;
        }

        .pending-bonus {
          margin-top: 15px;
          padding: 13px;
          display: flex;
          align-items: flex-start;
          gap: 9px;
          border-radius: 13px;
          color: #6d28d9;
          background: #f5f3ff;
          font-size: 12px;
          line-height: 1.5;
        }

        .splits {
          margin-top: 20px;
        }

        .splits > div {
          padding: 11px 0;
          display: grid;
          grid-template-columns: 1fr auto auto;
          gap: 18px;
          border-bottom: 1px solid #f1f5f9;
        }

        .event-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 18px;
        }

        .event-card-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .event-icon {
          width: 48px;
          height: 48px;
          display: grid;
          place-items: center;
          border-radius: 15px;
          color: #059669;
          background: #ecfdf5;
        }

        .status,
        .event-type {
          padding: 5px 9px;
          border-radius: 999px;
          color: #047857;
          background: #ecfdf5;
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
        }

        .event-details {
          display: grid;
          gap: 9px;
          margin-top: 18px;
        }

        .event-details span {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #64748b;
          font-size: 13px;
        }

        .joined,
        .created-by-me,
        .closed {
          margin-top: 17px;
          padding: 11px;
          border-radius: 12px;
          text-align: center;
          font-size: 12px;
          font-weight: 900;
        }

        .joined {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          color: #047857;
          background: #ecfdf5;
        }

        .created-by-me {
          color: #1d4ed8;
          background: #eff6ff;
        }

        .closed {
          color: #64748b;
          background: #f1f5f9;
        }

        .invite-card {
          margin-bottom: 20px;
        }

        .invite-row {
          padding: 13px 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
          border-bottom: 1px solid #f1f5f9;
        }

        .invite-row > div:first-child {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .invite-row span {
          color: #64748b;
          font-size: 12px;
        }

        .invite-actions {
          display: flex;
          gap: 8px;
        }

        .event-row,
        .mini-post {
          padding: 13px 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #f1f5f9;
        }

        .event-row > div,
        .mini-post {
          display: flex;
          gap: 4px;
        }

        .event-row > div {
          flex-direction: column;
        }

        .event-row span,
        .mini-post span {
          color: #64748b;
          font-size: 12px;
        }

        .wall {
          width: min(760px, 100%);
          margin: auto;
          display: grid;
          gap: 20px;
        }

        .post-header {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .post-header > div:nth-child(2) {
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        .post-header span {
          color: #94a3b8;
          font-size: 12px;
        }

        .post-avatar,
        .large-avatar {
          display: grid;
          place-items: center;
          border-radius: 50%;
          color: white;
          background: #0f172a;
          font-weight: 950;
        }

        .post-avatar {
          width: 45px;
          height: 45px;
          font-size: 11px;
        }

        .large-avatar {
          width: 96px;
          height: 96px;
          margin: auto;
          font-size: 25px;
        }

        .verified-icon {
          color: #10b981;
        }

        .post-message {
          margin-top: 17px;
        }

        .post-actions {
          display: flex;
          gap: 8px;
          padding-top: 15px;
          border-top: 1px solid #f1f5f9;
        }

        .post-actions button {
          border: 0;
          background: transparent;
          display: flex;
          align-items: center;
          gap: 6px;
          color: #64748b;
          font-weight: 800;
        }

        .profile-card {
          text-align: center;
        }

        .logout {
          width: 100%;
          margin-top: 19px;
          color: #be123c;
          background: #fff1f2;
        }

        .setting-list button {
          width: 100%;
          padding: 14px 0;
          border: 0;
          border-bottom: 1px solid #f1f5f9;
          background: transparent;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-weight: 800;
        }

        .switch {
          width: 43px;
          height: 24px;
          padding: 3px;
          display: flex;
          border-radius: 999px;
          background: #cbd5e1;
        }

        .switch i {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: white;
          transition: transform 0.2s;
        }

        .switch.on {
          background: #10b981;
        }

        .switch.on i {
          transform: translateX(19px);
        }

        .health-service {
          padding: 15px 0;
          display: flex;
          align-items: center;
          gap: 13px;
          border-bottom: 1px solid #f1f5f9;
        }

        .health-service > div {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .health-service span {
          color: #94a3b8;
          font-size: 12px;
        }

        .empty {
          min-height: 180px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          gap: 9px;
          text-align: center;
          color: #94a3b8;
        }

        .small-empty {
          min-height: 130px;
        }

        .empty strong {
          color: #334155;
        }

        .modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 100;
          padding: 18px;
          display: grid;
          place-items: center;
          background: rgba(15, 23, 42, 0.58);
          backdrop-filter: blur(5px);
          overflow-y: auto;
        }

        .modal {
          width: min(540px, 100%);
          max-height: calc(100vh - 36px);
          overflow-y: auto;
          position: relative;
          padding: 28px;
          border-radius: 27px;
          background: white;
          box-shadow: 0 30px 80px rgba(15, 23, 42, 0.28);
        }

        .modal-close {
          width: 39px;
          height: 39px;
          position: absolute;
          right: 17px;
          top: 17px;
          border: 0;
          display: grid;
          place-items: center;
          border-radius: 12px;
          background: #f1f5f9;
        }

        .modal-icon {
          color: #10b981;
        }

        .choice {
          width: 100%;
          margin-top: 12px;
          padding: 14px;
          display: flex;
          align-items: center;
          gap: 12px;
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          text-align: left;
          background: white;
        }

        .choice.selected {
          color: #047857;
          border-color: #10b981;
          background: #ecfdf5;
        }

        .choice span {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .choice small {
          color: #64748b;
        }

        .modal-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 20px;
        }

        .two-columns {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .toast {
          max-width: calc(100vw - 30px);
          position: fixed;
          z-index: 200;
          top: 16px;
          left: 50%;
          transform: translateX(-50%);
          padding: 12px 17px;
          display: flex;
          align-items: center;
          gap: 8px;
          border-radius: 13px;
          color: white;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.22);
        }

        .toast-success {
          background: #0f172a;
        }

        .toast-error {
          background: #be123c;
        }

        .mobile-nav {
          display: none;
        }

        @media (max-width: 900px) {
          header nav {
            display: none;
          }

          .dashboard-grid,
          .tracker-grid,
          .profile-grid {
            grid-template-columns: 1fr;
          }

          .event-grid {
            grid-template-columns: 1fr 1fr;
          }

          .mobile-nav {
            position: fixed;
            z-index: 50;
            left: 0;
            right: 0;
            bottom: 0;
            display: flex;
            justify-content: space-around;
            padding: 8px 2px calc(8px + env(safe-area-inset-bottom));
            border-top: 1px solid #e2e8f0;
            background: rgba(255, 255, 255, 0.96);
            backdrop-filter: blur(16px);
          }

          .mobile-nav button {
            border: 0;
            background: transparent;
            color: #94a3b8;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 3px;
            font-size: 10px;
            font-weight: 900;
          }

          .mobile-nav button.active {
            color: #059669;
          }
        }

        @media (max-width: 640px) {
          header {
            padding: 0 14px;
          }

          main {
            width: min(100% - 24px, 1180px);
            padding: 22px 0;
          }

          .page-title {
            align-items: flex-start;
            flex-direction: column;
          }

          .page-title > button {
            width: 100%;
          }

          .card {
            padding: 18px;
            border-radius: 21px;
          }

          .home-metrics,
          .post-metrics {
            grid-template-columns: 1fr 1fr;
          }

          .event-grid {
            grid-template-columns: 1fr;
          }

          .activity-selector {
            grid-template-columns: 1fr;
          }

          .tracker-metrics {
            grid-template-columns: repeat(3, 1fr);
          }

          .metric {
            padding: 10px;
          }

          .metric strong {
            font-size: 15px;
          }

          .map {
            height: 260px;
          }

          .timer {
            font-size: 38px;
          }

          .two-columns,
          .modal-actions {
            grid-template-columns: 1fr;
          }

          .invite-row {
            align-items: flex-start;
            flex-direction: column;
          }

          .invite-actions {
            width: 100%;
          }

          .invite-actions .accept {
            flex: 1;
          }
        }
      `}</style>
    </div>
  );
}
