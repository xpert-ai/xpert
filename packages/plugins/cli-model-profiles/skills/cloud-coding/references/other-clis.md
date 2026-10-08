# Other registered coding CLIs

These notes are not an availability list. Check the runtime catalog, exact installed
version and help before using one. Do not replace a user-requested CLI silently.
Xpert supplies only supported model protocols; an installed tool can still be
incompatible with the active Agent model.

- **Claude Code**: use `claude -p 'TASK' --output-format json`. The default profile
  preserves its approval behavior. Add only a supported, scoped edit permission
  when justified by the user's request; never use `--dangerously-skip-permissions`.
- **Kimi Code**: inspect `kimi --help` for this pinned version's non-interactive
  prompt/output options. Folder trust or an approval request must be resolved via
  its supported confirmation flow, not a GUI typing workaround or global yolo.
- **CodeBuddy Code**: use `codebuddy -p 'TASK'` with supported structured output.
  Its default and subagent permission modes remain in effect. Inspect edit/tool
  denials before claiming completion.
- **Aider**: use `aider --message 'TASK'` with the intended project files. The host
  supplies main/weak/editor models and disables automatic commits. Check the
  result and approval requirements; do not add blanket `--yes-always`.

Keep coding runs finite. Execute authorized build/tests in the parent sandbox shell
when the CLI returns an approval requirement. A user denial still applies there.
Do not auto-update pinned managed binaries or overwrite isolated credential files.
