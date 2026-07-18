import { useId, type FormEvent } from "react";

import styles from "./QuestionComposer.module.css";

export const defaultSamplePrompts = [
  "Why did my model score highly but fail on new customers?",
  "Does high accuracy mean the rare cases are being caught?",
] as const;

export function QuestionComposer({
  value,
  onChange,
  onAttachNotebook,
  onSubmit,
  onStartSample,
  onOpenReplay,
  samplePrompts = defaultSamplePrompts,
  busy = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onAttachNotebook: (file: File) => void;
  onSubmit: () => void;
  onStartSample: () => void;
  onOpenReplay: () => void;
  samplePrompts?: readonly string[];
  busy?: boolean;
}) {
  const inputId = useId();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || value.trim().length === 0) return;
    onSubmit();
  };

  return (
    <section className={styles.composer} aria-labelledby="landing-title">
      <div className={styles.intro}>
        <span>Ask like chat. Prove it like science.</span>
        <h1 id="landing-title" tabIndex={-1}>
          What result are you trying to understand?
        </h1>
        <p>
          State the claim first. CounterLab will show what evidence it can test
          before anything runs.
        </p>
      </div>

      <form className={styles.form} onSubmit={submit}>
        <label className={styles.srOnly} htmlFor={inputId}>
          Your question or claim
        </label>
        <textarea
          id={inputId}
          value={value}
          rows={4}
          disabled={busy}
          placeholder="State a claim or attach a notebook…"
          onChange={(event) => onChange(event.target.value)}
        />

        <div className={styles.composerActions}>
          <label className={styles.attach}>
            <input
              type="file"
              accept=".ipynb,application/x-ipynb+json,application/json"
              disabled={busy}
              aria-label="Attach notebook"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file !== undefined) onAttachNotebook(file);
              }}
            />
            <span>+ Attach notebook</span>
          </label>
          <button
            className={styles.submit}
            type="submit"
            disabled={busy || value.trim().length === 0}
          >
            {busy ? "Preparing test…" : "Test this claim →"}
          </button>
        </div>
      </form>

      <div className={styles.promptGroup} aria-label="Sample prompts">
        <span>Try a supported question</span>
        <div>
          {samplePrompts.map((prompt) => (
            <button
              type="button"
              disabled={busy}
              key={prompt}
              onClick={() => onChange(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.secondaryPaths}>
        <button type="button" disabled={busy} onClick={onStartSample}>
          Try verified sample
        </button>
        <button type="button" disabled={busy} onClick={onOpenReplay}>
          Watch verified replay
        </button>
      </div>

      <p className={styles.trustLine}>
        No account needed. Notebook cells are read for evidence and never run
        during intake.
      </p>
    </section>
  );
}
