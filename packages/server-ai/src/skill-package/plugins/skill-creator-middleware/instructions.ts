export const SKILL_CREATOR_AUTHORING_PROMPT = `
## Skill Creator

Use the skill creator tools only when the user wants to create, update, inspect-for-edit, or delete a workspace skill package. This middleware is authoring-only: do not use it to discover, install, enable, sync, or read runtime skills.

Routing:

- For creating or maintaining a workspace skill package, use create_workspace_skill, get_workspace_skill_for_edit, update_workspace_skill, or delete_workspace_skill.
- For using an already-enabled skill to perform a task, use the Skills System flow and read_skill_file when applicable.
- Do not use read_skill_file, search_skill_repository, install_workspace_skills, or sandbox runtime directories to author workspace skill packages.
- Do not ask where to create the skill in V1. The current workspace is implicit.

When creating or updating a skill:

1. Start by clarifying only the most important missing details. Avoid asking many questions in a single message.
2. Establish the skill's functionality, concrete example user requests, and trigger phrases. If these are clear enough from the user request, proceed without more questions.
3. Draft a complete SKILL.md for another agent to use. Keep it concise, procedural, and useful after the skill triggers.
4. For simple skills, create only SKILL.md.
5. For complex skills, create optional bundled files only when they directly help the skill work:
   - agents/openai.yaml for UI-facing skill metadata when useful.
   - scripts/ for deterministic or repeatedly reused executable logic.
   - references/ for longer instructions, schemas, examples, or domain material that should be loaded only when needed.
   - assets/ for templates, images, fonts, icons, or other output resources.
6. Do not create README, CHANGELOG, installation docs, or unrelated auxiliary files.
7. Call create_workspace_skill with the complete SKILL.md and optional files for new skills. Call update_workspace_skill only to replace SKILL.md for existing skills.
8. After the tool returns, summarize the status, skill name, packagePath, created bundled files, and whether runtime availability requires a new runtime selection or refresh.

When editing an existing skill:

- Use get_workspace_skill_for_edit before updating unless the user provides an unambiguous id or packagePath and full replacement content.
- If the tool returns ambiguous, show the candidates and ask the user to choose one.
- If the tool rejects invalid frontmatter, fix the SKILL.md and retry once.
- Never guess an id when name, displayName, or packagePath would be a safer ref.

SKILL.md frontmatter rules:

- Include exactly name and description.
- Use name as the stable skill name.
- Use description as the primary trigger mechanism. Include what the skill does and when to use it.
- Do not put "when to use" guidance only in the body because the body is loaded after triggering.
- Use imperative or infinitive wording in the body.

Bundled file rules:

- Do not include SKILL.md in files. SKILL.md must be provided as skillMarkdown.
- Use POSIX relative paths under agents/openai.yaml, scripts/, references/, or assets/.
- Use content for UTF-8 text files.
- Use contentBase64 only for binary assets under assets/.
- Keep SKILL.md lean and point to references/ files when longer details are optional.

Always preserve the split with Skills Middleware: this middleware changes workspace skill packages; Skills Middleware later handles runtime skill loading and progressive disclosure.
`.trim()
