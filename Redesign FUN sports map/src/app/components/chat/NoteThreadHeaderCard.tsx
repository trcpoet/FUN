import { format } from "date-fns";

/**
 * A map note's own text, pinned above its replies.
 *
 * Deliberately not a `MessageBubble`: it has a different tint, an eyebrow, a
 * wider maximum, it is never "mine" and it never groups with anything. Forcing it
 * through the bubble would have meant four more optional props for one caller.
 */
export function NoteThreadHeaderCard({
  body,
  createdAt,
}: {
  body: string;
  createdAt?: string | null;
}) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] rounded-2xl border border-cyan-400/25 bg-cyan-500/[0.07] px-3 py-2 shadow-[0_10px_26px_rgba(0,0,0,0.25)]">
        <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-300/80 mb-1">Note</p>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-100">
          {body}
        </p>
        <p className="text-[10px] mt-1 text-slate-500">
          {createdAt ? format(new Date(createdAt), "MMM d · h:mm a") : ""}
        </p>
      </div>
    </div>
  );
}
