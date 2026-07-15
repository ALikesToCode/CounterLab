import { defineCatalog, type Spec } from "@json-render/core";
import { defineRegistry, JSONUIProvider, Renderer } from "@json-render/react";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

import type { PublicCompilerEvent } from "../../api";

const catalog = defineCatalog(schema, {
  components: {
    ProofSequence: {
      props: z.object({ label: z.string().max(80) }),
      description: "A sequence of sanitized public compiler events.",
    },
    ProofStep: {
      props: z.object({
        phase: z.enum(["analyze", "plan", "verify", "repair", "run"]),
        title: z.string().max(120),
        detail: z.string().max(600),
        status: z.enum(["active", "passed", "rejected", "neutral"]),
      }),
      description:
        "One browser-safe compiler step. It cannot execute actions or define validity.",
    },
  },
  actions: {},
});

const { registry } = defineRegistry(catalog, {
  components: {
    ProofSequence: ({ props, children }) => (
      <section className="generated-proof-sequence" aria-label={props.label}>
        <div className="generated-proof-label">
          <span>Constrained generated view</span>
          <small>Trusted components · no executable UI</small>
        </div>
        <div className="generated-proof-steps">{children}</div>
      </section>
    ),
    ProofStep: ({ props }) => (
      <article
        className={`generated-proof-step ${props.phase} ${props.status}`}
      >
        <span>{props.phase}</span>
        <div>
          <strong>{props.title}</strong>
          <p>{props.detail}</p>
        </div>
      </article>
    ),
  },
});

type ProofStepProps = {
  phase: "analyze" | "plan" | "verify" | "repair" | "run";
  title: string;
  detail: string;
  status: "active" | "passed" | "rejected" | "neutral";
};

function stepForEvent(event: PublicCompilerEvent): ProofStepProps {
  switch (event.kind) {
    case "job.started":
      return {
        phase: "analyze",
        title: "Protected runner started",
        detail:
          "The scoped job token and sanitized input bundle were accepted.",
        status: "active",
      };
    case "plan.summary":
      return {
        phase: "plan",
        title: event.title,
        detail: event.steps.join(" · "),
        status: "active",
      };
    case "artifact.read":
      return {
        phase: "analyze",
        title: `${event.evidenceRefs.length} evidence references resolved`,
        detail: event.evidenceRefs
          .map((reference) =>
            reference.cellIndex === undefined
              ? reference.kind
              : `cell ${reference.cellIndex} · ${reference.kind}`,
          )
          .join(" · "),
        status: "passed",
      };
    case "file.created":
      return {
        phase: "plan",
        title: `${event.path} created`,
        detail: `SHA-256 ${event.sha256.slice(0, 16)}…`,
        status: "passed",
      };
    case "diff.updated":
      return {
        phase: "repair",
        title: `${event.path} revised`,
        detail: "A bounded plan diff was produced after verifier feedback.",
        status: "active",
      };
    case "command.completed":
      return {
        phase: "verify",
        title: event.label,
        detail: `Exit ${event.exitCode} · ${event.durationMs} ms · ${event.excerpt}`,
        status: event.exitCode === 0 ? "passed" : "rejected",
      };
    case "verifier.rejected":
      return {
        phase: "verify",
        title: `Rejected: ${event.invariant}`,
        detail: event.counterexample,
        status: "rejected",
      };
    case "repair.started":
      return {
        phase: "repair",
        title: `Repair attempt ${event.attempt}`,
        detail: "Only the structured verifier counterexample was returned.",
        status: "active",
      };
    case "verifier.verified":
      return {
        phase: "verify",
        title: "External verifier accepted the plan",
        detail: `${event.invariantCount} invariants · ${event.mutationCount} mutations`,
        status: "passed",
      };
    case "result.ready":
      return {
        phase: "run",
        title: "Fixed-kernel result ready",
        detail: `Result SHA-256 ${event.resultHash.slice(0, 16)}…`,
        status: "passed",
      };
    case "job.failed":
      return {
        phase: "verify",
        title: event.code,
        detail: event.message,
        status: "rejected",
      };
  }
}

export function GeneratedProofView({
  events,
}: {
  events: readonly PublicCompilerEvent[];
}) {
  const visible = events.slice(-8);
  const elements: Spec["elements"] = {
    sequence: {
      type: "ProofSequence",
      props: { label: "Generated compiler proof view" },
      children: visible.map((_, index) => `step-${index}`),
    },
  };
  visible.forEach((event, index) => {
    elements[`step-${index}`] = {
      type: "ProofStep",
      props: stepForEvent(event),
      children: [],
    };
  });
  const spec = { root: "sequence", elements };

  return (
    <JSONUIProvider registry={registry} initialState={{}} handlers={{}}>
      <Renderer spec={spec} registry={registry} />
    </JSONUIProvider>
  );
}
