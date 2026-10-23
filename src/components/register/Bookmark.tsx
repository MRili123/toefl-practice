"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { cx } from "@/components/ui/primitives";
import { IconBookmark, IconBookmarkFilled } from "@/components/ui/icons";

const without = (s: Record<string, string>, key: string) => {
  const next = { ...s };
  delete next[key];
  return next;
};

/** Saved questions of one test attempt, with optimistic toggling. */
export function useRegister(sessionId: string) {
  const [saved, setSaved] = useState<Record<string, string>>({});

  useEffect(() => {
    api.savedKeys(sessionId).then(setSaved, () => undefined);
  }, [sessionId]);

  const toggle = useCallback(
    async (key: string) => {
      const id = saved[key];
      if (id) {
        setSaved((s) => without(s, key));
        try {
          await api.removeSaved(id);
        } catch {
          setSaved((s) => ({ ...s, [key]: id }));
        }
      } else {
        setSaved((s) => ({ ...s, [key]: "pending" }));
        try {
          const q = await api.saveQuestion(sessionId, key);
          setSaved((s) => ({ ...s, [key]: q.id }));
        } catch {
          setSaved((s) => without(s, key));
        }
      }
    },
    [saved, sessionId],
  );

  return { isSaved: (key: string) => key in saved, toggle };
}

export function BookmarkButton({ saved, onToggle, label = "question" }: { saved: boolean; onToggle: () => void; label?: string }) {
  const [animKey, setAnimKey] = useState(0);
  return (
    <button
      type="button"
      onClick={() => {
        setAnimKey((k) => k + 1);
        onToggle();
      }}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${label} from your Question Register` : `Save ${label} to your Question Register`}
      title={saved ? "Saved to your Question Register" : "Save question"}
      className={cx(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors",
        saved ? "text-accent hover:bg-accent-weak" : "text-ink-3 hover:bg-black/[0.04] hover:text-ink",
      )}
    >
      <span key={animKey} className={cx("inline-flex", animKey > 0 && "pop")}>
        {saved ? <IconBookmarkFilled width={18} height={18} /> : <IconBookmark width={18} height={18} />}
      </span>
    </button>
  );
}
