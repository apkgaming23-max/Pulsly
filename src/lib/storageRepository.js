import { supabase } from "./supabase";

const AVATAR_BUCKET = "avatars";
const ACTIVITY_BUCKET = "activity-media";

async function currentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("Du måste vara inloggad i Pulsly.");
  return user;
}

function extensionFromFile(file) {
  const name = String(file?.name || "file");
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "jpg";
  return ext.replace(/[^a-z0-9]/g, "") || "jpg";
}

function ensureImage(file) {
  if (!file) throw new Error("Ingen fil vald.");
  if (!String(file.type || "").startsWith("image/")) {
    throw new Error("Endast bildfiler är tillåtna.");
  }
  if (Number(file.size || 0) > 10 * 1024 * 1024) {
    throw new Error("Bilden får vara högst 10 MB.");
  }
}

export async function uploadProfileImage(file) {
  const user = await currentUser();
  ensureImage(file);

  const path = `${user.id}/profile-${Date.now()}.${extensionFromFile(file)}`;
  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: false });
  if (uploadError) throw uploadError;

  const { data: publicData } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  const publicUrl = publicData?.publicUrl;
  if (!publicUrl) throw new Error("Profilbildens URL kunde inte skapas.");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
    .eq("id", user.id)
    .select("*")
    .single();
  if (profileError) throw profileError;

  return { path, publicUrl, profile };
}

export async function uploadActivityImage(file, activityId) {
  const user = await currentUser();
  ensureImage(file);
  if (!activityId) throw new Error("Aktivitets-ID saknas.");

  const { data: activity, error: activityError } = await supabase
    .from("activities")
    .select("id")
    .eq("id", activityId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (activityError) throw activityError;
  if (!activity) throw new Error("Aktiviteten hittades inte.");

  const path = `${user.id}/${activityId}/${Date.now()}.${extensionFromFile(file)}`;
  const { error: uploadError } = await supabase.storage
    .from(ACTIVITY_BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: false });
  if (uploadError) throw uploadError;

  const { data: publicData } = supabase.storage.from(ACTIVITY_BUCKET).getPublicUrl(path);
  return { path, publicUrl: publicData?.publicUrl || null };
}

export async function deleteActivityImage(path) {
  const user = await currentUser();
  if (!String(path || "").startsWith(`${user.id}/`)) {
    throw new Error("Du kan endast radera dina egna aktivitetsbilder.");
  }

  const { error } = await supabase.storage.from(ACTIVITY_BUCKET).remove([path]);
  if (error) throw error;
}
