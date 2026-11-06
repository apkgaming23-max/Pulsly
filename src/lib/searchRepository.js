import { supabase } from "./supabase";

async function requireUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("Du måste vara inloggad i Pulsly.");
  return user;
}

function cleanQuery(query) {
  return String(query || "").trim().replace(/[%_]/g, "");
}

/**
 * Global Pulsly-sökning inför nästa samlade UI-release.
 * Söker endast data som den inloggade användaren redan får läsa via RLS.
 */
export async function globalSearch(query, { limitPerGroup = 8 } = {}) {
  await requireUser();
  const value = cleanQuery(query);

  if (value.length < 2) {
    return {
      query: value,
      people: [],
      events: [],
      challenges: [],
      teams: [],
    };
  }

  const pattern = `%${value}%`;

  const [peopleResult, eventsResult, challengesResult, teamsResult] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, full_name, avatar_url, department, location")
        .ilike("full_name", pattern)
        .limit(limitPerGroup),

      supabase
        .from("group_events")
        .select("id, title, activity_type, starts_at, location_name, status")
        .or(`title.ilike.${pattern},description.ilike.${pattern},location_name.ilike.${pattern}`)
        .order("starts_at", { ascending: true })
        .limit(limitPerGroup),

      supabase
        .from("challenges")
        .select("id, title, description, challenge_type, starts_at, ends_at, active")
        .or(`title.ilike.${pattern},description.ilike.${pattern}`)
        .order("starts_at", { ascending: false })
        .limit(limitPerGroup),

      supabase
        .from("teams")
        .select("id, name, description, created_at")
        .or(`name.ilike.${pattern},description.ilike.${pattern}`)
        .order("name", { ascending: true })
        .limit(limitPerGroup),
    ]);

  for (const result of [
    peopleResult,
    eventsResult,
    challengesResult,
    teamsResult,
  ]) {
    if (result.error) throw result.error;
  }

  return {
    query: value,
    people: peopleResult.data || [],
    events: eventsResult.data || [],
    challenges: challengesResult.data || [],
    teams: teamsResult.data || [],
  };
}

export async function searchPeople(query, { limit = 20 } = {}) {
  await requireUser();
  const value = cleanQuery(query);
  if (value.length < 2) return [];

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url, department, location")
    .or(
      `full_name.ilike.%${value}%,department.ilike.%${value}%,location.ilike.%${value}%`
    )
    .order("full_name", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function searchEvents(query, { limit = 20 } = {}) {
  await requireUser();
  const value = cleanQuery(query);
  if (value.length < 2) return [];

  const pattern = `%${value}%`;

  const { data, error } = await supabase
    .from("group_events")
    .select("id, title, description, activity_type, starts_at, location_name, status")
    .or(`title.ilike.${pattern},description.ilike.${pattern},location_name.ilike.${pattern}`)
    .order("starts_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data || [];
}
