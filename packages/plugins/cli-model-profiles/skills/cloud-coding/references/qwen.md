# Qwen Code

Verified command interface: Qwen Code 0.24.7 from the default Computer toolchain.
Always check the runtime catalog and `qwen --version`; this document is not an
installation or model-compatibility guarantee.

```sh
cd ./project && qwen -p 'Implement the requested homepage in this project. Preserve existing files unrelated to the task. Write the files, then summarize changes and any commands that require approval.' --output-format json
```

Choose `sandbox_shell.timeout_sec` for the expected task duration. Do not add fixed
turn, tool-call or CLI wall-time caps unless the task explicitly requires them.
Qwen's managed Xpert profile selects `auto-edit`: requested file edits work without
TTY prompts; commands still retain approval checks. Its interactive desktop profile
retains `default` approval mode. Do not pass `--yolo` or allow every shell tool.

If Qwen needs to build/test and its shell permission is denied, inspect the proposed
command. Run an already authorized project build through the parent `sandbox_shell`
tool, then give Qwen the errors for a focused fix if needed. Do not treat a denied
write or a result claiming “cannot edit” as task completion even if Qwen exits 0.

Xpert configures OpenAI-compatible authentication and the current Agent model.
Do not run `qwen auth` or override its model, auth type, base URL or key.
The CLI's `--help` is the authority for flags when the registered version changes.

Official headless documentation: https://qwenlm.github.io/qwen-code-docs/en/users/features/headless/
