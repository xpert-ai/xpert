import type { StructuredToolInterface } from '@langchain/core/tools'
import { BuiltinToolset } from '@xpert-ai/plugin-sdk'
import { buildOpenMetricManagementTool } from './tool'

export class DataXMetricManagementToolset extends BuiltinToolset<StructuredToolInterface> {
	static override provider = 'datax_metric_management'
	override tools = [buildOpenMetricManagementTool()]
	override stateVariables = []

	constructor() {
		super(DataXMetricManagementToolset.provider)
	}

	override async _validateCredentials(): Promise<void> {
		return
	}
}
