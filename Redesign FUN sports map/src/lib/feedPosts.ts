import { supabase } from "./supabase";
import { getAuthUserIdCached } from "./authDedup";

export type FeedPostComment = {
  id: string;
  created_at: string;
  post_id: string;
  user_id: string;
  body: string;
  authorName: string | null;
  authorAvatarUrl: string | null;
};

export type PostEngagement = { likeCount: number; commentCount: number; likedByMe: boolean };

/** Counts + whether the current viewer has liked the post (one round of small reads). */
export async function getPostEngagement(postId: string): Promise<PostEngagement> {
  if (!supabase) return { likeCount: 0, commentCount: 0, likedByMe: false };
  const uid = await getAuthUserIdCached();
  const [likesRes, commentsRes, mineRes] = await Promise.all([
    supabase.from("feed_media_post_likes").select("post_id", { count: "exact", head: true }).eq("post_id", postId),
    supabase.from("feed_media_post_comments").select("id", { count: "exact", head: true }).eq("post_id", postId),
    uid
      ? supabase
          .from("feed_media_post_likes")
          .select("post_id")
          .eq("post_id", postId)
          .eq("user_id", uid)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return {
    likeCount: likesRes.count ?? 0,
    commentCount: commentsRes.count ?? 0,
    likedByMe: Boolean((mineRes as { data: unknown }).data),
  };
}

/** Like (upsert) or unlike (delete) a post for the current user. */
export async function togglePostLike(postId: string, like: boolean): Promise<Error | null> {
  if (!supabase) return new Error("Supabase not configured");
  const uid = await getAuthUserIdCached();
  if (!uid) return new Error("Not signed in");
  if (like) {
    const { error } = await supabase
      .from("feed_media_post_likes")
      .upsert({ post_id: postId, user_id: uid }, { onConflict: "post_id,user_id", ignoreDuplicates: true });
    return error ? new Error(error.message) : null;
  }
  const { error } = await supabase
    .from("feed_media_post_likes")
    .delete()
    .eq("post_id", postId)
    .eq("user_id", uid);
  return error ? new Error(error.message) : null;
}

/** Comments for a post, enriched with each commenter's name + avatar. */
export async function getPostComments(
  postId: string,
): Promise<{ data: FeedPostComment[]; error: Error | null }> {
  if (!supabase) return { data: [], error: new Error("Supabase not configured") };
  const { data, error } = await supabase.rpc("get_post_comments", { p_post_id: postId });
  const rows = (data as Omit<FeedPostComment, "authorName" | "authorAvatarUrl">[]) ?? [];
  if (error) return { data: [], error: new Error(error.message) };
  if (rows.length === 0) return { data: [], error: null };

  const ids = [...new Set(rows.map((r) => r.user_id))];
  const { data: profs } = await supabase.from("profiles").select("id, display_name, avatar_url").in("id", ids);
  const byId = new Map(
    ((profs ?? []) as { id: string; display_name?: string | null; avatar_url?: string | null }[]).map((p) => [
      p.id,
      p,
    ]),
  );
  return {
    data: rows.map((r) => ({
      ...r,
      authorName: byId.get(r.user_id)?.display_name ?? null,
      authorAvatarUrl: byId.get(r.user_id)?.avatar_url ?? null,
    })),
    error: null,
  };
}

export async function addPostComment(
  postId: string,
  body: string,
): Promise<{ error: Error | null }> {
  if (!supabase) return { error: new Error("Supabase not configured") };
  const { error } = await supabase.rpc("add_post_comment", { p_post_id: postId, p_body: body });
  return { error: error ? new Error(error.message) : null };
}
