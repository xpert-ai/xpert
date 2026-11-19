#!/usr/bin/env python3
"""Record a command against exact test inputs; this is provenance, not a business verdict."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time


def timestamp():
    return datetime.now(timezone.utc).isoformat()


def fingerprint(path):
    if not path.is_file():
        return None
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def input_path(root, name):
    # Preserve the declared path so a retargeted symlink is checked on later reads.
    path = Path(os.path.abspath(root / name))
    path.relative_to(root)
    path.resolve().relative_to(root)
    return path


def inputs(root, paths):
    result = []
    for name in paths:
        path = input_path(root, name)
        relative = path.relative_to(root).as_posix()
        digest = fingerprint(path)
        if digest is None:
            raise ValueError("Test input is not a file: " + relative)
        if not any(item["path"] == relative for item in result):
            result.append({"path": relative, "sha256": digest})
    return result


def current_inputs(root, recorded):
    result = []
    for item in recorded:
        path = input_path(root, item["path"])
        result.append({"path": item["path"], "sha256": fingerprint(path)})
    return result


def save(path, receipt):
    temporary = path.with_name(path.name + "." + str(os.getpid()) + ".tmp")
    try:
        with temporary.open("x", encoding="utf-8") as stream:
            json.dump(receipt, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def record(args):
    root = Path(args.root or ".").resolve()
    output = Path(args.output).resolve()
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not command:
        raise ValueError("Supply a command after --")
    before = inputs(root, args.input)
    if any((root / item["path"]).resolve() == output for item in before):
        raise ValueError("The receipt cannot be one of its test inputs")
    receipt = {
        "version": 1,
        "state": "running",
        "root": str(root),
        "startedAt": timestamp(),
        "inputs": before,
        # Arguments, environment, browser storage and output may contain credentials.
        "executable": Path(command[0]).name,
        "businessAcceptance": "not_assessed"
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("x", encoding="utf-8") as stream:
        json.dump(receipt, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
    started = time.monotonic()
    try:
        result = subprocess.run(command, cwd=root, check=False)
        receipt.update(state="finished", processExitCode=result.returncode)
        exit_code = result.returncode if result.returncode >= 0 else 128 - result.returncode
    except OSError as error:
        receipt.update(state="launch_failed", errorType=type(error).__name__)
        exit_code = 127
    except KeyboardInterrupt:
        receipt.update(state="interrupted")
        exit_code = 130
    try:
        after = current_inputs(root, before)
        receipt.update(inputsAfter=after, inputsUnchanged=before == after)
    except (OSError, ValueError) as error:
        receipt.update(inputsUnchanged=False, inputErrorType=type(error).__name__)
    if exit_code == 0 and not receipt["inputsUnchanged"]:
        exit_code = 3
    receipt.update(finishedAt=timestamp(), elapsedSeconds=round(time.monotonic() - started, 3), exitCode=exit_code)
    save(output, receipt)
    print(json.dumps({"receipt": str(output), "exitCode": exit_code,
                      "inputsUnchanged": receipt["inputsUnchanged"], "businessAcceptance": "not_assessed"}))
    return exit_code


def verify(args):
    receipt = json.loads(Path(args.receipt).read_text(encoding="utf-8"))
    if receipt.get("version") != 1 or receipt.get("state") != "finished":
        raise ValueError("Receipt does not describe a completed supported run")
    recorded = receipt.get("inputs")
    if not isinstance(recorded, list) or not recorded or not all(
        isinstance(item, dict) and isinstance(item.get("path"), str)
        and isinstance(item.get("sha256"), str) for item in recorded
    ):
        raise ValueError("Receipt has no valid input fingerprints")
    root = Path(args.root or receipt["root"]).resolve()
    if type(receipt.get("processExitCode")) is not int or type(receipt.get("exitCode")) is not int:
        raise ValueError("Receipt has no valid command exit status")
    matches = recorded == current_inputs(root, recorded)
    successful = receipt.get("processExitCode") == 0 and receipt.get("exitCode") == 0
    unchanged = receipt.get("inputsUnchanged") is True and receipt.get("inputsAfter") == recorded
    print(json.dumps({"matchesRecordedInputs": matches, "commandSucceeded": successful,
                      "processExitCode": receipt["processExitCode"],
                      "inputsUnchangedDuringRun": unchanged, "businessAcceptance": "not_assessed"}))
    # A completed failing check can be valid evidence. Integrity is not the command's outcome.
    return 0 if matches and unchanged else 3


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="operation", required=True)
    run = commands.add_parser("record")
    run.add_argument("--root", help="Project root containing all recorded inputs")
    run.add_argument("--input", action="append", required=True, help="Test script or fixture; repeat as needed")
    run.add_argument("--output", required=True, help="New receipt path; existing results are never overwritten")
    run.add_argument("command", nargs=argparse.REMAINDER)
    check = commands.add_parser("verify")
    check.add_argument("receipt")
    check.add_argument("--root", help="Root of an independently copied candidate with the same relative paths")
    args = parser.parse_args()
    try:
        return record(args) if args.operation == "record" else verify(args)
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(type(error).__name__ + ": " + str(error), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
