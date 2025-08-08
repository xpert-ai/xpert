import { StructuredToolInterface } from '@langchain/core/tools'
import { isEnableTool, IXpertToolset, TToolCredentials, XpertParameterTypeEnum } from '@metad/contracts'
import { BaseSandboxToolset, TSandboxToolsetParams } from '../sandbox-toolset'
import { SlidesToolEnum } from './types'

export class SlidesToolset extends BaseSandboxToolset<StructuredToolInterface> {
	static provider = 'slides'

	constructor(
		protected toolset?: IXpertToolset,
		params?: TSandboxToolsetParams
	) {
		super(SlidesToolset.provider, params, toolset)
	}

	async getVariables() {
		return [
			{
				name: 'tool_slides_prompts_default',
				type: XpertParameterTypeEnum.STRING,
				description: 'Default prompt for slides toolset',
				reducer: (a: string, b: string) => {
					return b ?? a
				},
				default: () => {
					return `1. Generate slides based on the provided template and content.`
				}
			},
			{
				name: 'tool_slides_template_file',
				type: XpertParameterTypeEnum.STRING,
				description: 'Template file name for slides toolset',
				reducer: (a: string, b: string) => {
					return b ?? a
				},
				default: () => {
					return ''
				}
			},
		]
	}

	async initTools() {
		await this._ensureSandbox()
		const allEnabled = !this.toolset?.tools?.length
		this.tools = []
		return this.tools
	}

	async _validateCredentials(credentials: TToolCredentials) {
		//
	}

	getCredentials() {
		return this.toolset?.credentials
	}
}
