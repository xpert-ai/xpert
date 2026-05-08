import { SystemMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import {
	AgentMiddleware,
	AgentMiddlewareStrategy,
	IAgentMiddlewareContext,
	IAgentMiddlewareStrategy,
	PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import {
	CreateWorkspaceSkillCommand,
	DeleteWorkspaceSkillCommand,
	GetWorkspaceSkillForEditQuery,
	UpdateWorkspaceSkillCommand
} from '../../authoring/skill-creator-cqrs'
import { SKILL_CREATOR_MIDDLEWARE_NAME } from '../../types'
import { SKILL_CREATOR_AUTHORING_PROMPT } from './instructions'

const skillRefSchema = z
	.object({
		id: z.string().optional().describe('Exact internal skill package id, if already known.'),
		name: z.string().optional().describe('Exact skill metadata.name or package name.'),
		displayName: z.string().optional().describe('Exact human-facing display name.'),
		packagePath: z.string().optional().describe('Exact workspace skill package path.')
	})
	.refine((value) => Object.values(value).some((item) => typeof item === 'string' && item.trim()), {
		message: 'Provide at least one of id, name, displayName, or packagePath.'
	})

const skillPackageFileSchema = z
	.object({
		path: z
			.string()
			.describe('POSIX relative path under agents/openai.yaml, scripts/, references/, or assets/. Do not include SKILL.md.'),
		content: z.string().optional().describe('UTF-8 text file content. Use for agents/openai.yaml, scripts, and references.'),
		contentBase64: z.string().optional().describe('Base64-encoded binary file content. Use mainly for assets.'),
		executable: z.boolean().optional().describe('Set true only for executable files under scripts/.')
	})
	.refine((value) => Boolean(value.content !== undefined) !== Boolean(value.contentBase64 !== undefined), {
		message: 'Provide exactly one of content or contentBase64.'
	})

@Injectable()
@AgentMiddlewareStrategy(SKILL_CREATOR_MIDDLEWARE_NAME)
export class SkillCreatorMiddleware implements IAgentMiddlewareStrategy {
	readonly meta: TAgentMiddlewareMeta = {
		name: SKILL_CREATOR_MIDDLEWARE_NAME,
		label: {
			en_US: 'Skill Creator Middleware',
			zh_Hans: '技能创建中间件'
		},
		description: {
			en_US: 'Author workspace skill packages from concise SKILL.md content without runtime skill loading.',
			zh_Hans: '基于简洁 SKILL.md 创建和维护工作区技能包，不承担运行时技能加载。'
		},
		icon: {
			type: 'svg',
			value: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 2h4v4h3a3 3 0 0 1 3 3v3h-4v-1a2 2 0 1 0-4 0v1H8V9H5v3H2V9a3 3 0 0 1 3-3h5V2Zm8 12h4v4a3 3 0 0 1-3 3h-5v-4h1a2 2 0 1 0 0-4h-1v-3h4v4ZM2 14h4v-1a2 2 0 1 1 4 0v1h4v3h-4v5H6v-5H2v-3Z"/></svg>',
			color: '#00d2e6'
		},
		configSchema: {
			type: 'object',
			properties: {},
			required: []
		}
	}

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	createMiddleware(_options: unknown, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
		const workspaceId = this.requireWorkspaceId(context)

		return {
			name: SKILL_CREATOR_MIDDLEWARE_NAME,
			tools: [
				this.createWorkspaceSkillTool(workspaceId),
				this.getWorkspaceSkillForEditTool(workspaceId),
				this.updateWorkspaceSkillTool(workspaceId),
				this.deleteWorkspaceSkillTool(workspaceId)
			],
			wrapModelCall: async (request, handler) => {
				const systemMessage = request.systemMessage
				const current = typeof systemMessage === 'string' ? systemMessage : ((systemMessage?.content as string) ?? '')
				const content = [current, SKILL_CREATOR_AUTHORING_PROMPT].filter(Boolean).join('\n\n')

				return handler({
					...request,
					systemMessage: new SystemMessage(content)
				})
			}
		}
	}

	private createWorkspaceSkillTool(workspaceId: string) {
		return tool(
			async (input) =>
				this.commandBus.execute(
					new CreateWorkspaceSkillCommand(workspaceId, {
						userIntent: input.userIntent,
						skillName: input.skillName,
						skillMarkdown: input.skillMarkdown,
						files: input.files?.map((file) => ({
							path: file.path ?? '',
							content: file.content,
							contentBase64: file.contentBase64,
							executable: file.executable
						}))
					})
				),
			{
				name: 'create_workspace_skill',
				description:
					'Create a private workspace skill package from a complete Codex-style SKILL.md and optional bundled package files. Use this only for authoring, not runtime skill discovery or loading.',
				schema: z.object({
					userIntent: z.string().describe('The user goal for this skill.'),
					skillName: z.string().optional().describe('Optional stable skill name to use for package path allocation.'),
					skillMarkdown: z
						.string()
						.describe('Complete SKILL.md content. Frontmatter must include only name and description.'),
					files: z
						.array(skillPackageFileSchema)
						.optional()
						.describe('Optional bundled files for complex skills, excluding SKILL.md.')
				})
			}
		)
	}

	private getWorkspaceSkillForEditTool(workspaceId: string) {
		return tool(
			async (input) =>
				this.queryBus.execute(
					new GetWorkspaceSkillForEditQuery(workspaceId, {
						skillRef: input.skillRef
					})
				),
			{
				name: 'get_workspace_skill_for_edit',
				description:
					'Fetch one workspace-authored skill package and its SKILL.md for editing. Use metadata refs; do not read runtime .xpert/skills or .agents/skills directories.',
				schema: z.object({
					skillRef: skillRefSchema
				})
			}
		)
	}

	private updateWorkspaceSkillTool(workspaceId: string) {
		return tool(
			async (input) =>
				this.commandBus.execute(
					new UpdateWorkspaceSkillCommand(workspaceId, {
						skillRef: input.skillRef,
						skillMarkdown: input.skillMarkdown
					})
				),
			{
				name: 'update_workspace_skill',
				description: 'Replace the SKILL.md for one workspace-authored skill package. The skillRef must uniquely match one package.',
				schema: z.object({
					skillRef: skillRefSchema,
					skillMarkdown: z
						.string()
						.describe('Replacement SKILL.md content. Frontmatter must include only name and description.')
				})
			}
		)
	}

	private deleteWorkspaceSkillTool(workspaceId: string) {
		return tool(
			async (input) =>
				this.commandBus.execute(
					new DeleteWorkspaceSkillCommand(workspaceId, {
						skillRef: input.skillRef
					})
				),
			{
				name: 'delete_workspace_skill',
				description: 'Delete one workspace-authored skill package. The skillRef must uniquely match one package.',
				schema: z.object({
					skillRef: skillRefSchema
				})
			}
		)
	}

	private requireWorkspaceId(context: IAgentMiddlewareContext) {
		const workspaceId = context.workspaceId?.trim()
		if (!workspaceId) {
			throw new Error('workspaceId is required for skillCreatorMiddleware tools.')
		}
		return workspaceId
	}
}
