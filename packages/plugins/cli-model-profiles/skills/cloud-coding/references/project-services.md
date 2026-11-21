# Project service handoff

The main Assistant decides **when** services should remain available or be shut
down. Coding CLI decides **how** to operate them using the project's own scripts.
The platform registers and checks state; it does not run application commands.
Project configuration `serviceLifecycle=coordinator` retains services across
tasks; `task` requests cleanup of services owned exclusively by that task.

On a Computer advertising project services, `XPERT_PROJECT_ROOT` identifies the
original mounted Project even in a separate review workspace:

```sh
computer-service list
computer-service start web --cwd "$XPERT_PROJECT_ROOT/app" --url http://127.0.0.1:8080 -- npm run dev -- --port 8080
computer-service logs web
computer-service stop web
```

Use `--project /workspace/projects/<project-id>` before the subcommand when the
runtime does not supply the variable. Read `computer-service --help`. Application
commands must stay in the foreground; for an existing project process manager,
use its foreground mode so the local manager owns the whole service tree.
Do not nest a daemonizing launcher and assume its exited parent proves success.

Only a small base environment is inherited. Put required application variables
in a private local JSON object and pass `--env-file /absolute/path/env.json`.
Never copy the complete Coding CLI environment, model credentials or transient
browser configuration. Prefer the project's normal environment-loading script.
Commands/config remain local and are not returned in the platform service list.

Before starting, check both registration and application readiness. The same
name and configuration reuses a live service; changed configuration requires
an explicit stop followed by start. Names are scoped to the Project. A service
that exited or belongs to an earlier Computer generation is not running.
Do not reinstall, rebuild, restart healthy services or switch instances merely
because a new Coding session began. If source changes require a restart, limit
it to affected services.

At handoff, record name, endpoint, generation, PID/startTime, startCount, readiness
and evidence paths. `running` proves only process liveness. Perform actual API/UI
tests for acceptance. Keep services while another review, rework or human
acceptance is pending. When the main Assistant assigns final cleanup, stop only
the listed Project services and verify their processes and endpoints stopped.
Container shutdown ends these services; a new container does not auto-start them.

Ordinary children of a Coding execution still get cleaned up on exit/cancellation.
Use this local manager only for authorized project application services, never
for extending the Coding agent/model session itself or bypassing a cancellation.
