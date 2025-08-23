import { tool } from '@langchain/core/tools'
import { TGithubAuth } from '@metad/contracts'
import z from 'zod'
import { ToolParameterValidationError } from '../../../../shared/'
import { getIntegrationCredentials, GitToolset } from '../git'
import { GitToolEnum } from '../types'

export function buildGitPushTool(toolset: GitToolset) {
	return tool(
		async (_, config) => {
			if (!_.path) {
				throw new ToolParameterValidationError(`Git repository path is empty`)
			}
			const { signal, configurable } = config ?? {}

			const credentials: TGithubAuth = getIntegrationCredentials(toolset)

			return await toolset.sandbox.git.push(_.path, 'git', credentials.installation_token)
		},
		{
			name: GitToolEnum.GIT_PUSH,
			description: 'Pushes changes to a Git repository.',
			schema: z.object({
				path: z
					.string()
					.describe(`The local relative path where the repository is located.`),
			})
		}
	)
}
