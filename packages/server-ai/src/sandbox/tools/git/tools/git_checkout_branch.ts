import { tool } from '@langchain/core/tools'
import z from 'zod'
import { ToolParameterValidationError } from '../../../../shared/'
import { GitToolset } from '../git'
import { GitToolEnum } from '../types'

export function buildGitCheckoutBranchTool(toolset: GitToolset) {
	return tool(
		async (_, config) => {
			if (!_.path) {
				throw new ToolParameterValidationError(`Git repository path is empty`)
			}
			if (!_.branch) {
				throw new ToolParameterValidationError(`Git branch name is empty`)
			}
			const { signal, configurable } = config ?? {}

			return await toolset.sandbox.git.checkoutBranch(_.path, _.branch)
		},
		{
			name: GitToolEnum.GIT_CHECKOUT_BRANCH,
			description: 'Checks out an existing branch in a Git repository.',
			schema: z.object({
				path: z
					.string()
					.describe(`The local relative path where the repository is located.`),
				branch: z
					.string()
					.describe(`The name of the branch to checkout.`),
			})
		}
	)
}
