/**
Middleware for loading and exposing agent skills to the system prompt.

This middleware implements Anthropic's "Agent Skills" pattern with progressive disclosure:
1. Parse YAML frontmatter from SKILL.md files at session start
2. Inject skills metadata (name + description) into system prompt
3. Agent reads full SKILL.md content when relevant to a task

Skills directory structure (per-workspace + project):
Uorkspace-level: /sandbox/{WORKSPACE}/skills/
Project-level: {PROJECT_ROOT}/skills/

Example structure:
/sandbox/{WORKSPACE}/skills/
├── web-research/
│   ├── SKILL.md        # Required: YAML frontmatter + instructions
│   └── helper.py       # Optional: supporting files
├── code-review/
│   ├── SKILL.md
│   └── checklist.md

/sandbox/{PROJECT_ROOT}/skills/
└── SKILL.md        # Project-specific skills
*/
import { SystemMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { TAgentMiddlewareMeta } from '@metad/contracts'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import {
	AgentMiddleware,
	AgentMiddlewareStrategy,
	IAgentMiddlewareContext,
	IAgentMiddlewareStrategy,
	SandboxBackendProtocol,
	isSandboxBackend
} from '@xpert-ai/plugin-sdk'
import { access, readFile, stat } from 'fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'path'
import { In, Repository } from 'typeorm'
import { z } from 'zod/v3'
import { SkillPackage } from '../../skill-package.entity'
import { SKILLS_MIDDLEWARE_NAME } from '../../types'
import { SandboxAcquireBackendCommand, SandboxCopyFileCommand } from '../../../sandbox'
import { getWorkspaceRoot } from '../../../xpert-workspace'
import { XpertWorkspace } from '../../../xpert-workspace/workspace.entity'

export interface ISkillsMiddlewareOptions {
	skills?: string[]
	systemPrompt?: string
}

/**
 * Runtime skill-selection state (attached to middleware state).
 *
 * - `selectedSkillIds`: Runtime-selected skill package IDs.
 * - `selectedSkillWorkspaceId`: Workspace ID associated with runtime-selected skills. If provided,
 *   middleware verifies access and loads those skills from this workspace; otherwise it falls back
 *   to the current context workspace.
 *
 * Merge behavior with config:
 * - `options.skills` are always loaded for the current context workspace.
 * - Runtime `selectedSkillIds` are additionally loaded for the effective workspace
 *   (`selectedSkillWorkspaceId` after access check / fallback).
 */
type RuntimeSkillSelectionState = {
	selectedSkillIds?: string[]
	selectedSkillWorkspaceId?: string
}

type SkillPromptMetadata = {
	id: string
	name: string
	description?: string
	path?: string
	source?: string
	packagePath?: string
	workspaceId: string
	version: string
}

const SkillsRootInContainer = '/root/skills/'
const SKILL_FILE_NAME = 'SKILL.md'
const MAX_SKILL_FILE_SIZE = 10 * 1024 * 1024
const START_STATE_KEY = '__start__'
const SKILLS_SYSTEM_PROMPT = `
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

Remember: Skills are tools to make you more capable and consistent. When in doubt, check if a skill exists for the task!`

/**
 * Middleware for loading and exposing agent skills.

    This middleware implements Anthropic's agent skills pattern:
    - Loads skills metadata (name, description) from YAML frontmatter at session start
    - Injects skills list into system prompt for discoverability
    - Agent reads full SKILL.md content when a skill is relevant (progressive disclosure)

    Supports both workspace-level and project-level skills:
    - Workspace skills: /sandbox/{WORKSPACE}/skills/
    - Project skills: /sandbox/{PROJECT_ROOT}/skills/
    - Project skills override workspace skills with the same name

    Args:
        skills_dir: Path to the workspace-level skills directory.
        assistant_id: The agent identifier for path references in prompts.
        project_skills_dir: Optional path to project-level skills directory.
 */
@Injectable()
@AgentMiddlewareStrategy(SKILLS_MIDDLEWARE_NAME)
export class SkillsMiddleware implements IAgentMiddlewareStrategy<ISkillsMiddlewareOptions> {
	readonly #logger = new Logger(SkillsMiddleware.name)

	@Inject(CommandBus)
	private readonly commandBus: CommandBus

	constructor(
		@InjectRepository(SkillPackage)
		private readonly skillPackageRepository: Repository<SkillPackage>,
		@InjectRepository(XpertWorkspace)
		private readonly workspaceRepository: Repository<XpertWorkspace>
	) {}

	readonly meta: TAgentMiddlewareMeta = {
		name: SKILLS_MIDDLEWARE_NAME,
		label: {
			en_US: 'Skills Middleware',
			zh_Hans: '技能中间件'
		},
		icon: {
			type: 'svg',
			value: `<svg class="svg-icon" style="fill: currentColor;" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg"><path d="M448.512 479.232a54.272 54.272 0 1 1 56.32-55.296 55.296 55.296 0 0 1-56.32 55.296z m343.04 91.136l-73.728-110.592V450.56a245.76 245.76 0 0 0-244.736-245.76 225.28 225.28 0 0 0-58.368 7.168A244.736 244.736 0 0 0 228.352 450.56a224.256 224.256 0 0 0 36.864 130.048c43.008 61.44 71.68 110.592 54.272 177.152a47.104 47.104 0 0 0 9.216 43.008 45.056 45.056 0 0 0 36.864 18.432h200.704a48.128 48.128 0 0 0 48.128-38.912 51.2 51.2 0 0 0 2.048-12.288 24.576 24.576 0 0 1 24.576-20.48H655.36a48.128 48.128 0 0 0 48.128-34.816 422.912 422.912 0 0 0 15.36-98.304h52.224a28.672 28.672 0 0 0 22.528-16.384 29.696 29.696 0 0 0-2.048-27.648z m-202.752-86.016l-10.24 16.384a22.528 22.528 0 0 1-18.432 9.216 24.576 24.576 0 0 1-7.168-1.024l-26.624-10.24a118.784 118.784 0 0 1-39.936 22.528l-5.12 29.696a20.48 20.48 0 0 1-20.48 16.384h-20.48a20.48 20.48 0 0 1-20.48-16.384l-4.096-29.696a102.4 102.4 0 0 1-37.888-20.48l-28.672 10.24a24.576 24.576 0 0 1-8.192 1.024 21.504 21.504 0 0 1-17.408-10.24l-10.24-16.384a19.456 19.456 0 0 1 5.12-25.6l23.552-19.456a103.424 103.424 0 0 1-3.072-21.504 96.256 96.256 0 0 1 3.072-20.48l-23.552-20.48a19.456 19.456 0 0 1-5.12-25.6l10.24-17.408a20.48 20.48 0 0 1 18.432-10.24 24.576 24.576 0 0 1 7.168 2.048l28.672 10.24a117.76 117.76 0 0 1 37.888-21.504L419.84 286.72a19.456 19.456 0 0 1 20.48-16.384h20.48a19.456 19.456 0 0 1 20.48 15.36l5.12 29.696a115.712 115.712 0 0 1 37.888 20.48l28.672-10.24a24.576 24.576 0 0 1 7.168-2.048 21.504 21.504 0 0 1 18.432 10.24l10.24 16.384a20.48 20.48 0 0 1-5.12 26.624l-23.552 19.456a98.304 98.304 0 0 1 2.048 21.504 96.256 96.256 0 0 1-2.048 20.48l23.552 19.456a20.48 20.48 0 0 1 5.12 26.624z"  /></svg>`,
			color: '#00d2e6'
		},
		description: {
			en_US: 'A middleware that add skills to the agent. Requires the File toolset to be used together.',
			zh_Hans: '一个中间件，允许向智能体添加技能。需要配合 File 工具集一起使用。'
		},
		configSchema: {
			type: 'object',
			properties: {
				systemPrompt: {
					type: 'string',
					title: {
						en_US: 'System Prompt',
						zh_Hans: '系统提示'
					},
					description: {
						en_US: 'Custom system prompt to prepend to the default todo list middleware prompt.',
						zh_Hans: '自定义系统提示，添加到默认的待办事项中间件提示之前。'
					},
					'x-ui': {
						component: 'textarea',
						span: 2
					}
				},
				skills: {
					type: 'array',
					default: [],
					title: {
						en_US: 'Skills to Enable',
						zh_Hans: '启用的技能'
					},
					description: {
						en_US: 'Enabled skills for the agent.',
						zh_Hans: '启用的技能。'
					},
					items: {
						type: 'string'
					},
					'x-ui': {
						component: 'skills-select',
						span: 2
					}
				}
			}
		}
	}

	readonly stateSchema = z.object({
		selectedSkillIds: z.array(z.string()).optional(),
		selectedSkillWorkspaceId: z.string().optional()
	})

	private asRecord(value: unknown): Record<string, unknown> {
		if (!value || typeof value !== 'object' || Array.isArray(value)) {
			return {}
		}
		return value as Record<string, unknown>
	}

	private sanitizeSkillIds(value: unknown): string[] {
		if (!Array.isArray(value)) {
			return []
		}

		const deduped = new Set<string>()
		for (const item of value) {
			if (typeof item !== 'string') {
				continue
			}
			const normalized = item.trim()
			if (!normalized) {
				continue
			}
			deduped.add(normalized)
		}
		return Array.from(deduped)
	}

	private sanitizeWorkspaceId(value: unknown): string {
		return typeof value === 'string' ? value.trim() : ''
	}

	private resolveRuntimeSkillSelection(state: Record<string, unknown>): {
		skillIds: string[]
		workspaceId: string
		hasRuntimeSelection: boolean
	} {
		const rootState = state as RuntimeSkillSelectionState
		const startState = this.asRecord(state[START_STATE_KEY]) as RuntimeSkillSelectionState
		const rootSkillIdsRaw = state.selectedSkillIds
		const startSkillIdsRaw = startState.selectedSkillIds
		const rootSkillIds = this.sanitizeSkillIds(rootSkillIdsRaw)
		const startSkillIds = this.sanitizeSkillIds(startSkillIdsRaw)

		const hasRuntimeSelection = Array.isArray(rootSkillIdsRaw) || Array.isArray(startSkillIdsRaw)

		const skillIds = rootSkillIds.length > 0 ? rootSkillIds : startSkillIds

		const workspaceId =
			this.sanitizeWorkspaceId(rootState.selectedSkillWorkspaceId) ||
			this.sanitizeWorkspaceId(startState.selectedSkillWorkspaceId)

		return { skillIds, workspaceId, hasRuntimeSelection }
	}

	private escapeForShell(value: string): string {
		return `'${value.replace(/'/g, `'\"'\"'`)}'`
	}

	private getSandboxFromToolConfig(config: unknown): unknown {
		const runtimeConfig = this.asRecord(config as Record<string, unknown>)
		const configurable = this.asRecord(runtimeConfig.configurable)
		return configurable.sandbox
	}

	private async acquireFallbackSandboxBackend(
		tenantId: string,
		userId: string,
		projectId?: string,
		workingDirectory?: string
	): Promise<SandboxBackendProtocol> {
		const sandbox = await this.commandBus.execute(
			new SandboxAcquireBackendCommand({
				tenantId,
				workingDirectory,
				workFor: projectId
					? { type: 'project', id: projectId }
					: { type: 'user', id: userId }
			})
		)
		const candidate = this.asRecord(sandbox).backend
		if (!candidate || !isSandboxBackend(candidate as any)) {
			throw new Error('Sandbox backend is not available.')
		}
		return candidate as SandboxBackendProtocol
	}

	async createMiddleware(
		options: ISkillsMiddlewareOptions,
		context: IAgentMiddlewareContext
	): Promise<AgentMiddleware> {
		const { tenantId, userId, workspaceId: contextWorkspaceId, projectId } = context
		const normalizedContextWorkspaceId = this.sanitizeWorkspaceId(contextWorkspaceId)
		this.#logger.debug(`SkillsMiddleware using context workspace: ${normalizedContextWorkspaceId}`)
		let runtimeSandbox: unknown = null

		/**
		 * Read skill's file tool
		 */
		const readSkillFile = tool(
			async ({ path }, config) => {
				const fullPath = this.isSafePath(path, SkillsRootInContainer) ? path : null
				if (!fullPath) {
					throw new Error(`Access to path "${path}" is denied.`)
				}

				const sandbox = this.getSandboxFromToolConfig(config) ?? runtimeSandbox
				const backend = this.asRecord(sandbox).backend
				const sandboxBackend = backend as any
				if (sandboxBackend && isSandboxBackend(sandboxBackend)) {
					const result = await sandboxBackend.execute(`cat ${this.escapeForShell(fullPath)}`)
					if (result.exitCode !== 0) {
						throw new Error(result.output || `Failed to read file: ${fullPath}`)
					}
					return result.output
				}

				const fallbackBackend = await this.acquireFallbackSandboxBackend(
					tenantId,
					userId,
					projectId,
					SkillsRootInContainer
				)
				const result = await fallbackBackend.execute(`cat ${this.escapeForShell(fullPath)}`)
				if (result.exitCode !== 0) {
					throw new Error(result.output || `Failed to read file: ${fullPath}`)
				}
				return result.output
			},
			{
				name: 'read_skill_file',
				description: `Read a skill's file from the skills library. Use this to read the full SKILL.md instructions when a skill is relevant to the user's task.`,
				schema: z.object({
					path: z.string().describe("The absolute path to the skill's file to read.")
				})
			}
		)

		const skillShell = tool(
			async ({ command }, config) => {
				if (!command || typeof command !== 'string') {
					throw new Error('Skill shell tool expects a non-empty command string.')
				}

				const timeoutMs = 30_000
				const maxOutputBytes = 64 * 1024

				try {
					const fallbackBackend = await this.acquireFallbackSandboxBackend(
						tenantId,
						userId,
						projectId,
						SkillsRootInContainer
					)
					const result = await fallbackBackend.execute(command, {
						timeoutMs,
						maxOutputBytes
					})
					let output = result.output || '<no output>'
					if (result.timedOut) {
						output = `Error: Command timed out after ${(timeoutMs / 1000).toFixed(1)} seconds.`
					}
					if (result.exitCode !== 0 && !result.timedOut) {
						return {
							content: output,
							status: 'error'
						}
					}

					return {
						content: output
					}
				} catch (err) {
					const e = err as Error
					const isTimeout =
						(e as any)?.code === 'ETIMEDOUT' ||
						(e as any)?.name === 'TimeoutError' ||
						/e?timed out/i.test(e.message)

					const output = isTimeout
						? `Error: Command timed out after ${(timeoutMs / 1000).toFixed(1)} seconds.`
						: `Error: ${e.message}`

					return {
						content: output,
						status: 'error'
					}
				}
			},
			{
				name: 'skill_shell',
				description: `Execute a shell command on the sandbox container.
					Commands will run in the working directory: ${SkillsRootInContainer}.
					Each command runs in a fresh shell environment with the current process's environment variables.
					Commands may be truncated if they exceed the configured timeout or output limits.`,
				schema: z.object({
					command: z.string().describe('The shell command to execute.')
				})
			}
		)

		let skillsSynced = false
		// Track which selection was last synced to avoid re-copying on every model call
		let lastSyncedKey = ''

		return {
			name: SKILLS_MIDDLEWARE_NAME,
			stateSchema: this.stateSchema,
			tools: [readSkillFile /*skillShell*/],
			wrapModelCall: async (request, handler) => {
				runtimeSandbox = request.runtime?.configurable?.sandbox ?? null
				const state = (request.state ?? {}) as Record<string, unknown>
				const configuredSkillIds = this.sanitizeSkillIds(options?.skills)
				const {
					skillIds: runtimeSkillIds,
					workspaceId: stateWorkspaceId,
					hasRuntimeSelection
				} = this.resolveRuntimeSkillSelection(state)
				const runtimeWorkspaceId = await this.resolveEffectiveWorkspaceId(
					tenantId,
					userId,
					normalizedContextWorkspaceId,
					stateWorkspaceId
				)

				const workspaceSkillSelections = new Map<string, Set<string>>()
				this.appendWorkspaceSkills(workspaceSkillSelections, normalizedContextWorkspaceId, configuredSkillIds)
				if (hasRuntimeSelection && runtimeSkillIds.length > 0) {
					this.appendWorkspaceSkills(workspaceSkillSelections, runtimeWorkspaceId, runtimeSkillIds)
				}

				const skills: SkillPromptMetadata[] = []
				for (const [workspaceId, ids] of workspaceSkillSelections.entries()) {
					const workspaceSkills = await this.loadSkillMetadata(
						SkillsRootInContainer,
						Array.from(ids),
						workspaceId
					)
					skills.push(...workspaceSkills)
				}

				const syncKey = this.buildSyncKey(skills)
				if (!skillsSynced || syncKey !== lastSyncedKey) {
					const sandbox = request.runtime.configurable.sandbox
					for await (const skill of skills) {
						const packagePath = skill.packagePath?.trim()
						if (!packagePath) {
							continue
						}

						try {
							const workspaceRoot = getWorkspaceRoot(tenantId, skill.workspaceId)
							const localSkillPath = await this.resolveLocalPackagePath(workspaceRoot, packagePath)
							if (!localSkillPath) {
								this.#logger.warn(
									`Skip syncing skill "${skill.name}" because package path "${packagePath}" is missing in workspace "${skill.workspaceId}".`
								)
								continue
							}
							await this.commandBus.execute(
								new SandboxCopyFileCommand(sandbox, {
									version: skill.version,
									localPath: localSkillPath,
									containerPath: join(SkillsRootInContainer, packagePath),
									overwrite: true
								})
							)
						} catch (error) {
							this.#logger.error(
								`Failed to copy skill package files for skill ${skill.name}: ${(error as Error).message}`
							)
						}
					}
					skillsSynced = true
					lastSyncedKey = syncKey
				}

				const skillsSection = this.buildSkillsSection(SkillsRootInContainer, skills)
				const extraPrompt = [options?.systemPrompt, skillsSection].filter(Boolean).join('\n\n')

				if (!extraPrompt) {
					return handler(request)
				}

				const systemMessage = request.systemMessage
				const current =
					typeof systemMessage === 'string' ? systemMessage : ((systemMessage?.content as string) ?? '')
				const content = [current, extraPrompt].filter(Boolean).join('\n\n')

				return handler({
					...request,
					systemMessage: new SystemMessage(content)
				})
			}
		}
	}

	private appendWorkspaceSkills(target: Map<string, Set<string>>, workspaceId: string, skillIds: string[]) {
		if (!workspaceId || skillIds.length === 0) {
			return
		}
		const existing = target.get(workspaceId) ?? new Set<string>()
		for (const id of skillIds) {
			existing.add(id)
		}
		target.set(workspaceId, existing)
	}

	private buildSyncKey(skills: SkillPromptMetadata[]): string {
		return skills
			.map((skill) => `${skill.workspaceId}:${skill.id}:${skill.version}`)
			.sort()
			.join('|')
	}

	private async pathExists(path: string): Promise<boolean> {
		try {
			await access(path)
			return true
		} catch {
			return false
		}
	}

	private normalizePackagePath(packagePath: string): string {
		return packagePath
			.replace(/\\/g, '/')
			.replace(/^\/+/, '')
			.replace(/^\.\/+/, '')
	}

	private async resolveLocalPackagePath(workspaceRoot: string, packagePath: string): Promise<string | null> {
		const normalized = this.normalizePackagePath(packagePath)
		if (!normalized) {
			return null
		}

		const primary = join(workspaceRoot, 'skills', normalized)
		if (await this.pathExists(primary)) {
			return primary
		}

		const legacyPrefixed = normalized.startsWith('skills/') ? normalized : `skills/${normalized}`
		const legacy = join(workspaceRoot, 'skills', legacyPrefixed)
		if (legacy !== primary && (await this.pathExists(legacy))) {
			return legacy
		}

		return null
	}

	private async resolveEffectiveWorkspaceId(
		tenantId: string,
		userId: string,
		contextWorkspaceId: string,
		stateWorkspaceId: string
	): Promise<string> {
		if (!stateWorkspaceId || stateWorkspaceId === contextWorkspaceId) {
			return contextWorkspaceId
		}

		try {
			const canAccess = await this.canAccessWorkspace(tenantId, userId, stateWorkspaceId)
			if (canAccess) {
				return stateWorkspaceId
			}

			this.#logger.warn(
				`selectedSkillWorkspaceId "${stateWorkspaceId}" is not accessible for user "${userId}" in tenant "${tenantId}", fallback to "${contextWorkspaceId}".`
			)
			return contextWorkspaceId
		} catch (error) {
			this.#logger.warn(
				`Failed to verify selectedSkillWorkspaceId "${stateWorkspaceId}" for user "${userId}" in tenant "${tenantId}": ${(error as Error).message}. Fallback to "${contextWorkspaceId}".`
			)
			return contextWorkspaceId
		}
	}

	private async canAccessWorkspace(tenantId: string, userId: string, workspaceId: string): Promise<boolean> {
		if (!tenantId || !userId || !workspaceId) {
			return false
		}

		const workspace = await this.workspaceRepository
			.createQueryBuilder('workspace')
			.leftJoin('workspace.members', 'member')
			.where('workspace.id = :id', { id: workspaceId })
			.andWhere('workspace.tenantId = :tenantId', { tenantId })
			// .andWhere('(workspace.ownerId = :userId OR member.id = :userId)', { userId })
			.getOne()

		return !!workspace
	}

	private async loadSkillMetadata(
		workspacePath: string,
		skillIds: string[],
		workspaceId: string
	): Promise<SkillPromptMetadata[]> {
		if (!workspaceId || skillIds.length === 0) {
			return []
		}

		const skillPackages = await this.skillPackageRepository.find({
			where: {
				workspaceId,
				id: In(skillIds)
			},
			relations: { skillIndex: { repository: true } }
		})

		const skills: SkillPromptMetadata[] = []
		for (const skillPackage of skillPackages) {
			const skill = await this.parseSkillPackage(workspacePath, skillPackage)
			if (skill) {
				skills.push(skill)
			}
		}

		return skills
	}

	private async parseSkillPackage(
		workspacePath: string,
		skillPackage: SkillPackage
	): Promise<SkillPromptMetadata | null> {
		const skillIndex = skillPackage.skillIndex
		const localSkillMdPath = this.resolveLocalSkillPath(workspacePath, skillPackage)

		const repoOptions = skillIndex?.repository?.options as Record<string, any> | undefined
		const repoUrl = repoOptions?.url
		const skillPath = skillIndex?.skillPath ?? ''

		const skillMdPath =
			localSkillMdPath ?? (repoUrl ? this.resolveSkillPath(workspacePath, repoUrl, skillPath) : null)
		const parsed = skillMdPath ? await this.parseSkillMetadata(skillMdPath) : null
		const packagePath = this.normalizePackagePath(skillPackage.packagePath ?? '')
		const promptSkillPath = packagePath ? join(workspacePath, packagePath, SKILL_FILE_NAME) : null

		const packageDescription = this.extractDescription(skillPackage.metadata?.description)
		const description = parsed?.description ?? packageDescription ?? skillIndex?.description ?? ''

		return {
			id: skillPackage.id,
			name: parsed?.name ?? (skillPackage.name as string) ?? skillIndex?.name ?? skillIndex?.skillId ?? 'Skill',
			description,
			path: promptSkillPath ?? skillMdPath ?? parsed?.path ?? localSkillMdPath ?? undefined,
			source: skillIndex?.repository?.provider ?? (skillPackage.metadata as any)?.source,
			packagePath: packagePath || null,
			workspaceId: skillPackage.workspaceId,
			version: skillPackage.updatedAt?.toISOString() ?? ''
		}
	}

	private extractDescription(description?: unknown): string | undefined {
		if (typeof description === 'string') {
			return description
		}
		if (description && typeof description === 'object' && 'en_US' in description) {
			return (description as any).en_US as string
		}
		return undefined
	}

	private resolveLocalSkillPath(workspacePath: string, skillPackage: SkillPackage) {
		const metadata = skillPackage.metadata as Record<string, any> | undefined
		if (!metadata) {
			return null
		}

		const skillMdPath = metadata.skillMdPath as string | undefined
		if (skillMdPath && this.isSafePath(skillMdPath, workspacePath)) {
			return skillMdPath
		}

		const skillPath = metadata.skillPath as string | undefined
		if (skillPath) {
			const resolved = isAbsolute(skillPath) ? skillPath : join(workspacePath, skillPath, SKILL_FILE_NAME)
			if (this.isSafePath(resolved, workspacePath)) {
				return resolved
			}
		}

		return null
	}

	private resolveSkillPath(workspacePath: string, repoUrl: string, skillPath: string) {
		try {
			const url = new URL(repoUrl)
			const [owner, repo] = url.pathname.replace(/^\/+/, '').split('/')
			if (!owner || !repo) {
				return null
			}
			const skillMdPath = join(workspacePath, owner, repo, skillPath, SKILL_FILE_NAME)
			return this.isSafePath(skillMdPath, workspacePath) ? skillMdPath : null
		} catch (error) {
			this.#logger.warn(`Failed to resolve skill path from ${repoUrl}: ${(error as Error).message}`)
			return null
		}
	}

	private async parseSkillMetadata(
		skillMdPath: string
	): Promise<{ name?: string; description?: string; path: string } | null> {
		try {
			const stats = await stat(skillMdPath)
			if (stats.size > MAX_SKILL_FILE_SIZE) {
				return null
			}

			const content = await readFile(skillMdPath, 'utf-8')
			const match = /^---\s*\n(.*?)\n---\s*\n/s.exec(content)
			if (!match) {
				return null
			}

			const metadata: Record<string, string> = {}
			for (const line of match[1].split('\n')) {
				const kv = /^(\w+):\s*(.+)$/.exec(line.trim())
				if (kv) {
					metadata[kv[1]] = kv[2].trim()
				}
			}

			if (!metadata.name && !metadata.description) {
				return null
			}

			return {
				name: metadata.name ?? 'Skill',
				description: metadata.description ?? '',
				path: skillMdPath
			}
		} catch {
			return null
		}
	}

	private buildSkillsSection(workspace: string, skills: SkillPromptMetadata[]) {
		const skillsLocations = this.formatSkillsLocations(workspace, skills)
		const skillsList = this.formatSkillsList(skills)
		return SKILLS_SYSTEM_PROMPT.replace('{skills_locations}', skillsLocations).replace('{skills_list}', skillsList)
	}

	private formatSkillsLocations(workspace: string, skills: SkillPromptMetadata[]) {
		if (!skills?.length) {
			return `Skills are installed under \`${workspace}\`. No skills are enabled yet.`
		}
		const dirs = Array.from(
			new Set(
				skills
					.map((skill) => (skill.path ? dirname(skill.path) : null))
					.filter((path): path is string => !!path)
			)
		)
		return dirs.map((dir) => `**Installed Skills**: \`${dir}\``).join('\n')
	}

	private formatSkillsList(skills: SkillPromptMetadata[]) {
		if (!skills?.length) {
			return '(No skills available yet. Install skills to enable this middleware.)'
		}
		return skills
			.map((skill) => {
				const description = skill.description || 'No description provided.'
				const path = skill.path || 'Skill path is unavailable.'
				return `- **${skill.name}**: ${description}\n  → Read \`${path}\` for full instructions`
			})
			.join('\n')
	}

	private isSafePath(target: string, baseDir: string) {
		try {
			const resolvedPath = resolve(target)
			const resolvedBase = resolve(baseDir)
			const relativePath = relative(resolvedBase, resolvedPath)
			return !relativePath.startsWith('..') && !isAbsolute(relativePath)
		} catch {
			return false
		}
	}
}
