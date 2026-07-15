import { useState } from "react";

import type { ImbalanceVerifiedResultSet } from "@counterlab/contracts";

import { ApiClientError, counterLabApi } from "../../api";
import { useRunnerEvents } from "../../hooks/useRunnerEvents";

type MetricFocus = "precision" | "recall" | "f1" | "pr_auc";
type PrevalenceScenario = "observed" | "rarer" | "more_common";

const percent = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function metricValue(
  run: ImbalanceVerifiedResultSet["runs"][number],
  metric: MetricFocus,
): number {
  return metric === "pr_auc" ? run.metrics.prAuc : run.metrics[metric];
}

export function InteractiveImbalanceLab({
  isLive,
  sessionId,
  authoritativeResultHash,
}: {
  isLive: boolean;
  sessionId: string | null;
  authoritativeResultHash: string;
}) {
  const [threshold, setThreshold] = useState(0.25);
  const [prevalenceScenario, setPrevalenceScenario] =
    useState<PrevalenceScenario>("observed");
  const [metricFocus, setMetricFocus] = useState<MetricFocus>("recall");
  const [result, setResult] = useState<ImbalanceVerifiedResultSet | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [configurationHash, setConfigurationHash] = useState<string | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runner = useRunnerEvents();

  const selectedRun = result?.runs.find((run) => run.id === selectedRunId);

  const runScenario = async () => {
    if (!isLive || sessionId === null) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setSelectedRunId(null);
    setConfigurationHash(null);
    runner.clear();
    try {
      const queued = await counterLabApi.runInteractiveImbalance(sessionId, {
        schemaVersion: "1",
        concept: "class_imbalance",
        threshold,
        prevalenceScenario,
        metricFocus,
      });
      await runner.waitForStandaloneJob({
        sessionId,
        jobId: queued.runnerJob.jobId,
      });
      const verified = await counterLabApi.getInteractiveResult(
        sessionId,
        queued.runnerJob.jobId,
      );
      if (verified.result.concept !== "class_imbalance") {
        throw new Error("The verified result did not match this lab.");
      }
      setResult(verified.result);
      setSelectedRunId(verified.selectedRunId);
      setConfigurationHash(verified.configurationHash);
    } catch (caught) {
      setError(
        caught instanceof ApiClientError || caught instanceof Error
          ? caught.message
          : "The protected runner could not verify this scenario.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (!isLive) {
    return (
      <section className="interactive-lab panel interactive-lab-preview">
        <div>
          <p className="eyebrow aqua">Explore with your notebook</p>
          <h2>Move the decision line and watch the trade-off change.</h2>
          <p>
            Live rare-event sessions recompute threshold and prevalence
            scenarios with fixed code. The sample stays frozen so its lesson is
            reproducible.
          </p>
        </div>
        <span className="verified-chip">
          No generated metric controls truth
        </span>
      </section>
    );
  }

  return (
    <section className="interactive-lab panel imbalance-workbench">
      <div className="interactive-lab-heading">
        <div>
          <p className="eyebrow aqua">Decision workbench</p>
          <h2>What happens when the cost boundary moves?</h2>
          <p>
            Change one deployment choice. CounterLab reruns all four fixed
            comparisons and releases the selected metric only after
            verification.
          </p>
        </div>
        <span className="verified-chip">
          Authority {authoritativeResultHash.slice(0, 10)}…
        </span>
      </div>

      <div className="lab-control-grid imbalance-control-grid">
        <label className="lab-range-control" htmlFor="imbalance-threshold">
          <span>
            Decision threshold <strong>{threshold.toFixed(2)}</strong>
          </span>
          <input
            id="imbalance-threshold"
            aria-label="Decision threshold"
            type="range"
            min="0.05"
            max="0.45"
            step="0.05"
            value={threshold}
            onChange={(event) => setThreshold(Number(event.target.value))}
          />
          <small>
            Lower values catch more positives and usually add false alarms.
          </small>
        </label>

        <label className="lab-select-control" htmlFor="imbalance-prevalence">
          <span>Prevalence scenario</span>
          <select
            id="imbalance-prevalence"
            aria-label="Prevalence scenario"
            value={prevalenceScenario}
            onChange={(event) =>
              setPrevalenceScenario(event.target.value as PrevalenceScenario)
            }
          >
            <option value="observed">Observed base rate</option>
            <option value="rarer">Rarer positives</option>
            <option value="more_common">More common positives</option>
          </select>
        </label>

        <label className="lab-select-control" htmlFor="imbalance-metric">
          <span>Metric focus</span>
          <select
            id="imbalance-metric"
            aria-label="Metric focus"
            value={metricFocus}
            onChange={(event) =>
              setMetricFocus(event.target.value as MetricFocus)
            }
          >
            <option value="recall">Recall · cases caught</option>
            <option value="precision">Precision · alerts correct</option>
            <option value="f1">F1 · balanced trade-off</option>
            <option value="pr_auc">PR-AUC · ranking under rarity</option>
          </select>
        </label>
      </div>

      <div className="interactive-run-summary">
        <div>
          <span>Changed</span>
          <strong>
            threshold {threshold.toFixed(2)} ·{" "}
            {prevalenceScenario.replaceAll("_", " ")}
          </strong>
        </div>
        <div>
          <span>Controlled</span>
          <strong>Fixture · model score · stratified holdout · seed</strong>
        </div>
        <button
          className="button button-primary"
          type="button"
          disabled={busy}
          onClick={() => void runScenario()}
        >
          {busy ? "Running verified scenario…" : "Run this scenario"}
        </button>
      </div>

      {busy && (
        <div className="interactive-progress" role="status" aria-live="polite">
          <span className="status-dot configured" />
          <div>
            <strong>
              {runner.events.length === 0
                ? "Protected runner accepted the scenario"
                : "Fixed kernel is producing a candidate result"}
            </strong>
            <span>
              No metric appears until the verifier accepts the payload.
            </span>
          </div>
        </div>
      )}

      {error !== null && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}

      {selectedRun !== undefined && configurationHash !== null && (
        <div className="interactive-result imbalance-interactive-result">
          <div>
            <span className="verified-chip">Verified exploratory result</span>
            <p>{metricFocus.replace("_", "-").toUpperCase()}</p>
            <strong>
              {percent.format(metricValue(selectedRun, metricFocus))}
            </strong>
            <small>
              threshold {selectedRun.threshold.toFixed(2)} · prevalence{" "}
              {percent.format(selectedRun.prevalence)} · n=
              {selectedRun.sampleSizes.test}
            </small>
          </div>
          <dl>
            <div>
              <dt>Rare cases caught</dt>
              <dd>{selectedRun.confusionMatrix.tp}</dd>
            </div>
            <div>
              <dt>Rare cases missed</dt>
              <dd>{selectedRun.confusionMatrix.fn}</dd>
            </div>
            <div>
              <dt>False alarms</dt>
              <dd>{selectedRun.confusionMatrix.fp}</dd>
            </div>
          </dl>
          <code>
            result {result?.resultHash.slice(0, 10)}… · config{" "}
            {configurationHash.slice(0, 10)}…
          </code>
        </div>
      )}
    </section>
  );
}
