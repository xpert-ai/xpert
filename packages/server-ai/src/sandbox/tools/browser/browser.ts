import { isEnableTool, IXpertToolset, TToolCredentials } from '@metad/contracts'
import { BrowserToolEnum } from './types'
import { v4 as uuidv4 } from 'uuid'
import { BaseSandboxToolset, TSandboxToolsetParams } from '../sandbox-toolset'

export class BrowserToolset extends BaseSandboxToolset {
	static provider = 'browser'

	private browserId = null
	constructor(
		protected toolset?: IXpertToolset,
		params?: TSandboxToolsetParams
	) {
		super(BrowserToolset.provider, params, toolset)
	}

	async initTools() {
		await this._ensureSandbox()
		this.tools = []
		if (this.toolset?.tools) {
			this.toolset?.tools
				.filter((_) => isEnableTool(_, this.toolset))
				.forEach((tool) => {
					//
				})
		}

		return this.tools
	}

	async _validateCredentials(credentials: TToolCredentials) {
		//
	}

	getOrInitBrowser() {
		if (!this.browserId) {
			this.browserId = uuidv4()
		}
		return this.browserId
	}
}
