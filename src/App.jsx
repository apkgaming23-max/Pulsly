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
  Share2,
  ShieldCheck,
  Smartphone,
  Square,
  Timer,
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
    id: "powerwalk",
    name: "Powerwalk",
    icon: Footprints,
    pointsPerMinute: 12,
    paceMode: true,
  },
  {
    id: "jogging",
    name: "Jogging",
    icon: Activity,
    pointsPerMinute: 14,
    paceMode: true,
  },
  {
    id: "running",
    name: "Löpning",
    icon: Activity,
    pointsPerMinute: 15,
    paceMode: true,
  },
  {
    id: "cycling",
    name: "Cykling",
    icon: Bike,
    pointsPerMinute: 12,
    paceMode: false,
  },
];

const initialEventForm = {
  title: "",
  description: "",
  activityType: "Jogging",
  startsAt: "",
  locationName: "",
};

function Card({ children, className = "" }) {
  return <div className={`card ${className}`}>{children}</div>;
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

function formatDuration(totalSeconds) {
  const value = Math.max(0, Math.round(Number(totalSeconds) || 0));

  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0"
  )}:${String(seconds).padStart(2, "0")}`;
}

function formatPace(secondsPerKm) {
  const value = Number(secondsPerKm);

  if (!Number.isFinite(value) || value <= 0) {
    return "--:--";
  }

  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);

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

  const dLat =
    ((second.latitude - first.latitude) * Math.PI) / 180;

  const dLon =
    ((second.longitude - first.longitude) * Math.PI) / 180;

  const lat1 = (first.latitude * Math.PI) / 180;
  const lat2 = (second.latitude * Math.PI) / 180;

  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLon / 2) ** 2;

  return (
    radius *
    2 *
    Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
  );
}

function ActivityMap({ positions = [], active = false }) {
  return (
    <div className="map">
      <div className="map-grid" />

      <div className="road road-one" />
      <div className="road road-two" />
      <div className="road road-three" />

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
        {positions.length} GPS-punkter
      </div>
    </div>
  );
}

function VerificationPanel({
  summary,
  personalStatus,
  loading,
  onRecheck,
}) {
  if (!summary) {
    return (
      <div className="verification-panel">
        <span>Ingen verifieringsdata ännu.</span>
      </div>
    );
  }

  const completed =
    summary.status === "completed" ||
    Number(summary.verified_participants || 0) >=
      Number(summary.minimum_participants || 2);

  return (
    <div
      className={`verification-panel ${
        completed ? "verified-panel" : ""
      }`}
    >
      <div className="verification-title">
        {completed ? (
          <>
            <CheckCircle2 size={20} />
            <strong>Gemensam aktivitet verifierad</strong>
          </>
        ) : (
          <>
            <RefreshCw size={20} />
            <strong>Verifiering pågår</strong>
          </>
        )}
      </div>

      <div className="verification-grid">
        <div>
          <strong>
            {Number(summary.accepted_participants || 0)}
          </strong>
          <span>Anmälda</span>
        </div>

        <div>
          <strong>
            {Number(summary.submitted_activities || 0)}
          </strong>
          <span>Aktiviteter</span>
        </div>

        <div>
          <strong>
            {Number(summary.verified_participants || 0)}
          </strong>
          <span>Verifierade</span>
        </div>

        <div>
          <strong>
            {Number(summary.pending_verification || 0)}
          </strong>
          <span>Väntar</span>
        </div>
      </div>

      {personalStatus && (
        <div className="my-verification">
          <strong>Din aktivitet</strong>

          {personalStatus.verification_status === "verified" ? (
            <>
              <span className="bonus-success">
                <CheckCircle2 size={16} />
                Gruppbonus 1,5×
              </span>

              <div className="points-breakdown">
                <span>
                  Grundpoäng:{" "}
                  <b>
                    {Number(
                      personalStatus.base_points || 0
                    ).toLocaleString("sv-SE")}
                  </b>
                </span>

                <span>
                  Multiplikator:{" "}
                  <b>{personalStatus.multiplier || 1}×</b>
                </span>

                <span>
                  Totalt:{" "}
                  <b>
                    {Number(
                      personalStatus.final_points || 0
                    ).toLocaleString("sv-SE")}{" "}
                    p
                  </b>
                </span>
              </div>
            </>
          ) : personalStatus.verification_status ===
            "not_verified" ? (
            <span className="not-verified">
              Aktiviteten kunde inte verifieras som gemensam.
            </span>
          ) : personalStatus.verification_status ===
            "waiting_for_activity" ? (
            <span className="waiting">
              Väntar på din aktivitet.
            </span>
          ) : (
            <span className="waiting">
              Väntar på övriga deltagares aktiviteter.
            </span>
          )}
        </div>
      )}

      {!completed && (
        <button
          className="recheck-button"
          disabled={loading}
          onClick={onRecheck}
        >
          <RefreshCw
            size={17}
            className={loading ? "spin" : ""}
          />

          {loading
            ? "Kontrollerar..."
            : "Kontrollera igen"}
        </button>
      )}
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

  const [eventSummaries, setEventSummaries] = useState({});
  const [personalEventStatuses, setPersonalEventStatuses] =
    useState({});

  const [checkingEventId, setCheckingEventId] =
    useState(null);

  const [settings, setSettings] = useState(null);

  const [tracking, setTracking] = useState(false);
  const [paused, setPaused] = useState(false);

  const [activityType, setActivityType] =
    useState(activityTypes[0]);

  const [elapsedSeconds, setElapsedSeconds] =
    useState(0);

  const [distanceKilometers, setDistanceKilometers] =
    useState(0);

  const [positions, setPositions] = useState([]);
  const [splits, setSplits] = useState([]);

  const [selectedEventId, setSelectedEventId] =
    useState("");

  const [eventDialog, setEventDialog] =
    useState(false);

  const [eventForm, setEventForm] =
    useState(initialEventForm);

  const [shareDialog, setShareDialog] =
    useState(false);

  const [completedActivity, setCompletedActivity] =
    useState(null);

  const [shareMessage, setShareMessage] =
    useState("");

  const [shareVisibility, setShareVisibility] =
    useState("members");

  const [shareRoute, setShareRoute] =
    useState(false);

  const [shareSplits, setShareSplits] =
    useState(true);

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
      ? distanceKilometers /
        (elapsedSeconds / 3600)
      : 0;

  const currentPoints = Math.floor(
    (elapsedSeconds / 60) *
      activityType.pointsPerMinute
  );

  const totals = useMemo(() => {
    return activities.reduce(
      (result, activity) => {
        result.points += Number(
          activity.points || 0
        );

        result.steps += Number(
          activity.steps || 0
        );

        result.minutes += Math.round(
          Number(
            activity.duration_seconds || 0
          ) / 60
        );

        result.distance +=
          Number(
            activity.distance_meters || 0
          ) / 1000;

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
      try {
        const {
          data: { session: currentSession },
        } =
          await supabase.auth.getSession();

        if (!mounted) return;

        setSession(currentSession);

        if (currentSession?.user) {
          await loadAll(
            currentSession.user.id
          );
        }
      } catch (error) {
        console.error(error);
      } finally {
        if (mounted) {
          setAuthLoading(false);
        }
      }
    }

    initialise();

    const {
      data: { subscription },
    } =
      supabase.auth.onAuthStateChange(
        async (
          event,
          nextSession
        ) => {
          if (
            event ===
            "PASSWORD_RECOVERY"
          ) {
            return;
          }

          setSession(nextSession);

          if (nextSession?.user) {
            await loadAll(
              nextSession.user.id
            );
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
    if (
      page === "events" &&
      session?.user
    ) {
      refreshEventPage();
    }
  }, [page]);

  useEffect(() => {
    if (!tracking || paused) return;

    const timer =
      window.setInterval(() => {
        setElapsedSeconds(
          (value) => value + 1
        );
      }, 1000);

    return () =>
      window.clearInterval(timer);
  }, [tracking, paused]);

  useEffect(() => {
    if (!tracking || paused) return;

    const intervalMeters =
      Number(
        settings?.voice_interval_meters
      ) || 1000;

    const currentMeters =
      distanceKilometers * 1000;

    const currentInterval =
      Math.floor(
        currentMeters /
          intervalMeters
      );

    const previousInterval =
      Math.floor(
        lastAnnouncedDistance.current /
          intervalMeters
      );

    if (
      currentInterval <=
      previousInterval
    ) {
      return;
    }

    const splitSeconds =
      elapsedSeconds -
      lastSplitElapsed.current;

    const split = {
      split_number:
        currentInterval,

      distance_meters:
        intervalMeters,

      elapsed_seconds:
        elapsedSeconds,

      split_seconds:
        splitSeconds,

      pace_seconds_per_km:
        intervalMeters > 0
          ? splitSeconds /
            (intervalMeters / 1000)
          : null,

      average_speed_kmh:
        elapsedSeconds > 0
          ? distanceKilometers /
            (elapsedSeconds / 3600)
          : null,
    };

    setSplits((current) => [
      ...current,
      split,
    ]);

    lastSplitElapsed.current =
      elapsedSeconds;

    lastAnnouncedDistance.current =
      currentMeters;

    speakSplit(
      currentInterval,
      splitSeconds
    );
  }, [
    distanceKilometers,
    elapsedSeconds,
    paused,
    tracking,
    settings,
  ]);

  useEffect(() => {
    return () => {
      stopGpsWatcher();

      if (
        "speechSynthesis" in window
      ) {
        window.speechSynthesis.cancel();
      }
    };
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
    const { data, error } =
      await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

    if (error) {
      console.error(error);
      return;
    }

    if (data) {
      setProfile(data);
    }
  }

  async function loadActivities(userId) {
    const { data, error } =
      await supabase
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
    const { data, error } =
      await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

    if (error) {
      console.error(error);
    }

    setSettings(
      data || {
        user_id: userId,
        voice_coach_enabled: true,
        voice_interval_meters: 1000,
        voice_total_time: true,
        voice_split_time: true,
        voice_average_pace: true,
        voice_speed: true,
        voice_language: "sv-SE",
      }
    );
  }

  async function loadEvents(userId) {
    const [
      eventResult,
      inviteResult,
    ] = await Promise.all([
      supabase
        .from("group_events")
        .select("*")
        .order("starts_at", {
          ascending: true,
        }),

      supabase
        .from(
          "group_event_invites"
        )
        .select(`
          *,
          group_events (*)
        `)
        .eq(
          "invited_user_id",
          userId
        )
        .order("invited_at", {
          ascending: false,
        }),
    ]);

    if (eventResult.error) {
      console.error(
        eventResult.error
      );

      notifyError(
        eventResult.error.message
      );
    }

    if (inviteResult.error) {
      console.error(
        inviteResult.error
      );
    }

    const nextEvents =
      eventResult.data || [];

    setEvents(nextEvents);
    setInvites(
      inviteResult.data || []
    );

    await loadEventSummaries(
      nextEvents
    );
  }

  async function loadEventSummaries(
    eventList
  ) {
    if (!eventList?.length) {
      setEventSummaries({});
      return;
    }

    const eventIds =
      eventList.map(
        (event) => event.id
      );

    const { data, error } =
      await supabase
        .from(
          "group_event_live_summary"
        )
        .select("*")
        .in(
          "event_id",
          eventIds
        );

    if (error) {
      console.error(error);
      return;
    }

    const nextSummaries = {};

    (data || []).forEach(
      (summary) => {
        nextSummaries[
          summary.event_id
        ] = summary;
      }
    );

    setEventSummaries(
      nextSummaries
    );

    await loadPersonalEventStatuses(
      eventList
    );
  }

  async function loadPersonalEventStatuses(
    eventList
  ) {
    const nextStatuses = {};

    for (const event of eventList) {
      try {
        const { data, error } =
          await supabase.rpc(
            "get_my_group_event_status",
            {
              p_event_id:
                event.id,
            }
          );

        if (!error && data) {
          nextStatuses[
            event.id
          ] = data;
        }
      } catch (error) {
        console.error(error);
      }
    }

    setPersonalEventStatuses(
      nextStatuses
    );
  }

  async function refreshEventPage() {
    if (!session?.user) return;

    await loadEvents(
      session.user.id
    );

    await loadActivities(
      session.user.id
    );
  }

  async function loadPosts() {
    const { data, error } =
      await supabase
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
        .in(
          "visibility",
          ["members", "public"]
        )
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

    window.setTimeout(() => {
      setMessage("");
    }, 3500);
  }

  function notifyError(value) {
    setErrorMessage(value);

    window.setTimeout(() => {
      setErrorMessage("");
    }, 5500);
  }

  function stopGpsWatcher() {
    if (
      watchId.current !== null &&
      navigator.geolocation
    ) {
      navigator.geolocation.clearWatch(
        watchId.current
      );

      watchId.current = null;
    }
  }

  function speak(text) {
    if (
      !settings?.voice_coach_enabled
    ) {
      return;
    }

    if (
      !(
        "speechSynthesis" in window
      )
    ) {
      return;
    }

    window.speechSynthesis.cancel();

    const utterance =
      new SpeechSynthesisUtterance(
        text
      );

    utterance.lang =
      settings?.voice_language ||
      "sv-SE";

    utterance.rate = 0.95;
    utterance.pitch = 1;

    window.speechSynthesis.speak(
      utterance
    );
  }

  function speakSplit(
    splitNumber,
    splitSeconds
  ) {
    const totalMinutes =
      Math.floor(
        elapsedSeconds / 60
      );

    const totalSeconds =
      elapsedSeconds % 60;

    const splitMinutes =
      Math.floor(
        splitSeconds / 60
      );

    const splitRemainder =
      Math.round(
        splitSeconds % 60
      );

    const pace =
      formatPace(averagePace);

    let text =
      `${splitNumber} kilometer.`;

    if (
      settings?.voice_total_time
    ) {
      text +=
        ` Total tid ${totalMinutes} minuter`;

      if (totalSeconds > 0) {
        text +=
          ` och ${totalSeconds} sekunder`;
      }

      text += ".";
    }

    if (
      settings?.voice_split_time
    ) {
      text +=
        ` Senaste kilometer ${splitMinutes} minuter`;

      if (
        splitRemainder > 0
      ) {
        text +=
          ` och ${splitRemainder} sekunder`;
      }

      text += ".";
    }

    if (
      settings?.voice_average_pace &&
      activityType.paceMode &&
      pace !== "--:--"
    ) {
      const [
        paceMinutes,
        paceSeconds,
      ] = pace.split(":");

      text +=
        ` Genomsnittstempo ${paceMinutes} minuter och ${paceSeconds} sekunder per kilometer.`;
    }

    if (
      settings?.voice_speed &&
      !activityType.paceMode
    ) {
      text +=
        ` Genomsnittshastighet ${currentSpeed.toFixed(
          1
        )} kilometer i timmen.`;
    }

    speak(text);
  }

  function startTracking() {
    if (!navigator.geolocation) {
      notifyError(
        "GPS stöds inte av denna enhet."
      );

      return;
    }

    setTracking(true);
    setPaused(false);

    setElapsedSeconds(0);
    setDistanceKilometers(0);

    setPositions([]);
    setSplits([]);

    lastPosition.current =
      null;

    lastAnnouncedDistance.current =
      0;

    lastSplitElapsed.current =
      0;

    speak(
      `${activityType.name} startad.`
    );

    watchId.current =
      navigator.geolocation.watchPosition(
        ({ coords }) => {
          const point = {
            latitude:
              coords.latitude,

            longitude:
              coords.longitude,

            accuracy:
              coords.accuracy,

            recordedAt:
              new Date().toISOString(),
          };

          if (
            lastPosition.current &&
            coords.accuracy <= 80
          ) {
            const segment =
              haversine(
                lastPosition.current,
                point
              );

            if (
              segment > 0 &&
              segment < 0.5
            ) {
              setDistanceKilometers(
                (current) =>
                  current +
                  segment
              );
            }
          }

          lastPosition.current =
            point;

          setPositions(
            (current) => [
              ...current,
              point,
            ]
          );
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

    const endedAt =
      new Date();

    const startedAt =
      new Date(
        endedAt.getTime() -
          elapsedSeconds * 1000
      );

    const durationSeconds =
      Math.max(
        elapsedSeconds,
        60
      );

    const minutes =
      Math.max(
        1,
        Math.round(
          durationSeconds / 60
        )
      );

    const basePoints =
      minutes *
      activityType.pointsPerMinute;

    try {
      const {
        data: activity,
        error,
      } =
        await supabase
          .from("activities")
          .insert({
            user_id:
              session.user.id,

            activity_type:
              activityType.name,

            source: "gps",

            started_at:
              startedAt.toISOString(),

            ended_at:
              endedAt.toISOString(),

            duration_seconds:
              durationSeconds,

            distance_meters:
              Math.round(
                distanceKilometers *
                  1000
              ),

            steps: 0,

            base_points:
              basePoints,

            multiplier: 1,

            is_group_activity:
              false,

            verified:
              positions.length >= 2,

            verification_source:
              "GPS",

            event_id:
              selectedEventId ||
              null,

            average_pace_seconds_per_km:
              activityType.paceMode &&
              distanceKilometers > 0
                ? Math.round(
                    averagePace
                  )
                : null,

            average_speed_kmh:
              elapsedSeconds > 0
                ? Number(
                    currentSpeed.toFixed(
                      2
                    )
                  )
                : null,
          })
          .select()
          .single();

      if (error) throw error;

      if (
        positions.length > 0
      ) {
        const routeRows =
          positions.map(
            (point) => ({
              activity_id:
                activity.id,

              user_id:
                session.user.id,

              latitude:
                point.latitude,

              longitude:
                point.longitude,

              accuracy_meters:
                point.accuracy,

              recorded_at:
                point.recordedAt,
            })
          );

        await supabase
          .from(
            "activity_routes"
          )
          .insert(routeRows);
      }

      if (splits.length > 0) {
        const splitRows =
          splits.map(
            (split) => ({
              ...split,

              activity_id:
                activity.id,

              user_id:
                session.user.id,
            })
          );

        await supabase
          .from(
            "activity_splits"
          )
          .insert(splitRows);
      }

      if (selectedEventId) {
        await supabase
          .from(
            "event_activity_matches"
          )
          .upsert(
            {
              event_id:
                selectedEventId,

              user_id:
                session.user.id,

              activity_id:
                activity.id,

              verification_status:
                "pending",

              group_bonus_awarded:
                false,
            },
            {
              onConflict:
                "event_id,user_id",
            }
          );

        await supabase.rpc(
          "recheck_my_group_event",
          {
            p_event_id:
              selectedEventId,
          }
        );
      }

      setCompletedActivity({
        ...activity,

        savedPositions:
          [...positions],

        savedSplits:
          [...splits],
      });

      setShareDialog(true);

      await loadActivities(
        session.user.id
      );

      if (selectedEventId) {
        await loadEvents(
          session.user.id
        );
      }

      notify(
        selectedEventId
          ? "Aktiviteten sparades. Pulsly kontrollerar nu gruppaktiviteten."
          : `Aktiviteten sparades. +${basePoints} poäng.`
      );

      speak(
        `Aktiviteten avslutad. Distans ${distanceKilometers.toFixed(
          2
        )} kilometer.`
      );
    } catch (error) {
      console.error(error);

      notifyError(
        error.message ||
          "Aktiviteten kunde inte sparas."
      );
    } finally {
      setTracking(false);
      setPaused(false);

      setElapsedSeconds(0);
      setDistanceKilometers(0);

      setPositions([]);
      setSplits([]);

      setSelectedEventId("");

      lastPosition.current =
        null;
    }
  }

  async function createEvent(
    event
  ) {
    event.preventDefault();

    try {
      if (
        !eventForm.title ||
        !eventForm.startsAt
      ) {
        throw new Error(
          "Fyll i namn och starttid."
        );
      }

      const startsAt =
        new Date(
          eventForm.startsAt
        );

      if (
        startsAt <= new Date()
      ) {
        throw new Error(
          "Starttiden måste ligga i framtiden."
        );
      }

      const eventDate =
        startsAt
          .toISOString()
          .slice(0, 10);

      const {
        data: createdEvent,
        error,
      } =
        await supabase
          .from("group_events")
          .insert({
            created_by:
              session.user.id,

            title:
              eventForm.title.trim(),

            description:
              eventForm.description.trim() ||
              null,

            activity_type:
              eventForm.activityType,

            event_date:
              eventDate,

            starts_at:
              startsAt.toISOString(),

            ends_at: null,

            join_deadline:
              null,

            location_name:
              eventForm.locationName.trim() ||
              null,

            status: "open",
          })
          .select()
          .single();

      if (error) throw error;

      const {
        error: joinError,
      } =
        await supabase.rpc(
          "join_group_event",
          {
            p_event_id:
              createdEvent.id,
          }
        );

      if (joinError) {
        throw joinError;
      }

      setEventDialog(false);
      setEventForm(
        initialEventForm
      );

      await loadEvents(
        session.user.id
      );

      notify(
        "Eventet skapades och du är anmäld."
      );
    } catch (error) {
      console.error(error);

      notifyError(
        error.message
      );
    }
  }

  async function joinOpenEvent(
    eventId
  ) {
    try {
      const { error } =
        await supabase.rpc(
          "join_group_event",
          {
            p_event_id:
              eventId,
          }
        );

      if (error) throw error;

      await loadEvents(
        session.user.id
      );

      notify(
        "Du är nu anmäld till eventet."
      );
    } catch (error) {
      console.error(error);

      notifyError(
        error.message ||
          "Anmälan misslyckades."
      );
    }
  }

  async function recheckEvent(
    eventId
  ) {
    setCheckingEventId(
      eventId
    );

    try {
      const {
        data,
        error,
      } =
        await supabase.rpc(
          "recheck_my_group_event",
          {
            p_event_id:
              eventId,
          }
        );

      if (error) {
        throw error;
      }

      await refreshEventPage();

      const verified =
        Number(
          data?.verified_participants ||
            0
        );

      if (verified >= 2) {
        notify(
          `${verified} deltagare verifierade. Gruppbonus uppdaterad.`
        );
      } else {
        notify(
          "Kontrollen är klar. Pulsly väntar fortfarande på fler matchande aktiviteter."
        );
      }
    } catch (error) {
      console.error(error);

      notifyError(
        error.message ||
          "Verifieringen kunde inte köras."
      );
    } finally {
      setCheckingEventId(
        null
      );
    }
  }

  async function respondToInvite(
    inviteId,
    response
  ) {
    const { error } =
      await supabase.rpc(
        "respond_to_group_event",
        {
          p_invite_id:
            inviteId,

          p_response:
            response,
        }
      );

    if (error) {
      notifyError(
        error.message
      );

      return;
    }

    await loadEvents(
      session.user.id
    );

    notify(
      response === "accepted"
        ? "Du är nu anmäld."
        : "Du har avböjt."
    );
  }

  async function publishActivity() {
    if (!completedActivity) {
      return;
    }

    try {
      const {
        data: post,
        error,
      } =
        await supabase
          .from(
            "activity_posts"
          )
          .insert({
            activity_id:
              completedActivity.id,

            user_id:
              session.user.id,

            message:
              shareMessage.trim() ||
              null,

            visibility:
              shareVisibility,

            share_route:
              shareRoute,

            hide_route_start:
              true,

            hide_route_end:
              true,

            privacy_radius_meters:
              200,

            share_splits:
              shareSplits,

            share_points:
              true,

            share_pace:
              true,
          })
          .select()
          .single();

      if (error) throw error;

      if (
        shareRoute &&
        completedActivity
          .savedPositions
          ?.length > 0
      ) {
        const allPoints =
          completedActivity
            .savedPositions;

        const pointsToShare =
          allPoints.length > 10
            ? allPoints.slice(
                2,
                -2
              )
            : allPoints;

        await supabase
          .from(
            "activity_post_routes"
          )
          .insert(
            pointsToShare.map(
              (
                point,
                index
              ) => ({
                post_id:
                  post.id,

                activity_id:
                  completedActivity.id,

                user_id:
                  session.user.id,

                route_order:
                  index,

                latitude:
                  point.latitude,

                longitude:
                  point.longitude,
              })
            )
          );
      }

      setShareDialog(false);
      setCompletedActivity(
        null
      );

      setShareMessage("");
      setShareRoute(false);
      setShareSplits(true);

      await loadPosts();

      setPage("wall");

      notify(
        "Aktiviteten publicerades."
      );
    } catch (error) {
      console.error(error);

      notifyError(
        error.message
      );
    }
  }

  async function toggleLike(post) {
    const liked =
      post.activity_post_likes?.some(
        (like) =>
          like.user_id ===
          session.user.id
      );

    if (liked) {
      await supabase
        .from(
          "activity_post_likes"
        )
        .delete()
        .eq(
          "post_id",
          post.id
        )
        .eq(
          "user_id",
          session.user.id
        );
    } else {
      await supabase
        .from(
          "activity_post_likes"
        )
        .insert({
          post_id:
            post.id,

          user_id:
            session.user.id,
        });
    }

    await loadPosts();
  }

  async function saveVoiceSettings(
    nextValues
  ) {
    const nextSettings = {
      ...settings,
      ...nextValues,

      user_id:
        session.user.id,

      updated_at:
        new Date().toISOString(),
    };

    setSettings(
      nextSettings
    );

    const { error } =
      await supabase
        .from(
          "user_settings"
        )
        .upsert(
          nextSettings,
          {
            onConflict:
              "user_id",
          }
        );

    if (error) {
      notifyError(
        error.message
      );

      return;
    }

    notify(
      "Röstinställningarna sparades."
    );
  }

  async function signOut() {
    stopGpsWatcher();

    window.speechSynthesis?.cancel();

    await supabase.auth.signOut();

    setSession(null);
    setProfile(null);
    setPage("home");
  }

  const acceptedEventIds =
    new Set(
      invites
        .filter(
          (invite) =>
            invite.status ===
            "accepted"
        )
        .map(
          (invite) =>
            invite.event_id
        )
    );

  const upcomingAcceptedEvents =
    events.filter(
      (event) =>
        acceptedEventIds.has(
          event.id
        ) &&
        new Date(
          event.starts_at
        ) > new Date()
    );

  const navigation = [
    ["home", "Hem", Home],
    ["wall", "Vägg", Heart],
    ["track", "Spåra", MapPin],
    [
      "events",
      "Event",
      CalendarDays,
    ],
    ["profile", "Profil", User],
  ];

  if (authLoading) {
    return (
      <div className="loading-page">
        <Activity size={45} />
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
        <button
          className="logo"
          onClick={() =>
            setPage("home")
          }
        >
          <span>
            <Activity size={23} />
          </span>

          Pulsly
        </button>

        <nav>
          {navigation.map(
            ([
              id,
              label,
              Icon,
            ]) => (
              <button
                key={id}
                className={
                  page === id
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setPage(id)
                }
              >
                <Icon size={17} />
                {label}
              </button>
            )
          )}
        </nav>

        <button
          className="avatar-button"
          onClick={() =>
            setPage("profile")
          }
        >
          {initials(fullName)}
        </button>
      </header>

      <main>
        {page === "home" && (
          <>
            <section className="page-title">
              <div>
                <span className="eyebrow">
                  PULSLY
                </span>

                <h1>
                  Hej {firstName}! 👋
                </h1>

                <p>
                  All verifierad
                  aktivitet räknas.
                  Ingen daglig
                  poänggräns.
                </p>
              </div>

              <button
                className="primary"
                onClick={() =>
                  setPage("track")
                }
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
                  value={totals.steps.toLocaleString(
                    "sv-SE"
                  )}
                />

                <Metric
                  icon={Timer}
                  label="Aktiv tid"
                  value={`${totals.minutes} min`}
                />

                <Metric
                  icon={Route}
                  label="Distans"
                  value={`${totals.distance.toFixed(
                    1
                  )} km`}
                />

                <Metric
                  icon={Zap}
                  label="Poäng"
                  value={totals.points.toLocaleString(
                    "sv-SE"
                  )}
                />
              </div>
            </Card>

            <div className="dashboard-grid">
              <Card>
                <h2>Aktivitetsvägg</h2>

                {posts.length === 0 ? (
                  <div className="empty">
                    <Share2 size={36} />

                    <strong>
                      Inga inlägg ännu
                    </strong>

                    <span>
                      Avsluta en
                      aktivitet och dela
                      den på väggen.
                    </span>
                  </div>
                ) : (
                  posts
                    .slice(0, 3)
                    .map((post) => (
                      <div
                        className="mini-row"
                        key={post.id}
                      >
                        <div>
                          <strong>
                            {post
                              .profiles
                              ?.full_name ||
                              "Pulsly-medlem"}
                          </strong>

                          <span>
                            {
                              post
                                .activities
                                ?.activity_type
                            }
                          </span>
                        </div>

                        <ChevronRight />
                      </div>
                    ))
                )}
              </Card>

              <Card>
                <h2>Kommande event</h2>

                {events
                  .filter(
                    (event) =>
                      new Date(
                        event.starts_at
                      ) >
                      new Date()
                  )
                  .slice(0, 3)
                  .map((event) => (
                    <div
                      className="mini-row"
                      key={event.id}
                    >
                      <div>
                        <strong>
                          {event.title}
                        </strong>

                        <span>
                          {formatDate(
                            event.starts_at
                          )}
                        </span>
                      </div>

                      <span className="pill">
                        {
                          event.activity_type
                        }
                      </span>
                    </div>
                  ))}
              </Card>
            </div>
          </>
        )}

        {page === "track" && (
          <>
            <section className="page-title">
              <div>
                <span className="eyebrow">
                  LIVE TRACKING
                </span>

                <h1>
                  Spåra aktivitet
                </h1>

                <p>
                  GPS, distans, tempo
                  och kilometertider
                  registreras live.
                </p>
              </div>
            </section>

            <div className="tracker-grid">
              <Card>
                <ActivityMap
                  positions={positions}
                  active={
                    tracking &&
                    !paused
                  }
                />

                {splits.length >
                  0 && (
                  <div className="splits">
                    <h3>
                      Kilometertider
                    </h3>

                    {splits.map(
                      (split) => (
                        <div
                          key={
                            split.split_number
                          }
                        >
                          <strong>
                            {
                              split.split_number
                            }{" "}
                            km
                          </strong>

                          <span>
                            {formatPace(
                              split.pace_seconds_per_km
                            )}
                            /km
                          </span>

                          <span>
                            {formatDuration(
                              split.elapsed_seconds
                            )}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                )}
              </Card>

              <Card>
                <h2>
                  Välj aktivitet
                </h2>

                <div className="activity-selector">
                  {activityTypes.map(
                    (type) => {
                      const Icon =
                        type.icon;

                      return (
                        <button
                          key={
                            type.id
                          }
                          disabled={
                            tracking
                          }
                          className={
                            activityType.id ===
                            type.id
                              ? "selected"
                              : ""
                          }
                          onClick={() =>
                            setActivityType(
                              type
                            )
                          }
                        >
                          <Icon
                            size={21}
                          />

                          {type.name}
                        </button>
                      );
                    }
                  )}
                </div>

                <label className="field">
                  Gruppevent

                  <select
                    disabled={
                      tracking
                    }
                    value={
                      selectedEventId
                    }
                    onChange={(
                      event
                    ) =>
                      setSelectedEventId(
                        event.target
                          .value
                      )
                    }
                  >
                    <option value="">
                      Ingen
                      gruppaktivitet
                    </option>

                    {upcomingAcceptedEvents.map(
                      (event) => (
                        <option
                          key={
                            event.id
                          }
                          value={
                            event.id
                          }
                        >
                          {
                            event.title
                          }{" "}
                          ·{" "}
                          {
                            event.activity_type
                          }
                        </option>
                      )
                    )}
                  </select>
                </label>

                <div className="timer">
                  {formatDuration(
                    elapsedSeconds
                  )}

                  <span>
                    Aktiv tid
                  </span>
                </div>

                <div className="tracker-metrics">
                  <Metric
                    icon={Route}
                    label="Distans"
                    value={`${distanceKilometers.toFixed(
                      2
                    )} km`}
                  />

                  <Metric
                    icon={Clock}
                    label={
                      activityType.paceMode
                        ? "Tempo"
                        : "Hastighet"
                    }
                    value={
                      activityType.paceMode
                        ? `${formatPace(
                            averagePace
                          )}/km`
                        : `${currentSpeed.toFixed(
                            1
                          )} km/h`
                    }
                  />

                  <Metric
                    icon={Zap}
                    label="Grundpoäng"
                    value={
                      currentPoints
                    }
                  />
                </div>

                {selectedEventId && (
                  <div className="pending-bonus">
                    <Users size={18} />

                    1,5× tilldelas
                    automatiskt efter
                    verifierad
                    gruppaktivitet.
                  </div>
                )}

                {!tracking ? (
                  <button
                    className="primary full"
                    onClick={
                      startTracking
                    }
                  >
                    <Play
                      size={19}
                    />

                    Starta GPS
                  </button>
                ) : (
                  <div className="tracking-actions">
                    <button
                      className="secondary"
                      onClick={() =>
                        setPaused(
                          (value) =>
                            !value
                        )
                      }
                    >
                      {paused ? (
                        <Play />
                      ) : (
                        <Pause />
                      )}

                      {paused
                        ? "Fortsätt"
                        : "Pausa"}
                    </button>

                    <button
                      className="danger"
                      onClick={
                        finishActivity
                      }
                    >
                      <Square />
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
                <span className="eyebrow">
                  GEMENSAM AKTIVITET
                </span>

                <h1>Event</h1>

                <p>
                  Anmäl före start.
                  Pulsly verifierar
                  aktiviteterna
                  automatiskt.
                </p>
              </div>

              <button
                className="primary"
                onClick={() =>
                  setEventDialog(
                    true
                  )
                }
              >
                <Plus size={18} />
                Skapa event
              </button>
            </section>

            <div className="event-grid">
              {events.map(
                (event) => {
                  const invite =
                    invites.find(
                      (item) =>
                        item.event_id ===
                        event.id
                    );

                  const isJoined =
                    invite?.status ===
                    "accepted";

                  const hasStarted =
                    new Date(
                      event.starts_at
                    ) <= new Date();

                  const summary =
                    eventSummaries[
                      event.id
                    ];

                  const personal =
                    personalEventStatuses[
                      event.id
                    ];

                  return (
                    <Card
                      key={event.id}
                    >
                      <div className="event-card-top">
                        <span className="event-icon">
                          <CalendarDays />
                        </span>

                        <span className="pill">
                          {summary?.status ===
                          "completed"
                            ? "Verifierat"
                            : hasStarted
                            ? "Startat"
                            : "Öppet"}
                        </span>
                      </div>

                      <h2>
                        {event.title}
                      </h2>

                      <p>
                        {event.description ||
                          event.activity_type}
                      </p>

                      <div className="event-details">
                        <span>
                          <Clock
                            size={16}
                          />
                          {formatDate(
                            event.starts_at
                          )}
                        </span>

                        <span>
                          <Activity
                            size={16}
                          />
                          {
                            event.activity_type
                          }
                        </span>

                        <span>
                          <MapPin
                            size={16}
                          />
                          {event.location_name ||
                            "Plats ej angiven"}
                        </span>
                      </div>

                      {isJoined ? (
                        <div className="joined">
                          <CheckCircle2
                            size={17}
                          />
                          Du är anmäld
                        </div>
                      ) : !hasStarted ? (
                        <button
                          className="primary full"
                          onClick={() =>
                            joinOpenEvent(
                              event.id
                            )
                          }
                        >
                          Gå med
                        </button>
                      ) : (
                        <div className="closed">
                          Anmälan
                          stängd
                        </div>
                      )}

                      {hasStarted &&
                        isJoined && (
                          <VerificationPanel
                            summary={
                              summary
                            }
                            personalStatus={
                              personal
                            }
                            loading={
                              checkingEventId ===
                              event.id
                            }
                            onRecheck={() =>
                              recheckEvent(
                                event.id
                              )
                            }
                          />
                        )}
                    </Card>
                  );
                }
              )}
            </div>
          </>
        )}

        {page === "wall" && (
          <>
            <section className="page-title">
              <div>
                <span className="eyebrow">
                  AKTIVITETSVÄGG
                </span>

                <h1>
                  Pulsly-väggen
                </h1>

                <p>
                  Dela aktivitet,
                  resultat och valfri
                  GPS-rutt.
                </p>
              </div>

              <button
                className="secondary"
                onClick={loadPosts}
              >
                <RefreshCw
                  size={18}
                />
                Uppdatera
              </button>
            </section>

            <div className="wall">
              {posts.length === 0 ? (
                <Card>
                  <div className="empty">
                    <Share2
                      size={42}
                    />

                    <strong>
                      Väggen är tom
                    </strong>
                  </div>
                </Card>
              ) : (
                posts.map(
                  (post) => {
                    const activity =
                      post.activities ||
                      {};

                    const likes =
                      post.activity_post_likes ||
                      [];

                    const liked =
                      likes.some(
                        (like) =>
                          like.user_id ===
                          session.user.id
                      );

                    return (
                      <Card
                        className="post"
                        key={
                          post.id
                        }
                      >
                        <div className="post-header">
                          <div className="post-avatar">
                            {initials(
                              post
                                .profiles
                                ?.full_name
                            )}
                          </div>

                          <div>
                            <strong>
                              {post
                                .profiles
                                ?.full_name ||
                                "Pulsly-medlem"}
                            </strong>

                            <span>
                              {formatDate(
                                post.created_at
                              )}
                            </span>
                          </div>

                          {activity.verified && (
                            <ShieldCheck className="verified-icon" />
                          )}
                        </div>

                        {post.message && (
                          <p>
                            {
                              post.message
                            }
                          </p>
                        )}

                        <h2>
                          {
                            activity.activity_type
                          }
                        </h2>

                        <div className="post-metrics">
                          <Metric
                            icon={
                              Route
                            }
                            label="Distans"
                            value={`${(
                              Number(
                                activity.distance_meters ||
                                  0
                              ) /
                              1000
                            ).toFixed(
                              2
                            )} km`}
                          />

                          <Metric
                            icon={
                              Timer
                            }
                            label="Tid"
                            value={formatDuration(
                              activity.duration_seconds
                            )}
                          />

                          <Metric
                            icon={
                              Zap
                            }
                            label="Poäng"
                            value={Number(
                              activity.points ||
                                0
                            ).toLocaleString(
                              "sv-SE"
                            )}
                          />
                        </div>

                        {post.share_route && (
                          <ActivityMap />
                        )}

                        <div className="post-actions">
                          <button
                            className={
                              liked
                                ? "liked"
                                : ""
                            }
                            onClick={() =>
                              toggleLike(
                                post
                              )
                            }
                          >
                            <Heart
                              size={
                                20
                              }
                              fill={
                                liked
                                  ? "currentColor"
                                  : "none"
                              }
                            />

                            {
                              likes.length
                            }
                          </button>

                          <button>
                            <MessageCircle
                              size={
                                20
                              }
                            />
                          </button>
                        </div>
                      </Card>
                    );
                  }
                )
              )}
            </div>
          </>
        )}

        {page === "profile" && (
          <>
            <section className="page-title">
              <div>
                <span className="eyebrow">
                  MIN PROFIL
                </span>

                <h1>
                  {fullName}
                </h1>

                <p>
                  {
                    session.user
                      .email
                  }
                </p>
              </div>
            </section>

            <div className="profile-grid">
              <Card className="profile-card">
                <div className="large-avatar">
                  {initials(
                    fullName
                  )}
                </div>

                <h2>
                  {fullName}
                </h2>

                <p>
                  {profile?.department ||
                    "Pulsly-medlem"}
                </p>

                <button
                  className="logout"
                  onClick={signOut}
                >
                  <LogOut
                    size={18}
                  />
                  Logga ut
                </button>
              </Card>

              <Card>
                <div className="section-header">
                  <div>
                    <h2>
                      Röstcoach
                    </h2>

                    <p>
                      Distans, tid och
                      tempo under
                      aktiviteten.
                    </p>
                  </div>

                  <button
                    className={`voice-toggle ${
                      settings?.voice_coach_enabled
                        ? "enabled"
                        : ""
                    }`}
                    onClick={() =>
                      saveVoiceSettings(
                        {
                          voice_coach_enabled:
                            !settings?.voice_coach_enabled,
                        }
                      )
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
                    value={
                      settings?.voice_interval_meters ||
                      1000
                    }
                    onChange={(
                      event
                    ) =>
                      saveVoiceSettings(
                        {
                          voice_interval_meters:
                            Number(
                              event
                                .target
                                .value
                            ),
                        }
                      )
                    }
                  >
                    <option
                      value={
                        500
                      }
                    >
                      500 meter
                    </option>

                    <option
                      value={
                        1000
                      }
                    >
                      1 kilometer
                    </option>

                    <option
                      value={
                        2000
                      }
                    >
                      2 kilometer
                    </option>
                  </select>
                </label>

                <div className="setting-list">
                  {[
                    [
                      "voice_total_time",
                      "Total tid",
                    ],
                    [
                      "voice_split_time",
                      "Senaste kilometertid",
                    ],
                    [
                      "voice_average_pace",
                      "Genomsnittstempo",
                    ],
                    [
                      "voice_speed",
                      "Hastighet vid cykling",
                    ],
                  ].map(
                    ([
                      key,
                      label,
                    ]) => (
                      <button
                        key={
                          key
                        }
                        onClick={() =>
                          saveVoiceSettings(
                            {
                              !settings?.[
                                  key
                                ],
                            }
                          )
                        }
                      >
                        <span>
                          {
                            label
                          }
                        </span>

                        <span
                          className={`switch ${
                            settings?.[
                              key
                            ]
                              ? "on"
                              : ""
                          }`}
                        >
                          <i />
                        </span>
                      </button>
                    )
                  )}
                </div>

                <button
                  className="secondary full"
                  onClick={() =>
                    speak(
                      "Pulsly röstcoach. En kilometer. Total tid fem minuter och fyrtiotvå sekunder."
                    )
                  }
                >
                  <Mic size={18} />
                  Testa röstcoach
                </button>
              </Card>

              <Card>
                <h2>
                  Hälsoanslutningar
                </h2>

                <div className="health-service">
                  <Smartphone />

                  <div>
                    <strong>
                      Apple Health
                    </strong>

                    <span>
                      iPhone
                    </span>
                  </div>
                </div>

                <div className="health-service">
                  <Activity />

                  <div>
                    <strong>
                      Health Connect
                    </strong>

                    <span>
                      Android
                    </span>
                  </div>
                </div>

                <div className="health-service">
                  <Watch />

                  <div>
                    <strong>
                      Garmin
                    </strong>

                    <span>
                      Planerad
                      integration
                    </span>
                  </div>
                </div>
              </Card>
            </div>
          </>
        )}
      </main>

      <div className="mobile-nav">
        {navigation.map(
          ([
            id,
            label,
            Icon,
          ]) => (
            <button
              key={id}
              className={
                page === id
                  ? "active"
                  : ""
              }
              onClick={() =>
                setPage(id)
              }
            >
              <Icon size={20} />
              <span>{label}</span>
            </button>
          )
        )}
      </div>

      {eventDialog && (
        <div className="modal-backdrop">
          <form
            className="modal"
            onSubmit={
              createEvent
            }
          >
            <button
              type="button"
              className="modal-close"
              onClick={() =>
                setEventDialog(
                  false
                )
              }
            >
              <X />
            </button>

            <CalendarDays
              size={32}
              className="modal-icon"
            />

            <h2>
              Skapa event
            </h2>

            <p>
              Anmälan är öppen
              fram till
              starttiden.
            </p>

            <label className="field">
              Namn

              <input
                required
                value={
                  eventForm.title
                }
                onChange={(
                  event
                ) =>
                  setEventForm(
                    {
                      ...eventForm,
                      title:
                        event
                          .target
                          .value,
                    }
                  )
                }
              />
            </label>

            <label className="field">
              Aktivitet

              <select
                value={
                  eventForm.activityType
                }
                onChange={(
                  event
                ) =>
                  setEventForm(
                    {
                      ...eventForm,
                      activityType:
                        event
                          .target
                          .value,
                    }
                  )
                }
              >
                {activityTypes.map(
                  (type) => (
                    <option
                      key={
                        type.id
                      }
                      value={
                        type.name
                      }
                    >
                      {
                        type.name
                      }
                    </option>
                  )
                )}
              </select>
            </label>

            <label className="field">
              Starttid

              <input
                type="datetime-local"
                required
                value={
                  eventForm.startsAt
                }
                onChange={(
                  event
                ) =>
                  setEventForm(
                    {
                      ...eventForm,
                      startsAt:
                        event
                          .target
                          .value,
                    }
                  )
                }
              />
            </label>

            <label className="field">
              Mötesplats

              <input
                value={
                  eventForm.locationName
                }
                onChange={(
                  event
                ) =>
                  setEventForm(
                    {
                      ...eventForm,
                      locationName:
                        event
                          .target
                          .value,
                    }
                  )
                }
              />
            </label>

            <label className="field">
              Beskrivning

              <textarea
                value={
                  eventForm.description
                }
                onChange={(
                  event
                ) =>
                  setEventForm(
                    {
                      ...eventForm,
                      description:
                        event
                          .target
                          .value,
                    }
                  )
                }
              />
            </label>

            <button
              className="primary full"
              type="submit"
            >
              Skapa event och
              anmäl mig
            </button>
          </form>
        </div>
      )}

      {shareDialog &&
        completedActivity && (
          <div className="modal-backdrop">
            <div className="modal">
              <button
                className="modal-close"
                onClick={() => {
                  setShareDialog(
                    false
                  );

                  setCompletedActivity(
                    null
                  );
                }}
              >
                <X />
              </button>

              <Share2
                size={32}
                className="modal-icon"
              />

              <h2>
                Dela aktiviteten?
              </h2>

              <p>
                Aktiviteten är privat
                tills du väljer att
                publicera den.
              </p>

              <textarea
                value={
                  shareMessage
                }
                placeholder="Skriv något..."
                onChange={(
                  event
                ) =>
                  setShareMessage(
                    event.target
                      .value
                  )
                }
              />

              <label className="field">
                Synlighet

                <select
                  value={
                    shareVisibility
                  }
                  onChange={(
                    event
                  ) =>
                    setShareVisibility(
                      event.target
                        .value
                    )
                  }
                >
                  <option value="private">
                    Privat
                  </option>

                  <option value="members">
                    Pulsly-medlemmar
                  </option>

                  <option value="public">
                    Offentligt
                  </option>
                </select>
              </label>

              <button
                className={`choice ${
                  shareRoute
                    ? "selected"
                    : ""
                }`}
                onClick={() =>
                  setShareRoute(
                    (value) =>
                      !value
                  )
                }
              >
                <MapPin />

                <span>
                  <strong>
                    Dela
                    GPS-rutt
                  </strong>

                  <small>
                    Start och slut
                    döljs.
                  </small>
                </span>

                {shareRoute && (
                  <Check />
                )}
              </button>

              <button
                className={`choice ${
                  shareSplits
                    ? "selected"
                    : ""
                }`}
                onClick={() =>
                  setShareSplits(
                    (value) =>
                      !value
                  )
                }
              >
                <BarChart3 />

                <span>
                  <strong>
                    Dela
                    kilometertider
                  </strong>
                </span>

                {shareSplits && (
                  <Check />
                )}
              </button>

              <div className="modal-actions">
                <button
                  className="secondary"
                  onClick={() => {
                    setShareDialog(
                      false
                    );

                    setCompletedActivity(
                      null
                    );
                  }}
                >
                  Behåll privat
                </button>

                <button
                  className="primary"
                  onClick={
                    publishActivity
                  }
                >
                  <Send
                    size={18}
                  />
                  Publicera
                </button>
              </div>
            </div>
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
          position: sticky;
          top: 0;
          z-index: 30;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #e2e8f0;
          background: rgba(255,255,255,.95);
          backdrop-filter: blur(18px);
        }

        button {
          cursor: pointer;
        }

        button:disabled {
          cursor: default;
          opacity: .6;
        }

        .logo {
          border: 0;
          background: transparent;
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 22px;
          font-weight: 950;
        }

        .logo > span {
          width: 39px;
          height: 39px;
          display: grid;
          place-items: center;
          color: white;
          border-radius: 13px;
          background: linear-gradient(135deg,#10b981,#14b8a6);
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
          padding: 9px 12px;
          display: flex;
          gap: 7px;
          align-items: center;
          border-radius: 10px;
          background: transparent;
          color: #64748b;
          font-weight: 800;
        }

        nav button.active {
          color: #059669;
          background: white;
          box-shadow: 0 2px 5px rgba(15,23,42,.08);
        }

        .avatar-button {
          width: 42px;
          height: 42px;
          border: 0;
          border-radius: 50%;
          color: white;
          background: #0f172a;
          font-size: 11px;
          font-weight: 900;
        }

        main {
          width: min(1180px,calc(100% - 28px));
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
          font-size: clamp(31px,5vw,44px);
        }

        .page-title p,
        .card p {
          color: #64748b;
        }

        .eyebrow {
          color: #059669;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: .1em;
        }

        .card {
          padding: 24px;
          border-radius: 26px;
          background: white;
          box-shadow: 0 4px 18px rgba(15,23,42,.05);
        }

        .home-metrics {
          display: grid;
          grid-template-columns: repeat(4,1fr);
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

        .verified {
          display: flex;
          align-items: center;
          gap: 7px;
          color: #059669;
          font-weight: 900;
        }

        .dashboard-grid {
          display: grid;
          grid-template-columns: 1.2fr .8fr;
          gap: 20px;
          margin-top: 20px;
        }

        .tracker-grid {
          display: grid;
          grid-template-columns: 1fr 400px;
          gap: 20px;
        }

        .profile-grid {
          display: grid;
          grid-template-columns: 320px 1fr;
          gap: 20px;
          align-items: start;
        }

        .event-grid {
          display: grid;
          grid-template-columns: repeat(2,1fr);
          gap: 18px;
        }

        .event-card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
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

        .event-details {
          display: grid;
          gap: 9px;
          margin-top: 16px;
        }

        .event-details span {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #64748b;
          font-size: 13px;
        }

        .pill {
          padding: 5px 9px;
          border-radius: 999px;
          color: #047857;
          background: #ecfdf5;
          font-size: 10px;
          font-weight: 900;
        }

        .joined,
        .closed {
          margin-top: 15px;
          padding: 11px;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 7px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 900;
        }

        .joined {
          color: #047857;
          background: #ecfdf5;
        }

        .closed {
          color: #64748b;
          background: #f1f5f9;
        }

        .verification-panel {
          margin-top: 17px;
          padding: 15px;
          border-radius: 16px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
        }

        .verified-panel {
          border-color: #a7f3d0;
          background: #ecfdf5;
        }

        .verification-title {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 14px;
          color: #475569;
        }

        .verified-panel .verification-title {
          color: #047857;
        }

        .verification-grid {
          display: grid;
          grid-template-columns: repeat(4,1fr);
          gap: 6px;
        }

        .verification-grid > div {
          padding: 9px 5px;
          display: flex;
          flex-direction: column;
          text-align: center;
          border-radius: 10px;
          background: white;
        }

        .verification-grid strong {
          font-size: 18px;
        }

        .verification-grid span {
          color: #94a3b8;
          font-size: 9px;
        }

        .my-verification {
          margin-top: 14px;
          padding-top: 13px;
          border-top: 1px solid #e2e8f0;
          display: grid;
          gap: 8px;
        }

        .bonus-success {
          display: flex;
          gap: 6px;
          align-items: center;
          color: #047857;
          font-weight: 900;
        }

        .points-breakdown {
          display: grid;
          grid-template-columns: repeat(3,1fr);
          gap: 5px;
        }

        .points-breakdown span {
          padding: 7px;
          display: flex;
          flex-direction: column;
          border-radius: 9px;
          background: white;
          font-size: 10px;
        }

        .waiting {
          color: #92400e;
        }

        .not-verified {
          color: #be123c;
        }

        .recheck-button {
          width: 100%;
          margin-top: 13px;
          padding: 10px;
          border: 0;
          border-radius: 10px;
          background: #0f172a;
          color: white;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 7px;
          font-weight: 800;
        }

        .activity-selector {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .activity-selector button {
          min-height: 76px;
          border: 1px solid #e2e8f0;
          border-radius: 15px;
          background: white;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          gap: 7px;
          font-weight: 900;
        }

        .activity-selector button.selected {
          border-color: #10b981;
          color: #047857;
          background: #ecfdf5;
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
        }

        .timer span {
          display: block;
          color: #94a3b8;
          font-size: 12px;
        }

        .tracker-metrics,
        .post-metrics {
          display: grid;
          grid-template-columns: repeat(3,1fr);
          gap: 8px;
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
          gap: 9px;
          border-radius: 13px;
          color: #6d28d9;
          background: #f5f3ff;
          font-size: 12px;
        }

        .primary,
        .secondary,
        .danger,
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

        .full {
          width: 100%;
          margin-top: 16px;
        }

        .profile-card {
          text-align: center;
        }

        .large-avatar,
        .post-avatar {
          display: grid;
          place-items: center;
          border-radius: 50%;
          color: white;
          background: #0f172a;
          font-weight: 950;
        }

        .large-avatar {
          width: 96px;
          height: 96px;
          margin: auto;
          font-size: 25px;
        }

        .post-avatar {
          width: 45px;
          height: 45px;
          font-size: 11px;
        }

        .logout {
          width: 100%;
          margin-top: 20px;
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
          align-items: center;
          justify-content: space-between;
          font-weight: 800;
        }

        .switch {
          width: 43px;
          height: 24px;
          padding: 3px;
          border-radius: 999px;
          display: flex;
          background: #cbd5e1;
        }

        .switch i {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: white;
          transition: transform .2s;
        }

        .switch.on {
          background: #10b981;
        }

        .switch.on i {
          transform: translateX(19px);
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: start;
          gap: 15px;
        }

        .voice-toggle {
          width: 44px;
          height: 44px;
          border: 0;
          display: grid;
          place-items: center;
          border-radius: 14px;
          background: #f1f5f9;
        }

        .voice-toggle.enabled {
          color: white;
          background: #10b981;
        }

        .health-service {
          padding: 15px 0;
          display: flex;
          gap: 13px;
          align-items: center;
          border-bottom: 1px solid #f1f5f9;
        }

        .health-service > div {
          display: flex;
          flex-direction: column;
        }

        .health-service span {
          color: #94a3b8;
          font-size: 12px;
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
          opacity: .5;
          background-image:
            linear-gradient(#bdcbc2 1px,transparent 1px),
            linear-gradient(90deg,#bdcbc2 1px,transparent 1px);
          background-size: 42px 42px;
          transform: rotate(-7deg);
        }

        .road {
          height: 13px;
          position: absolute;
          border-radius: 20px;
          background: rgba(255,255,255,.9);
        }

        .road-one {
          width: 92%;
          left: 8%;
          top: 25%;
          transform: rotate(14deg);
        }

        .road-two {
          width: 115%;
          left: -8%;
          top: 67%;
          transform: rotate(-8deg);
        }

        .road-three {
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
          font-size: 12px;
          font-weight: 900;
        }

        .map-badge {
          top: 14px;
          left: 14px;
          display: flex;
          gap: 6px;
        }

        .map-count {
          right: 14px;
          bottom: 14px;
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

        .wall {
          width: min(760px,100%);
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

        .verified-icon {
          color: #10b981;
        }

        .post-metrics {
          margin: 18px 0;
        }

        .post-actions {
          display: flex;
          gap: 10px;
          border-top: 1px solid #f1f5f9;
          padding-top: 14px;
        }

        .post-actions button {
          border: 0;
          background: transparent;
        }

        .post-actions .liked {
          color: #e11d48;
        }

        .mini-row {
          padding: 13px 0;
          display: flex;
          justify-content: space-between;
          border-bottom: 1px solid #f1f5f9;
        }

        .mini-row > div {
          display: flex;
          flex-direction: column;
        }

        .empty {
          min-height: 140px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          gap: 8px;
          color: #94a3b8;
        }

        .modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 100;
          padding: 18px;
          display: grid;
          place-items: center;
          background: rgba(15,23,42,.58);
          backdrop-filter: blur(5px);
        }

        .modal {
          width: min(540px,100%);
          max-height: calc(100vh - 36px);
          overflow-y: auto;
          position: relative;
          padding: 28px;
          border-radius: 27px;
          background: white;
        }

        .modal-close {
          width: 39px;
          height: 39px;
          position: absolute;
          right: 17px;
          top: 17px;
          border: 0;
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
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          display: flex;
          align-items: center;
          gap: 12px;
          text-align: left;
          background: white;
        }

        .choice.selected {
          border-color: #10b981;
          color: #047857;
          background: #ecfdf5;
        }

        .choice span {
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        .modal-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 20px;
        }

        .toast {
          position: fixed;
          z-index: 200;
          top: 16px;
          left: 50%;
          transform: translateX(-50%);
          max-width: calc(100vw - 30px);
          padding: 12px 17px;
          border-radius: 13px;
          color: white;
        }

        .toast-success {
          background: #0f172a;
        }

        .toast-error {
          background: #be123c;
        }

        .spin {
          animation: spin .8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .mobile-nav {
          display: none;
        }

        @media (max-width:900px) {
          header nav {
            display: none;
          }

          .dashboard-grid,
          .tracker-grid,
          .profile-grid,
          .event-grid {
            grid-template-columns: 1fr;
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
            background: rgba(255,255,255,.96);
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

        @media (max-width:640px) {
          header {
            padding: 0 14px;
          }

          main {
            width: calc(100% - 24px);
            padding: 22px 0;
          }

          .page-title {
            flex-direction: column;
            align-items: stretch;
          }

          .home-metrics {
            grid-template-columns: 1fr 1fr;
          }

          .card {
            padding: 18px;
          }

          .activity-selector {
            grid-template-columns: 1fr 1fr;
          }

          .tracker-metrics {
            grid-template-columns: repeat(3,1fr);
          }

          .verification-grid {
            grid-template-columns: 1fr 1fr;
          }

          .points-breakdown {
            grid-template-columns: 1fr;
          }

          .map {
            height: 260px;
          }

          .modal-actions {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
