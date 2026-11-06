import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  BarChart3,
  Bike,
  CheckCircle2,
  Flame,
  Footprints,
  Home,
  LogOut,
  MapPin,
  Medal,
  Pause,
  Play,
  RefreshCw,
  Route,
  ShieldCheck,
  Smartphone,
  Square,
  Trophy,
  User,
  Users,
  Watch,
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
  },
  {
    id: "run",
    name: "Löpning",
    icon: Activity,
    pointsPerMinute: 15,
  },
  {
    id: "bike",
    name: "Cykling",
    icon: Bike,
    pointsPerMinute: 12,
  },
  {
    id: "group",
    name: "Gemensam aktivitet",
    icon: Users,
    pointsPerMinute: 15,
    multiplier: 1.5,
  },
];

const demoActivities = [
  {
    id: "demo-1",
    name: "Promenad",
    minutes: 42,
    distance: 4.2,
    steps: 5660,
    points: 420,
    source: "Apple Hälsa",
    verified: true,
    group: false,
    demo: true,
  },
  {
    id: "demo-2",
    name: "Gemensam löprunda",
    minutes: 28,
    distance: 4.8,
    steps: 6120,
    points: 630,
    source: "GPS",
    verified: true,
    group: true,
    demo: true,
  },
];

const demoRanking = [
  ["Sara Lind", "Produktion", 18420],
  ["Nermin Culum", "Broms & Hydraulik", 17690],
  ["Johan Berg", "Logistik", 16980],
  ["Emma Nilsson", "Kvalitet", 15640],
  ["Mikael Hansen", "Produktion", 14910],
];

function haversine(a, b) {
  const radius = 6371;

  const dLat =
    ((b.latitude - a.latitude) * Math.PI) / 180;

  const dLon =
    ((b.longitude - a.longitude) * Math.PI) / 180;

  const lat1 =
    (a.latitude * Math.PI) / 180;

  const lat2 =
    (b.latitude * Math.PI) / 180;

  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLon / 2) ** 2;

  return (
    radius *
    2 *
    Math.atan2(
      Math.sqrt(value),
      Math.sqrt(1 - value)
    )
  );
}

function formatTime(seconds) {
  const hours = String(
    Math.floor(seconds / 3600)
  ).padStart(2, "0");

  const minutes = String(
    Math.floor((seconds % 3600) / 60)
  ).padStart(2, "0");

  const secs = String(
    seconds % 60
  ).padStart(2, "0");

  return `${hours}:${minutes}:${secs}`;
}

