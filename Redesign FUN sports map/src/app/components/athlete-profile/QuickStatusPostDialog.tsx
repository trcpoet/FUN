import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Loader2 } from "lucide-react";
import type { ActivityPost } from "../../../lib/athleteProfile";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (post: ActivityPost) => Promise<void>;
};

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `post-${Date.now()}`;
}

export function QuickStatusPostDialog({ open, onOpenChange, onSave }: Props) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setText("");
    setSaving(false);
    setError(null);
  }, [open]);

  const submit = async () => {
    const caption = text.trim();
    if (!caption) {
      setError("Write something to post.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const post: ActivityPost = {
        id: newId(),
        caption,
        timeAgo: "now",
      };
      await onSave(post);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not post");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="border-white/10 bg-[#161B22] text-slate-100 sm:max-w-md"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle className="text-white">New status</DialogTitle>
        </DialogHeader>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What's happening?"
          className="min-h-[120px] border-white/10 bg-[#0D1117] text-slate-100 placeholder:text-slate-600"
          maxLength={2000}
        />
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="text-slate-400">
            Cancel
          </Button>
          <Button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className="bg-[#00F5FF] text-[#0D1117] hover:bg-[#00F5FF]/90"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Posting
              </>
            ) : (
              "Post"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
