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
cd ./project && codex exec --sandbox workspace-write --json 'Implement the requested change in this project and run its relevant checks. Preserve unrelated changes.'
```

Use the existing Git repository. For a new project the user requested, initialize
its repository in that project directory before execution if Codex requires it.
Retain the workspace-write sandbox. If the runtime cannot provide its required
sandbox facilities, report the error rather than disabling the sandbox or using
dangerous bypass flags. The host already supplies provider/model/authentication.

Read the result events, inspect the diff and independently verify the deliverable.
Neither process exit 0 nor a model's summary proves tests passed.
