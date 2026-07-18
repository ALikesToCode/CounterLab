import { useId } from "react";

import styles from "./NotebookEvidenceStory.module.css";

export type NotebookEvidenceReference = Readonly<{
  id: string;
  reference: string;
  relevance: string;
  excerpt: string;
}>;

export type EvidenceIntegrityItem = Readonly<{
  label: string;
  value: string;
}>;

export function NotebookEvidenceStory({
  title,
  headlineMetric,
  references,
  integrity,
}: {
  title: string;
  headlineMetric: Readonly<{ label: string; value: string }>;
  references: readonly NotebookEvidenceReference[];
  integrity: readonly EvidenceIntegrityItem[];
}) {
  const titleId = useId();

  return (
    <section
      className={styles.story}
      aria-label="Notebook evidence story"
      aria-describedby={titleId}
    >
      <header className={styles.header}>
        <div>
          <span>Notebook evidence</span>
          <h2 id={titleId}>{title}</h2>
        </div>
        <div className={styles.metric} aria-label={headlineMetric.label}>
          <strong>{headlineMetric.value}</strong>
          <span>{headlineMetric.label}</span>
        </div>
      </header>

      <ol className={styles.references} aria-label="Exact evidence references">
        {references.map((evidence) => (
          <li key={evidence.id}>
            <code>{evidence.reference}</code>
            <p>{evidence.relevance}</p>
          </li>
        ))}
      </ol>

      <details className={styles.disclosure}>
        <summary>Full evidence and integrity</summary>
        <div className={styles.disclosureBody}>
          <section aria-label="Full evidence excerpts">
            <h3>Exact excerpts</h3>
            <dl>
              {references.map((evidence) => (
                <div key={evidence.id}>
                  <dt>{evidence.reference}</dt>
                  <dd>{evidence.excerpt}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section aria-label="Evidence integrity">
            <h3>Integrity</h3>
            <dl>
              {integrity.map((item) => (
                <div key={item.label}>
                  <dt>{item.label}</dt>
                  <dd>
                    <code>{item.value}</code>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </details>
    </section>
  );
}
