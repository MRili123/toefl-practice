"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type MicStatus = "idle" | "requesting" | "ready" | "denied" | "unsupported";

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];

export interface Microphone {
  status: MicStatus;
  error: string | null;
  request: () => Promise<boolean>;
  /** 0..1 RMS level of the live input. */
  level: () => number;
  /** Resolves false (with `error` set) when the microphone cannot record, instead of throwing. */
  startRecording: () => Promise<boolean>;
  stopRecording: () => Promise<{ blob: Blob; durationMs: number } | null>;
  recording: boolean;
}

const MIC_LOST = "The microphone stopped working. Check that it is connected and not used by another app, then try again.";

/** A stream can die while kept open (headset unplugged or switched, laptop asleep, another app took the mic). */
const isLive = (s: MediaStream | null): s is MediaStream => !!s && s.active && s.getAudioTracks().some((t) => t.readyState === "live");

/**
 * One microphone stream for the whole Speaking section, reused for every recording — reconnected automatically
 * when it has stopped working.
 */
export function useMicrophone(): Microphone {
  const [status, setStatus] = useState<MicStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const stream = useRef<MediaStream | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const buf = useRef<Uint8Array<ArrayBuffer> | null>(null);

  const release = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    void ctx.current?.close().catch(() => undefined);
    stream.current = null;
    ctx.current = null;
    analyser.current = null;
  }, []);

  const request = useCallback(async () => {
    if (isLive(stream.current)) return true;
    if (stream.current) release(); // it died: open the microphone again
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setStatus("unsupported");
      setError("This browser cannot record audio.");
      return false;
    }
    setStatus("requesting");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
      stream.current = s;
      const ac = new AudioContext();
      const an = ac.createAnalyser();
      an.fftSize = 1024;
      ac.createMediaStreamSource(s).connect(an);
      ctx.current = ac;
      analyser.current = an;
      buf.current = new Uint8Array(new ArrayBuffer(an.fftSize));
      setStatus("ready");
      setError(null);
      return true;
    } catch (e) {
      setStatus("denied");
      setError((e as Error).name === "NotAllowedError" ? "Microphone access was blocked." : (e as Error).message);
      return false;
    }
  }, [release]);

  const level = useCallback(() => {
    const an = analyser.current;
    const b = buf.current;
    if (!an || !b) return 0;
    an.getByteTimeDomainData(b);
    let sum = 0;
    for (let i = 0; i < b.length; i++) {
      const v = (b[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / b.length) * 3);
  }, []);

  const startRecording = useCallback(async () => {
    if (recorder.current) return true;
    const begin = () => {
      const s = stream.current;
      if (!isLive(s)) throw new Error("microphone stream is not live");
      void ctx.current?.resume();
      const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
      const r = new MediaRecorder(s, mimeType ? { mimeType } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      r.start(250);
      recorder.current = r;
      startedAt.current = performance.now();
      setRecording(true);
    };
    // Try with the current stream; if it died or the recorder refuses to start, reconnect once and retry.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (!(await request())) return false;
        begin();
        return true;
      } catch {
        recorder.current = null;
        release();
      }
    }
    setStatus("denied");
    setError(MIC_LOST);
    return false;
  }, [request, release]);

  const stopRecording = useCallback(() => {
    const r = recorder.current;
    if (!r) return Promise.resolve(null);
    return new Promise<{ blob: Blob; durationMs: number } | null>((resolve) => {
      r.onstop = () => {
        recorder.current = null;
        setRecording(false);
        const blob = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });
        resolve(blob.size > 0 ? { blob, durationMs: performance.now() - startedAt.current } : null);
      };
      r.stop();
    });
  }, []);

  useEffect(
    () => () => {
      recorder.current?.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      void ctx.current?.close();
    },
    [],
  );

  return { status, error, request, level, startRecording, stopRecording, recording };
}

/** Short tone that marks the start of a response, as in the real test. */
export function beep() {
  try {
    const ac = new AudioContext();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.15, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.25);
    o.connect(g).connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + 0.25);
    o.onended = () => void ac.close();
  } catch {
    /* audio cue is optional */
  }
}
