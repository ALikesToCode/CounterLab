import styles from "./ClaimPathChooser.module.css";

export function ClaimPathChooser({
  claim,
  busy,
  onStartSample,
  onAttachNotebook,
  onCheckLiveTools,
  onBack,
}: {
  claim: string;
  busy: boolean;
  onStartSample: () => void;
  onAttachNotebook: (file: File) => void;
  onCheckLiveTools: () => void;
  onBack: () => void;
}) {
  return (
    <main
      className={styles.screen}
      id="main-content"
      tabIndex={-1}
      aria-labelledby="claim-path-title"
    >
      <header className={styles.intro}>
        <span>Question · Choose evidence</span>
        <h1 id="claim-path-title" tabIndex={-1}>
          Start with evidence that matches your question.
        </h1>
        <p>
          Your question is saved. Practice with CounterLab's fixed
          customer-identity lesson, or attach a supported notebook when you need
          evidence that answers your exact question.
        </p>
      </header>

      <blockquote className={styles.claim}>
        <span>Your question</span>
        <p>{claim}</p>
      </blockquote>

      <section className={styles.paths} aria-label="Evidence choices">
        <article className={styles.primaryPath}>
          <span>Practice path · Verified leakage sample</span>
          <h2>Test whether repeated customers inflated a score.</h2>
          <p>
            This bundled customer-churn lesson answers only that fixed question.
            It starts a separate practice question and never claims the sample
            analyzed or answered your wording.
          </p>
          <button type="button" disabled={busy} onClick={onStartSample}>
            Practice with leakage sample <span aria-hidden="true">→</span>
          </button>
        </article>

        <aside
          className={styles.notebookPath}
          aria-label="Live notebook option"
        >
          <div>
            <span>Have a supported notebook?</span>
            <h2>Use artifact-specific evidence instead.</h2>
            <p>
              Nbformat 4 Python/scikit-learn notebooks for entity leakage or
              class imbalance are read as untrusted data and never executed
              during intake.
            </p>
          </div>
          <div className={styles.notebookActions}>
            <label className={busy ? styles.disabled : undefined}>
              <input
                type="file"
                accept=".ipynb,application/x-ipynb+json,application/json"
                disabled={busy}
                aria-label="Attach a supported notebook"
                onChange={(event) => {
                  const input = event.currentTarget;
                  const file = input.files?.[0];
                  input.value = "";
                  if (file !== undefined) onAttachNotebook(file);
                }}
              />
              <span>+ Attach notebook</span>
            </label>
            <button
              className={styles.checkTools}
              type="button"
              disabled={busy}
              onClick={onCheckLiveTools}
            >
              Check live notebook tools
            </button>
          </div>
        </aside>
      </section>

      <button className={styles.back} type="button" onClick={onBack}>
        ← Edit the question
      </button>
    </main>
  );
}
