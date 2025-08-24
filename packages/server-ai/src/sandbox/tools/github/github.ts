import { StructuredToolInterface } from '@langchain/core/tools'
import { isEnableTool, IXpertToolset } from '@metad/contracts'
import { t } from 'i18next'
import { BaseSandboxToolset } from '../sandbox-toolset'
import { getCurrentTaskCredentials, TBuiltinToolsetParams } from '../../../shared'
import { GitHubToolsEnum, TGitHubToolCredentials } from './types'
import { buildSwitchRepositoryTool } from './tools/switch_repository'

export class GitHubToolset extends BaseSandboxToolset<StructuredToolInterface> {
	static provider = 'github'

	constructor(
		protected toolset?: IXpertToolset,
		params?: TBuiltinToolsetParams
	) {
		super(GitHubToolset.provider, params, toolset)
	}

	async initTools() {
		await this._ensureSandbox()
		const allEnabled = !this.toolset?.tools?.length
		this.tools = []
		if (allEnabled || this.isEnabled(GitHubToolsEnum.SWITCH_REPOSITORY)) {
			this.tools.push(buildSwitchRepositoryTool(this))
		}
		return this.tools
	}

	async _validateCredentials(credentials: TGitHubToolCredentials) {
		if (!credentials || !credentials.integration) {
			throw new Error(t('server-ai:Error.GitIntegrationNotProvided'))
		}
	}

	isEnabled(name: string) {
		return this.toolset?.tools?.some((_) => isEnableTool(_, this.toolset) && name === _.name)
	}
}

// export function getIntegrationCredentials(toolset: GitToolset) {
// 	const credentials = getCurrentTaskCredentials<Record<string, any>>()
// 	const _config = toolset.getCredentials<TGitToolCredentials>()
// 	if (_config?.integration) {
// 		return credentials[_config.integration]
// 	}
// 	return null
// }