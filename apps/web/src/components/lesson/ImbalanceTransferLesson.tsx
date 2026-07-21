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
import {
  isMeaningfulLearnerText,
  ReflectionBuilder,
} from "../learner/ReflectionBuilder";
import { recordLearnerInteraction } from "../../features/learner/interactionEvidence";

export type ImbalanceTransferDecision =
  "approve_high_accuracy" | "reject_accuracy_only" | "collect_more_negatives";
export type ImbalanceTransferMetric =
  "accuracy" | "recall_and_pr_auc" | "negative_specificity";
export type ImbalanceTransferEvidence =
  "zero_true_positives" | "rare_base_rate" | "many_true_negatives";

type DecisionChoice = "" | ImbalanceTransferDecision;
type MetricChoice = "" | ImbalanceTransferMetric;
type EvidenceChoice = ImbalanceTransferEvidence;

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

const decisionOptions = [
  {
    value: "approve_high_accuracy",
    label: "Approve because accuracy is 99%",
    description: "Treat overall correctness as sufficient evidence.",
  },
  {
    value: "reject_accuracy_only",
    label: "Reject the accuracy-only conclusion",
    description:
      "Check performance on defective parts and account for the cost of missed defects.",
  },
  {
    value: "collect_more_negatives",
    label: "Collect only more acceptable parts",
    description: "Increase the already dominant negative class.",
  },
] as const satisfies readonly CostTransferChoice<DecisionChoice>[];

const metricOptions = [
  {
    value: "accuracy",
    label: "Accuracy only",
    description: "Report the fraction of all parts classified correctly.",
  },
  {
    value: "recall_and_pr_auc",
    label: "Defect recall and PR-AUC",
    description:
      "Measure recovered defects and ranking quality relative to the rare-class base rate.",
  },
  {
    value: "negative_specificity",
    label: "Acceptable-part specificity",
    description: "Measure only performance on the dominant class.",
  },
] as const satisfies readonly CostTransferChoice<MetricChoice>[];

const evidenceOptions = [
  {
    value: "zero_true_positives",
    label: "The confusion matrix has zero true positives",
    description: "The model missed 200 defects and caught none.",
  },
  {
    value: "rare_base_rate",
    label: "Defects are only 1% of evaluated parts",
    description: "There were 200 defective parts among 20,000 parts.",
  },
  {
    value: "many_true_negatives",
    label: "19,800 acceptable parts were classified correctly",
    description: "The dominant class accounts for nearly all correct counts.",
  },
] as const satisfies readonly CostTransferChoice<EvidenceChoice>[];

const defectMatrix = {
  alertLabel: "Alert",
  noAlertLabel: "No alert",
  actualPositiveLabel: "Actual defect",
  actualNegativeLabel: "Actual clear",
  caughtLabel: "0 caught",
  falseAlarmLabel: "0 false alarms",
  missedLabel: "200 missed",
  correctClearLabel: "19,800 correct clear",
} as const satisfies CostMatrixCopy;

