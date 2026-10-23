"use client";

import { useCallback, useEffect, useState } from "react";
import type { ResultsView } from "@/engine/results/results";
import { api } from "@/lib/api";

/** Loads results and keeps polling while any AI evaluation is still queued or running. */
export function useResults(sessionId: string) {
  const [data, setData] = useState<ResultsView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.results(sessionId).then(setData, (e) => setError((e as Error).message));
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  const pending = !!data?.sections.some((s) => s.tasks.some((t) => t.evaluation && (t.evaluation.status === "queued" || t.evaluation.status === "running")));
  useEffect(() => {
    if (!pending) return;
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [pending, load]);

  const retry = useCallback(
    (itemId: string) => {
      void api.retryEvaluation(sessionId, itemId).then(load);
    },
    [sessionId, load],
  );

  const confirm = useCallback(
    async (itemId: string, text: string) => {
      await api.confirmTranscript(sessionId, itemId, text);
      load();
    },
    [sessionId, load],
  );

  return { data, error, reload: load, retry, confirm };
}
