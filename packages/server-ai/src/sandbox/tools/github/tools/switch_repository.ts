import { tool } from '@langchain/core/tools'
import { interrupt, LangGraphRunnableConfig } from '@langchain/langgraph'
import {
	InterruptMessageType,
	TInterruptMessage,
} from '@metad/contracts'
import { z } from 'zod'
import { GitHubToolset } from '../github'
import { GitHubToolsEnum } from '../types'

export function buildSwitchRepositoryTool(toolset: GitHubToolset) {

	return tool(
		async (_, config: LangGraphRunnableConfig) => {
			const credentials = toolset.getCredentials()

			let url = ''
			while (!url) {
				const value = interrupt<TInterruptMessage<{integration: string}>, { url: string }>({
					category: 'BI',
					type: InterruptMessageType.SwitchGitHubRepository,
					title: {
						en_US: 'Switch GitHub repository',
						zh_Hans: '切换 GitHub 仓库'
					},
					message: {
						en_US: 'Please select a GitHub repository',
						zh_Hans: '请选择一个新的 GitHub 仓库'
					},
					data: {
						integration: credentials?.integration
					}
				})
				url = value.url
			}
			
			const result = await toolset.sandbox.git.clone(url)

			return result
		},
		{
			name: GitHubToolsEnum.SWITCH_REPOSITORY,
			description: 'Switch or New a GitHub repository',
			schema: z.object({}),
			verboseParsingErrors: true
		}
	)
}
