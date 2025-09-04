import { tool } from '@langchain/core/tools'
import { interrupt, LangGraphRunnableConfig } from '@langchain/langgraph'
import { I18nObject, InterruptMessageType, TInterruptMessage, TSelectOption } from '@metad/contracts'
import { z } from 'zod'
import { GitHubToolset } from '../github'
import { GitHubToolsEnum, TGitHubToolCredentials } from '../types'
import { getUserRepositories } from '../utils'

export function buildSwitchRepositoryTool(toolset: GitHubToolset) {
	return tool(
		async (_, config: LangGraphRunnableConfig) => {
			const credentials = toolset.getCredentials<TGitHubToolCredentials>()

			let url = ''
			if (credentials.personal_access_token) {
				const repos = await getUserRepositories(credentials.personal_access_token)
				while (!url) {
					const value = interrupt<
						TInterruptMessage<{ placeholder: I18nObject; select_options: TSelectOption<string>[] }>,
						{ url: string }
					>({
						category: 'BI',
						type: InterruptMessageType.Select,
						title: {
							en_US: 'Select GitHub repository',
							zh_Hans: '选择 GitHub 仓库'
						},
						message: {
							en_US: 'Please select a GitHub repository',
							zh_Hans: '请选择一个 GitHub 仓库'
						},
						data: {
							placeholder: {
								en_US: 'Please select a GitHub repository',
								zh_Hans: '请选择一个 GitHub 仓库'
							},
							select_options: repos.map((repo) => ({
								value: repo.full_name,
								label: repo.full_name,
								description: repo.description
							}))
						}
					})
					if (!value?.url) continue
					url = `https://${credentials.personal_access_token}@github.com/${value.url}.git`
				}
			} else {
				let url = ''
				while (!url) {
					const value = interrupt<TInterruptMessage<{ integration: string }>, { url: string }>({
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
