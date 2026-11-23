"""Benchmark destinations are derived from GitHub run IDs, never caller-supplied paths."""
from dataclasses import dataclass
import os
import re


@dataclass(frozen=True)
class Destination:
    mode: str = "release"
    run_id: str = ""

    def __post_init__(self):
        valid = (self.mode == "release" and self.run_id == "") or (
            self.mode == "benchmark" and re.fullmatch(r"[1-9][0-9]*", self.run_id))
        if not valid:
            raise ValueError("Invalid OSS destination")

    @property
    def prefix(self):
        return f"bosi/_benchmarks/{self.run_id}" if self.mode == "benchmark" else "bosi"


RELEASE = Destination()


def from_environment():
    benchmark = os.environ.get("BOSI_OSS_BENCHMARK", "false")
    if benchmark == "false":
        return RELEASE
    if benchmark != "true":
        raise ValueError("BOSI_OSS_BENCHMARK must be true or false")
    return Destination("benchmark", os.environ["GITHUB_RUN_ID"])
