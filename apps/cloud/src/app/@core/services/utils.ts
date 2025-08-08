import { IndicatorStatusEnum, NgmSemanticModel } from '@metad/cloud/state'
import { NgmDSCoreService } from '@metad/ocap-angular/core'
import { WasmAgentService } from '@metad/ocap-angular/wasm-agent'
import { AgentType, DataSourceOptions, isNil, omit, PropertyMeasure, Syntax } from '@metad/ocap-core'
import { getSemanticModelKey } from '@metad/story/core'

/**
 * Register semantic model into data soruce.
 * Note: Keep the logic consistent with `registerSemanticModel` on the backend.
 *
 * @param model Semantic Model
 * @param dsCoreService
 * @param wasmAgent
 * @param indicators Runtime indicators
 * @returns
 */
export function registerModel(
  model: NgmSemanticModel & { isDraft?: boolean; isIndicatorsDraft?: boolean },
  isDraft: boolean,
  dsCoreService: NgmDSCoreService,
  wasmAgent: WasmAgentService,
  calculatedMeasures?: Record<string, PropertyMeasure[]> // Runtime measures to be registered
) {
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
    // name: modelKey,
    catalog,
    dialect,
    agentType,
    settings: {
      dataSourceInfo: model.dataSource?.options?.data_source_info as string
    } as any,
    schema: {
      ...(model.schema ?? {}),
      // Use only released indicators
      indicators: model.indicators?.filter((_: any) => !_.status || _.status === IndicatorStatusEnum.RELEASED)
    },
    calculatedMeasures
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
        key: getSQLSourceName(modelKey),
        type: 'SQL',
        syntax: Syntax.SQL,
        isDraft
      })

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
        } as any,
        isDraft
      })
    } else {
      dsCoreService.registerModel({
        ...semanticModel,
        key: getXmlaSourceName(modelKey),
        settings: {
          ...semanticModel.settings,
          dataSourceInfo: model.dataSource?.options?.data_source_info
        } as any,
        // Don't use schema for source XMLA system
        schema: null,
        isDraft
      })

      dsCoreService.registerModel({
        ...semanticModel,
        settings: {
          ...semanticModel.settings,
          dataSourceInfo: model.dataSource?.options?.data_source_info
        } as any,
        isDraft
      })
    }
  } else {
    dsCoreService.registerModel({
      ...semanticModel,
      syntax: Syntax.SQL,
      settings: {
        ...semanticModel.settings,
        dataSourceInfo: model.dataSource?.options?.data_source_info
      } as any,
      isDraft
    })
  }

  if (semanticModel.agentType === AgentType.Wasm) {
    // Initialize the wasm service first
    wasmAgent.registerModel({
      ...semanticModel,
    })
  }

  return semanticModel
}

export function getSQLSourceName(key: string) {
  return key + '_SQL_SOURCE'
}
export function getXmlaSourceName(key: string) {
  return key + '_XMLA_SOURCE'
}

export function registerWasmAgentModel(wasmAgent: WasmAgentService, model: NgmSemanticModel) {
  wasmAgent.registerModel({
    ...model,
    name: getSemanticModelKey(model),
    catalog: model.catalog ?? 'main'
  })
}
