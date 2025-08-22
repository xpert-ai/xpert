import { tool } from '@langchain/core/tools'
import z from 'zod'
import { ToolParameterValidationError } from '../../../../shared/'
import { GitToolset } from '../git'
import { GitToolEnum } from '../types'

export function buildGitCloneTool(toolset: GitToolset) {
	return tool(
		async (_, config) => {
			if (!_.url) {
				throw new ToolParameterValidationError(`Git repository URL is empty`)
			}
			// Validate the URL format
			const urlPattern = /^(https?|git):\/\/[^\s/$.?#].[^\s]*$/i
			if (!urlPattern.test(_.url)) {
				throw new ToolParameterValidationError(`Invalid Git repository URL format`)
			}

			const { signal, configurable } = config ?? {}

			return await toolset.sandbox.git.clone(_.url, _.path, _.branch)
		},
		{
			name: GitToolEnum.GIT_CLONE,
			description: 'Clones a Git repository.',
			schema: z.object({
				url: z.string().describe(`The Git repository URL to clone.`),
				path: z
					.string()
					.optional()
					.nullable()
					.describe(`The local relative path where the repository should be cloned.`),
				branch: z.string().optional().nullable().describe(`The branch to checkout after cloning.`)
			})
		}
	)
}
