import { isEnableTool, IXpertToolset, TStateVariable, TToolCredentials } from '@metad/contracts'
import { BuiltinTool, BuiltinToolset, TBuiltinToolsetParams } from '@metad/server-ai'
import { Logger } from '@nestjs/common'
import { GetBIContextQuery } from '../../../queries'
import { TBIContext } from '../../../types'
import { markdownModelCubes } from '../../types'
import { SemanticModelToolContext, SemanticModelToolsEnum, SemanticModelVariableEnum, TSemanticModelCredentials } from './types'

export class SemanticModelToolset extends BuiltinToolset {
	protected logger = new Logger(SemanticModelToolset.name)

	static provider = 'model'

	private biContext: SemanticModelToolContext
	get dsCoreService() {
		return this.biContext.dsCoreService
	}
	get credentials() {
		return this.toolset.credentials as TSemanticModelCredentials
	}
	get models() {
		return this.biContext.models || []
	}

	constructor(
		protected toolset: IXpertToolset,
		params: TBuiltinToolsetParams
	) {
		super(SemanticModelToolset.provider, toolset, params)
	}

	async getVariables() {
		return [
			{
				name: 'tool_indicators_prompts_default',
				type: 'string',
				description: 'Default prompt for indicators toolset',
				reducer: (a: string, b: string) => {
					return a || b
				},
				default: () => {
					return 'You can use indicators toolset to create or retrieve indicators.'
				}
			},
			{
				name: 'tool_indicators_prompts_pro',
				type: 'string',
				description: 'Pro prompt for indicators toolset',
				reducer: (a: string, b: string) => {
					return a || b
				},
				default: () => {
					return 'You can use indicators toolset to create or retrieve indicators.'
				}
			},
			{
				name: SemanticModelVariableEnum.CurrentCubeContext,
				type: 'string',
				description: 'Current cube context in the model toolset',
				reducer: (a: string, b: string) => {
					return a || b
				},
				default: () => {
					return 'Empty'
				}
			},
			{
				name: 'tool_indicators_cubes',
				type: 'array[string]',
				description: 'Cubes of models in indicator system',
				reducer: (a, b) => {
					return b ?? a
				},
				default: () => {
					return markdownModelCubes(this.models)
				}
			}
		] as TStateVariable[]
	}

	private async initModels() {
		this.biContext = await this.queryBus.execute<GetBIContextQuery, TBIContext>(new GetBIContextQuery())
		this.biContext.logger = this.logger
		this.biContext.commandBus = this.commandBus
	}

	async initTools(): Promise<BuiltinTool[]> {
		// Initialize models in coap framework
		await this.initModels()
		// Initialize enabled tools
		this.tools = []

		return this.tools
	}

	async _validateCredentials(credentials: TToolCredentials) {
		return null
	}
}
