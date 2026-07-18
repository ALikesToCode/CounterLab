import { useId, useState, type FormEvent } from "react";

import styles from "./QuestionComposer.module.css";

export const defaultSamplePrompts = [
  "Why did my model score highly but fail on new customers?",
  "Does high accuracy mean the rare cases are being caught?",
] as const;

type ComposerIntent = "question" | "notebook";

export type QuestionComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onAttachNotebook: (file: File) => void;
  onSubmit: () => void;
  onStartSample: () => void;
  onOpenReplay: () => void;
  samplePrompts?: readonly string[];
  busy?: boolean;
};

export function QuestionComposer({
  value,
  onChange,
  onAttachNotebook,
  onSubmit,
  samplePrompts = defaultSamplePrompts,
  busy = false,
}: QuestionComposerProps) {
  const inputId = useId();
  const [intent, setIntent] = useState<ComposerIntent>("question");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || value.trim().length === 0) return;
    onSubmit();
  };

  const placeholder =
    intent === "question"
      ? "State a claim you want to test…"
      : "What claim should this notebook help test?";

  return (
    <section className={styles.composer} aria-label="Question composer">
      <div
        className={styles.intentSwitch}
        role="group"
        aria-label="Choose input type"
      >
        <button
          type="button"
          className={intent === "question" ? styles.intentActive : undefined}
          aria-pressed={intent === "question"}
          disabled={busy}
          onClick={() => setIntent("question")}
        >
          Question
        </button>
        <button
          type="button"
          className={intent === "notebook" ? styles.intentActive : undefined}
          aria-pressed={intent === "notebook"}
          disabled={busy}
          onClick={() => setIntent("notebook")}
        >
          Notebook
        </button>
      </div>

      <form className={styles.form} onSubmit={submit} aria-label="Test a claim">
        <label className={styles.srOnly} htmlFor={inputId}>
          Your question or claim
        </label>
        <textarea
          id={inputId}
          value={value}
          rows={5}
          disabled={busy}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />

        <div className={styles.composerActions}>
          <label
            className={`${styles.attach} ${busy ? styles.controlDisabled : ""}`}
            aria-disabled={busy}
          >
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

      <div className={styles.promptGroup} aria-label="Prompt starters">
        <span>Prompt starters</span>
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
    </section>
  );
}
