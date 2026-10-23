"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientAnswer } from "@/engine/session/viewTypes";
import { api, ApiError } from "@/lib/api";

/** Remaining ms until a server deadline, corrected for client/server clock offset. Fires onExpire once per deadline. */
export function useCountdown(deadline: number | null, offsetMs: number, onExpire: () => void): number | null {
  const [now, setNow] = useState(() => Date.now());
  const fired = useRef<number | null>(null);
  const expireRef = useRef(onExpire);
  useEffect(() => {
    expireRef.current = onExpire;
  });

  useEffect(() => {
    if (deadline === null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadline]);

  const remaining = deadline === null ? null : deadline - (now + offsetMs);
  useEffect(() => {
    if (deadline !== null && remaining !== null && remaining <= 0 && fired.current !== deadline) {
      fired.current = deadline;
      expireRef.current();
    }
  }, [deadline, remaining]);
  return remaining === null ? null : Math.max(0, remaining);
}

type SavableAnswer = Exclude<ClientAnswer, { kind: "recording" }>;

/**
 * Local answer state with debounced autosave. flush() resolves once every pending
 * answer has reached the server — call it before submitting, navigating, or timing out.
 */
export function useAnswerSync(sessionId: string, serverAnswers: Record<string, ClientAnswer>, onConflict: () => void) {
  const [answers, setAnswers] = useState<Record<string, ClientAnswer>>(serverAnswers);
  const pending = useRef(new Map<string, { answer: SavableAnswer; timer: ReturnType<typeof setTimeout> | null }>());
  const inflight = useRef(new Set<Promise<unknown>>());
  const conflictRef = useRef(onConflict);
  useEffect(() => {
    conflictRef.current = onConflict;
  });

  // Adopt server answers for items without unsaved local edits.
  useEffect(() => {
    setAnswers((local) => {
      const merged: Record<string, ClientAnswer> = { ...serverAnswers };
      for (const id of pending.current.keys()) if (local[id]) merged[id] = local[id];
      return merged;
    });
  }, [serverAnswers]);

  const send = useCallback(
    (itemId: string) => {
      const entry = pending.current.get(itemId);
      if (!entry) return;
      pending.current.delete(itemId);
      if (entry.timer) clearTimeout(entry.timer);
      const p = api.saveAnswer(sessionId, itemId, entry.answer).catch((e) => {
        if (e instanceof ApiError && e.status === 409) conflictRef.current();
      });
      inflight.current.add(p);
      void p.finally(() => inflight.current.delete(p));
    },
    [sessionId],
  );

  const setAnswer = useCallback(
    (itemId: string, answer: SavableAnswer, delayMs = 500) => {
      setAnswers((a) => ({ ...a, [itemId]: answer }));
      const prev = pending.current.get(itemId);
      if (prev?.timer) clearTimeout(prev.timer);
      const timer = delayMs > 0 ? setTimeout(() => send(itemId), delayMs) : null;
      pending.current.set(itemId, { answer, timer });
      if (delayMs === 0) send(itemId);
    },
    [send],
  );

  const flush = useCallback(async () => {
    for (const id of [...pending.current.keys()]) send(id);
    await Promise.all([...inflight.current]);
  }, [send]);

  useEffect(() => {
    const onHide = () => void flush();
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [flush]);

  return { answers, setAnswer, flush };
}
