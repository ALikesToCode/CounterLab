import { useId, useState } from "react";

import styles from "./ReflectionBuilder.module.css";

export type EvidenceLinkedClauseOption = Readonly<{
  id: string;
  text: string;
  evidenceHref: string;
  evidenceLabel: string;
}>;

export type ReflectionClauseSelection = Readonly<{
  whenId: string;
  actionId: string;
  becauseId: string;
}>;

type ClauseKey = keyof ReflectionClauseSelection;

export function isMeaningfulLearnerText(value: string): boolean {
  const normalized = value.trim().toLocaleLowerCase();
  if (
    ["not sure", "i don't know", "i do not know", "no idea", "idk"].includes(
      normalized.replace(/[.!?]+$/u, ""),
    )
  ) {
    return false;
  }
  const words = value.match(/\p{L}[\p{L}\p{N}'-]*/gu) ?? [];
  const distinctWords = new Set(words.map((word) => word.toLocaleLowerCase()));
  const letterNumberCharacters = [...normalized].filter((character) =>
    /[\p{L}\p{N}]/u.test(character),
  );
  const continuousScriptStatement =
    words.length === 1 &&
    letterNumberCharacters.length >= 8 &&
    new Set(letterNumberCharacters).size >= 3;
  return (
    normalized.length >= 12 &&
    ((words.length >= 3 && distinctWords.size >= 2) ||
      continuousScriptStatement)
  );
}

function withoutTerminalPunctuation(value: string): string {
  return value.trim().replace(/[.,;:!?]+$/u, "");
}

function sentenceFromSelection(
  selection: ReflectionClauseSelection,
  whenOptions: readonly EvidenceLinkedClauseOption[],
  actionOptions: readonly EvidenceLinkedClauseOption[],
  becauseOptions: readonly EvidenceLinkedClauseOption[],
): string | null {
  const when = whenOptions.find((option) => option.id === selection.whenId);
  const action = actionOptions.find(
    (option) => option.id === selection.actionId,
  );
  const because = becauseOptions.find(
    (option) => option.id === selection.becauseId,
  );
  if (when === undefined || action === undefined || because === undefined) {
    return null;
  }
  return `When ${withoutTerminalPunctuation(when.text)},\nI should ${withoutTerminalPunctuation(action.text)},\nbecause ${withoutTerminalPunctuation(because.text)}.`;
}

export function ReflectionBuilder({
  value,
  onRevisionChange,
  onLearnerEdit,
  onGeneratedRevision,
  whenOptions,
  actionOptions,
  becauseOptions,
  initialSelection,
  editorLabel,
  placeholder = "When rows repeat the same entity, I should…",
  disabled = false,
  onAuthoringModeChange,
}: {
  value: string;
  onRevisionChange: (revision: string) => void;
  onLearnerEdit?: (revision: string) => void;
  onGeneratedRevision?: (revision: string) => void;
  whenOptions: readonly EvidenceLinkedClauseOption[];
  actionOptions: readonly EvidenceLinkedClauseOption[];
  becauseOptions: readonly EvidenceLinkedClauseOption[];
  initialSelection?: Partial<ReflectionClauseSelection>;
  editorLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  onAuthoringModeChange?: (mode: "clauses" | "free_text") => void;
}) {
  const instanceId = useId();
  const revisionStatusId = `${instanceId}-revision-status`;
  const [mode, setMode] = useState<"clauses" | "free_text">("clauses");
  const [selection, setSelection] = useState<ReflectionClauseSelection>(() => ({
    whenId: initialSelection?.whenId ?? "",
    actionId: initialSelection?.actionId ?? "",
    becauseId: initialSelection?.becauseId ?? "",
  }));

  const updateClause = (key: ClauseKey, optionId: string) => {
    const next = { ...selection, [key]: optionId };
    setSelection(next);
    const nextSentence = sentenceFromSelection(
      next,
      whenOptions,
      actionOptions,
      becauseOptions,
    );
    if (nextSentence !== null) {
      onRevisionChange(nextSentence);
      onGeneratedRevision?.(nextSentence);
    }
  };

  const groups = [
    {
      key: "whenId" as const,
      lead: "When",
      label: "Choose the condition",
      placeholder: "Select a condition…",
      options: whenOptions,
    },
    {
      key: "actionId" as const,
      lead: "I should",
      label: "Choose the action",
      placeholder: "Select an action…",
      options: actionOptions,
    },
    {
      key: "becauseId" as const,
      lead: "because",
      label: "Choose the evidence-based reason",
      placeholder: "Select a reason…",
      options: becauseOptions,
    },
  ];

  return (
    <section
      className={styles.builder}
      aria-labelledby={`${instanceId}-title`}
      data-motion="reduced-safe"
    >
      <header>
        <span>Reflection</span>
        <h2 id={`${instanceId}-title`}>
          Build the rule you will carry forward.
        </h2>
        <p>
          Use the evidence-linked clauses, then edit the sentence until it says
          what you mean. CounterLab does not grade your prose.
        </p>
      </header>

      <fieldset className={styles.mode} disabled={disabled}>
        <legend>How would you like to write?</legend>
        <label>
          <input
            type="radio"
            name={`${instanceId}-reflection-mode`}
            checked={mode === "clauses"}
            onChange={() => {
              setMode("clauses");
              onAuthoringModeChange?.("clauses");
            }}
          />
          <span>Build with evidence-linked clauses</span>
        </label>
        <label>
          <input
            type="radio"
            name={`${instanceId}-reflection-mode`}
            checked={mode === "free_text"}
            onChange={() => {
              setMode("free_text");
              onAuthoringModeChange?.("free_text");
            }}
          />
          <span>Write freely</span>
        </label>
      </fieldset>

      {mode === "clauses" ? (
        <div className={styles.clauses}>
          {groups.map((group) => {
            const selected = group.options.find(
              (option) => option.id === selection[group.key],
            );
            const selectId = `${instanceId}-${group.key}`;
            const evidenceId = `${selectId}-evidence`;
            return (
              <div className={styles.clause} key={group.key}>
                <label htmlFor={selectId}>
                  <span>{group.lead}</span>
                  {group.label}
                </label>
                <select
                  id={selectId}
                  value={selection[group.key]}
                  disabled={disabled}
                  aria-describedby={evidenceId}
                  onChange={(event) =>
                    updateClause(group.key, event.target.value)
                  }
                >
                  <option value="" disabled>
                    {group.placeholder}
                  </option>
                  {group.options.map((option) => (
                    <option value={option.id} key={option.id}>
                      {option.text}
                    </option>
                  ))}
                </select>
                <p id={evidenceId} className={styles.evidence}>
                  {selected === undefined ? (
                    "No evidence link is available for this clause."
                  ) : (
                    <a href={selected.evidenceHref}>
                      Evidence: {selected.evidenceLabel}
                    </a>
                  )}
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <p className={styles.freeNote}>
          Write the reusable rule in your own structure. Only this revision text
          is recorded.
        </p>
      )}

      <label className={styles.editor} htmlFor={`${instanceId}-revision`}>
        <span>
          {editorLabel ??
            (mode === "clauses" ? "Editable final sentence" : "Your rule")}
        </span>
        <textarea
          id={`${instanceId}-revision`}
          rows={5}
          maxLength={4_000}
          value={value}
          disabled={disabled}
          aria-describedby={revisionStatusId}
          placeholder={placeholder}
          onChange={(event) => {
            const nextRevision = event.target.value;
            onRevisionChange(nextRevision);
            onLearnerEdit?.(nextRevision);
          }}
        />
      </label>
      <p
        id={revisionStatusId}
        className={styles.freeNote}
        role="status"
        aria-live="polite"
      >
        {value.trim().length === 0
          ? "Write a specific condition, action, and evidence-based reason."
          : isMeaningfulLearnerText(value)
            ? "This rule is specific enough to continue, and you can still revise it."
            : "Add a specific condition, action, or reason before continuing."}
      </p>
    </section>
  );
}
