#!/usr/bin/env python3
"""Encode a reviewer-authored JSON report in the current task-result envelope.

This helper does not assess the candidate, invent checks, set a verdict, repair
report fields, or submit anything to the platform. Run in the review workspace.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import sys


def check_fields(value, required, optional, path):
    if not isinstance(value, dict):
        raise ValueError(f"{path} must be an object")
    missing = sorted(required - value.keys())
    extra = sorted(value.keys() - required - optional)
    issues = []
    if missing:
        issues.append("missing fields: " + ", ".join(missing))
    if extra:
        issues.append("unexpected fields: " + ", ".join(name[:80] for name in extra[:20]))
    if issues:
        raise ValueError(path + ": " + "; ".join(issues) + ". Keep assessment text in the supported fields.")


def check_report_fields(report):
    """Preflight protocol field names; the host still validates the full schema and evidence."""
    version = report.get("version")
    if type(version) is not int or version not in (1, 2):
        raise ValueError("Unsupported report version; use the host's current review contract")
    common = {"version", "verdict", "specificationDigest", "implementationInvocationId",
              "evidence", "findings", "limitations"}
    check_fields(report, common | ({"mode", "summary", "checks"} if version == 2 else set()), set(), "report")
    if version == 2:
        shapes = {
            "checks": ({"description", "outcome", "actual"}, {"command", "expected", "evidencePaths"}),
            "findings": ({"id", "kind", "blocking", "description"},
                         {"requirement", "reproduction", "expected", "actual"})
        }
        for name, (required, optional) in shapes.items():
            if not isinstance(report[name], list):
                raise ValueError(f"report.{name} must be an array")
            for index, item in enumerate(report[name]):
                check_fields(item, required, optional, f"report.{name}[{index}]")


def local_file(value, *, existing):
    parts = value.split("/")
    if not value or "\\" in value or any(p in ("", ".", "..") for p in parts):
        raise ValueError("Use a relative file path without empty, dot, or parent segments")
    root = Path.cwd().resolve()
    target = root.joinpath(*parts)
    if target.resolve() != target or not target.is_relative_to(root):
        raise ValueError("Files must stay in the review workspace without symlinks")
    if existing and not target.is_file():
        raise ValueError(f"Missing file: {value}")
    return target


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", required=True, help="JSON report written by this reviewer")
    parser.add_argument("--file", action="append", default=[], help="Explicit deliverable file; repeat as needed")
    parser.add_argument("--output", required=True, help="Where to save the serialized envelope")
    parser.add_argument("--submission", choices=("inline", "file"), default="inline",
                        help="Use file only when the runtime advertises result-file submission v1")
    args = parser.parse_args()
    source = local_file(args.report, existing=True)
    output = local_file(args.output, existing=False)
    if output == source:
        raise ValueError("The envelope output must differ from the report input")
    if source.stat().st_size > 1024 * 1024:
        raise ValueError("Report input exceeds 1 MiB")
    report = json.loads(source.read_text(encoding="utf-8"))
    if not isinstance(report, dict):
        raise ValueError("The report must be a JSON object; use the host's current review schema")
    check_report_fields(report)
    context_path = Path.cwd() / "review-context.json"
    if context_path.exists():
        context = json.loads(local_file("review-context.json", existing=True).read_text(encoding="utf-8"))
        if "subject" in context:
            subject = context["subject"]
            fields = ("implementationInvocationId", "specificationDigest", "evidence")
            if not isinstance(subject, dict) or any(key not in subject for key in fields):
                raise ValueError("Invalid host review-context.json.subject")
            mismatches = [key for key in fields if report.get(key) != subject[key]]
            if mismatches:
                raise ValueError("Report subject differs from review-context.json.subject: " + ", ".join(mismatches)
                                 + ". Copy these fields programmatically from the host context; keep your assessment unchanged.")
    summary = json.dumps(report, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    if len(summary.encode("utf-16-le")) // 2 > 64000:
        raise ValueError("Encoded report exceeds the current task envelope's 64000-character limit")
    if len(args.file) > 32 or len(set(args.file)) != len(args.file):
        raise ValueError("Choose at most 32 distinct deliverable files")
    items = []
    for index, name in enumerate(args.file, 1):
        target = local_file(name, existing=True)
        if target == output:
            raise ValueError("The generated envelope cannot be its own evidence file")
        items.append({"type": "file", "id": f"evidence-{index}",
                      "title": target.name[:200], "summary": f"Reviewer-selected file: {name}", "path": name})
    envelope = {"version": 1, "summary": summary, "items": items}
    encoded = json.dumps(envelope, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    output.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    content = (encoded + "\n").encode("utf-8")
    with os.fdopen(descriptor, "wb") as handle:
        handle.write(content)
    if args.submission == "file":
        reference = {"version": 1, "path": args.output, "sha256": hashlib.sha256(content).hexdigest()}
        print("```xpert-task-result-file\n" + json.dumps(reference, separators=(",", ":")) + "\n```")
    else:
        print("```xpert-task-result\n" + encoded + "\n```")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError) as error:
        print(f"review-result: {error}", file=sys.stderr)
        sys.exit(1)
