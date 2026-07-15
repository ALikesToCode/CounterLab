from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Sequence

from .artifacts import generate_public_artifacts
from .canonical import canonical_json, sha256_json
from .experiment import run_leakage_experiment
from .fixture import generate_leakage_fixture
from .imbalance import (
    canonical_imbalance_run_specs,
    generate_imbalance_fixture,
    run_imbalance_experiment,
    run_imbalance_plan,
)
from .imbalance_transfer import evaluate_manufacturing_transfer
from .imbalance_verifier import (
    critical_imbalance_mutations,
    verify_imbalance_candidate,
)
from .verifier import critical_mutations, verify_candidate
from .transfer import evaluate_forecasting_transfer


def _write_result(output: Path, result: dict[str, Any]) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(f"{canonical_json(result)}\n", encoding="utf-8")


def _run_command(args: argparse.Namespace) -> int:
    result = run_leakage_experiment(generate_leakage_fixture(seed=args.seed), seed=args.seed)
    _write_result(args.output, result)
    run_ids = ", ".join(run["id"] for run in result["runs"])
    print(f"VERIFIED_RESULT {result['resultHash']} runs={run_ids}")
    return 0


def _generate_command(args: argparse.Namespace) -> int:
    output = generate_public_artifacts(args.root, seed=args.seed)
    print(json.dumps(output, indent=2, sort_keys=True))
    return 0


def _mutations_command(args: argparse.Namespace) -> int:
    if args.concept == "leakage":
        seed = 1729 if args.seed is None else args.seed
        reference = run_leakage_experiment(
            generate_leakage_fixture(seed=seed), seed=seed
        )
        mutations = critical_mutations(reference)
        verifier = verify_candidate
    elif args.concept == "imbalance":
        seed = 2603 if args.seed is None else args.seed
        reference = run_imbalance_plan(
            generate_imbalance_fixture(seed=seed),
            canonical_imbalance_run_specs(seed),
            plan_id="mutation-reference-imbalance-v2",
            session_id="mutation-benchmark",
            artifact_manifest_hash=sha256_json(
                {
                    "fixture": "public-imbalance-v1",
                    "purpose": "mutation-reference",
                }
            ),
            concept_pack_version="1.0.0",
        )
        mutations = critical_imbalance_mutations(reference)
        verifier = verify_imbalance_candidate
    else:
        print(f"Unsupported concept: {args.concept}")
        return 2
    rows: list[tuple[str, str, str]] = []
    escaped = 0
    for mutation in mutations:
        report = verifier(mutation["candidate"])
        detected = report["status"] == "REJECTED" and mutation["expectedInvariant"] in {
            failure["invariant"] for failure in report["failures"]
        }
        state = "DETECTED" if detected else "ESCAPED"
        if not detected:
            escaped += 1
        rows.append((mutation["id"], mutation["expectedInvariant"], state))

    width = max(len("MUTATION"), *(len(row[0]) for row in rows))
    print(f"{'MUTATION':<{width}}  INVARIANT  STATUS")
    for mutation_id, invariant, state in rows:
        print(f"{mutation_id:<{width}}  {invariant}  {state}")
    print(f"Summary: {len(rows) - escaped}/{len(rows)} critical mutations detected")
    return 1 if escaped else 0


def _transfer_command(args: argparse.Namespace) -> int:
    if args.concept == "leakage":
        if args.strategy is None or args.risk is None:
            raise ValueError("leakage transfer requires --strategy and --risk")
        result = evaluate_forecasting_transfer(
            strategy_choice=args.strategy,
            risk_choice=args.risk,
            evidence_choices=args.evidence,
        )
    elif args.concept == "imbalance":
        if args.decision is None or args.metric is None:
            raise ValueError("imbalance transfer requires --decision and --metric")
        result = evaluate_manufacturing_transfer(
            decision_choice=args.decision,
            metric_choice=args.metric,
            evidence_choices=args.evidence,
        )
    else:
        raise ValueError(f"unsupported transfer concept: {args.concept}")
    _write_result(args.output, result)
    print(f"{result['outcome']} {result['resultHash']}")
    return 0 if result["passed"] else 1


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="counterlab-kernel")
    subcommands = parser.add_subparsers(dest="command", required=True)

    run = subcommands.add_parser("run", help="compute the canonical leakage result")
    run.add_argument("--seed", type=int, default=1729)
    run.add_argument("--output", type=Path, required=True)
    run.set_defaults(handler=_run_command)

    generate = subcommands.add_parser("generate", help="generate the public fixture and notebook")
    generate.add_argument("--root", type=Path, required=True)
    generate.add_argument("--seed", type=int, default=1729)
    generate.set_defaults(handler=_generate_command)

    mutations = subcommands.add_parser("mutations", help="run the published critical mutation matrix")
    mutations.add_argument("--concept", default="leakage")
    mutations.add_argument("--seed", type=int)
    mutations.set_defaults(handler=_mutations_command)

    transfer = subcommands.add_parser(
        "transfer", help="score one fixed transfer task without a model"
    )
    transfer.add_argument("--concept", choices=("leakage", "imbalance"), required=True)
    transfer.add_argument("--strategy")
    transfer.add_argument("--risk")
    transfer.add_argument("--decision")
    transfer.add_argument("--metric")
    transfer.add_argument("--evidence", action="append", default=[])
    transfer.add_argument("--output", type=Path, required=True)
    transfer.set_defaults(handler=_transfer_command)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    return int(args.handler(args))


if __name__ == "__main__":
    raise SystemExit(main())
