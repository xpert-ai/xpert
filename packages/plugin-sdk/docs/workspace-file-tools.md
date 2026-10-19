# Workspace file tools

Use the platform `SandboxFile` middleware to read, write, append and edit HTML,
Python, JavaScript and other text files. Domain plugins should consume the files
through `WorkspaceFilesRuntimeCapability` instead of adding duplicate writers.
The Assistant must enable the sandbox feature and include the file middleware;
these helpers do not enable tools or grant file access.

## Agent arguments

File paths are relative to the Assistant's file workspace, for example
`dashboards/sales.html` or `scripts/sales.py`. The SDK exports
`workspaceRelativeFilePathSchema` for the same portable input contract:

- At most 1024 characters, with non-empty `/`-separated segments.
- No absolute paths, Windows drive prefixes, backslashes, control characters,
  `.`/`..` segments or whitespace at either edge of a segment.
- Unicode names and spaces inside a segment are supported.

Write and append accept `{ file_path, content }`, with `content` as one string
(including an empty string). Arrays, `html` aliases and extra fields are rejected.
Edit uses `old_string`, `new_string` and optional `replace_all`; multi-edit takes
`edits` containing `oldString`, `newString` and optional `replaceAll`. Unknown keys
are rejected inside each edit as well as at the top level.

This is a file-path contract. Directory listing and search retain their own
schemas, including support for the workspace root. Input validation does not
replace host authorization, filesystem containment or symlink protection.

## Observing file mutation intent

The four mutating platform tools declare host-owned metadata:

```ts
metadata: workspaceFileMutationMetadata
// { workspaceFileOperation: { type: 'mutation', pathArgument: 'file_path' } }
```

A plugin can call `workspaceFileMutationPath(tool.metadata, toolCall.args)` to
obtain the validated relative path. Other tool implementations may declare their
own `pathArgument`. Missing or malformed metadata, non-mutation operations and
invalid paths return `undefined`; consumers must not infer mutation behavior
from tool names, labels or file extensions.

Metadata describes an attempted operation, not its success. A plugin may mark an
already registered document as potentially changed before execution, but must
inspect the tool result and actual file content before accepting a save. Writing
a file does not save an Artifact draft or publish a version. Artifact saves need
their own successful, revision-bearing receipt. Business rules for selecting
files, validating dashboards, saving drafts and publishing remain in plugins.

## Runtime path mapping

Plugins exchange relative paths, never container or server absolute paths. After
sandbox acquisition, the invocation handler uses the acquired provider's workspace
mapper when it differs from the requested provider, including when the host
chooses a default provider. Graph compilation and runtime workspace paths use this
mapped work area; server-side file access retains the Volume path and scope.
This does not add default-provider selection to hosts that require an explicit
provider, or change workspace authorization and sandbox lifecycle ownership.

## Recovering failed file edits

`sandbox_write_file` creates a new file; it does not overwrite an existing editing copy. Read an existing file and use exact-text edit tools. Structured mutation results containing an error provide a portable `recovery.read` tool call and recovery guidance without converting the error into success.

`BaseSandbox.multiEdit` persists operations sequentially, stops at the first error, and does not roll back earlier successful edits. Its optional `MultiEditResult.progress` reports `mode: "sequential"`, `appliedEdits`, and a one-based `failedEdit` on failure. Other backends may omit progress; consumers must not infer rollback or applied counts when it is absent. Transport exceptions propagate. Always reread current contents after a failed batch and apply only remaining changes.
