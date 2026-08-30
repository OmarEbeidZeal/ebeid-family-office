import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const GOAL_IMAGE_BUCKET = "goal-images";
export const GOAL_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/avif"];

/**
 * Goal photographs live in a private bucket scoped to the household folder.
 * Nothing is ever served from a public URL — the browser gets a short-lived
 * signed link, and only for a household it belongs to.
 */
export function useGoalImageUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ["goal-image", path],
    enabled: !!path,
    staleTime: 45 * 60 * 1000,
    queryFn: async () => {
      if (!path) return null;
      const { data, error } = await supabase.storage
        .from(GOAL_IMAGE_BUCKET)
        .createSignedUrl(path, 60 * 60);
      if (error) throw error;
      return data?.signedUrl ?? null;
    },
  });
}

export async function uploadGoalImage(file: File, householdId: string) {
  if (!ACCEPTED.includes(file.type)) {
    throw new Error("That file type isn't supported — use a JPEG, PNG, WebP or AVIF image.");
  }
  if (file.size > GOAL_IMAGE_MAX_BYTES) {
    throw new Error("That image is over 5MB. Choose a smaller one or export it at a lower size.");
  }

  const extension =
    file.name
      .split(".")
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${householdId}/${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage.from(GOAL_IMAGE_BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(`The image could not be uploaded: ${error.message}`);

  return path;
}

export async function removeGoalImage(path: string | null | undefined) {
  if (!path) return;
  await supabase.storage.from(GOAL_IMAGE_BUCKET).remove([path]);
}
