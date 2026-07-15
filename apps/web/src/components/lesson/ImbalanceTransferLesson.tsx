import { useState } from "react";

import {
  ApiClientError,
  counterLabApi,
  type SessionState,
  type SessionView,
} from "../../api";

type StrategyChoice = "" | "highest_accuracy" | "cost_aware_threshold";
type RiskChoice = "" | "overall_error_rate" | "minority_false_negative_cost";

export function ImbalanceTransferLesson({
  sessionId,
  state,
  revision,
  transferOutcome,
  updateSession,
}: {
  sessionId: string;
  state: SessionState;
  revision?: string;
  transferOutcome?: "PASSED" | "FAILED";
  updateSession: (session: SessionView) => void;
}) {
  const [revisionDraft, setRevisionDraft] = useState(revision ?? "");
  const [strategyChoice, setStrategyChoice] = useState<StrategyChoice>("");
  const [riskChoice, setRiskChoice] = useState<RiskChoice>("");
  const [evidenceChoices, setEvidenceChoices] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recordRevision = async () => {
    setBusy(true);
    setError(null);
    try {
      updateSession(
        await counterLabApi.recordRevision(sessionId, {
          revision: revisionDraft,
        }),
      );
    } catch (caught) {
      setError(
        caught instanceof ApiClientError || caught instanceof Error
          ? caught.message
          : "CounterLab could not save this revision.",
      );
    } finally {
      setBusy(false);
    }
  };

  const toggleEvidence = (value: string, checked: boolean) => {
    setEvidenceChoices((current) =>
      checked
        ? [...new Set([...current, value])]
        : current.filter((item) => item !== value),
    );
  };

  const submitTransfer = async () => {
    if (strategyChoice === "" || riskChoice === "") return;
    setBusy(true);
    setError(null);
    try {
      updateSession(
        await counterLabApi.submitTransfer(sessionId, {
          strategyChoice,
          riskChoice,
          evidenceChoices,
        }),
      );
    } catch (caught) {
      setError(
        caught instanceof ApiClientError || caught instanceof Error
          ? caught.message
          : "The fixed transfer evaluator could not score this answer.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (transferOutcome === "PASSED" || state === "TRANSFER_PASSED") {
    return (
      <section className="transfer-pass panel imbalance-transfer-pass">
        <p className="eyebrow aqua">Transfer passed</p>
        <h2>You moved the rule—not the answer.</h2>
        <p>
          You recognized the same evaluation problem in manufacturing defects:
          rare-class cost and deployment prevalence decide which metric and
          threshold are useful. The patch gate is now unlocked.
        </p>
      </section>
    );
  }

  if (revision === undefined) {
    return (
      <section className="revision panel imbalance-revision">
        <div>
          <p className="eyebrow">In your words</p>
          <h2>Write the rule you would reuse on the next rare event.</h2>
          <p>
            Avoid these exact numbers. Name the baseline, error, or deployment
            condition you would check.
          </p>
        </div>
        <label htmlFor="imbalance-revision">Your revised mental model</label>
        <textarea
          id="imbalance-revision"
          rows={4}
          value={revisionDraft}
          onChange={(event) => setRevisionDraft(event.target.value)}
          placeholder="When one class is rare, I should…"
        />
        <button
          className="button button-primary"
          type="button"
          disabled={revisionDraft.trim().length < 20 || busy}
          onClick={() => void recordRevision()}
        >
          {busy ? "Saving rule…" : "Try it on defects"}
        </button>
        {error !== null && <p role="alert">{error}</p>}
      </section>
    );
  }

  return (
    <section className="transfer panel imbalance-transfer">
      <div className="transfer-head">
        <div>
          <p className="eyebrow gold">Fixed transfer · no model hints</p>
          <h2>A factory screens for a rare but costly defect.</h2>
        </div>
        <span className="patch-lock">Patch locked until this passes</span>
      </div>
      <p className="transfer-scenario">
        Defects are rarer next month, and shipping one missed defect costs far
        more than manually inspecting a false alarm. The model score
        distribution is otherwise unchanged.
      </p>

      <fieldset className="transfer-question">
        <legend>Which evaluation decision matches deployment?</legend>
        <label>
          <input
            type="radio"
            name="imbalance-transfer-strategy"
            checked={strategyChoice === "highest_accuracy"}
            onChange={() => setStrategyChoice("highest_accuracy")}
          />
          <span>Keep the threshold with the highest overall accuracy</span>
        </label>
        <label>
          <input
            type="radio"
            name="imbalance-transfer-strategy"
            checked={strategyChoice === "cost_aware_threshold"}
            onChange={() => setStrategyChoice("cost_aware_threshold")}
          />
          <span>Lower threshold based on missed-defect cost</span>
        </label>
      </fieldset>

      <fieldset className="transfer-question">
        <legend>Which error needs explicit weight?</legend>
        <label>
          <input
            type="radio"
            name="imbalance-transfer-risk"
            checked={riskChoice === "overall_error_rate"}
            onChange={() => setRiskChoice("overall_error_rate")}
          />
          <span>Only the total error rate matters</span>
        </label>
        <label>
          <input
            type="radio"
            name="imbalance-transfer-risk"
            checked={riskChoice === "minority_false_negative_cost"}
            onChange={() => setRiskChoice("minority_false_negative_cost")}
          />
          <span>Missing a defect is the costly error</span>
        </label>
      </fieldset>

      <fieldset className="transfer-question transfer-evidence">
        <legend>Select the evidence that supports the decision</legend>
        <label>
          <input
            type="checkbox"
            checked={evidenceChoices.includes(
              "confusion_matrix_exposes_misses",
            )}
            onChange={(event) =>
              toggleEvidence(
                "confusion_matrix_exposes_misses",
                event.target.checked,
              )
            }
          />
          <span>Confusion matrix shows misses</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={evidenceChoices.includes(
              "prevalence_shift_changes_precision",
            )}
            onChange={(event) =>
              toggleEvidence(
                "prevalence_shift_changes_precision",
                event.target.checked,
              )
            }
          />
          <span>Prevalence changes precision</span>
        </label>
      </fieldset>

      {transferOutcome === "FAILED" || state === "TRANSFER_FAILED" ? (
        <p className="transfer-feedback fail" role="status">
          Not yet. Return to the confusion matrix and ask which class carries
          the costly mistake. No patch was generated.
        </p>
      ) : null}
      {error !== null && <p role="alert">{error}</p>}
      <button
        className="button button-primary"
        type="button"
        disabled={
          strategyChoice === "" ||
          riskChoice === "" ||
          evidenceChoices.length === 0 ||
          busy
        }
        onClick={() => void submitTransfer()}
      >
        {busy ? "Checking transfer…" : "Check transfer"}
      </button>
    </section>
  );
}
