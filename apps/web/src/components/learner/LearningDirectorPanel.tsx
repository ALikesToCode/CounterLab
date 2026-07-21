import type { SessionView } from "../../api";

type LearningDirectorState = NonNullable<SessionView["learningDirector"]>;
type ClarificationChoice = Extract<
  LearningDirectorState["decision"],
  { status: "CLARIFICATION_REQUIRED" }
>["choices"][number];

const clarificationCopy: Readonly<Record<ClarificationChoice, string>> = {
  "comparison-first": "See the comparison first",
  "controls-first": "Trace the controls first",
  "boundary-first": "Explore the boundary first",
  "apply-first": "Apply the rule first",
};

const scaffoldCopy: Readonly<Record<string, string>> = {
  "compare-splits": "Compare evaluation boundaries side by side.",
  "hold-controls-fixed": "Keep the model, seed, and metric visibly fixed.",
  "compare-metrics": "Compare overall and rare-case measures together.",
  "hold-operating-point-fixed":
    "Keep the operating point visible while the measure changes.",
};

const clarificationQuestions = {
  "learning-emphasis": "Which part should the introduction foreground?",
} as const;

export function LearningDirectorPanel({
  state,
  busy,
  onAnswer,
}: {
  state: LearningDirectorState;
  busy: boolean;
  onAnswer: (answer: ClarificationChoice) => void;
}) {
  if (state.decision.status === "CLARIFICATION_REQUIRED") {
    return (
      <section
        className="panel learning-director-panel"
        aria-labelledby="learning-director-question"
      >
        <p className="eyebrow">Learning setup · one question</p>
        <h2 id="learning-director-question">
          {clarificationQuestions[state.decision.questionId]}
        </h2>
        <p>
          This optional choice changes only how the supported lesson is
          introduced. You can confirm your explanation without answering it. It
          cannot choose the experiment, compute a result, verify evidence, grade
          your answer, or unlock Repair.
        </p>
        <div className="form-footer">
          {state.decision.choices.map((choice) => (
            <button
              className="button button-secondary"
              type="button"
              disabled={busy}
              key={choice}
              onClick={() => onAnswer(choice)}
            >
              {clarificationCopy[choice]}
            </button>
          ))}
        </div>
      </section>
    );
  }

  const { plan } = state.decision;
  return (
    <section
      className="panel learning-director-panel"
      aria-labelledby="learning-director-route"
    >
      <p className="eyebrow">Learning route · presentation only</p>
      <h2 id="learning-director-route">
        Suggested introduction emphasis: {plan.primaryEmphasis.toLowerCase()}.
      </h2>
      <ol
        className="learning-director-stages"
        aria-label="Planned learner stages"
      >
        {plan.introductionStages.map((stage) => (
          <li key={stage}>
            {stage === plan.primaryEmphasis ? <strong>{stage}</strong> : stage}
          </li>
        ))}
      </ol>
      {plan.scaffoldIds.map((scaffoldId) => (
        <p key={scaffoldId}>{scaffoldCopy[scaffoldId]}</p>
      ))}
      <small>
        GPT-5.6 selected only registered presentation IDs for review. The
        current fixed lesson does not claim to apply every suggestion. The
        Subject Pack scorer still selects the test, and fixed kernels and
        verifiers own every result and verdict.
      </small>
    </section>
  );
}
