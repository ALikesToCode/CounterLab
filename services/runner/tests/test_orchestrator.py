from __future__ import annotations

from pathlib import Path

from counterlab_runner.orchestrator import (
    CompileVerifyOrchestrator,
    PipelineOutcome,
    StructuredCounterexample,
    sanitize_counterexamples,
)


def _failure(attempt: int) -> StructuredCounterexample:
    return StructuredCounterexample(
        invariant="zero_group_overlap",
        observed={"count": attempt},
        expected={"count": 0},
        counterexample="Customer identities overlapped across the split.",
    )


def test_counterexample_sanitizer_drops_unapproved_verifier_fields() -> None:
    report = {
        "status": "REJECTED",
        "failures": [
            {
                "invariant": "zero_group_overlap",
                "observed": {"count": 2},
                "expected": {"count": 0},
                "counterexample": "Two customer IDs overlap.",
                "hiddenPath": "/repo/concept-packs/leakage/verifier/private.py",
                "traceback": "private stack",
            }
        ],
    }

    sanitized = sanitize_counterexamples(report)

    assert sanitized == (
        StructuredCounterexample(
            invariant="zero_group_overlap",
            observed={"count": 2},
            expected={"count": 0},
            counterexample="Two customer IDs overlap.",
        ),
    )
    assert "hiddenPath" not in repr(sanitized)
    assert "traceback" not in repr(sanitized)


def test_orchestrator_allows_at_most_two_repairs_and_sends_only_counterexamples(
    tmp_path: Path,
) -> None:
    workspaces = [tmp_path / f"attempt-{index}" for index in range(3)]
    for workspace in workspaces:
        workspace.mkdir()
    attempts: list[Path] = []
    repair_inputs: list[tuple[StructuredCounterexample, ...]] = []

    def pipeline(workspace: Path) -> PipelineOutcome:
        attempts.append(workspace)
        return PipelineOutcome.rejected((_failure(len(attempts)),))

    def repair(
        failures: tuple[StructuredCounterexample, ...], repair_number: int
    ) -> Path:
        repair_inputs.append(failures)
        return workspaces[repair_number]

    outcome = CompileVerifyOrchestrator(pipeline, max_repairs=2).run(
        workspaces[0], repair
    )

    assert outcome.status == "REJECTED"
    assert outcome.attempts == 3
    assert outcome.repairs == 2
    assert attempts == workspaces
    assert repair_inputs == [(_failure(1),), (_failure(2),)]


def test_orchestrator_stops_immediately_when_candidate_verifies(tmp_path: Path) -> None:
    workspace = tmp_path / "attempt-0"
    workspace.mkdir()
    repairs = 0

    def repair(
        failures: tuple[StructuredCounterexample, ...], repair_number: int
    ) -> Path:
        nonlocal repairs
        repairs += 1
        return workspace

    outcome = CompileVerifyOrchestrator(
        lambda _: PipelineOutcome.verified({"resultHash": "a" * 64}),
        max_repairs=2,
    ).run(workspace, repair)

    assert outcome.status == "VERIFIED"
    assert outcome.attempts == 1
    assert outcome.repairs == 0
    assert outcome.result == {"resultHash": "a" * 64}
    assert repairs == 0
