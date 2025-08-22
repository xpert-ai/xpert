import { tool } from '@langchain/core/tools'
import z from 'zod'
import { ToolParameterValidationError } from '../../../../shared/'
import { GitToolset } from '../git'
import { GitToolEnum } from '../types'

export function buildGitBranchesTool(toolset: GitToolset) {
	return tool(
		async (_, config) => {
			if (!_.path) {
				throw new ToolParameterValidationError(`Git repository path is empty`)
			}
			const { signal, configurable } = config ?? {}

			return await toolset.sandbox.git.branches(_.path)
		},
		{
			name: GitToolEnum.GIT_BRANCHES,
			description: 'Lists all branches in a Git repository.',
			schema: z.object({
				path: z
					.string()
					.optional()
					.nullable()
					.describe(`The local relative path where the repository is located.`),
			})
		}
	)
}
