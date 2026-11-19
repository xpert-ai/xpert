---
name: browser-testing
description: Test and debug a running web application in the current cloud Computer using Chrome DevTools MCP or CLI, and reuse the installed Playwright browser for repeatable tests. Use for browser behavior, UI acceptance, console errors and network failures.
---

# Browser testing in the Computer

Use your Coding CLI's own tools. The browser and application run in this Computer,
so an application's localhost address refers to this environment. This skill does
not provide the host Assistant's Computer or Shell tools.

## Discover and reuse

Read `$XPERT_BROWSER_CAPABILITIES_FILE` for the installed browser, Playwright and
DevTools versions. `$PLAYWRIGHT_BROWSERS_PATH` identifies the image browser cache;
an empty `~/.cache/ms-playwright` or missing `chromium` command does not mean the
browser is absent. `$XPERT_BROWSER_CONFIG_FILE` contains this execution's browser
profile, workspace and launch settings. Do not overwrite another task's profile.

Use the `xpert_computer_browser` MCP tools when advertised by the CLI. They start
the browser on demand. Start with `list_pages` / `new_page`, then `take_snapshot`;
use element IDs from a current snapshot for `click`, `fill` and `fill_form`.
Read tool schemas for arguments. An open page or screenshot alone is not evidence
that the requested business operation worked.

If a control is missing, refresh the snapshot after the page has rendered and
inspect the actual frame tree before concluding that the tool cannot reach it.
Embedded content may use normal URLs, Blob URLs or `about:srcdoc`; locate frames
by their observed identity and controls instead of assuming a URL scheme. After
a wait fails, inspect the current page and diagnostics before repeating it with
a longer timeout. Prefer the current browser session; close unneeded browsers
before starting another test workflow to avoid resource contention.
In Python's synchronous Playwright API, use locator assertions or Playwright event
waits. Do not poll `page.frames` inside `time.sleep` loops: those sleeps prevent
protocol events from updating client state. For short diagnostic pauses only,
use `page.wait_for_timeout`; longer sleeps are not a readiness check.

Other Coding CLIs can use the installed Chrome DevTools CLI:

```sh
chrome-devtools start --config "$XPERT_BROWSER_CONFIG_FILE"
chrome-devtools list_pages
chrome-devtools new_page "http://localhost:<application-port>"
chrome-devtools take_snapshot <page-id>
chrome-devtools click <page-id> <element-uid>
chrome-devtools take_screenshot <page-id> --filePath "<project-output>/page.png"
chrome-devtools stop
```

Replace placeholders with the actual application address, current page/element
IDs and a path in the assigned workspace. Run `<command> --help` for its schema.
The CLI's daemon is scoped to this execution. `start` restarts that CLI browser;
do not repeat it before each action. MCP and CLI use separate processes: choose
one per browser workflow, or stop the first before switching the same profile.

For visible testing, start the CLI with `--headless=false` in addition to the
configuration. Its window appears on the Computer desktop. Browser processes may
stop when the coding execution finishes; preserve evidence in the project.

## Test the actual application

Use the project's own commands to inspect/start its services and check readiness.
Run existing browser tests where appropriate. Exercise the requested workflow
through the real UI, including meaningful negative cases and persistence checks.
Use the authorized test account and data; keep credentials out of screenshots,
reports and committed artifacts. Independent review uses its own browser session.

Choose inputs that distinguish the behavior under test: a positive match alone
does not prove that each condition works when another condition already excludes
every other record. Add a contrasting case for each important rule. After reload
or reopening, compare the required fields and history with their observed values
before navigation; a reachable page alone does not prove persistence.

Record meaningful actions and their asserted outcomes separately, with enough
detail to reproduce them without exposing credentials. Keep fixtures identifiable
and document any preexisting data needed by a rerun. An assertion failure must
produce a failed check; an unexercised check is blocked or skipped with a reason.
Do not swallow exceptions and report the whole suite as passed because its
process exited successfully. Preserve partial results when later checks fail.

When a check fails, inspect `list_console_messages` and `list_network_requests`,
then retrieve the relevant item. Distinguish browser startup, service readiness,
login/scope and application defects. Fix the identified cause before repeating a
check. Preserve the original failure and the affected rerun results.

For repeatable coverage, retain project-owned Playwright tests and their commands.
The image includes the Python Playwright library; a Node Playwright dependency is
owned by the project, not by `/opt/xpert/browser-tools/node_modules`. When creating
a new Python browser check, reuse the execution's verified executable and launch
arguments. In particular, do not rediscover emulation/GPU workarounds by repeatedly
launching the default browser:

```python
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright

settings = json.loads(Path(os.environ["XPERT_BROWSER_CONFIG_FILE"]).read_text())
with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path=settings["executablePath"],
        headless=settings["headless"],
        args=settings.get("chromeArg", []),
    )
    context = browser.new_context()  # Separate from the MCP browser's login/profile.
    page = context.new_page()
    # Navigate to the authorized application and exercise its real UI.
    browser.close()
```

Match the project's Playwright version to the browser revision. Reuse a matching
image installation; install a different browser into a user-owned cache only when
the project's dependency actually requires it. Do not force a mismatched binary
or upgrade project dependencies merely because a default cache path is empty.

Report the target URL, candidate/version when relevant, checks actually performed,
failures and exact evidence paths. Keep screenshots, traces and diagnostics in the
assigned output directory, separate from a read-only review candidate. Do not
substitute mocked API responses or database edits for the requested UI behavior.
