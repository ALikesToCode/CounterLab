import {
  Component,
  lazy,
  Suspense,
  type ComponentProps,
  type ReactNode,
} from "react";

import styles from "./DeferredVerifiedBeliefBreak.module.css";

type VerifiedBeliefBreakMechanismProps = ComponentProps<
  (typeof import("./VerifiedBeliefBreakTheater"))["VerifiedBeliefBreakMechanism"]
>;

const LazyVerifiedBeliefBreakMechanism = lazy(async () => {
  const module = await import("./VerifiedBeliefBreakTheater");
  return { default: module.VerifiedBeliefBreakMechanism };
});

export class VerifiedEvidenceLoadBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div
          className={styles.state}
          role="alert"
          aria-label="Verified sample evidence unavailable"
        >
          <strong>Verified sample evidence could not be loaded.</strong>
          <span>No result or conclusion was released.</span>
        </div>
      );
    }
    return this.props.children;
  }
}

export function DeferredVerifiedBeliefBreak(
  props: VerifiedBeliefBreakMechanismProps,
) {
  return (
    <VerifiedEvidenceLoadBoundary>
      <Suspense
        fallback={
          <div className={styles.state} role="status" aria-live="polite">
            Checking fixed sample evidence…
          </div>
        }
      >
        <LazyVerifiedBeliefBreakMechanism {...props} />
      </Suspense>
    </VerifiedEvidenceLoadBoundary>
  );
}
