# Project Tasks and Asynchronous Collaboration

Project Tasks connects a user's goal with Assistant delegation, execution history, and deliverables. Users describe their needs in a conversation, monitor progress in **Project tasks**, and have the responsible Assistant or an authorized user confirm the result. Earlier versions called the Workbench entry **Tasks and Timeline**.

This document describes current product behavior. Available executors depend on workspace configuration and authorization. Task management does not itself provide a Computer or another execution environment.

## Getting started

The project's general Assistant includes Project Tasks by default. For other Assistants, add the built-in **Plugin → Project Tasks** in Studio, connect it to the relevant Agent, and use it in a project conversation. An administrator must configure the executors that the Assistant can call.

Users describe the desired outcome, completion requirements, and deliverables. For example:

> Build a browser-based income and expense tracker. I should be able to add and delete entries and see monthly income, expenses, and balance. Arrange the development tasks, check the calculations when the work is ready, and give me files I can open and use.

The Assistant organizes tasks, selects an available executor, and checks the results. Users can name a preferred tool without supplying task IDs, request identifiers, or revision numbers.

A typical task follows this sequence:

1. The Assistant creates a task with its goal, completion requirements, owner, and any predecessors. The task starts as Not started.
2. The Assistant explicitly delegates it. The platform saves the attempt and returns an execution receipt. The Assistant can finish its reply while execution continues in the background.
3. The open conversation and Project tasks view update execution status. Users can leave the execution page and return later.
4. When execution ends, the result returns to the original responsible Assistant's conversation. If automatic continuation is allowed, the Assistant reads the result and continues checking it or arranges rework.
5. The responsible Assistant or an authorized user accepts the task. If requirements are unmet, the previous record is retained and another attempt can be arranged.

Changing planned dates only changes the schedule; it does not start execution. Successor tasks still require explicit delegation after their predecessors finish. Runtime delegation currently runs serially within each project to prevent simultaneous attempts from modifying the shared workspace.

## Task status and execution status

A task represents the business outcome to achieve. An execution record represents one attempt to achieve it. A task can retain several implementation attempts, retries, and independent reviews.

| Task status        | Meaning                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| Not started        | The task has been created but has not started, or rework has been requested and another delegation is pending |
| In progress        | The executor has actually started the current implementation attempt                                          |
| In review          | The current implementation run succeeded and its results still need checking against the requirements         |
| Completed          | An explicit completion decision has been made with supporting evidence                                        |
| Blocked            | Execution failed or another issue needs attention                                                             |
| Paused / Cancelled | The business task has been explicitly paused or cancelled                                                     |

**Execution success is not task acceptance.** A normal process exit, successful tool call, completed steps, or 100% progress does not replace result confirmation. Cancelling an execution does not automatically cancel the business task.

Responsibilities are divided as follows:

| Role                           | Responsibility                                                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| User and responsible Assistant | Goals, completion requirements, scheduling, executor selection, and acceptance or rework decisions                   |
| Execution tool and adapter     | Actual startup, running state, failure, cancellation, outputs, and execution results                                 |
| Platform                       | Persisting execution facts, reflecting them in task state, reliably delivering results, and refreshing the interface |
| Independent reviewer           | Assessing a specified implementation and its evidence without directly marking the original task as completed        |

The platform reflects only the current valid implementation attempt in task state. Older results cannot override changed requirements, a newer attempt, or subsequent user decisions. Tasks owned by a business application continue to follow that application's state rules.

A progress percentage appears when an explicit source supplies it. Otherwise, the interface shows status only and does not estimate completion from elapsed time.

## Tasks, timelines, and deliverables

Open **Project tasks** from the project page or the Workbench of a project conversation. Four layouts share search and filters:

| Layout       | Use it to inspect                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| All tasks    | Names, statuses, responsible Assistants, and execution records                                         |
| Task tree    | Parent-child relationships and hierarchy                                                               |
| Gantt        | Planned dates, actual execution intervals, and dependencies; tasks without dates appear as unscheduled |
| Status board | Tasks grouped by business status                                                                       |

While visible, the view synchronizes approximately every five seconds. Gantt supports hour, day, and week granularity, zoom, and navigation to the current time. These controls change presentation without rescheduling tasks.

Select a task name to open its details in a centered dialog:

- **Overview**: goal, responsible Assistant, requirements, hierarchy, dependencies, and schedule. Authorized users can edit the plan. Application-owned hierarchy and dependencies cannot be changed in this generic view.
- **Executions**: each attempt's purpose, executor, runtime state, result delivery state, and acceptance or rework evidence.
- **Outputs**: committed files and delivery diagnostics grouped by execution. Use the corresponding execution viewer to preview or download them. Mentioning a working directory or file path does not establish that a file has been delivered.

