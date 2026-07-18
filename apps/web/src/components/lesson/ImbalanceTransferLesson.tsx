import { useState } from "react";

import {
  ApiClientError,
  counterLabApi,
  type SessionState,
  type SessionView,
} from "../../api";
import {
  CostTransfer,
  type CostMatrixCopy,
  type CostTransferChoice,
} from "../learner/CostTransfer";
import { ReflectionBuilder } from "../learner/ReflectionBuilder";

type StrategyChoice = "" | "highest_accuracy" | "cost_aware_threshold";
type RiskChoice = "" | "overall_error_rate" | "minority_false_negative_cost";
type EvidenceChoice =
  "confusion_matrix_exposes_misses" | "prevalence_shift_changes_precision";

const defaultImbalanceReflection =
  "When one class is rare,\nI should inspect class-specific errors and deployment costs,\nbecause high overall accuracy can hide missed rare events.";

const reflectionWhen = [
  {
    id: "rare-class",
    text: "one class is rare",
    evidenceHref: "#experiment-theater-comparison",
    evidenceLabel: "verified headline and rare-class comparison",
  },
  {
    id: "prevalence-shifts",
    text: "deployment prevalence changes",
    evidenceHref: "#experiment-theater-comparison",
    evidenceLabel: "verified prevalence scenario",
  },
] as const;

const reflectionActions = [
  {
    id: "class-errors",
    text: "inspect class-specific errors and deployment costs",
    evidenceHref: "#experiment-theater-comparison",
    evidenceLabel: "verified confusion evidence",
  },
  {
    id: "baseline",
    text: "compare against the majority baseline",
    evidenceHref: "#experiment-theater-comparison",
    evidenceLabel: "verified majority baseline",
  },
] as const;

const reflectionReasons = [
  {
    id: "accuracy-hides",
    text: "high overall accuracy can hide missed rare events",
    evidenceHref: "#experiment-theater-comparison",
    evidenceLabel: "verified rare-class recall",
  },
  {
    id: "metrics-shift",
    text: "threshold and prevalence change the useful metric",
    evidenceHref: "#experiment-theater-comparison",
    evidenceLabel: "verified threshold and prevalence runs",
  },
] as const;

const strategyOptions = [
  {
    value: "highest_accuracy",
    label: "Keep the threshold with the highest overall accuracy",
    description: "Optimize the overall correct count.",
  },
  {
    value: "cost_aware_threshold",
    label: "Lower threshold based on missed-defect cost",
    description: "Include the deployment cost of missing a defect.",
  },
] as const satisfies readonly CostTransferChoice<StrategyChoice>[];

const riskOptions = [
  {
    value: "overall_error_rate",
    label: "Only the total error rate matters",
    description: "Treat both error types as interchangeable.",
  },
  {
    value: "minority_false_negative_cost",
    label: "Missing a defect is the costly error",
    description: "Give missed defects their supplied deployment weight.",
  },
] as const satisfies readonly CostTransferChoice<RiskChoice>[];

const evidenceOptions = [
  {
    value: "confusion_matrix_exposes_misses",
    label: "Confusion matrix shows misses",
    description: "Separates missed defects from false alarms.",
  },
  {
    value: "prevalence_shift_changes_precision",
    label: "Prevalence changes precision",
    description: "Uses the fixed lower-prevalence deployment scenario.",
  },
] as const satisfies readonly CostTransferChoice<EvidenceChoice>[];

const defectMatrix = {
  alertLabel: "Alert",
  noAlertLabel: "No alert",
  actualPositiveLabel: "Actual defect",
  actualNegativeLabel: "Actual clear",
  caughtLabel: "caught",
  falseAlarmLabel: "false alarm",
  missedLabel: "missed",
  correctClearLabel: "correct clear",
} as const satisfies CostMatrixCopy;

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
  const [revisionDraft, setRevisionDraft] = useState(
    revision ?? defaultImbalanceReflection,
  );
  const [strategyChoice, setStrategyChoice] = useState<StrategyChoice>("");
  const [riskChoice, setRiskChoice] = useState<RiskChoice>("");
  const [evidenceChoices, setEvidenceChoices] = useState<EvidenceChoice[]>([]);
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
        <ReflectionBuilder
          value={revisionDraft}
          onRevisionChange={setRevisionDraft}
          whenOptions={reflectionWhen}
          actionOptions={reflectionActions}
          becauseOptions={reflectionReasons}
          initialSelection={{
            whenId: "rare-class",
            actionId: "class-errors",
            becauseId: "accuracy-hides",
          }}
          editorLabel="Your revised mental model"
          placeholder="When one class is rare, I should…"
          disabled={busy}
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
      <CostTransfer
        heading="Which mistakes matter at deployment?"
        scenario="Defects are rarer next month, and shipping one missed defect costs far more than manually inspecting a false alarm. The model score distribution is otherwise unchanged."
        matrix={defectMatrix}
        missedCost="Far higher than manual inspection"
        deploymentPrevalence="Rarer next month (fixed scenario)"
        strategyValue={strategyChoice}
        strategyOptions={strategyOptions}
        onStrategyChange={setStrategyChoice}
        riskValue={riskChoice}
        riskOptions={riskOptions}
        onRiskChange={setRiskChoice}
        evidenceValues={evidenceChoices}
        evidenceOptions={evidenceOptions}
        onEvidenceChange={setEvidenceChoices}
        disabled={busy}
      />

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
