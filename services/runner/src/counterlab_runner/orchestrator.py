from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal


@dataclass(frozen=True)
class StructuredCounterexample:
    invariant: str
    observed: object
    expected: object
    counterexample: str


def sanitize_counterexamples(report: Mapping[str, object]) -> tuple[StructuredCounterexample, ...]:
    failures = report.get("failures")
    if not isinstance(failures, Sequence) or isinstance(
        failures, (str, bytes, bytearray)
    ):
        return ()
    sanitized: list[StructuredCounterexample] = []
    for failure in failures:
        if not isinstance(failure, Mapping):
            continue
        invariant = failure.get("invariant")
        counterexample = failure.get("counterexample")
        if not isinstance(invariant, str) or not isinstance(counterexample, str):
            continue
        sanitized.append(
            StructuredCounterexample(
                invariant=invariant[:128],
                observed=failure.get("observed"),
                expected=failure.get("expected"),
                counterexample=counterexample[:1_024],
            )
        )
    return tuple(sanitized)


@dataclass(frozen=True)
class PipelineOutcome:
    status: Literal["VERIFIED", "REJECTED"]
    failures: tuple[StructuredCounterexample, ...]
    result: dict[str, Any] | None

    @classmethod
    def verified(cls, result: dict[str, Any]) -> "PipelineOutcome":
        return cls(status="VERIFIED", failures=(), result=result)

    @classmethod
    def rejected(
        cls, failures: tuple[StructuredCounterexample, ...]
    ) -> "PipelineOutcome":
        return cls(status="REJECTED", failures=failures, result=None)


@dataclass(frozen=True)
class OrchestrationOutcome:
    status: Literal["VERIFIED", "REJECTED"]
    attempts: int
    repairs: int
    failures: tuple[StructuredCounterexample, ...]
    result: dict[str, Any] | None


Pipeline = Callable[[Path], PipelineOutcome]
Repair = Callable[[tuple[StructuredCounterexample, ...], int], Path]


class CompileVerifyOrchestrator:
    """Run one candidate plus at most two repairs in separate workspaces."""

    def __init__(self, pipeline: Pipeline, *, max_repairs: int = 2) -> None:
        if not 0 <= max_repairs <= 2:
            raise ValueError("max_repairs must be between 0 and 2")
        self._pipeline = pipeline
        self._max_repairs = max_repairs

    def run(self, initial_workspace: Path, repair: Repair) -> OrchestrationOutcome:
        workspace = initial_workspace
        attempts = 0
        repairs = 0
        latest = PipelineOutcome.rejected(())
        while True:
            attempts += 1
            latest = self._pipeline(workspace)
            if latest.status == "VERIFIED" or repairs >= self._max_repairs:
                return OrchestrationOutcome(
                    status=latest.status,
                    attempts=attempts,
                    repairs=repairs,
                    failures=latest.failures,
                    result=latest.result,
                )
            repairs += 1
            workspace = repair(latest.failures, repairs)
