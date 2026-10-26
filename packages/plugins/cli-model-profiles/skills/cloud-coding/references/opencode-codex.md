# OpenCode and Codex

Use only a compatible installed tool from the runtime catalog. Check `--version`
before using examples and `--help` if the registered version differs.

## OpenCode

```sh
cd ./project && opencode run --format json 'Implement the requested change within this project. Preserve unrelated changes, verify the result and report failures.'
```

The managed profile supplies the Xpert provider/model and a bounded permission
configuration. It denies external-directory access and interactive questions.
Do not replace the injected provider config, add broad permissions, or use `serve`
as a substitute for a finite coding run. Bound execution with `timeout_sec`.

## Codex

```sh
cd ./project && codex exec --json 'Implement the requested change in this project and run its relevant checks. Preserve unrelated changes.'
```

Use the existing Git repository. For a new project the user requested, initialize
its repository in that project directory before execution if Codex requires it.
The managed launcher supplies provider/model/authentication and the tenant's
permission policy. Read the Codex entry's `isolation` field in
`$XPERT_CODING_TOOLS_FILE`: `sandboxMode` is the effective CLI policy and
`enforcement` names the layer responsible for the boundary. These guarantees require
a host that advertises this contract. If `isolation` is absent, do not infer policy
or command readiness from the CLI profile revision; report that a matching managed
host update is required. `computer` means
Codex can access the files and network already available to the Computer's user;
it does not add a per-project boundary inside that container. `codex` retains
`workspace-write`. Neither a working directory nor the word “container” grants
permission to broaden access.

Use a fresh `codex exec` invocation as shown above. The managed entry rejects
sandbox, approval, config/profile, working-directory, extra writable-directory,
feature and remote overrides, including bypass aliases. Set the working directory
with `cd` before calling it. Pass the prompt after `--` if it starts with a dash.
Do not use resume/fork to inherit another session's policy or bypass the wrapper.

`--version` and a text-only PONG prove neither sandbox nor command readiness.
Before accepting work, the launcher executes a fixed command through Codex's
sandbox helper with the selected policy and current directory, without a model
request. If this probe reports `SandboxUnavailable`, stop and report an environment
blocker to the parent. Do not repeat the delegation or retry with broader permissions.
`IsolationConflict` means remove caller policy overrides and use the managed entry.

Read the result events, inspect the diff and independently verify the deliverable.
Neither process exit 0 nor a model's summary proves tests passed.
