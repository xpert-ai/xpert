import { IndicatorStatusEnum, NgmSemanticModel } from '@xpert-ai/cloud/state'
import { NgmDSCoreService } from '@xpert-ai/ocap-angular/core'
import { WasmAgentService } from '@xpert-ai/ocap-angular/wasm-agent'
import { AgentType, DataSourceOptions, isNil, omit, PropertyMeasure, Syntax } from '@xpert-ai/ocap-core'

/**
 * Register a semantic model for the existing Xpert live-artifact renderer.
 * Data/BI authoring and management are owned by Data Xpert.
 */
export function registerModel(
  model: NgmSemanticModel & { isDraft?: boolean; isIndicatorsDraft?: boolean },
  isDraft: boolean,
  dsCoreService: NgmDSCoreService,
  wasmAgent: WasmAgentService,
  calculatedMeasures?: Record<string, PropertyMeasure[]>
) {
  const modelKey = model.key ?? model.name
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
  const dataSourceInfo = getDataSourceInfo(model)
  const semanticModel = {
    ...omit(model, 'indicators'),
    key: modelKey,
    catalog,
    dialect,
    agentType,
    settings: {
      dataSourceInfo
    },
    schema: {
      ...(model.schema ?? {}),
      indicators: model.indicators?.filter(
        (indicator) => !indicator.status || indicator.status === IndicatorStatusEnum.RELEASED
      )
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
        catalog: model.name,
        settings: {
          ...(semanticModel.settings ?? {}),
          dataSourceInfo: isDraft ? `${model.id}/draft` : model.id
        },
        isDraft
      })
    } else {
      dsCoreService.registerModel({
        ...semanticModel,
        key: getXmlaSourceName(modelKey),
        settings: {
          ...semanticModel.settings,
          dataSourceInfo
        },
        schema: null,
        isDraft
      })

      dsCoreService.registerModel({
        ...semanticModel,
        settings: {
          ...semanticModel.settings,
          dataSourceInfo
        },
        isDraft
      })
    }
  } else {
    dsCoreService.registerModel({
      ...semanticModel,
      syntax: Syntax.SQL,
      settings: {
        ...semanticModel.settings,
        dataSourceInfo
      },
      isDraft
    })
  }

  if (semanticModel.agentType === AgentType.Wasm) {
    wasmAgent.registerModel(semanticModel)
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
    name: model.key ?? model.name,
    catalog: model.catalog ?? 'main'
  })
}

function getDataSourceInfo(model: NgmSemanticModel) {
  const value = model.dataSource?.options?.data_source_info
  return typeof value === 'string' ? value : undefined
}
