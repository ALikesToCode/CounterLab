import { useId, type FormEvent, type RefObject } from "react";

import styles from "./QuestionComposer.module.css";

export const defaultSamplePrompts = [
  "Why did my model score highly but fail on new customers?",
  "Does high accuracy mean the rare cases are being caught?",
] as const;

export type QuestionComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onAttachNotebook: (file: File) => void;
  onSubmit: () => void;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  samplePrompts?: readonly string[];
  busy?: boolean;
};

export function QuestionComposer({
  value,
  onChange,
  onAttachNotebook,
  onSubmit,
  inputRef,
  samplePrompts = defaultSamplePrompts,
  busy = false,
}: QuestionComposerProps) {
  const inputId = useId();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || value.trim().length === 0) return;
    onSubmit();
  };

  return (
    <section className={styles.composer} aria-label="Question composer">
      <form className={styles.form} onSubmit={submit} aria-label="Test a claim">
        <label className={styles.srOnly} htmlFor={inputId}>
          Your question or claim
        </label>
        <textarea
          ref={inputRef}
          id={inputId}
          value={value}
          rows={2}
          disabled={busy}
          placeholder="State a claim or attach a notebook…"
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
        <span>Try a question</span>
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
