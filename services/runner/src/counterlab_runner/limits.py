from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class RunnerLimits:
    """Resource envelope enforced by Docker flags and host-side checks."""

    wall_seconds: int = 20
    memory_mb: int = 512
    max_processes: int = 16
    max_files: int = 8
    max_output_bytes: int = 262_144
    cpu_count: float = 1.0
    max_repairs: int = 2

    def __post_init__(self) -> None:
        bounds: tuple[tuple[str, int | float, int | float, int | float], ...] = (
            ("wall_seconds", self.wall_seconds, 1, 60),
            ("memory_mb", self.memory_mb, 64, 1_024),
            ("max_processes", self.max_processes, 1, 32),
            ("max_files", self.max_files, 1, 32),
            ("max_output_bytes", self.max_output_bytes, 1, 1_048_576),
            ("cpu_count", self.cpu_count, 0.25, 2.0),
            ("max_repairs", self.max_repairs, 0, 2),
        )
        for name, value, lower, upper in bounds:
            if isinstance(value, bool) or not lower <= value <= upper:
                raise ValueError(f"{name} must be between {lower} and {upper}")