Each execution dot in a task row identifies one specific attempt. Selecting the dot opens that execution; selecting the task name opens business details. Coding executions open the independent execution viewer. Other executions use their available navigation target. Historical records without a linked target report that navigation is unavailable.

Web and Desktop use the same view and authorization rules. Language, theme, and fonts follow the host. The root font size defaults to 14px when the host does not supply one.

## Execution cards and live conversation replies

Creating or updating a task uses the normal tool record. Explicit delegation adds an execution card showing the task title, purpose, tool, and current status. Implementation and independent review have separate cards, and rework retains a new attempt record.

Repeated receipts for the same execution within one reply update the existing card instead of adding duplicates. Different replies retain their own references. The original title remains, while status refreshes from current authorized execution facts. Historical task cards remain readable.

A Coding execution card's **Open** action and its timeline dot lead to the same execution. Task-level cards and receipts without an independent execution target open Project tasks.

After the original reply ends, an open ChatKit continues observing the conversation. When a background result starts a follow-up Assistant turn, its reply appears in the message list and streams without a manual refresh. Card refresh and reply streaming are independent; cards can appear before the full reply finishes.

Reconnection reads persisted state. Replies completed while offline can be recovered from message history, without guaranteeing replay of every token generated during the disconnection. Observation and reconnection do not start the task again.

Automatic continuation depends on conversation state:

| Conversation state                                                            | Behavior                                                                                                                 |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| The Assistant is replying                                                     | Persist and queue the result to avoid concurrent writes to the same thread                                               |
| The current turn has ended                                                    | Create a follow-up in the original authorized conversation and display its output on the open page                       |
| Waiting for user input or approval, paused, or explicitly stopped by the user | Save the result without bypassing the wait or stop; the user can request inspection of existing results in a manual turn |
| The service is temporarily unavailable                                        | Recover persisted observation, delivery, and processing records; delivery retries do not rerun the tool                  |
| Access is revoked or the conversation is unavailable                          | Retain the record and show the blocked condition without redirecting it to another conversation                          |

## Acceptance and independent review

The responsible Assistant can inspect files and results directly or delegate an independent review. Acceptance must refer to the current implementation, current requirements, and specific result or file versions. If requirements, implementation, or evidence change, an older passing report cannot justify acceptance of the current task.

Independent review returns pass, changes required, or indeterminate. If independent review has been delegated, acceptance must reference the latest valid passing review. It cannot skip that review or cite an older report. A review report does not directly mark the task as completed.

An authorized user can also enter checks and a rationale in the task dialog's Executions tab, then select **Accept task** or **Request rework**. The platform still validates result status, versions, and required review evidence. Rework returns the task to Not started without automatically running it again.

Independent review requires an execution environment that isolates the evidence. The current implementation is provided by Computer OpenCode in Pro and examines fixed evidence only. It does not rerun implementation tests. The responsible Assistant can separately use authorized tools to inspect actual files and rerun tests before making the final decision.

## Exceptions and capability boundaries

- After a failed run, inspect that execution's error and retained results before the Assistant repairs the environment, adjusts the task, or starts another attempt. An unknown outcome is not automatically rerun, avoiding duplicate file changes.
- If execution has ended but the Assistant has not replied, delivery status in task details helps distinguish an undelivered result, a queued result, and blocked automatic continuation.
- File delivery failure is recorded separately from execution failure. Existing artifacts can remain available; successful execution alone does not establish that every file was delivered.
- A card refresh failure does not interrupt Assistant replies. Deleted or inaccessible resources appear unavailable. If the card provider is missing or uninstalled, the saved snapshot remains, and opening it still checks access.
- Missing historical cards are not reconstructed from Assistant text. A successful task mutation or delegation must not be repeated just to replace a missing receipt card.
- Project, conversation, execution, and file access are checked separately. Seeing a card does not grant access to its linked resources.

Plugins can emit cards through the same protocol and supply live status through an optional Provider. Initial presentation and later refresh can share the plugin's formatting logic, while business services retain ownership of business state. This capability is not limited to project tasks and does not require each plugin to supply a custom frontend component.

## Development and integration references

- [Built-in Project Tasks plugin](../packages/server-ai/src/xpert-project/plugins/project-tasks/README.md): tools, identity context, and result decision contracts.
- [Resource Card plugin SDK](../packages/plugin-sdk/RESOURCE-CARDS.md): card creation, optional Providers, authorization, and refresh boundaries.
- [Conversation activity service](../packages/server-ai/src/ai/thread-activity/README.md): background reply discovery and existing execution streams.
- [Reliable Runtime replies](../packages/server-ai/src/handoff/runtime-messaging/README.md): delivery, consumption, recovery, and troubleshooting.
- [Project tasks view](../packages/server-ai/src/xpert-project/remote-components/project-tasks/README.md) and [Coding execution viewer](../packages/server-ai/src/agent-invocation/remote-components/coding-execution/README.md): navigation and interface behavior.
