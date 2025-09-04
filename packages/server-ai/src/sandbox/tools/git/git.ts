import { StructuredToolInterface } from '@langchain/core/tools'
import { isEnableTool, IXpertToolset } from '@metad/contracts'
import { t } from 'i18next'
import { BaseSandboxToolset } from '../sandbox-toolset'
import { GitToolEnum, TGitToolCredentials } from './types'
import { buildGitCloneTool } from './tools/git_clone'
import { buildGitStatusTool } from './tools/git_status'
import { buildGitBranchesTool } from './tools/git_branches'
import { buildGitCreateBranchTool } from './tools/git_create_branch'
import { buildGitCheckoutBranchTool } from './tools/git_checkout_branch'
import { buildGitDeleteBranchTool } from './tools/git_delete_branch'
import { buildGitAddTool } from './tools/git_add'
import { buildGitCommitTool } from './tools/git_commit'
import { buildGitPushTool } from './tools/git_push'
import { buildGitPullTool } from './tools/git_pull'
import { getCurrentTaskCredentials, TBuiltinToolsetParams } from '../../../shared'

export class GitToolset extends BaseSandboxToolset<StructuredToolInterface> {
	static provider = 'git'

	constructor(
		protected toolset?: IXpertToolset,
		params?: TBuiltinToolsetParams
	) {
		super(GitToolset.provider, params, toolset)
	}

	async initTools() {
		await this._ensureSandbox()
		const allEnabled = !this.toolset?.tools?.length
		this.tools = []
		if (allEnabled || this.isEnabled(GitToolEnum.GIT_CLONE)) {
			this.tools.push(buildGitCloneTool(this))
		}
		if (allEnabled || this.isEnabled(GitToolEnum.GIT_STATUS)) {
			this.tools.push(buildGitStatusTool(this))
		}
		if (allEnabled || this.isEnabled(GitToolEnum.GIT_BRANCHES)) {
			this.tools.push(buildGitBranchesTool(this))
		}
		if (allEnabled || this.isEnabled(GitToolEnum.GIT_CREATE_BRANCH)) {
			this.tools.push(buildGitCreateBranchTool(this))
		}
		if (allEnabled || this.isEnabled(GitToolEnum.GIT_CHECKOUT_BRANCH)) {
			this.tools.push(buildGitCheckoutBranchTool(this))
		}
		if (allEnabled || this.isEnabled(GitToolEnum.GIT_DELETE_BRANCH)) {
			this.tools.push(buildGitDeleteBranchTool(this))
		}
		if (allEnabled || this.isEnabled(GitToolEnum.GIT_ADD)) {
			this.tools.push(buildGitAddTool(this))
		}
		if (allEnabled || this.isEnabled(GitToolEnum.GIT_COMMIT)) {
			this.tools.push(buildGitCommitTool(this))
		}
		if (allEnabled || this.isEnabled(GitToolEnum.GIT_PUSH)) {
			this.tools.push(buildGitPushTool(this))
		}
		if (allEnabled || this.isEnabled(GitToolEnum.GIT_PULL)) {
			this.tools.push(buildGitPullTool(this))
		}
		return this.tools
	}

	async _validateCredentials(credentials: TGitToolCredentials) {
		// if (!credentials || !credentials.integration) {
		// 	throw new Error(t('server-ai:Error.GitIntegrationNotProvided'))
		// }
	}

	isEnabled(name: string) {
		return this.toolset?.tools?.some((_) => isEnableTool(_, this.toolset) && name === _.name)
	}
}

export function getIntegrationCredentials(toolset: GitToolset) {
	const credentials = getCurrentTaskCredentials<Record<string, any>>()
	const _config = toolset.getCredentials<TGitToolCredentials>()
	if (_config?.integration) {
		return credentials[_config.integration]
	}
	return null
}