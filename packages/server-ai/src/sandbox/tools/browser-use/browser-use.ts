import { isEnableTool, IXpertToolset, TToolCredentials } from '@metad/contracts'
import { BrowserUseToolEnum } from './types'
import { BaseSandboxToolset, TSandboxToolsetParams } from '../sandbox-toolset'

export class BrowserUseToolset extends BaseSandboxToolset {
	static provider = 'browser-use'

	constructor(
		protected toolset?: IXpertToolset,
		params?: TSandboxToolsetParams
	) {
		super(BrowserUseToolset.provider, params, toolset)
	}

	async initTools() {
		await this._ensureSandbox()
		this.tools = []
		if (this.toolset?.tools) {
			this.toolset?.tools.filter((_) => isEnableTool(_, this.toolset)).forEach((tool) => {
				//
			})

		}

		return this.tools
	}

	async _validateCredentials(credentials: TToolCredentials) {
		//
	}

	getCredentials() {
		return this.toolset?.credentials
	}
}
