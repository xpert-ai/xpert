import type { TRuntimeSkillSource } from '@xpert-ai/contracts'
import type { SkillPackage } from '../../skill-package.entity'

export interface ISkillsMiddlewareOptions {
    /** Validated portable resources, supplied only by the execution overlay. */
    resourceOnly?: boolean
    /**
     * Optional manual allow-list for default skills. When omitted or empty, all
     * workspace skills are loaded by default and can be filtered by runtime
     * disabledSkillIds.
     */
    skills?: string[]
    systemPrompt?: string
    repositoryDefault?: {
        repositoryId: string
        disabledSkillIds: string[]
    }
    autoDiscovery?: {
        enabled?: boolean
        repositoryIds?: string[]
        searchLimit?: number
        maxInstallPerRun?: number
    }
}

/**
 * Runtime skill-selection state (attached to middleware state).
 *
 * - `selectedSkillIds`: Runtime-selected skill package IDs.
 * - `disabledSkillIds`: Runtime blacklist for the effective workspace skill set.
 * - `selectedSkillWorkspaceId`: Workspace ID associated with runtime-selected skills. If provided,
 *   middleware verifies access and uses that workspace for runtime skill loading; otherwise it falls
 *   back to the current context workspace.
 * - `skillSelectionMode`: Optional explicit runtime override for how workspace skills are resolved.
 *
 * Merge behavior with config:
 * - Omitted or empty `options.skills` means all skills in the current context
 *   workspace are default-enabled.
 * - Non-empty `options.skills` is a manual allow-list for the current context workspace.
 * - Runtime `selectedSkillIds` are an explicit allow-list for the effective workspace
 *   (`selectedSkillWorkspaceId` after access check / fallback), replacing configured defaults.
 * - When `skillSelectionMode` is `workspace_blacklist`, the middleware ignores configured and
 *   runtime-selected skill IDs, loads the full effective workspace skill set, and filters it with
 *   `disabledSkillIds`.
 */
export type RuntimeSkillSelectionMode = 'workspace_blacklist'

export type RuntimeSkillSelectionState = {
    selectedSkillIds?: string[]
    disabledSkillIds?: string[]
    selectedSkillWorkspaceId?: string
    skillSelectionMode?: RuntimeSkillSelectionMode
}

export type ConfigRepositoryDefaultSelection = {
    repositoryId: string
    disabledSkillIds: string[]
}

export type ConfigAutoDiscoveryOptions = {
    enabled: boolean
    repositoryIds: string[]
    searchLimit: number
    maxInstallPerRun: number
}

export type SkillPromptMetadata = {
    id: string
    name: string
    description?: string
    path?: string
    source?: string
    packagePath?: string
    /** Namespaced relative path used inside the shared runtime skills directory. */
    runtimePath?: string
    runtimeSource?: TRuntimeSkillSource['type']
    repositoryId?: string
    workspaceId: string
    version: string
    /** Authoritative source directory for non-Workspace skills such as Project Content. */
    localPath?: string
}

export type SkillSyncRecord = {
    containerPath: string
    error?: Error
    key: string
    promise: Promise<void>
    sandboxIdentity: string
    skill: SkillPromptMetadata
}

export type SkillPackageInstallMetadata = Partial<SkillPackage['metadata']> & {
    skillMdPath?: string
    skillPath?: string
    source?: string
}

export const FALLBACK_RUNTIME_ROOT_IN_CONTAINER = '/root'
export const RUNTIME_SKILLS_DIRECTORY = '.xpert/skills'
export const SKILL_FILE_NAME = 'SKILL.md'
export const MAX_SKILL_FILE_SIZE = 10 * 1024 * 1024
export const START_STATE_KEY = '__start__'
export const DEFAULT_AUTO_DISCOVERY_SEARCH_LIMIT = 5
export const MAX_AUTO_DISCOVERY_SEARCH_LIMIT = 20
export const DEFAULT_AUTO_DISCOVERY_MAX_INSTALL_PER_RUN = 3
export const MAX_AUTO_DISCOVERY_MAX_INSTALL_PER_RUN = 10
export const AUTO_DISCOVERY_SYSTEM_PROMPT = `
## Skill Discovery

Automatic skill discovery is enabled. If the installed skills above are not enough for the user's request:

1. Use search_skill_repository to find relevant skills from the indexed skill repositories.
2. Install only the most relevant skills with install_skills.
3. After installation, read the installed skill's SKILL.md with read_skill_file and follow its instructions.
4. Outside a Project, you can also add skills yourself with \`npx skills add\`; it installs skills under the current working directory's \`.agents/skills\`. Read those SKILL.md files with read_skill_file using paths inside the current working directory.

Installation scope is bound by the host: Project skills persist in the current Project; outside a Project, skills persist in the current authoring Workspace. Never guess a target path or copy skills from another Project. list_skills shows the current installed set, including disabled Project skills. Reusing an installation does not update it or enable a disabled skill. A new thread reuses the persisted installation.

Search only when a new skill is likely to materially improve the answer. Do not install unrelated or speculative skills.

This is a runtime skill flow. Do not use read_skill_file, repository search, repository install, npx skills add, or runtime skill directories to create or maintain workspace skill packages. Use dedicated workspace skill authoring tools when present.`
export const PROJECT_SKILL_PRIORITY_SYSTEM_PROMPT = `When no skill is explicitly selected, prefer a matching Project skill over a general Xpert skill. An explicitly selected skill always takes priority.`
export const SKILLS_SYSTEM_PROMPT = `
## Skills System

You have access to a skills library that provides specialized capabilities and domain knowledge.

{skills_locations}

**Available Skills:**

{skills_list}

**How to Use Skills (Progressive Disclosure):**

Skills follow a **progressive disclosure** pattern - you know they exist (name + description above), but you only read the full instructions when needed:

1. **Recognize when a skill applies**: Check if the user's task matches any skill's description
2. **Read the skill's full instructions**: The skill list above shows the exact path to use with read_skill_file
3. **Follow the skill's instructions**: SKILL.md contains step-by-step workflows, best practices, and examples
4. **Access supporting files**: Skills may include Python scripts, configs, or reference docs - use absolute paths

**When to Use Skills:**
- When the user's request matches a skill's domain (e.g., "research X" → web-research skill)
- When you need specialized knowledge or structured workflows
- When a skill provides proven patterns for complex tasks

**Skills are Self-Documenting:**
- Each SKILL.md tells you exactly what the skill does and how to use it
- The skill list above shows the full path for each skill's SKILL.md file

**Executing Skill Scripts:**
Skills may contain scripts or other executable files. Always use absolute paths from the skill list.

**Example Workflow:**

User: "Can you research the latest developments in quantum computing?"

1. Check available skills above → See "web-research" skill with its full path
2. Read the skill using the path shown in the list
3. Follow the skill's research workflow (search → organize → synthesize)
4. Use any helper scripts with absolute paths

Remember: Skills are tools to make you more capable and consistent. When in doubt, check if a skill exists for the task.

Use this runtime flow to apply existing skills, not to author workspace skill packages. If the user asks to create, update, or delete a skill package, use dedicated workspace skill authoring tools when present.`
