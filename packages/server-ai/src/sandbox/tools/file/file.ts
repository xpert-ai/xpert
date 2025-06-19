import { IXpertToolset, TToolCredentials } from '@metad/contracts'
import { IBuiltinToolset } from '../../../xpert-toolset'
import {
	BaseFileToolset,
	buildCreateFileTool,
	buildDeleteFileTool,
	buildFullFileRewriteTool,
	buildListFilesTool,
	buildReadFileTool,
	buildStrReplaceTool
} from '../base-file'
import { TSandboxToolsetParams } from '../sandbox-toolset'

export class FileToolset extends BaseFileToolset implements IBuiltinToolset {
	static provider = 'file'

	constructor(
		protected toolset?: IXpertToolset,
		protected params?: TSandboxToolsetParams
	) {
		super(FileToolset.provider, params, toolset)
	}

	async initTools() {
		await this._ensureSandbox()
		this.tools = []

		this.tools.push(buildListFilesTool(this))
		this.tools.push(buildCreateFileTool(this))
		this.tools.push(buildStrReplaceTool(this))
		this.tools.push(buildFullFileRewriteTool(this))
		this.tools.push(buildDeleteFileTool(this))
		this.tools.push(buildReadFileTool(this))

		// this.toolset?.tools?.filter((_) => isEnableTool(_, this.toolset)).forEach((tool) => {
		// })
		return this.tools
	}

	async validateCredentials(credentials: TToolCredentials) {
		//
	}
}
