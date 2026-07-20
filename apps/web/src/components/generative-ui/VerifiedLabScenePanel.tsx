import { useEffect, useState } from "react";

import {
  ApiClientError,
  counterLabApi,
  type VerifiedLabSceneView,
} from "../../api";
import { TrustedLabSceneRenderer } from "./TrustedLabSceneRenderer";

type SceneRequest =
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "ready"; view: VerifiedLabSceneView }>
  | Readonly<{ status: "unavailable"; message: string }>;

export function VerifiedLabScenePanel({ sessionId }: { sessionId: string }) {
  const [request, setRequest] = useState<SceneRequest>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setRequest({ status: "loading" });
    void counterLabApi
      .getLabScene(sessionId, controller.signal)
      .then((view) => {
        if (!controller.signal.aborted) setRequest({ status: "ready", view });
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setRequest({
          status: "unavailable",
          message:
            caught instanceof ApiClientError && caught.retryable
              ? "The verified scene could not be loaded yet. The fixed comparison below remains authoritative."
              : "The verified scene authority is unavailable. No generated visual was released.",
        });
      });
    return () => controller.abort();
  }, [sessionId]);

  if (request.status === "loading") {
    return (
      <section className="panel" role="status" aria-live="polite" aria-busy>
        <p className="eyebrow aqua">Trusted Lab Scene</p>
        <h4>Resolving the verified scene…</h4>
        <p>
          CounterLab is matching the bounded scene to immutable compiler and
          fixed-result hashes.
        </p>
      </section>
    );
  }
  if (request.status === "unavailable") {
    return (
      <section className="panel" role="status" aria-live="polite">
        <p className="eyebrow">Trusted Lab Scene</p>
        <h4>Generated visual withheld.</h4>
        <p>{request.message}</p>
      </section>
    );
  }
  return (
    <TrustedLabSceneRenderer
      scene={request.view.scene}
      verifiedSceneHash={request.view.verifiedSceneHash}
      signedResult={request.view.signedResult}
    />
  );
}
