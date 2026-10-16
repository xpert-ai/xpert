# Skill commands in ChatKit

Commands are shortcuts into ordinary Agent Skills. `SKILL.md` owns the instructions
and routes slash arguments; `extensions.xpertai.commands` contains presentation
metadata only. This is an Xpert extension, not a new Agent Plugins or Agent Skills
standard field.

```json
{
  "extensions": {
    "xpertai": {
      "version": 2,
      "commands": {
        "greeting": {},
        "bom": {
          "label": { "en_US": "BOM", "zh_Hans": "物料清单" },
          "description": "Work with a bill of materials",
          "subcommands": {
            "import": { "label": "导入物料", "argsHint": "Attach the source BOM" },
            "update": { "argsHint": "Describe the requested changes" }
          }
        }
      }
    }
  }
}
```

Each command key must match a valid `skills/<key>/SKILL.md` in the same package.
Labels and descriptions accept a string or `{en_US, zh_Hans?, zh_Hant?}`. An empty
command object enables a plain skill shortcut. Subcommands have the same optional
`label`, `description`, and `argsHint` fields; nested subcommands, prompts, paths,
code, and execution overrides are not accepted. Keys use lower-case letters,
numbers and hyphens (maximum 64 characters). At most 100 commands and 50
subcommands per command are accepted. Invalid commands produce component
diagnostics without disabling the package's other skills, MCP servers or templates.

Only selected packages contribute commands. The shortcut row appears only before a
conversation starts. In ongoing conversations, type `/` to find the same commands
by key (for example `/bom/plan`), descriptive label, or description. Choosing an
entry removes the slash search and inserts the skill and subcommand; it never
sends the message automatically.
When subcommands exist, the row shows `command/subcommand` instead of a parent-only
shortcut. Labels fall back to the keys. Clicking inserts the usual skill chip,
then ordinary editable text such as `/import`, retaining existing user arguments.
Repeated selection of the same skill replaces a known subcommand prefix without
duplicating its chip. A command without subcommands inserts just the skill chip;
it can be sent with no additional text. Removing the plugin removes its chip and
preserves the user's text.

The read-only SDK method `client.assistants.getResourceCommands()` accepts the
existing `bindingId + version` resource selection. Discovery creates no Assistant,
SkillPackage, or toolset and returns no file paths or instruction bodies.
Explicit message activation adds `resourceSkills: [{bindingId, version, skillKey}]`
independently of workspace `runtimeCapabilities` allowlists. The main runtime
rechecks Assistant/Project access, selected versions, package availability, role,
and content digest, then reads the exact skill into the human message. A slash
argument belonging to the selected skill is not expanded as a global workflow.
Only the main task receives this activation; it is not inherited by child agents.
Skill instructions do not grant any additional tool, connector, or file access.

`role: "assistant"` packages do not contribute shortcuts. Existing template-market,
subagent, skill and MCP behavior is unchanged. UI display metadata never becomes
an authorization grant. Replay retains pinned references and revalidates access;
steered messages can activate only resources already resolved for the running task.

The `commands/fixtures/command-demo` package includes a plain greeting command and
`bom/summary`, `bom/plan` subcommands for reproducible acceptance.

Release order: publish the SDK addition, update ChatKit's SDK dependency and lockfile
to that published version, then release ChatKit types/UI and the API. Local cross-repo
verification can use the newly built SDK; the current published SDK does not expose
`getResourceCommands` yet. No nonexistent dependency version is recorded here.
