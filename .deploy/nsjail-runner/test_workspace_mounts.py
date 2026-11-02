import base64
import os
import pathlib
import tempfile
import unittest
from http import HTTPStatus
from unittest import mock

import runner


class RunnerProjectContentMountTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temporary_directory.name)
        self.workspace_root = self.root / "sandbox"
        self.workspace = self.workspace_root / "tenant-1" / "project" / "project-1"
        self.workspace.mkdir(parents=True)
        self.workspace_root = self.workspace_root.resolve()
        self.workspace = self.workspace.resolve()
        (self.workspace / "project.md").write_text("Project instructions")
        (self.workspace / "skills").mkdir()
        self.patchers = [
            mock.patch.object(runner, "WORKSPACE_ROOT", self.workspace_root),
            mock.patch.object(runner, "USE_CGROUP_V2", False),
            mock.patch.object(runner, "JAIL_UID", os.geteuid()),
            mock.patch.object(runner, "JAIL_GID", os.getegid()),
        ]
        for patcher in self.patchers:
            patcher.start()

    def tearDown(self) -> None:
        with runner.RUNTIMES_LOCK:
            runtimes = list(runner.RUNTIMES.values())
            runner.RUNTIMES.clear()
        for runtime in runtimes:
            runtime.destroy()
        for patcher in reversed(self.patchers):
            patcher.stop()
        self.temporary_directory.cleanup()

    def create_payload(self, **overrides: object) -> dict[str, object]:
        payload: dict[str, object] = {
            "runtimeId": "a" * 32,
            "workingDirectory": "/workspace",
            "workspacePath": str(self.workspace),
            "protectProjectContent": True,
        }
        payload.update(overrides)
        return payload

    def test_protected_runtime_adds_only_the_fixed_read_only_mounts(self) -> None:
        runtime = runner.create_runtime(self.create_payload())

        args = runner.nsjail_args(runtime, "true")

        read_only_mounts = [
            args[index + 1]
            for index, argument in enumerate(args)
            if argument == "--bindmount_ro"
        ]
        self.assertEqual(
            read_only_mounts,
            [
                f"{runner.APP_DATA_MASK}:/workspace/.apps",
                f"{self.workspace / 'project.md'}:/workspace/project.md",
                f"{self.workspace / 'skills'}:/workspace/skills",
            ],
        )

    def test_unprotected_runtime_does_not_add_project_content_mounts(self) -> None:
        payload = self.create_payload(runtimeId="b" * 32)
        payload.pop("protectProjectContent")

        runtime = runner.create_runtime(payload)

        args = runner.nsjail_args(runtime, "true")
        mounts = [args[i + 1] for i, item in enumerate(args) if item == "--bindmount_ro"]
        self.assertEqual(mounts, [f"{runner.APP_DATA_MASK}:/workspace/.apps"])

    def test_app_data_is_masked_and_file_rpc_cannot_read_or_write_it(self) -> None:
        runtime = runner.create_runtime(self.create_payload())
        private = self.workspace / ".apps" / "meetings"
        private.mkdir()
        (private / "secret.txt").write_text("secret")
        for target in ("/workspace/.apps/meetings/secret.txt", ".apps/other/new.txt", "/workspace/.APPS/meetings/secret.txt"):
            with self.assertRaises(runner.RunnerError):
                runner.read_file_content(runtime, target)
            self.assertIsNotNone(runner.upload_file(runtime, target, base64.b64encode(b"bad").decode())["error"])
        self.assertEqual((private / "secret.txt").read_text(), "secret")
        alias = self.workspace / "alias"
        alias.symlink_to(private, target_is_directory=True)
        with self.assertRaises(OSError):
            runner.read_file_content(runtime, "/workspace/alias/secret.txt")

    def test_rejects_symlinked_managed_directory_and_working_directory(self) -> None:
        (self.workspace / ".apps").symlink_to(self.workspace / "skills", target_is_directory=True)
        with self.assertRaises(runner.RunnerError):
            runner.create_runtime(self.create_payload())
        (self.workspace / ".apps").unlink()
        with self.assertRaises(runner.RunnerError):
            runner.create_runtime(self.create_payload(workingDirectory="/workspace/.apps"))

    def test_runner_file_uploads_cannot_bypass_project_content_mounts(self) -> None:
        runtime = runner.create_runtime(self.create_payload())
        content = base64.b64encode(b"replacement").decode()

        project_file = runner.upload_file(runtime, "/workspace/project.md", content)
        skill_file = runner.upload_file(runtime, "/workspace/skills/example/SKILL.md", content)

        self.assertEqual(project_file["error"], "permission_denied")
        self.assertEqual(skill_file["error"], "permission_denied")
        self.assertEqual((self.workspace / "project.md").read_text(), "Project instructions")
        self.assertFalse((self.workspace / "skills" / "example").exists())

    def test_rejects_a_symlinked_project_file(self) -> None:
        outside = self.root / "outside.md"
        outside.write_text("outside")
        (self.workspace / "project.md").unlink()
        (self.workspace / "project.md").symlink_to(outside)

        with self.assertRaisesRegex(runner.RunnerError, "project.md must not be a symbolic link"):
            runner.create_runtime(self.create_payload())

    def test_rejects_a_symlinked_skills_directory(self) -> None:
        outside = self.root / "outside-skills"
        outside.mkdir()
        (self.workspace / "skills").rmdir()
        (self.workspace / "skills").symlink_to(outside, target_is_directory=True)

        with self.assertRaisesRegex(runner.RunnerError, "skills must not be a symbolic link"):
            runner.create_runtime(self.create_payload())

    def test_rejects_a_hardlinked_project_file(self) -> None:
        outside = self.root / "outside.md"
        outside.write_text("outside")
        (self.workspace / "project.md").unlink()
        os.link(outside, self.workspace / "project.md")

        with self.assertRaisesRegex(runner.RunnerError, "project.md must have exactly one hard link"):
            runner.create_runtime(self.create_payload())

    def test_rejects_a_nested_symlink_in_project_skills(self) -> None:
        outside = self.root / "outside.md"
        outside.write_text("outside")
        skill_directory = self.workspace / "skills" / "unsafe"
        skill_directory.mkdir()
        (skill_directory / "SKILL.md").symlink_to(outside)

        with self.assertRaisesRegex(runner.RunnerError, "must not be a symbolic link"):
            runner.create_runtime(self.create_payload())

    def test_rejects_a_hardlinked_project_skill_file(self) -> None:
        outside = self.root / "outside.md"
        outside.write_text("outside")
        skill_directory = self.workspace / "skills" / "unsafe"
        skill_directory.mkdir()
        os.link(outside, skill_directory / "SKILL.md")

        with self.assertRaisesRegex(runner.RunnerError, "must have exactly one hard link"):
            runner.create_runtime(self.create_payload())

    def test_runtime_identity_rejects_a_change_to_project_content_protection(self) -> None:
        runner.create_runtime(self.create_payload())
        unprotected_payload = self.create_payload()
        unprotected_payload.pop("protectProjectContent")

        with self.assertRaises(runner.RunnerError) as context:
            runner.create_runtime(unprotected_payload)

        self.assertEqual(context.exception.status, HTTPStatus.CONFLICT)

    def test_rejects_non_true_project_content_protection_values(self) -> None:
        for value in (False, "true", 1, {}):
            with self.subTest(value=value):
                with self.assertRaisesRegex(runner.RunnerError, "protectProjectContent must be true"):
                    runner.create_runtime(self.create_payload(protectProjectContent=value))


if __name__ == "__main__":
    unittest.main()