export function ImbalanceTransferLesson({
  sessionId,
  state,
  revision,
  initialInterpretation,
  initialDecisionChoice,
  initialMetricChoice,
  initialEvidenceChoices,
  transferOutcome,
  repairAllowed = true,
  updateSession,
}: {
  sessionId: string;
  state: SessionState;
  revision?: string;
  initialInterpretation?: string;
  initialDecisionChoice?: ImbalanceTransferDecision;
  initialMetricChoice?: ImbalanceTransferMetric;
  initialEvidenceChoices?: readonly ImbalanceTransferEvidence[];
  transferOutcome?: "PASSED" | "FAILED";
  repairAllowed?: boolean;
  updateSession: (session: SessionView) => void;
}) {
  const [revisionDraft, setRevisionDraft] = useState(revision ?? "");
  const [revisionAuthored, setRevisionAuthored] = useState(false);
  const [revisionMode, setRevisionMode] = useState<"clauses" | "free_text">(
    "clauses",
  );
  const [decisionChoice, setDecisionChoice] = useState<DecisionChoice>(
    initialDecisionChoice ?? "",
  );
  const [metricChoice, setMetricChoice] = useState<MetricChoice>(
    initialMetricChoice ?? "",
  );
  const [evidenceChoices, setEvidenceChoices] = useState<EvidenceChoice[]>(
    () => [...(initialEvidenceChoices ?? [])],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recordRevision = async () => {
    if (
      !revisionAuthored ||
      !isMeaningfulLearnerText(revisionDraft) ||
      revisionDraft.trim().length < 20
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await counterLabApi.recordRevision(sessionId, {
        revision: revisionDraft,
      });
      updateSession(updated);
      void recordLearnerInteraction(sessionId, {
        kind: "revision.recorded",
        stage: "apply",
        authoringMode: revisionMode,
      });
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
    if (decisionChoice === "" || metricChoice === "") return;
    setBusy(true);
    setError(null);
    try {
      const updated = await counterLabApi.submitTransfer(sessionId, {
        decisionChoice,
        metricChoice,
        evidenceChoices,
      });
      updateSession(updated);
      if (updated.transferResult !== undefined) {
        void recordLearnerInteraction(sessionId, {
          kind: "transfer.evaluated",
          stage: "apply",
          outcome: updated.transferResult.outcome,
        });
      }
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
        <p className="eyebrow aqua">
          Transfer passed ·{" "}
          {repairAllowed ? "Repair unlocked" : "Repair locked"}
        </p>
        <h2>This fixed manufacturing transfer passed.</h2>
        <p>
          Your submitted choices matched the fixed evaluator for rare-class cost
          and deployment prevalence. This records one task outcome; it does not
          establish mastery.{" "}
          {repairAllowed
            ? "The repair gate is now unlocked."
            : "The experiment was inconclusive, so Repair remains locked."}
        </p>
      </section>
    );
  }

  if (revision === undefined) {
    return (
      <section className="revision panel imbalance-revision">
        {initialInterpretation === undefined ? null : (
          <aside role="note">
            <strong>Your earlier observation</strong>
            <p>{initialInterpretation}</p>
            <p>Now write a separate rule you could reuse in another case.</p>
          </aside>
        )}
        <ReflectionBuilder
          value={revisionDraft}
          onRevisionChange={setRevisionDraft}
          onLearnerEdit={(nextRevision) =>
            setRevisionAuthored(isMeaningfulLearnerText(nextRevision))
          }
          onGeneratedRevision={(nextRevision) =>
            setRevisionAuthored(isMeaningfulLearnerText(nextRevision))
          }
          whenOptions={reflectionWhen}
          actionOptions={reflectionActions}
          becauseOptions={reflectionReasons}
          editorLabel="Your revised mental model"
          placeholder="When one class is rare, I should…"
          disabled={busy}
          onAuthoringModeChange={setRevisionMode}
        />
        <p>
          Complete all three clauses or write a full rule in your own words.
          CounterLab records the revision without grading the prose.
        </p>
        <button
          className="button button-primary"
          type="button"
          disabled={
            !revisionAuthored ||
            !isMeaningfulLearnerText(revisionDraft) ||
            revisionDraft.trim().length < 20 ||
            busy
          }
          onClick={() => void recordRevision()}
        >
          {busy ? "Saving rule…" : "Try it on defects"}
        </button>
        {error !== null && <p role="alert">{error}</p>}
      </section>
    );
  }

  return (
    <section
      className="transfer panel imbalance-transfer"
      id="learner-apply-evidence"
    >
      <div className="transfer-head">
        <div>
          <p className="eyebrow gold">Fixed transfer · no model hints</p>
          <h2>A factory screens for a rare but costly defect.</h2>
        </div>
        <span className="patch-lock">Patch locked until this passes</span>
      </div>
      <CostTransfer
        heading="Does 99% accuracy support deployment?"
        scenario="A factory evaluated 20,000 parts, including 200 defective parts. The model predicted every part as acceptable. Decide whether that evidence supports deployment."
        matrix={defectMatrix}
        missedCost="Far higher than manual inspection"
        deploymentPrevalence="1% defects (200 of 20,000)"
        strategyValue={decisionChoice}
        strategyOptions={decisionOptions}
        onStrategyChange={setDecisionChoice}
        riskValue={metricChoice}
        riskOptions={metricOptions}
        onRiskChange={setMetricChoice}
        evidenceValues={evidenceChoices}
        evidenceOptions={evidenceOptions}
        onEvidenceChange={setEvidenceChoices}
        firstFieldsetLegend="Which deployment conclusion does this evidence support?"
        secondFieldsetLegend="Which minority-sensitive metric should guide the evaluation?"
        evidenceFieldsetLegend="Which evidence supports the deployment conclusion?"
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
          decisionChoice === "" ||
          metricChoice === "" ||
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
