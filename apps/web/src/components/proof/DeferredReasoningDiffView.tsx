import {
  Component,
  lazy,
  Suspense,
  type ComponentProps,
  type ReactNode,
} from "react";

import styles from "./ReasoningDiffView.module.css";

type ReasoningDiffViewProps = ComponentProps<
  (typeof import("./ReasoningDiffView"))["ReasoningDiffView"]
>;

const LazyReasoningDiffView = lazy(async () => {
  const module = await import("./ReasoningDiffView");
  return { default: module.ReasoningDiffView };
});

class ProofLoadBoundary extends Component<
  { children: ReactNode; onReload: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div className={styles.deferred} role="alert">
          <p>The technical proof could not be loaded.</p>
          <button type="button" onClick={this.props.onReload}>
            Reload technical proof
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function DeferredReasoningDiffView(props: ReasoningDiffViewProps) {
  return (
    <ProofLoadBoundary onReload={() => window.location.reload()}>
      <Suspense
        fallback={
          <div className={styles.deferred} role="status" aria-live="polite">
            Loading technical proof…
          </div>
        }
      >
        <LazyReasoningDiffView {...props} />
      </Suspense>
    </ProofLoadBoundary>
  );
}