function initials(name) {
  if (!name) return "PU";

  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function Card({
  children,
  className = "",
}) {
  return (
    <div className={`card ${className}`}>
      {children}
    </div>
  );
}

function Metric({
  icon: Icon,
  value,
  label,
}) {
  return (
    <div className="metric">
      <Icon size={20} />

      <strong>{value}</strong>

      <span>{label}</span>
    </div>
  );
}

function MapView({
  positions,
  tracking,
}) {
  return (
    <div className="map">
      <div className="map-grid" />

      <div className="road road-one" />
      <div className="road road-two" />
      <div className="road road-three" />

      <svg
        viewBox="0 0 600 300"
        preserveAspectRatio="none"
        className="route-svg"
      >
        <path
          d="M75 245 C125 215 145 180 205 190 S280 145 325 155 S405 105 520 70"
          fill="none"
          stroke="#10b981"
          strokeWidth="9"
          strokeLinecap="round"
        />

        <circle
          cx="75"
          cy="245"
          r="10"
          fill="white"
          stroke="#10b981"
          strokeWidth="6"
        />

        <circle
          cx="520"
          cy="70"
          r="12"
          fill={
            tracking
              ? "#10b981"
              : "#0f172a"
          }
          stroke="white"
          strokeWidth="5"
        />
      </svg>

      <div className="gps-label">
        <MapPin size={16} />

        {tracking
          ? "GPS aktiv"
          : "Förhandsvisning"}
      </div>

      <div className="position-label">
        {positions.length} GPS-punkter
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] =
    useState(null);

  const [profile, setProfile] =
    useState(null);

  const [authLoading, setAuthLoading] =
    useState(true);

  const [page, setPage] =
    useState("home");

  const [activities, setActivities] =
    useState([]);

  const [activitiesLoading, setActivitiesLoading] =
    useState(false);

  const [activityType, setActivityType] =
    useState(activityTypes[0]);

  const [tracking, setTracking] =
    useState(false);

  const [paused, setPaused] =
    useState(false);

  const [seconds, setSeconds] =
    useState(0);

  const [distance, setDistance] =
    useState(0);

  const [positions, setPositions] =
    useState([]);

  const [syncing, setSyncing] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [errorMessage, setErrorMessage] =
    useState("");

  const watchId = useRef(null);
  const lastPosition = useRef(null);

  const fullName =
    profile?.full_name ||
    session?.user?.user_metadata?.full_name ||
    session?.user?.email ||
    "Pulsly-användare";

  const firstName =
    fullName.includes("@")
      ? "där"
      : fullName.split(" ")[0];

  const activityList =
    activities.length > 0
      ? activities
      : demoActivities;

  const todayPoints = useMemo(
    () =>
      activityList.reduce(
        (total, activity) =>
          total +
          Number(activity.points || 0),
        0
      ),
    [activityList]
  );

  const todaySteps = useMemo(
    () =>
      activityList.reduce(
        (total, activity) =>
          total +
          Number(activity.steps || 0),
        0
      ),
    [activityList]
  );

  const todayMinutes = useMemo(
    () =>
      activityList.reduce(
        (total, activity) =>
          total +
          Number(activity.minutes || 0),
        0
      ),
    [activityList]
  );

  const todayDistance = useMemo(
    () =>
      activityList.reduce(
        (total, activity) =>
          total +
          Number(activity.distance || 0),
        0
      ),
    [activityList]
  );

  const multiplier =
    activityType.multiplier || 1;

  const currentPoints =
    Math.floor(
      (seconds / 60) *
        activityType.pointsPerMinute *
        multiplier
    );

  useEffect(() => {
    let mounted = true;

    async function initialiseAuth() {
      try {
        const {
          data: { session: currentSession },
        } =
          await supabase.auth.getSession();

        if (!mounted) return;

        setSession(currentSession);

        if (currentSession?.user) {
          await loadProfile(
            currentSession.user.id
          );

          await loadActivities(
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

    initialiseAuth();

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
            await loadProfile(
              nextSession.user.id
            );

            await loadActivities(
              nextSession.user.id
            );
          } else {
            setProfile(null);
            setActivities([]);
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
    if (!tracking || paused) {
      return;
    }

    const timer =
      window.setInterval(() => {
        setSeconds(
          (value) => value + 1
        );
      }, 1000);

    return () =>
      window.clearInterval(timer);
  }, [tracking, paused]);

  useEffect(() => {
    return () => {
      stopGpsWatcher();
    };
  }, []);

  async function loadProfile(userId) {
    const { data, error } =
      await supabase
        .from("profiles")
        .select(
          "id, full_name, avatar_url, department, location, role"
        )
        .eq("id", userId)
        .maybeSingle();

    if (error) {
      console.error(
        "Kunde inte läsa profil:",
        error
      );

      return;
    }

    if (data) {
      setProfile(data);
    }
  }

  async function loadActivities(
    userId
  ) {
    setActivitiesLoading(true);

    try {
      const { data, error } =
        await supabase
          .from("activities")
          .select("*")
          .eq("user_id", userId)
          .order(
            "started_at",
            {
              ascending: false,
            }
          )
          .limit(100);

      if (error) {
        throw error;
      }

      const mapped = (data || []).map(
        (activity) => ({
          id: activity.id,
          name:
            activity.activity_type,
          minutes: Math.round(
            Number(
              activity.duration_seconds ||
                0
            ) / 60
          ),
          distance:
            Number(
              activity.distance_meters ||
                0
            ) / 1000,
          steps:
            Number(
              activity.steps || 0
            ),
          points:
            Number(
              activity.points || 0
            ),
          source:
            activity.verification_source ||
            activity.source ||
            "Pulsly",
          verified:
            activity.verified,
          group:
            activity.is_group_activity,
        })
      );

      setActivities(mapped);
    } catch (error) {
      console.error(
        "Kunde inte läsa aktiviteter:",
        error
      );
    } finally {
      setActivitiesLoading(false);
    }
  }

  function notify(text) {
    setMessage(text);

    window.setTimeout(() => {
      setMessage("");
    }, 3500);
  }

  function notifyError(text) {
    setErrorMessage(text);

    window.setTimeout(() => {
      setErrorMessage("");
    }, 5000);
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

  function startTracking() {
    if (!navigator.geolocation) {
      notifyError(
        "GPS stöds inte av den här webbläsaren."
      );

      return;
    }

    setTracking(true);
    setPaused(false);
    setSeconds(0);
    setDistance(0);
    setPositions([]);

    lastPosition.current = null;

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
          };

          if (
            lastPosition.current &&
            coords.accuracy < 80
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
              setDistance(
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
        (error) => {
          console.error(error);

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
          seconds * 1000
      );

    const minutes =
      Math.max(
        1,
        Math.round(seconds / 60)
      );

    const basePoints =
      minutes *
      activityType.pointsPerMinute;

    const isGroup =
      activityType.multiplier ===
      1.5;

    const finalMultiplier =
      isGroup ? 1.5 : 1;

    try {
      const {
        data: createdActivity,
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
              Math.max(seconds, 60),

            distance_meters:
              Math.round(
                distance * 1000
              ),

            steps: 0,

            base_points:
              basePoints,

            multiplier:
              finalMultiplier,

            is_group_activity:
              isGroup,

            verified:
              positions.length > 0,

            verification_source:
              "GPS",
          })
          .select()
          .single();

      if (error) {
        throw error;
      }

      if (
        createdActivity &&
        positions.length > 0
      ) {
        const routeRows =
          positions.map(
            (point) => ({
              activity_id:
                createdActivity.id,

              user_id:
                session.user.id,

              latitude:
                point.latitude,

              longitude:
                point.longitude,

              accuracy_meters:
                point.accuracy,
            })
          );

        const { error: routeError } =
          await supabase
            .from(
              "activity_routes"
            )
            .insert(routeRows);

        if (routeError) {
          console.error(
            "Rutten kunde inte sparas:",
            routeError
          );
        }
      }

      await loadActivities(
        session.user.id
      );

      notify(
        `Aktiviteten sparades. +${Math.round(
          basePoints *
            finalMultiplier
        )} poäng`
      );
    } catch (error) {
      console.error(error);

      notifyError(
        `Aktiviteten kunde inte sparas: ${
          error.message ||
          "Okänt fel"
        }`
      );
    } finally {
      setTracking(false);
      setPaused(false);
      setSeconds(0);
      setDistance(0);
      setPositions([]);
      lastPosition.current =
        null;
    }
  }

  async function signOut() {
    stopGpsWatcher();

    await supabase.auth.signOut();

    setSession(null);
    setProfile(null);
    setActivities([]);
    setPage("home");
  }

  function syncHealth() {
    setSyncing(true);

    window.setTimeout(() => {
      setSyncing(false);

      notify(
        "Synkroniseringen är förberedd. Apple Health och Health Connect kopplas in i mobilversionen."
      );
    }, 1000);
  }

  const navigation = [
    ["home", "Hem", Home],
    ["track", "Spåra", MapPin],
    [
      "challenges",
      "Utmaningar",
      Trophy,
    ],
    [
      "ranking",
      "Topplista",
      BarChart3,
    ],
    ["profile", "Profil", User],
  ];

  if (authLoading) {
    return (
      <div className="loading-page">
        <div className="loading-logo">
          <Activity size={34} />
        </div>

        <h2>Laddar Pulsly...</h2>

        <style>{`
          .loading-page {
            min-height: 100vh;
            display: grid;
            place-content: center;
            text-align: center;
            background: #eff5f2;
            color: #0f172a;
          }

          .loading-logo {
            width: 65px;
            height: 65px;
            margin: 0 auto 12px;
            display: grid;
            place-items: center;
            border-radius: 20px;
            color: white;
            background: linear-gradient(
              135deg,
              #10b981,
              #14b8a6
            );
          }
        `}</style>
      </div>
    );
  }

  if (!session) {
    return <Auth />;
  }

  return (
    <div className="app">
      {message && (
        <div
          className="toast success-toast"
          onClick={() =>
            setMessage("")
          }
        >
          <CheckCircle2
            size={18}
          />

          {message}
        </div>
      )}

      {errorMessage && (
        <div
          className="toast error-toast"
          onClick={() =>
            setErrorMessage("")
          }
        >
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
          <span className="logo-icon">
            <Activity
              size={23}
            />
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
                    ? "nav-active"
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
          className="profile-button"
          onClick={() =>
            setPage("profile")
          }
          title={fullName}
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
                  Ingen daglig
                  poänggräns. All
                  verifierad aktivitet
                  räknas.
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

            <Card className="health-card">
              <div className="health-intro">
                <div>
                  <div className="verified">
                    <ShieldCheck
                      size={18}
                    />

                    Verifierad
                    hälsodata
                  </div>

                  <div className="step-number">
                    {todaySteps.toLocaleString(
                      "sv-SE"
                    )}{" "}
                    steg
                  </div>

                  <p>
                    All aktivitet under
                    dagen samlas i
                    Pulsly.
                  </p>
                </div>

                {activities.length ===
                  0 && (
                  <span className="demo-label">
                    Demodata tills första
                    aktiviteten sparas
                  </span>
                )}
              </div>

              <div className="metrics">
                <Metric
                  icon={Flame}
                  value={`${todayMinutes} min`}
                  label="Aktiv tid"
                />

                <Metric
                  icon={Route}
                  value={`${todayDistance.toFixed(
                    1
                  )} km`}
                  label="Distans"
                />

                <Metric
                  icon={Zap}
                  value={todayPoints.toLocaleString(
                    "sv-SE"
                  )}
                  label="Poäng"
                />
              </div>

              <div className="connections">
                <span>
                  <Smartphone
                    size={16}
                  />

                  Apple Health
                </span>

                <span>
                  <Activity
                    size={16}
                  />

                  Health Connect
                </span>

                <span>
                  <Watch size={16} />

                  Garmin
                </span>

                <button
                  onClick={
                    syncHealth
                  }
                >
                  <RefreshCw
                    size={16}
                    className={
                      syncing
                        ? "spin"
                        : ""
                    }
                  />

                  {syncing
                    ? "Synkar..."
                    : "Synka nu"}
                </button>
              </div>
            </Card>

            <div className="home-grid">
              <Card>
                <h2>
                  Verifierad aktivitet
                </h2>

                <p>
                  Starta en aktivitet så
                  använder Pulsly GPS,
                  tid och rörelsedata för
                  verifiering.
                </p>

                <MapView
                  positions={[]}
                  tracking={false}
                />

                <button
                  className="primary full"
                  onClick={() =>
                    setPage("track")
                  }
                >
                  <Play size={18} />

                  Starta spårning
                </button>
              </Card>

              <Card>
                <h2>
                  Senaste aktiviteter
                </h2>

                {activitiesLoading ? (
                  <p>
                    Läser aktiviteter...
                  </p>
                ) : (
                  <div className="activity-list">
                    {activityList
                      .slice(0, 6)
                      .map(
                        (activity) => (
                          <div
                            className="activity-row"
                            key={
                              activity.id
                            }
                          >
                            <div>
                              <strong>
                                {
                                  activity.name
                                }
                              </strong>

                              {activity.group && (
                                <span className="multiplier">
                                  1,5×
                                </span>
                              )}

                              <small>
                                <ShieldCheck
                                  size={13}
                                />

                                {
                                  activity.source
                                }{" "}
                                ·{" "}
                                {
                                  activity.minutes
                                }{" "}
                                min
                              </small>
                            </div>

                            <b>
                              +
                              {
                                activity.points
                              }
                            </b>
                          </div>
                        )
                      )}
                  </div>
                )}
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
                  GPS, aktivitetstid och
                  rörelsedata verifierar
                  aktiviteten.
                </p>
              </div>
            </section>

            <div className="tracker-grid">
              <Card>
                <MapView
                  positions={
                    positions
                  }
                  tracking={
                    tracking &&
                    !paused
                  }
                />
              </Card>

              <Card>
                <h2>
                  Välj aktivitet
                </h2>

                <div className="activity-types">
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

                          <span>
                            {type.name}
                          </span>

                          {type.multiplier && (
                            <small>
                              1,5×
                              poäng
                            </small>
                          )}
                        </button>
                      );
                    }
                  )}
                </div>

                <div className="timer">
                  {formatTime(
                    seconds
                  )}

                  <small>
                    Aktiv tid
                  </small>
                </div>

                <div className="tracker-metrics">
                  <Metric
                    icon={Route}
                    value={`${distance.toFixed(
                      2
                    )} km`}
                    label="Distans"
                  />

                  <Metric
                    icon={MapPin}
                    value={
                      positions.length
                    }
                    label="GPS"
                  />

                  <Metric
                    icon={Zap}
                    value={
                      currentPoints
                    }
                    label="Poäng"
                  />
                </div>

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
                        <Play
                          size={18}
                        />
                      ) : (
                        <Pause
                          size={18}
                        />
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
                      <Square
                        size={17}
                      />

                      Avsluta
                    </button>
                  </div>
                )}

                <div className="unlimited">
                  <Zap size={17} />

                  Ingen daglig
                  poänggräns
                </div>

                {activityType.multiplier ===
                  1.5 && (
                  <div className="group-bonus">
                    <Users
                      size={18}
                    />

                    Gemensam aktivitet:
                    alla intjänade poäng
                    multipliceras med
                    1,5.
                  </div>
                )}
              </Card>
            </div>
          </>
        )}

        {page ===
          "challenges" && (
          <>
            <section className="page-title">
              <div>
                <span className="eyebrow">
                  PULSLY TOGETHER
                </span>

                <h1>
                  Utmaningar
                </h1>

                <p>
                  Rörelse, lagarbete och
                  gemensamma mål.
                </p>
              </div>
            </section>

            <div className="challenge-grid">
              {[
                [
                  "Lund till München",
                  68,
                  "Gemensam stegresa",
                ],
                [
                  "Aktiv lunch",
                  80,
                  "20 min vardagsmotion",
                ],
                [
                  "Move Together",
                  42,
                  "Gemensamma aktiviteter ger 1,5× poäng",
                ],
              ].map(
                ([
                  title,
                  progress,
                  description,
                ]) => (
                  <Card key={title}>
                    <Trophy
                      size={34}
                      className="challenge-icon"
                    />

                    <h2>
                      {title}
                    </h2>

                    <p>
                      {description}
                    </p>

                    <div className="progress">
                      <span
                        style={{
                          width: `${progress}%`,
                        }}
                      />
                    </div>

                    <strong>
                      {progress}% klart
                    </strong>
                  </Card>
                )
              )}
            </div>
          </>
        )}

        {page === "ranking" && (
          <>
            <section className="page-title">
              <div>
                <span className="eyebrow">
                  TOPPLISTA
                </span>

                <h1>
                  Mest aktiva
                </h1>

                <p>
                  Verifierade poäng utan
                  daglig maxgräns.
                </p>
              </div>
            </section>

            <Card>
              <div className="ranking">
                {demoRanking.map(
                  (
                    [
                      name,
                      team,
                      points,
                    ],
                    index
                  ) => (
                    <div
                      key={name}
                    >
                      <span className="rank">
                        {index <
                        3 ? (
                          <Medal
                            size={20}
                          />
                        ) : (
                          index + 1
                        )}
                      </span>

                      <span className="avatar">
                        {initials(
                          name
                        )}
                      </span>

                      <span className="ranking-name">
                        <strong>
                          {name}
                        </strong>

                        <small>
                          {team}
                        </small>
                      </span>

                      <b>
                        {points.toLocaleString(
                          "sv-SE"
                        )}{" "}
                        p
                      </b>
                    </div>
                  )
                )}
              </div>

              <p className="demo-note">
                Topplistan använder
                demodata tills vi
                bygger databasvyn för
                ranking.
              </p>
            </Card>
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
                  {profile?.department ||
                    "Pulsly-medlem"}

                  {profile?.location
                    ? ` · ${profile.location}`
                    : ""}
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
                  {session.user.email}
                </p>

                <div className="profile-stats">
                  <Metric
                    icon={Footprints}
                    value={todaySteps.toLocaleString(
                      "sv-SE"
                    )}
                    label="Steg"
                  />

                  <Metric
                    icon={Zap}
                    value={todayPoints.toLocaleString(
                      "sv-SE"
                    )}
                    label="Poäng"
                  />
                </div>

                <button
                  className="logout-button"
                  onClick={signOut}
                >
                  <LogOut
                    size={18}
                  />

                  Logga ut
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

                    <small>
                      Kommer kopplas via
                      iOS-appen
                    </small>
                  </div>
                </div>

                <div className="health-service">
                  <Activity />

                  <div>
                    <strong>
                      Health Connect
                    </strong>

                    <small>
                      Kommer kopplas via
                      Android-appen
                    </small>
                  </div>
                </div>

                <div className="health-service">
                  <Watch />

                  <div>
                    <strong>
                      Garmin
                    </strong>

                    <small>
                      Planerad integration
                    </small>
                  </div>
                </div>

                <div className="privacy-box">
                  <ShieldCheck />

                  <div>
                    <strong>
                      Integritet
                    </strong>

                    <p>
                      Exakta GPS-rutter
                      ligger separat i
                      databasen och ska
                      endast vara
                      tillgängliga för
                      användaren som äger
                      aktiviteten.
                    </p>
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
                  ? "nav-active"
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

      <style>{`
        .app {
          min-height: 100vh;
          padding-bottom: 90px;
          color: #0f172a;
        }

        header {
          height: 68px;
          padding: 0 24px;
          background: rgba(255,255,255,.94);
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          position: sticky;
          top: 0;
          z-index: 20;
          backdrop-filter: blur(18px);
        }

        .logo {
          border: 0;
          background: transparent;
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 22px;
          font-weight: 900;
          color: #0f172a;
        }

        .logo-icon {
          width: 39px;
          height: 39px;
          display: grid;
          place-items: center;
          border-radius: 13px;
          color: white;
          background: linear-gradient(135deg,#10b981,#14b8a6);
        }

        nav {
          display: flex;
          padding: 4px;
          border-radius: 13px;
          background: #f1f5f9;
        }

        nav button {
          border: 0;
          background: transparent;
          padding: 9px 13px;
          border-radius: 10px;
          display: flex;
          gap: 7px;
          align-items: center;
          color: #64748b;
          font-weight: 700;
        }

        nav .nav-active {
          background: white;
          color: #059669;
          box-shadow: 0 1px 4px rgba(0,0,0,.07);
        }

        .profile-button {
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
          max-width: 1180px;
          padding: 32px 20px;
          margin: auto;
        }

        .page-title {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 25px;
        }

        .page-title h1 {
          font-size: clamp(32px,5vw,44px);
          margin: 4px 0;
          line-height: 1.05;
        }

        .page-title p,
        .card p {
          color: #64748b;
        }

        .eyebrow {
          color: #059669;
          font-size: 13px;
          font-weight: 900;
          letter-spacing: .08em;
        }

        .card {
          background: white;
          border-radius: 26px;
          padding: 24px;
          box-shadow: 0 3px 14px rgba(15,23,42,.05);
        }

        .health-card {
          margin-bottom: 20px;
        }

        .health-intro {
          display: flex;
          justify-content: space-between;
          gap: 15px;
        }

        .verified {
          color: #059669;
          font-size: 14px;
          font-weight: 800;
          display: flex;
          align-items: center;
          gap: 7px;
        }

        .demo-label {
          align-self: flex-start;
          background: #fef3c7;
          color: #92400e;
          padding: 7px 10px;
          border-radius: 10px;
          font-size: 11px;
          font-weight: 800;
        }

        .step-number {
          font-size: 40px;
          font-weight: 950;
          margin-top: 8px;
        }

        .metrics,
        .tracker-metrics,
        .profile-stats {
          display: grid;
          grid-template-columns: repeat(3,1fr);
          gap: 12px;
          margin-top: 22px;
        }

        .metric {
          padding: 15px;
          border-radius: 17px;
          background: #f8fafc;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .metric svg {
          color: #10b981;
        }

        .metric strong {
          font-size: 18px;
        }

        .metric span {
          color: #94a3b8;
          font-size: 12px;
        }

        .connections {
          display: flex;
          gap: 9px;
          flex-wrap: wrap;
          margin-top: 18px;
        }

        .connections span,
        .connections button {
          border: 0;
          background: #f1f5f9;
          padding: 9px 12px;
          border-radius: 11px;
          font-size: 12px;
          font-weight: 800;
          display: flex;
          gap: 6px;
          align-items: center;
        }

        .home-grid {
          display: grid;
          grid-template-columns: 1.25fr .75fr;
          gap: 20px;
        }

        .tracker-grid {
          display: grid;
          grid-template-columns: 1fr 380px;
          gap: 20px;
        }

        .map {
          position: relative;
          height: 320px;
          overflow: hidden;
          border-radius: 22px;
          background: #e6eee9;
        }

        .map-grid {
          position: absolute;
          inset: -40px;
          opacity: .45;
          background-image:
            linear-gradient(#bdcbc2 1px,transparent 1px),
            linear-gradient(90deg,#bdcbc2 1px,transparent 1px);
          background-size: 42px 42px;
          transform: rotate(-7deg);
        }

        .road {
          position: absolute;
          height: 13px;
          background: rgba(255,255,255,.9);
          border-radius: 20px;
        }

        .road-one {
          width: 90%;
          left: 10%;
          top: 25%;
          transform: rotate(14deg);
        }

        .road-two {
          width: 110%;
          left: -5%;
          top: 68%;
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

        .gps-label,
        .position-label {
          position: absolute;
          background: white;
          border-radius: 10px;
          padding: 8px 11px;
          font-size: 12px;
          font-weight: 800;
          box-shadow: 0 3px 12px rgba(0,0,0,.08);
        }

        .gps-label {
          left: 14px;
          top: 14px;
          display: flex;
          gap: 5px;
          align-items: center;
        }

        .position-label {
          bottom: 14px;
          right: 14px;
        }

        .primary,
        .secondary,
        .danger,
        .logout-button {
          border: 0;
          padding: 12px 18px;
          border-radius: 12px;
          font-weight: 800;
          display: inline-flex;
          justify-content: center;
          align-items: center;
          gap: 8px;
        }

        .primary {
          background: #0f172a;
          color: white;
        }

        .secondary {
          background: #f1f5f9;
          color: #0f172a;
        }

        .danger {
          background: #e11d48;
          color: white;
        }

        .logout-button {
          width: 100%;
          margin-top: 20px;
          background: #fff1f2;
          color: #be123c;
        }

        .full {
          width: 100%;
          margin-top: 15px;
        }

        .activity-row {
          padding: 14px 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #f1f5f9;
        }

        .activity-row small {
          margin-top: 5px;
          display: flex;
          gap: 4px;
          align-items: center;
          color: #94a3b8;
        }

        .activity-row > b {
          color: #059669;
        }

        .multiplier {
          margin-left: 7px;
          background: #ede9fe;
          color: #7c3aed;
          padding: 3px 7px;
          font-size: 10px;
          border-radius: 20px;
        }

        .activity-types {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 9px;
        }

        .activity-types button {
          border: 1px solid #e2e8f0;
          background: white;
          border-radius: 15px;
          padding: 14px;
          text-align: left;
          font-weight: 800;
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .activity-types .selected {
          background: #ecfdf5;
          color: #047857;
          border-color: #10b981;
        }

        .activity-types small {
          color: #7c3aed;
        }

        .timer {
          font-size: 45px;
          font-weight: 950;
          text-align: center;
          margin: 28px 0 18px;
          font-variant-numeric: tabular-nums;
        }

        .timer small {
          display: block;
          margin-top: 3px;
          font-size: 12px;
          color: #94a3b8;
        }

        .tracking-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 16px;
        }

        .unlimited,
        .group-bonus {
          margin-top: 16px;
          padding: 12px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          font-size: 12px;
          font-weight: 800;
        }

        .unlimited {
          background: #f8fafc;
          color: #64748b;
        }

        .group-bonus {
          background: #f5f3ff;
          color: #6d28d9;
        }

        .challenge-grid {
          display: grid;
          grid-template-columns: repeat(3,1fr);
          gap: 18px;
        }

        .challenge-icon {
          color: #10b981;
        }

        .progress {
          background: #e2e8f0;
          border-radius: 20px;
          height: 10px;
          overflow: hidden;
          margin: 20px 0 10px;
        }

        .progress span {
          display: block;
          height: 100%;
          background: linear-gradient(90deg,#10b981,#14b8a6);
        }

        .ranking > div {
          display: flex;
          align-items: center;
          gap: 15px;
          padding: 14px;
          border-radius: 16px;
        }

        .rank {
          width: 25px;
          font-weight: 950;
          color: #d97706;
        }

        .avatar {
          width: 43px;
          height: 43px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: #0f172a;
          color: white;
          font-size: 11px;
          font-weight: 900;
        }

        .ranking-name {
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        .ranking-name small {
          color: #94a3b8;
        }

        .demo-note {
          margin-top: 18px;
          font-size: 12px;
        }

        .profile-grid {
          display: grid;
          grid-template-columns: 340px 1fr;
          gap: 20px;
        }

        .profile-card {
          text-align: center;
        }

        .large-avatar {
          width: 95px;
          height: 95px;
          margin: auto;
          border-radius: 50%;
          background: #0f172a;
          color: white;
          display: grid;
          place-items: center;
          font-size: 26px;
          font-weight: 950;
        }

        .profile-stats {
          grid-template-columns: 1fr 1fr;
        }

        .health-service {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 17px 0;
          border-bottom: 1px solid #f1f5f9;
        }

        .health-service > div {
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        .health-service small {
          color: #94a3b8;
        }

        .privacy-box {
          display: flex;
          gap: 13px;
          margin-top: 20px;
          background: #fffbeb;
          color: #78350f;
          padding: 16px;
          border-radius: 16px;
        }

        .privacy-box p {
          color: #92400e;
          font-size: 13px;
        }

        .toast {
          position: fixed;
          z-index: 100;
          top: 18px;
          left: 50%;
          transform: translateX(-50%);
          color: white;
          padding: 12px 17px;
          border-radius: 13px;
          display: flex;
          gap: 8px;
          align-items: center;
          box-shadow: 0 10px 30px rgba(0,0,0,.2);
          max-width: calc(100vw - 30px);
        }

        .success-toast {
          background: #0f172a;
        }

        .error-toast {
          background: #be123c;
        }

        .spin {
          animation: spin .9s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .mobile-nav {
          display: none;
        }

        @media (max-width: 850px) {
          header nav {
            display: none;
          }

          .home-grid,
          .tracker-grid,
          .profile-grid {
            grid-template-columns: 1fr;
          }

          .challenge-grid {
            grid-template-columns: 1fr;
          }

          .mobile-nav {
            position: fixed;
            z-index: 50;
            display: flex;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(255,255,255,.96);
            border-top: 1px solid #e2e8f0;
            justify-content: space-around;
            padding: 8px 2px calc(8px + env(safe-area-inset-bottom));
            backdrop-filter: blur(16px);
          }

          .mobile-nav button {
            border: 0;
            background: transparent;
            color: #94a3b8;
            font-size: 10px;
            font-weight: 800;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 3px;
          }

          .mobile-nav .nav-active {
            color: #059669;
          }
        }

        @media (max-width: 600px) {
          main {
            padding: 22px 14px;
          }

          header {
            padding: 0 15px;
          }

          .page-title {
            align-items: flex-start;
            flex-direction: column;
          }

          .page-title > .primary {
            width: 100%;
          }

          .health-card,
          .card {
            padding: 18px;
          }

          .health-intro {
            flex-direction: column;
          }

          .step-number {
            font-size: 34px;
          }

          .metrics,
          .tracker-metrics {
            grid-template-columns: repeat(3,1fr);
            gap: 6px;
          }

          .metric {
            padding: 10px;
          }

          .metric strong {
            font-size: 15px;
          }

          .metric span {
            font-size: 10px;
          }

          .map {
            height: 260px;
          }

          .timer {
            font-size: 38px;
          }
        }
      `}</style>
    </div>
  );
}
