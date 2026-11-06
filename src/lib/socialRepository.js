import { supabase } from "./supabase";

async function currentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("Du måste vara inloggad i Pulsly.");
  return user;
}

export async function getPostDetails(postId) {
  const { data, error } = await supabase
    .from("activity_posts")
    .select(`
      *,
      profiles(full_name,avatar_url,department),
      activities(*),
      activity_post_likes(user_id,created_at),
      activity_post_comments(id,user_id,comment,created_at,updated_at)
    `)
    .eq("id", postId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function addComment(postId, text) {
  const user = await currentUser();
  const comment = String(text || "").trim();
  if (!comment) throw new Error("Kommentaren är tom.");
  if (comment.length > 1000) throw new Error("Kommentaren får vara högst 1000 tecken.");

  const { data, error } = await supabase
    .from("activity_post_comments")
    .insert({ post_id: postId, user_id: user.id, comment })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMyComment(commentId) {
  const user = await currentUser();
  const { error } = await supabase
    .from("activity_post_comments")
    .delete()
    .eq("id", commentId)
    .eq("user_id", user.id);
  if (error) throw error;
}

export async function toggleLike(postId) {
  const user = await currentUser();
  const { data: existing, error: findError } = await supabase
    .from("activity_post_likes")
    .select("post_id")
    .eq("post_id", postId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (findError) throw findError;

  if (existing) {
    const { error } = await supabase.from("activity_post_likes").delete().eq("post_id", postId).eq("user_id", user.id);
    if (error) throw error;
    return { liked: false };
  }

  const { error } = await supabase.from("activity_post_likes").insert({ post_id: postId, user_id: user.id });
  if (error) throw error;
  return { liked: true };
}

export async function updateMyPost(postId, values = {}) {
  const user = await currentUser();
  const visibility = values.visibility;
  if (visibility && !["private", "members", "public"].includes(visibility)) {
    throw new Error("Ogiltig synlighet.");
  }

  const payload = { updated_at: new Date().toISOString() };
  if ("message" in values) payload.message = String(values.message || "").trim() || null;
  if (visibility) payload.visibility = visibility;
  if ("share_route" in values) payload.share_route = Boolean(values.share_route);
  if ("share_splits" in values) payload.share_splits = Boolean(values.share_splits);
  if ("share_points" in values) payload.share_points = Boolean(values.share_points);
  if ("share_pace" in values) payload.share_pace = Boolean(values.share_pace);

  const { data, error } = await supabase
    .from("activity_posts")
    .update(payload)
    .eq("id", postId)
    .eq("user_id", user.id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMyPost(postId) {
  const user = await currentUser();
  const { error } = await supabase.from("activity_posts").delete().eq("id", postId).eq("user_id", user.id);
  if (error) throw error;
}

export function subscribeToWall(onChange) {
  const channel = supabase
    .channel("pulsly-wall-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "activity_posts" }, (payload) => onChange?.({ type: "post", payload }))
    .on("postgres_changes", { event: "*", schema: "public", table: "activity_post_likes" }, (payload) => onChange?.({ type: "like", payload }))
    .on("postgres_changes", { event: "*", schema: "public", table: "activity_post_comments" }, (payload) => onChange?.({ type: "comment", payload }))
    .subscribe();

  return () => supabase.removeChannel(channel);
}
