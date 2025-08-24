import { tool } from '@langchain/core/tools'
import { LangGraphRunnableConfig } from '@langchain/langgraph'
import { TGithubAuth } from '@metad/contracts'
import { z } from 'zod'
import { getIntegrationCredentials, GitHubToolset } from '../github'
import { GitHubToolsEnum } from '../types'
import { checkRemoteBranch } from '../utils'

export function buildPushFilesTool(toolset: GitHubToolset) {
	return tool(
		async (_, config: LangGraphRunnableConfig) => {
			if (!(_.files?.length > 0)) {
				throw new Error('No files to add')
			}
			if (!_.message) {
				throw new Error('No commit message provided')
			}

			const repoPath = _.path
			// if (!fs.existsSync(repoPath)) {
			// 	throw new Error(`Repo path does not exist: ${repoPath}`)
			// }

			const credentials: TGithubAuth = getIntegrationCredentials(toolset)
			await toolset.sandbox.git.setRemote(
				repoPath,
				'origin',
				`https://x-access-token:${credentials.installation_token}@github.com/${credentials.repository}.git`
			)
			// await toolset.sandbox.git.add(repoPath, _.files)
			// await toolset.sandbox.git.commit(repoPath, _.message)

			const branchName = await toolset.sandbox.git.currentBranch(repoPath)
			
			const exists = await checkRemoteBranch(credentials.repository, branchName, credentials.installation_token)
			if (!exists) {
				await toolset.sandbox.git.push(repoPath, { createBranch: branchName })
			}
			return await toolset.sandbox.git.push(repoPath)
		},
		{
			name: GitHubToolsEnum.PUSH_FILES,
			description: 'Push files to a GitHub repository',
			schema: z.object({
				path: z.string().describe(`The local relative path where the repository is located.`),
				files: z
					.array(z.string().describe('File path'))
					.min(1)
					.describe(`The list of files to add to the staging area.`),
				message: z.string().describe(`The commit message.`),
				branch: z.string().optional().describe(`The branch to push to. Defaults to 'main' or 'master'.`)
			}),
			verboseParsingErrors: true
		}
	)
}
