"""Host-owned execution boundary for generated CounterLab adapters.

The package validates generated workspaces, invokes the constrained local
container, and calls the frozen verifier from the host.  It is one layer in a
defense-in-depth design, not a formal sandbox proof.
"""

from .docker import DockerAdapterExecutor, DockerExecutionRecord, RunnerLimits
from .orchestrator import (
    CompileVerifyOrchestrator,
    PipelineOutcome,
    StructuredCounterexample,
)
from .pipeline import HostCompileVerifyPipeline
from .workspace import create_fresh_workspace, validate_generated_workspace

__all__ = [
    "CompileVerifyOrchestrator",
    "DockerAdapterExecutor",
    "DockerExecutionRecord",
    "HostCompileVerifyPipeline",
    "PipelineOutcome",
    "RunnerLimits",
    "StructuredCounterexample",
    "create_fresh_workspace",
    "validate_generated_workspace",
]
