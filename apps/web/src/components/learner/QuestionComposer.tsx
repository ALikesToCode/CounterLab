import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";

import styles from "./QuestionComposer.module.css";

export const defaultSamplePrompts = [
  "Why did my model score highly but fail on new customers?",
  "Could repeated customers make my test score look better than it is?",
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
  const inputHintId = `${inputId}-keyboard-hint`;
  const localInputRef = useRef<HTMLTextAreaElement>(null);

  const setInputNode = useCallback(
    (node: HTMLTextAreaElement | null) => {
      localInputRef.current = node;
      if (inputRef !== undefined) inputRef.current = node;
    },
    [inputRef],
  );

  const resizeInput = useCallback((input: HTMLTextAreaElement) => {
    const maximumHeight = 192;
    input.style.height = "auto";
    const nextHeight = Math.min(input.scrollHeight, maximumHeight);
    input.style.height = `${nextHeight}px`;
    input.style.overflowY =
      input.scrollHeight > maximumHeight ? "auto" : "hidden";
  }, []);

  useLayoutEffect(() => {
    if (localInputRef.current !== null) resizeInput(localInputRef.current);
  }, [resizeInput, value]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || value.trim().length === 0) return;
    onSubmit();
  };

  const submitFromKeyboard = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    ) {
      return;
    }
    event.preventDefault();
    if (!busy && value.trim().length > 0) onSubmit();
  };

  return (
    <section className={styles.composer} aria-label="Question composer">
      <form className={styles.form} onSubmit={submit} aria-label="Test a claim">
        <label className={styles.srOnly} htmlFor={inputId}>
          Your question or claim
        </label>
        <textarea
          ref={setInputNode}
          id={inputId}
          value={value}
          rows={1}
          disabled={busy}
          aria-describedby={inputHintId}
          placeholder="State a claim or attach a notebook…"
          onChange={(event) => {
            onChange(event.target.value);
            resizeInput(event.target);
          }}
          onKeyDown={submitFromKeyboard}
        />
        <span className={styles.srOnly} id={inputHintId}>
          Press Enter to continue. Press Shift and Enter for a new line.
        </span>

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
            <span className={styles.attachSymbol} aria-hidden="true">
              +
            </span>
            <span className={styles.attachText}>Attach notebook</span>
          </label>
          <button
            className={styles.submit}
            type="submit"
            disabled={busy || value.trim().length === 0}
          >
            <span className={styles.submitText}>
              {busy ? "Preparing test…" : "Test this claim"}
            </span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </form>

      <div
        className={styles.promptGroup}
        role="group"
        aria-label="Prompt starters"
      >
        <span>Try a question</span>
        <div>
          {samplePrompts.map((prompt) => (
            <button
              type="button"
              disabled={busy}
              key={prompt}
              onClick={() => {
                onChange(prompt);
                localInputRef.current?.focus();
              }}
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
