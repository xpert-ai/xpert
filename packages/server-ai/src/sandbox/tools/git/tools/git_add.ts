import { tool } from '@langchain/core/tools'
import z from 'zod'
import { ToolParameterValidationError } from '../../../../shared/'
import { GitToolset } from '../git'
import { GitToolEnum } from '../types'

export function buildGitAddTool(toolset: GitToolset) {
	return tool(
		async (_, config) => {
			if (!_.path) {
				throw new ToolParameterValidationError(`Git repository path is empty`)
			}
			const { signal, configurable } = config ?? {}

			return await toolset.sandbox.git.add(_.path, _.files)
		},
		{
			name: GitToolEnum.GIT_ADD,
			description: 'Adds files to the staging area in a Git repository. Add all files using ["."]',
			schema: z.object({
				path: z.string().describe(`The local relative path where the repository is located.`),
				files: z
					.array(z.string().describe('File path'))
					.min(1)
					.describe(`The list of files to add to the staging area.`)
			})
		}
	)
}
