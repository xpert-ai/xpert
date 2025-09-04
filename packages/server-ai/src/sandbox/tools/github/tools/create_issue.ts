import { tool } from '@langchain/core/tools'
import { LangGraphRunnableConfig } from '@langchain/langgraph'
import { TGithubAuth } from '@metad/contracts'
import { z } from 'zod'
import { getIntegrationCredentials, GitHubToolset } from '../github'
import { GitHubToolsEnum } from '../types'
import { createIssue } from '../utils'

export function buildCreateIssueTool(toolset: GitHubToolset) {
	return tool(
		async (_, config: LangGraphRunnableConfig) => {
			const credentials: TGithubAuth = getIntegrationCredentials(toolset)

			const [owner, repo] = credentials.repository.split('/')

			const issue = await createIssue(
				owner,
				repo,
				{
					title: 'New Issue',
					body: 'Issue description',
					assignees: ['user1', 'user2'],
					labels: ['bug', 'urgent']
				},
				credentials.installation_token
			)
			return JSON.stringify(issue)
		},
		{
			name: GitHubToolsEnum.CREATE_ISSUE,
			description: 'Create a new issue in a GitHub repository',
			schema: z.object({
				owner: z.string().describe(`The owner of the repository.`),
				repo: z.string().describe(`The name of the repository.`),
				title: z.string().describe(`The title of the issue.`),
				body: z.string().describe(`The body content of the issue.`),
				assignees: z.array(z.string()).optional().describe(`The users to assign to the issue.`),
				labels: z.array(z.string()).optional().describe(`The labels to assign to the issue.`),
				type: z.enum(['bug', 'feature', 'task']).optional().describe(`The type of the issue.`)
			}),
			verboseParsingErrors: true
		}
	)
}
