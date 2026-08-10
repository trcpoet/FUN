import { useCallback } from "react";
import { toggleNoteCommentLike } from "../../../lib/api";
import type { MapNoteCommentRow } from "../../../lib/supabase";
import { LikeButton } from "./LikeButton";

/**
 * Heart toggle + count for a single map-note comment. Used by the feed card,
 * the map dialog, and the messenger note thread so the like UX is identical
 * everywhere.
 *
 * Comments have had a real read path since `get_note_comments_with_likes`;
 * this is now the same `LikeButton` that map notes and statuses render.
 */
export function NoteCommentLikeButton(props: {
  comment: Pick<MapNoteCommentRow, "id" | "like_count" | "liked_by_me">;
  /** Optional override styling (e.g. tighter messenger bubble). */
  className?: string;
}) {
  const { comment, className } = props;
  const id = comment.id;
  const toggle = useCallback(() => toggleNoteCommentLike(id), [id]);

  return (
    <LikeButton
      rowId={id}
      likeCount={comment.like_count}
      likedByMe={comment.liked_by_me}
      toggle={toggle}
      label="comment"
      className={className}
    />
  );
}
