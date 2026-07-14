from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Sequence

from .artifacts import generate_public_artifacts
from .canonical import canonical_json
from .experiment import run_leakage_experiment
from .fixture import generate_leakage_fixture
from .verifier import critical_mutations, verify_candidate


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
    if args.concept != "leakage":
        print(f"Unsupported concept: {args.concept}")
        return 2
    reference = run_leakage_experiment(generate_leakage_fixture(seed=args.seed), seed=args.seed)
    rows: list[tuple[str, str, str]] = []
    escaped = 0
    for mutation in critical_mutations(reference):
        report = verify_candidate(mutation["candidate"])
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
    mutations.add_argument("--seed", type=int, default=1729)
    mutations.set_defaults(handler=_mutations_command)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    return int(args.handler(args))


if __name__ == "__main__":
    raise SystemExit(main())
