"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Button, cx, PageHeader, Spinner } from "@/components/ui/primitives";
import { IconCheck } from "@/components/ui/icons";

interface SetupStatus {
  ollama: { ok: boolean; model: string; modelInstalled: boolean; error: string | null };
  model: string;
  stt: { ok: boolean; ready: boolean; model: string | null; error: string | null };
  desktop: boolean;
}

type Pull = { status: string; total?: number; completed?: number } | null;

const fmtGB = (b: number) => `${(b / 1e9).toFixed(b >= 1e10 ? 0 : 1)} GB`;

function Step({ n, title, ok, children }: { n: number; title: string; ok: boolean | null; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <span
          className={cx(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
            ok ? "bg-success text-white" : ok === false ? "bg-warn-weak text-warn" : "bg-surface-2 text-ink-3",
          )}
          aria-hidden
        >
          {ok ? <IconCheck width={16} height={16} strokeWidth={3} /> : n}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">{title}</h2>
          <div className="mt-2 text-[15px] leading-relaxed text-ink-2">{children}</div>
        </div>
      </div>
    </section>
  );
}

export function SetupPage() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [pull, setPull] = useState<Pull>(null);
  const [pullError, setPullError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    () => fetch("/api/setup", { cache: "no-store" }).then((r) => r.json() as Promise<SetupStatus>).then(setStatus, () => undefined),
    [],
  );
  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      await load();
    } finally {
      setChecking(false);
    }
  }, [load]);

  useEffect(() => {
    void load();
  }, [load]);

  // Speech-to-text loads its model for a few seconds after start: poll until ready.
  useEffect(() => {
    if (!status || (status.stt.ok && status.stt.ready)) return;
    const t = setTimeout(() => void load(), 4000);
    return () => clearTimeout(t);
  }, [status, load]);

  const downloadModel = async () => {
    setPullError(null);
    setPull({ status: "Starting download…" });
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/setup/pull", { method: "POST", signal: ctrl.signal });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? "The download could not start.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const msg = JSON.parse(line) as { status?: string; total?: number; completed?: number; error?: string };
          if (msg.error) throw new Error(msg.error);
          setPull((p) => ({ status: msg.status ?? p?.status ?? "", total: msg.total ?? p?.total, completed: msg.completed ?? (msg.total ? 0 : p?.completed) }));
        }
      }
      setPull(null);
      await refresh();
    } catch (e) {
      if ((e as Error).name !== "AbortError") setPullError((e as Error).message);
      setPull(null);
    } finally {
      abortRef.current = null;
    }
  };

  const aiReady = !!status && status.ollama.ok && status.ollama.modelInstalled;
  const sttReady = !!status && status.stt.ok && status.stt.ready;
  const pct = pull?.total ? Math.min(100, Math.round(((pull.completed ?? 0) / pull.total) * 100)) : null;

  return (
    <>
      <PageHeader
        eyebrow="Setup"
        title="Set up this computer"
        description="Tests, Spelling, Grammar and Listen & Repeat work right away. The AI feedback for Writing and Speaking needs a free local AI model, set up once."
        aside={<Button size="sm" onClick={() => void refresh()} disabled={checking}>{checking && <Spinner />} Check again</Button>}
      />
      {!status ? (
        <div className="flex items-center gap-2 py-12 text-ink-3"><Spinner /> Checking this computer…</div>
      ) : (
        <div className="max-w-3xl space-y-4">
          <Step n={1} title="Install Ollama (free local AI)" ok={status.ollama.ok}>
            {status.ollama.ok ? (
              <p>Ollama is installed and running.</p>
            ) : (
              <>
                <p>Ollama runs the AI model on this computer, so your writing and recordings never leave it.</p>
                <ol className="mt-3 list-decimal space-y-1 pl-5">
                  <li>
                    Download and install Ollama from{" "}
                    <a href="https://ollama.com/download" target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">ollama.com/download</a>.
                  </li>
                  <li>Open it once (it keeps running in the background).</li>
                  <li>Come back here and press “Check again”.</li>
                </ol>
              </>
            )}
          </Step>

          <Step n={2} title="Download the AI model" ok={status.ollama.ok ? status.ollama.modelInstalled : null}>
            {aiReady ? (
              <p>The model <span className="font-mono text-sm">{status.model}</span> is installed. Writing and Speaking feedback is ready.</p>
            ) : !status.ollama.ok ? (
              <p className="text-ink-3">Available after step 1.</p>
            ) : (
              <>
                <p>
                  The evaluator uses <span className="font-mono text-sm">{status.model}</span> (about 4.7 GB). The download runs once; if it
                  stops, pressing the button again continues where it left off.
                </p>
                {pull ? (
                  <div className="mt-4">
                    <div className="mb-1.5 flex justify-between text-sm">
                      <span className="text-ink-2">{pull.status}</span>
                      {pct !== null && <span className="font-medium tabular">{pct}% · {fmtGB(pull.completed ?? 0)} / {fmtGB(pull.total!)}</span>}
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={pct ?? undefined} aria-valuemin={0} aria-valuemax={100}>
                      <div className={cx("h-full rounded-full bg-accent transition-[width] duration-300", pct === null && "w-1/3 animate-pulse")} style={pct !== null ? { width: `${pct}%` } : undefined} />
                    </div>
                    <Button size="sm" variant="ghost" className="mt-2" onClick={() => abortRef.current?.abort()}>Pause download</Button>
                  </div>
                ) : (
                  <Button variant="primary" className="mt-4" onClick={() => void downloadModel()}>Download AI model</Button>
                )}
                {pullError && <p className="mt-2 text-sm text-danger" role="alert">{pullError}</p>}
              </>
            )}
          </Step>

          <Step n={3} title="Speech-to-text" ok={sttReady ? true : status.stt.ok ? null : false}>
            {sttReady ? (
              <p>Ready — your spoken answers are transcribed on this computer.</p>
            ) : status.stt.ok ? (
              <p className="flex items-center gap-2"><Spinner /> Loading the speech model… (a few seconds after the app starts)</p>
            ) : (
              <p>Not running{status.stt.error ? ` — ${status.stt.error}` : ""}. Restart the app; if it keeps failing, reinstall it.</p>
            )}
          </Step>

          <Step n={4} title="Audio (included)" ok={true}>
            <p>
              All Spelling and Listen &amp; Repeat audio is included in the app. Anything added later — a word from your mistakes,
              an Interaction question, an item edited in Admin — is read once by the built-in offline voice and saved.
              No account, key or internet connection is needed.
            </p>
          </Step>
        </div>
      )}
    </>
  );
}
