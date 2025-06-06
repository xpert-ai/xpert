import { AgentType, IIndicator, ISemanticModel } from '@metad/contracts'
import { DataSourceOptions, DSCoreService, Indicator, SemanticModel, Syntax } from '@metad/ocap-core'
import { isNil, omit } from 'lodash'

export const OCAP_AGENT_TOKEN = 'OCAP_AGENT_TOKEN'
export const OCAP_DATASOURCE_TOKEN = 'OCAP_DATASOURCE_TOKEN'
export const OCAP_MODEL_TOKEN = 'OCAP_MODEL_TOKEN'

export function getSemanticModelKey(model: ISemanticModel) {
	return model.id
}

export function registerSemanticModel(model: ISemanticModel & {isDraft?: boolean}, isDraft: boolean, dsCoreService: DSCoreService, settings?: {language: string}) {
	const modelKey = getSemanticModelKey(model)
	const agentType = isNil(model.dataSource)
		? AgentType.Wasm
		: model.dataSource.useLocalAgent
			? AgentType.Local
			: AgentType.Server
	const dialect =
		model.dataSource?.type?.type === 'agent'
			? 'sqlite'
			: agentType === AgentType.Wasm
				? 'duckdb'
				: model.dataSource?.type?.type
	const catalog = agentType === AgentType.Wasm ? model.catalog || 'main' : model.catalog
	const semanticModel = {
		...omit(model, 'indicators'),
		key: modelKey,
		catalog,
		dialect,
		agentType,
		mode: 'server',
		settings: {
			dataSourceInfo: model.dataSource?.options?.data_source_info as string,
			...(settings ?? {})
		} as any,
		schema: {
			...(model.options?.schema ?? {}),
			indicators: model.indicators?.map(convertOcapIndicatorResult)
		}
	} as DataSourceOptions

	if (model.dataSource?.type?.protocol?.toUpperCase() === 'SQL') {
		semanticModel.settings = semanticModel.settings
			? { ...semanticModel.settings }
			: {
					ignoreUnknownProperty: true
				}
		semanticModel.settings.dataSourceId = model.dataSource.id
	}

	if (model.type === 'XMLA') {
		semanticModel.syntax = Syntax.MDX
		if (model.dataSource?.type?.protocol?.toUpperCase() === 'SQL') {
			dsCoreService.registerModel({
				...semanticModel,
				/**
				 * Corresponding name of schema in olap engine:
				 * ```xml
				 * <root name="Semantic Model Name">
				 *    <Cube name="Sales">
				 * ...
				 * ```
				 */
				catalog: model.name,
				settings: {
					...(semanticModel.settings ?? {}),
					/**
					 * Corresponding id of XmlaConnection in olap engine:
					 */
					dataSourceInfo: isDraft ? `${model.id}/draft` : model.id
				} as any
			})
		} else {
			dsCoreService.registerModel({
				...semanticModel,
				settings: {
					...semanticModel.settings,
					dataSourceInfo: model.dataSource?.options?.data_source_info
				} as any
			})
		}
	} else {
		dsCoreService.registerModel({
			...semanticModel,
			syntax: Syntax.SQL,
			settings: {
				...semanticModel.settings,
				dataSourceInfo: model.dataSource?.options?.data_source_info
			} as any
		})
	}

	return semanticModel
}

/**
 * Convert the indicator type on server to the ocap framework type
 */
export function convertOcapIndicatorResult(result: IIndicator): Indicator {
	return {
	  ...omit(result, 'options'),
	  description: result.business,
	  ...(result.options ?? {})
	} as Indicator
}

/**
 * Convert the semantic model type on server to the ocap framework type
 */
export function convertOcapSemanticModel(result: ISemanticModel): SemanticModel {
	return {
	  ...result.options,
	  ...omit(result, 'options'),
	  indicators: result.indicators?.map(convertOcapIndicatorResult)
	} as SemanticModel
}
