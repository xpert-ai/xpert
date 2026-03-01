import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { ToolMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { InferInteropZodInput, interopSafeParse } from '@langchain/core/utils/types'
import { Command, getCurrentTaskInput, LangGraphRunnableConfig } from '@langchain/langgraph'
import {
  ChatMessageEventTypeEnum,
  ChatMessageStepCategory,
  ChatMessageTypeEnum,
  getToolCallIdFromConfig,
  TAgentMiddlewareMeta,
  TAgentRunnableConfigurable
} from '@metad/contracts'
import {
  CalculatedMeasureSchema,
  ChartDimensionSchema,
  ChartMeasureSchema,
  DataSettingsSchema,
  DSCoreService,
  Indicator,
  isEntitySet,
  markdownModelCube,
  OrderBySchema,
  Schema,
  SlicerSchema,
  TimeGranularity,
  VariableSchema
} from '@metad/ocap-core'
import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import {
  ANALYTICS_PERMISSION_SERVICE_TOKEN,
  AnalyticsPermissionService,
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PluginContext,
  PromiseOrValue,
  getErrorMessage
} from '@xpert-ai/plugin-sdk'
import { firstValueFrom, switchMap, throwError, timeout } from 'rxjs'
import { z } from 'zod/v3'
import { ChatLarkMessage } from '../message'
import { drawChatAnswerCard } from './chatbi-lark-answer.render'
import { LARK_PLUGIN_CONTEXT } from '../tokens'
import { iconImage } from '../types'

const CHATBI_LARK_MIDDLEWARE_NAME = 'ChatBILarkMiddleware'
const CHATBI_CUBES_CHANNEL = 'chatbi_cubes'
const CHATBI_INDICATORS_CHANNEL = 'chatbi_indicators'
const CHATBI_MODEL_SELECT_OPTIONS_URL = '/api/chatbi-model/model-select-options'
const DEFAULT_TIMEOUT_MS = 30000

const TOOL_CHATBI_PROMPTS_DEFAULT = `
## Tools
  1. Call \`get_cube_context\` to get the cube context information if you do not have the model's dimensions and measures info, then proceed based on that information.
  2. Use the \`answer_question\` tool to reply to the user with the analysis results.
      If the number of dimensions used exceeds 3, please use the 'Table' visual type first.
      Always provide \`dataSettings.dataSource\` and \`dataSettings.entitySet\`; if missing, call \`get_cube_context\` first.
## Measures and indicators
  1. Call \`show_indicators\` to display indicator data only when the user explicitly wants to display certain indicators. Try NOT to call tools.
  2. When using a measure that has parameters, be sure to specify the values of those parameters in your answer.
  3. If the cube context does not have the required measure or indicators, you can use the \`calculated_members\` field of the \`answer_question\` tool to supplement the requirement and use calculated member's name in \`measures\`.
## Finally
  there is no need to generate a data:image/png;base64 image, as the data graphics are already displayed to the user in the tool.
`

const ChatBIModelSchema = z.object({
  id: z.string().optional().nullable().describe('The ChatBI model id'),
  modelId: z.string().describe('The model id'),
  modelKey: z.string().optional().nullable().describe('The data source key of semantic model'),
  cubeName: z.string().describe('The name of cube'),
  entityCaption: z.string().optional().nullable().describe('The caption of cube'),
  context: z.string().optional().nullable().describe('The context of cube'),
  prompts: z.array(z.string()).optional().nullable().default([]).describe('The suggestion prompts')
})

const LanguageSchema = z.enum(['en', 'zh-Hans']).describe('Language used by user')

const TimeSlicerSchema = z.object({
  dimension: z.string().describe('The name of time dimension'),
  hierarchy: z.string().optional().nullable().describe('The name of selected hierarchy in time dimension'),
  granularity: z
    .enum([TimeGranularity.Year, TimeGranularity.Quarter, TimeGranularity.Month, TimeGranularity.Week, TimeGranularity.Day])
    .describe('The granularity of the time range'),
  start: z
    .string()
    .describe(
      'The start period of the time range, format follows granularity: Day 20210101, Year 2022, Month 202101, Quarter 2022Q1, Week 2021W1'
    ),
  end: z
    .string()
    .optional()
    .nullable()
    .describe('The end period of the time range, format follows granularity')
})

const ChatAnswerSchema = z.object({
  language: LanguageSchema.optional().nullable(),
  preface: z.string().describe('preface of the answer'),
  visualType: z
    .enum(['ColumnChart', 'LineChart', 'PieChart', 'BarChart', 'Table', 'KPI'])
    .optional()
    .nullable()
    .describe('Visual type of result'),
  dataSettings: DataSettingsSchema.optional().nullable().describe('The data settings of the widget'),
  dimensions: z.array(ChartDimensionSchema).optional().nullable().describe('The dimensions used by the chart'),
  measures: z
    .array(ChartMeasureSchema)
    .optional()
    .nullable()
    .describe('The measures or calculated members used by the chart'),
  orders: z.array(OrderBySchema).optional().nullable().describe('The orders used by the chart'),
  limit: z.number().optional().nullable().describe('The number of rows in the returned result'),
  slicers: z.array(SlicerSchema).optional().nullable().describe('The slicers to filter data'),
  timeSlicers: z.array(TimeSlicerSchema).optional().nullable().describe('The time slicers to filter data'),
  parameters: z
    .array(
      z.object({
        name: z.string().describe('The name of the parameter'),
        value: z.string().or(z.number()).describe('The value of the parameter')
      })
    )
    .optional()
    .nullable()
    .describe('The parameters to the query of cube'),
  variables: z.array(VariableSchema).optional().nullable().describe('The variables to the query of cube'),
  calculated_members: z
    .array(CalculatedMeasureSchema)
    .optional()
    .nullable()
    .describe(
      'Temporary calculated members are used to supplement situations that cannot be met by current measures and indicators in cube.'
    )
})

const IndicatorSchema = z.object({
  language: z.string().optional().nullable().describe('Language used by user'),
  modelId: z.string().describe('The id of model'),
  cube: z.string().describe('The cube name'),
  code: z.string().describe('The unique code of indicator'),
  name: z.string().describe("The caption of indicator in user's language"),
  description: z.string().optional().nullable().describe('The detail description of indicator'),
  calendar: z.string().optional().nullable().describe('The calendar hierarchy used by indicator'),
  formula: z.string().describe('The MDX formula for calculated measure'),
  unit: z.string().optional().nullable().describe('The unit of measure'),
  query: z.string().optional().nullable().describe('A query statement for indicator verification')
})

const middlewareConfigSchema = z.object({
  models: z.array(z.any()).default([]),
  dataPermission: z.boolean().optional().nullable().default(false),
  dataLimit: z.number().int().min(1).default(100),
  timeouts: z.number().int().min(100).default(DEFAULT_TIMEOUT_MS),
})

const chatBIStateSchema = z.object({
  tool_chatbi_prompts_default: z.string().default(''),
  chatbi_models: z.string().default(''),
  chatbi_cubes: z
    .array(
      z.object({
        modelId: z.string(),
        cubeName: z.string(),
        context: z.string()
      })
    )
    .default([]),
  chatbi_cubes_context: z.string().default(''),
  chatbi_indicators: z.array(z.record(z.any())).default([])
})

type ChatBILarkMiddlewareConfig = InferInteropZodInput<typeof middlewareConfigSchema>
type ChatBIState = z.infer<typeof chatBIStateSchema>
type ChatBIModel = z.infer<typeof ChatBIModelSchema>

function markdownCubes(models: ChatBIModel[]) {
  return models
    .map((item) => {
      return `- dataSource: ${item.modelId}
  cubeName: ${item.cubeName}
  cubeCaption: ${item.entityCaption || item.cubeName}
  cubeDescription: ${item.context || ''}`
    })
    .join('\n')
}

function normalizeModels(models: unknown): ChatBIModel[] {
  const values = Array.isArray(models) ? models : models == null ? [] : [models]
  return values
    .map((raw): ChatBIModel | null => {
      const item = raw as any
      if (typeof item === 'string') {
        const id = item.trim()
        if (!id) {
          return null
        }
        return {
          id,
          modelId: id,
          modelKey: id,
          cubeName: id,
          entityCaption: id,
          context: '',
          prompts: []
        }
      }

      if (typeof item?.modelId === 'string' && item.modelId && typeof item?.cubeName === 'string' && item.cubeName) {
        return {
          id: item.id || item.chatbiModelId || item.value || item.modelId,
          modelId: item.modelId,
          modelKey: item.modelKey || item.modelId,
          cubeName: item.cubeName,
          entityCaption: item.entityCaption || item.label || item.cubeName,
          context: item.context || '',
          prompts: item.prompts || []
        }
      }

      const selectedValue = String(item?.value || item?.id || item?.modelId || item?.cubeName || '').trim()
      if (!selectedValue) {
        return null
      }

      const cubeName = item?.cubeName || selectedValue
      return {
        id: selectedValue,
        modelId: item?.modelId || selectedValue,
        modelKey: item?.modelKey || item?.modelId || selectedValue,
        cubeName,
        entityCaption: item?.label || item?.entityCaption || cubeName,
        context: item?.context || '',
        prompts: item?.prompts || []
      }
    })
    .filter((item): item is ChatBIModel => !!item)
}

function extractChatBIModelIds(models: unknown): string[] {
  const values = Array.isArray(models) ? models : models == null ? [] : [models]
  return values
    .map((item) => {
      if (typeof item === 'string') {
        return item.trim()
      }
      if (!item || typeof item !== 'object') {
        return ''
      }
      const candidate = (item as any).chatbiModelId || (item as any).id || (item as any).value
      return candidate ? String(candidate).trim() : ''
    })
    .filter(Boolean)
}

function createMessageId() {
  return `chatbi-lark-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function getCurrentStateSafe() {
  try {
    return (getCurrentTaskInput<Partial<ChatBIState>>() ?? {}) as Partial<ChatBIState>
  } catch {
    return {}
  }
}

function mergeCubes(current: ChatBIState['chatbi_cubes'], next: ChatBIState['chatbi_cubes']) {
  return [
    ...(current ?? []).filter((cube) => !(next ?? []).some((item) => item.cubeName === cube.cubeName)),
    ...(next ?? [])
  ]
}

function mergeIndicators(current: any[], next: any[]) {
  return [
    ...(current ?? []).filter((indicator) => !(next ?? []).some((item) => item.code === indicator.code)),
    ...(next ?? [])
  ]
}

function resolveChatBIModel(models: ChatBIModel[], modelIdentifier: string | null | undefined) {
  if (!modelIdentifier) {
    return null
  }
  return (
    models.find(
      (item) => item.modelId === modelIdentifier || item.id === modelIdentifier || item.modelKey === modelIdentifier
    ) || null
  )
}

function getSemanticModelId(models: ChatBIModel[], modelIdentifier: string) {
  const model = resolveChatBIModel(models, modelIdentifier)
  return model?.modelId || modelIdentifier
}

function getModelDataSourceKey(models: ChatBIModel[], modelIdentifier: string) {
  const model = resolveChatBIModel(models, modelIdentifier)
  return model?.modelKey || model?.modelId || modelIdentifier
}

function resolveAnswerDataSettings(
  answer: z.infer<typeof ChatAnswerSchema>,
  currentState: Partial<ChatBIState>,
  models: ChatBIModel[]
) {
  const dataSettings = (answer.dataSettings ?? {}) as Record<string, any>
  let semanticModelId =
    dataSettings.dataSource || dataSettings.semanticModelId || dataSettings.modelId || dataSettings.model || null
  let entitySet = dataSettings.entitySet || dataSettings.cube || dataSettings.entity || dataSettings.name || null
  const normalizedSemanticModelId = semanticModelId ? getSemanticModelId(models, semanticModelId) : null

  const cubes = ((currentState[CHATBI_CUBES_CHANNEL] as any[]) ?? []).filter(
    (item) => typeof item?.modelId === 'string' && typeof item?.cubeName === 'string'
  )
  if ((!normalizedSemanticModelId || !entitySet) && cubes.length) {
    const candidates = cubes.filter(
      (item) =>
        (!normalizedSemanticModelId || item.modelId === normalizedSemanticModelId) &&
        (!entitySet || item.cubeName === entitySet)
    )
    const selected = candidates[candidates.length - 1] || cubes[cubes.length - 1]
    semanticModelId = normalizedSemanticModelId || selected.modelId
    entitySet = entitySet || selected.cubeName
  } else {
    semanticModelId = normalizedSemanticModelId
  }

  if ((!semanticModelId || !entitySet) && models.length === 1) {
    semanticModelId = semanticModelId || models[0].modelId
    entitySet = entitySet || models[0].cubeName
  }

  if (!semanticModelId || !entitySet) {
    return null
  }

  return {
    ...dataSettings,
    dataSource: getModelDataSourceKey(models, semanticModelId),
    entitySet
  }
}

async function updateIndicators(dsCoreService: DSCoreService, models: ChatBIModel[], indicators: Indicator[]) {
  const indicatorsByModel = indicators.reduce<Record<string, Indicator[]>>((acc, indicator) => {
    const modelId = indicator?.modelId
    if (!modelId) {
      return acc
    }
    if (!acc[modelId]) {
      acc[modelId] = []
    }
    acc[modelId].push(indicator)
    return acc
  }, {})

  for (const modelId of Object.keys(indicatorsByModel)) {
    const modelIndicators = indicatorsByModel[modelId]
    const modelKey = getModelDataSourceKey(models, modelId)
    const dataSource = await firstValueFrom(dsCoreService.getDataSource(modelKey))
    const schema = (dataSource.options?.schema ?? {}) as Schema
    const existingIndicators = schema.indicators ?? []
    const mergedIndicators = [
      ...existingIndicators.filter(
        (existing) => !modelIndicators.some((next) => next.id === existing.id && next.code === existing.code)
      ),
      ...modelIndicators
    ]

    dataSource.setSchema({
      ...schema,
      indicators: mergedIndicators
    } as Schema)
  }
}

async function dispatchToolEvent(data: Record<string, unknown>) {
  try {
    await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, data)
  } catch {
    // Ignore callback pipeline availability errors.
  }
}

function emitLarkUpdateCard(config: LangGraphRunnableConfig, data: Record<string, unknown>) {
  const configurable = config?.configurable as TAgentRunnableConfigurable
  configurable?.subscriber?.next({
    data: {
      type: ChatMessageTypeEnum.MESSAGE,
      data: {
        id: createMessageId(),
        type: 'update',
        data
      }
    }
  } as MessageEvent)
}

function limitDataResults(items: any[], dataLimit: number) {
  const rows = Array.isArray(items) ? items : []
  let results = JSON.stringify(rows.slice(0, dataLimit), null, 2)
  if (rows.length > dataLimit) {
    results += `\nOnly the first ${dataLimit} pieces of data are returned. There are ${rows.length - dataLimit} pieces of data left. Please add more query conditions to view all the data.`
  }
  return results
}

function formatStatementPreview(statement: string, maxLines = 20) {
  const lines = (statement || '').split(/\r?\n/)
  const preview = lines
    .slice(0, maxLines)
    .map((line, index) => `${String(index + 1).padStart(2, '0')}| ${line}`)
    .join('\n')

  if (lines.length > maxLines) {
    return `${preview}\n... (${lines.length - maxLines} more lines)`
  }

  return preview
}

function formatJsonPreview(value: unknown, maxLength = 3000) {
  let text = ''
  if (typeof value === 'string') {
    text = value
  } else {
    try {
      text = JSON.stringify(value)
    } catch {
      text = String(value)
    }
  }

  if (text.length > maxLength) {
    return `${text.slice(0, maxLength)}... [truncated ${text.length - maxLength} chars]`
  }

  return text
}

@Injectable()
@AgentMiddlewareStrategy(CHATBI_LARK_MIDDLEWARE_NAME)
export class ChatBILarkMiddleware implements IAgentMiddlewareStrategy {
  private readonly logger = new Logger(ChatBILarkMiddleware.name)

  private readonly pluginContext?: PluginContext

  constructor(
    @Optional()
    @Inject(LARK_PLUGIN_CONTEXT)
    pluginContext?: PluginContext
  ) {
    this.pluginContext = pluginContext
  }

  private _analyticsPermissionService: AnalyticsPermissionService<DSCoreService> | null | undefined

  private get analyticsPermissionService(): AnalyticsPermissionService<DSCoreService> | null {
    if (this._analyticsPermissionService !== undefined) {
      return this._analyticsPermissionService
    }
    if (!this.pluginContext) {
      this._analyticsPermissionService = null
      return this._analyticsPermissionService
    }

    try {
      this._analyticsPermissionService = this.pluginContext.resolve(ANALYTICS_PERMISSION_SERVICE_TOKEN)
    } catch {
      this._analyticsPermissionService = null
    }

    return this._analyticsPermissionService
  }

  meta: TAgentMiddlewareMeta = {
    name: CHATBI_LARK_MIDDLEWARE_NAME,
    icon: {
      type: 'image',
      value: iconImage
    },
    label: {
      en_US: 'ChatBI Lark Middleware',
      zh_Hans: 'ChatBI 飞书中间件'
    },
    description: {
      en_US: 'Provides ChatBI-Lark compatible tools in middleware mode.',
      zh_Hans: '以中间件方式提供兼容 ChatBI-Lark 的工具集。'
    },
    configSchema: {
      type: 'object',
      properties: {
        models: {
          title: {
            en_US: 'Models',
            zh_Hans: '模型'
          },
          description: {
            en_US: 'Select ChatBI models',
            zh_Hans: '选择 ChatBI 模型'
          },
          'x-ui': {
            component: 'remoteSelect',
            selectUrl: CHATBI_MODEL_SELECT_OPTIONS_URL,
            multiple: true,
            span: 2
          }
        },
        dataPermission: {
          type: 'boolean',
          title: {
            en_US: 'Data Permission',
            zh_Hans: '数据权限'
          }
        },
        dataLimit: {
          type: 'number',
          title: {
            en_US: 'Data Limit',
            zh_Hans: '数据条数限制'
          },
          default: 100
        },
        timeouts: {
          type: 'number',
          title: {
            en_US: 'Timeout (ms, default 30s)',
            zh_Hans: '超时时间(毫秒，默认30s)'
          },
          default: DEFAULT_TIMEOUT_MS,
          minimum: 100
        },
      }
    } as TAgentMiddlewareMeta['configSchema']
  }

  createMiddleware(
    options: ChatBILarkMiddlewareConfig,
    _context: IAgentMiddlewareContext
  ): PromiseOrValue<AgentMiddleware> {
    void _context
    const { data, error } = interopSafeParse(middlewareConfigSchema, options ?? {})
    if (error) {
      throw new Error(`ChatBILarkMiddleware configuration error: ${error.message}`)
    }
    const parsed = data! as any
    const analyticsPermissionService = this.analyticsPermissionService
    const modelIds = extractChatBIModelIds(parsed.models)
    const fallbackModels = normalizeModels(parsed.models)
    this.logger.log(
      `[createMiddleware] Initialize with chatbiModelIds=${JSON.stringify(modelIds)}, fallbackModels=${fallbackModels.length}`
    )
    const enabled = {
      welcome: parsed.tools?.welcome !== false,
      answer_question: parsed.tools?.answer_question !== false,
      get_available_cubes: parsed.tools?.get_available_cubes !== false,
      get_cube_context: parsed.tools?.get_cube_context !== false,
      dimension_member_retriever: parsed.tools?.dimension_member_retriever !== false,
      create_indicator: parsed.tools?.create_indicator !== false
    }
    const timeoutMs = parsed.timeouts ?? DEFAULT_TIMEOUT_MS
    let configuredModels: ChatBIModel[] | null = null
    let dsCoreServicePromise: Promise<DSCoreService | null> | null = null

    const getConfiguredModels = async () => {
      if (configuredModels) {
        return configuredModels
      }

      if (analyticsPermissionService && modelIds.length) {
        try {
          const models = await analyticsPermissionService.resolveChatBIModels(modelIds)
          configuredModels = models.map((item) => ({
            id: item.chatbiModelId,
            modelId: item.modelId,
            modelKey: item.modelKey || item.modelId,
            cubeName: item.cubeName,
            entityCaption: item.entityCaption || item.cubeName,
            context: item.entityDescription || '',
            prompts: item.prompts ?? []
          }))
          this.logger.log(
            `[getConfiguredModels] Resolved ${configuredModels.length} ChatBI models from analytics permission service`
          )
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          this.logger.warn(
            `[getConfiguredModels] Failed to resolve models by ids=${JSON.stringify(modelIds)}: ${message}`
          )
          configuredModels = null
        }
      }

      if (!configuredModels) {
        configuredModels = fallbackModels
        this.logger.log(`[getConfiguredModels] Using ${configuredModels.length} fallback models from middleware config`)
      }

      return configuredModels
    }

    const getModelMarkdown = async () => {
      const models = await getConfiguredModels()
      return markdownCubes(models)
    }

    const probeRegisteredDataSources = async (dsCoreService: DSCoreService) => {
      const models = await getConfiguredModels()
      const dataSourceKeys = Array.from(
        new Set(models.map((item) => getModelDataSourceKey(models, item.modelId)).filter((value): value is string => !!value))
      )
      if (!dataSourceKeys.length) {
        this.logger.warn(`[getDSCoreService] No dataSource keys resolved from configured models`)
        return
      }

      for (const dataSourceKey of dataSourceKeys) {
        try {
          await firstValueFrom(dsCoreService.getDataSource(dataSourceKey))
          this.logger.log(`[getDSCoreService] Registered dataSource is ready: ${dataSourceKey}`)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          this.logger.warn(`[getDSCoreService] Failed to resolve dataSource '${dataSourceKey}': ${message}`)
        }
      }
    }

    const getDSCoreService = async () => {
      if (dsCoreServicePromise) {
        return await dsCoreServicePromise
      }

      dsCoreServicePromise = (async () => {
        if (!analyticsPermissionService) {
          throw new Error('[getDSCoreService] Analytics permission service is unavailable')
        }
        if (!modelIds.length) {
          throw new Error('[getDSCoreService] No ChatBI model ids configured for DSCore registration')
        }

        this.logger.log(`[getDSCoreService] Request DSCoreService with chatbiModelIds=${JSON.stringify(modelIds)}`)
        const dsCoreService = await analyticsPermissionService.getDSCoreService({
          modelIds
        })
        this.logger.log(`[getDSCoreService] DSCoreService acquired`)
        await probeRegisteredDataSources(dsCoreService)
        return dsCoreService
      })().catch((error) => {
        dsCoreServicePromise = null
        const message = error instanceof Error ? error.message : String(error)
        this.logger.warn(`[getDSCoreService] Failed to acquire DSCoreService: ${message}`)
        throw error instanceof Error ? error : new Error(message)
      })

      return await dsCoreServicePromise
    }

    const tools = []

    if (enabled.get_available_cubes) {
      tools.push(
        tool(
          async () => {
            return await getModelMarkdown()
          },
          {
            name: 'get_available_cubes',
            description: 'Get available cubes list',
            schema: z.object({})
          }
        )
      )
    }

    if (enabled.get_cube_context) {
      tools.push(
        tool(
          async ({ modelId, name }, config: LangGraphRunnableConfig) => {
            const toolCallId = getToolCallIdFromConfig(config)
            await dispatchToolEvent({
              id: toolCallId,
              category: 'Tool',
              message: name
            })

            const currentState = getCurrentStateSafe()
            const models = await getConfiguredModels()
            const resolvedModelId = getSemanticModelId(models, modelId)
            const resolvedModel = resolveChatBIModel(models, modelId)
            if (!resolvedModel) {
              throw new Error(
                `[get_cube_context] Model identifier '${modelId}' not found in configured models. Please check middleware model configuration.`
              )
            }

            const dsCoreService = await getDSCoreService()
            try {
              const indicators = ((currentState[CHATBI_INDICATORS_CHANNEL] as Indicator[]) ?? []).filter(
                (item): item is Indicator => !!item
              )
              if (indicators.length) {
                await updateIndicators(dsCoreService, models, indicators)
              }

              const dataSourceId = getModelDataSourceKey(models, modelId)
              this.logger.log(
                `[get_cube_context] selectEntitySet start: modelId=${modelId}, dataSource=${dataSourceId}, entitySet=${name}`
              )
              const entitySet = await firstValueFrom(
                dsCoreService
                  .getDataSource(dataSourceId)
                  .pipe(switchMap((dataSource) => dataSource.selectEntitySet(name)))
              )
              if (!isEntitySet(entitySet)) {
                throw new Error(
                  `[get_cube_context] The result of selectEntitySet is invalid for dataSource='${dataSourceId}', entitySet='${name}', error: ${getErrorMessage(entitySet)}`
                )
              }

              const propertyCount = Object.keys(entitySet.entityType?.properties ?? {}).length
              this.logger.log(
                `[get_cube_context] selectEntitySet success: dataSource=${dataSourceId}, entitySet=${name}, properties=${propertyCount}`
              )
              const context = markdownModelCube({
                modelId: resolvedModelId,
                dataSource: dataSourceId,
                cube: entitySet.entityType
              })
              try {
                await analyticsPermissionService?.visitChatBIModel(resolvedModelId, name)
              } catch {
                // Ignore model visit failures.
              }

              const cube = [{ modelId: resolvedModelId, cubeName: name, context }]
              const mergedCubes = mergeCubes((currentState[CHATBI_CUBES_CHANNEL] as any[]) || [], cube)

              return new Command({
                update: {
                  [CHATBI_CUBES_CHANNEL]: mergedCubes,
                  chatbi_cubes_context: mergedCubes.map(({ context }) => context).join('\n\n'),
                  messages: [
                    new ToolMessage({
                      content: context,
                      tool_call_id: toolCallId,
                      status: 'success'
                    })
                  ]
                }
              })
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error)
              this.logger.warn(
                `[get_cube_context] selectEntitySet failed: modelId=${modelId}, entitySet=${name}, error=${message}`
              )
              throw new Error(
                `[get_cube_context] Failed to load cube context for modelId='${modelId}', entitySet='${name}': ${message}`
              )
            }
          },
          {
            name: 'get_cube_context',
            description: 'Get the context info for the cubes',
            schema: z.object({
              modelId: z.string().describe('The model id of cube'),
              name: z.string().describe('The name of cube')
            })
          }
        )
      )
    }

    if (enabled.dimension_member_retriever) {
      tools.push(
        tool(
          async ({ modelId, cube, query, dimension, hierarchy, level, topK, re_embedding }, config) => {
            void re_embedding
            const toolCallId = getToolCallIdFromConfig(config)
            const models = await getConfiguredModels()
            const resolvedModel = resolveChatBIModel(models, modelId)
            if (!resolvedModel) {
              throw new Error(
                `[dimension_member_retriever] Model identifier '${modelId}' not found in configured models`
              )
            }
            const dataSourceId = getModelDataSourceKey(models, modelId)
            const dsCoreService = await getDSCoreService()
            const dataSource = await firstValueFrom(dsCoreService.getDataSource(dataSourceId))
            const allMembers = await firstValueFrom(
              (dataSource as any).selectMembers(cube, {
                dimension,
                hierarchy,
                level
              })
            )

            const keyword = (query || '').trim().toLowerCase()
            const rows = Array.isArray(allMembers) ? allMembers : []
            const filteredMembers = (keyword && keyword !== '*'
              ? rows.filter((member) => {
                  const caption = String(
                    member?.memberCaption ?? member?.caption ?? member?.label ?? member?.memberKey ?? ''
                  ).toLowerCase()
                  const key = String(member?.memberUniqueName ?? member?.memberKey ?? member?.key ?? '').toLowerCase()
                  return caption.includes(keyword) || key.includes(keyword)
                })
              : rows
            ).slice(0, topK && topK > 0 ? topK : 5)

            const members = filteredMembers.map((member) => ({
              caption: member?.memberCaption ?? member?.caption ?? member?.label ?? null,
              key: member?.memberUniqueName ?? member?.memberKey ?? member?.key
            }))

            await dispatchToolEvent({
              id: toolCallId,
              category: 'Computer',
              type: ChatMessageStepCategory.Knowledges,
              data: members.map((member) => ({
                pageContent: member.caption || member.key,
                metadata: {
                  caption: member.caption || '',
                  key: member.key
                }
              }))
            })

            if (!members.length) {
              throw new Error(
                `[dimension_member_retriever] No members found for modelId='${modelId}', cube='${cube}', dimension='${dimension}', query='${query}'`
              )
            }

            return members.map((member) => `- Caption: ${member.caption || ''}; Key: \`${member.key}\``).join('\n')
          },
          {
            name: 'dimension_member_retriever',
            description:
              'Search for dimension member key information about filter conditions. For any needs about filtering data, you must use this tool!',
            schema: z.object({
              modelId: z.string().describe('The model ID'),
              cube: z.string().describe('The cube name'),
              query: z.string().describe('The keywords to look up members'),
              dimension: z.string().describe('The dimension to look up in the retriever'),
              hierarchy: z.string().optional().describe('The hierarchy to look up in the retriever'),
              level: z.string().optional().describe('The level to look up in the retriever'),
              topK: z.number().optional().describe('Top k results'),
              re_embedding: z
                .boolean()
                .optional()
                .nullable()
                .default(false)
                .describe(
                  'Need re-embedding dimension members if the user explicitly requires, otherwise the default is false'
                )
            })
          }
        )
      )
    }

    if (enabled.create_indicator) {
      tools.push(
        tool(
          async (indicator, config: LangGraphRunnableConfig) => {
            const toolCallId = getToolCallIdFromConfig(config)
            const formula = indicator.formula?.trim()
            if (!formula) {
              throw new Error('The formula of indicator cannot be empty')
            }
            this.logger.warn(
              `[create_indicator] Incoming indicator: ${JSON.stringify({
                modelId: indicator.modelId,
                cube: indicator.cube,
                code: indicator.code,
                name: indicator.name,
                formula,
                query: indicator.query ?? null
              })}`
            )
            const models = await getConfiguredModels()
            if (analyticsPermissionService) {
              await analyticsPermissionService.ensureCreateIndicatorAccess()
              if (indicator.query?.trim()) {
                const statement = `WITH MEMBER [Measures].[${indicator.code}] AS ${formula}\n` + indicator.query
                const modelKey = getModelDataSourceKey(models, indicator.modelId)
                this.logger.warn(
                  `[create_indicator] Validate statement: modelId=${indicator.modelId}, modelKey=${modelKey}, code=${indicator.code}`
                )
                this.logger.warn(`[create_indicator] Statement preview:\n${formatStatementPreview(statement)}`)
                try {
                  await analyticsPermissionService.validateIndicatorStatement({
                    modelIds,
                    semanticModelId: indicator.modelId,
                    modelKey,
                    statement
                  })
                } catch (error) {
                  this.logger.error(
                    `[create_indicator] Statement validation failed: ${getErrorMessage(error)}\nStatement:\n${formatStatementPreview(
                      statement
                    )}`
                  )
                  throw error
                }
              }
            }

            await dispatchToolEvent({
              id: toolCallId,
              category: 'Tool',
              message: indicator.name || indicator.code
            })

            const currentState = getCurrentStateSafe()
            const nextIndicator = {
              ...indicator,
              formula,
              entity: indicator.cube,
              visible: true
            }
            const mergedIndicators = mergeIndicators((currentState[CHATBI_INDICATORS_CHANNEL] as any[]) || [], [
              nextIndicator
            ])

            emitLarkUpdateCard(config, {
              elements: [
                {
                  tag: 'markdown',
                  content:
                    `:Pin: New Calculated Indicator\n` +
                    `**Name:** ${indicator.name}\n` +
                    `**Code:** ${indicator.code}\n` +
                    `**Formula:**\n` +
                    `\`\`\`SQL\n${indicator.formula}\n\`\`\`\n` +
                    `${indicator.unit ? `**Unit:** ${indicator.unit}\n` : ''}`
                },
                {
                  tag: 'hr'
                }
              ]
            })

            return new Command({
              update: {
                [CHATBI_INDICATORS_CHANNEL]: mergedIndicators,
                messages: [
                  new ToolMessage({
                    content: `The indicator with code '${indicator.code}' has been created!`,
                    name: 'create_indicator',
                    tool_call_id: toolCallId,
                    status: 'success'
                  })
                ]
              }
            })
          },
          {
            name: 'create_indicator',
            description: 'Create a indicator for new measure',
            schema: IndicatorSchema,
            verboseParsingErrors: true
          }
        )
      )
    }

    if (enabled.welcome) {
      tools.push(
        tool(
          async ({ language, models, more }, config: LangGraphRunnableConfig) => {
            const lang = language === 'zh-Hans' ? 'zh-Hans' : 'en'
            const configuredModels = await getConfiguredModels()
            const modelMap = new Map(
              configuredModels.map((item) => [`${item.modelId}/${item.cubeName}`, item] as const)
            )
            const elements = [
              {
                tag: 'markdown',
                content: lang === 'zh-Hans' ? '你可以从这些数据集开始提问：' : 'You can start from these datasets:'
              }
            ] as any[]

            for (const item of models || []) {
              const configModel = modelMap.get(`${item.modelId}/${item.cubeName}`)
              const cubeCaption = configModel?.entityCaption || item.cubeName
              elements.push({
                tag: 'markdown',
                content: `- ${cubeCaption}`
              })

              if (item.prompts?.length) {
                elements.push({
                  tag: 'column_set',
                  columns: [
                    {
                      tag: 'column',
                      width: '23px'
                    },
                    {
                      tag: 'column',
                      elements: item.prompts.map((prompt) => ({
                        tag: 'button',
                        text: {
                          tag: 'plain_text',
                          content: prompt
                        },
                        type: 'primary_text',
                        complex_interaction: true,
                        width: 'default',
                        size: 'small',
                        value: prompt
                      }))
                    }
                  ]
                })
              }
            }

            if (more?.length) {
              elements.push({
                tag: 'markdown',
                content: lang === 'zh-Hans' ? '更多数据集：' : 'More datasets:'
              })
              elements.push({
                tag: 'column_set',
                columns: [
                  {
                    tag: 'column',
                    width: '23px'
                  },
                  {
                    tag: 'column',
                    elements: more.map((item) => {
                      const configModel = modelMap.get(`${item.modelId}/${item.cubeName}`)
                      const cubeCaption = configModel?.entityCaption || item.cubeName
                      return {
                        tag: 'button',
                        text: {
                          tag: 'plain_text',
                          content: cubeCaption
                        },
                        type: 'primary_text',
                        complex_interaction: true,
                        width: 'default',
                        size: 'small',
                        value: cubeCaption
                      }
                    })
                  }
                ]
              })
            }

            emitLarkUpdateCard(config, {
              language,
              header: {
                title: {
                  tag: 'plain_text',
                  content: lang === 'zh-Hans' ? '欢迎' : 'Welcome'
                },
                subtitle: {
                  tag: 'plain_text',
                  content: ''
                },
                template: ChatLarkMessage.headerTemplate,
                icon: ChatLarkMessage.logoIcon
              },
              elements
            })

            const toolCallId = getToolCallIdFromConfig(config)
            return new Command({
              update: {
                sys_language: language,
                messages: [
                  new ToolMessage({
                    content: 'Welcome message sent to user!',
                    name: 'welcome',
                    tool_call_id: toolCallId,
                    status: 'success'
                  })
                ]
              }
            })
          },
          {
            name: 'welcome',
            description: 'Show welcome message to guide user ask questions about models.',
            schema: z.object({
              language: z.enum(['en', 'zh-Hans']).describe('Language used by user'),
              models: z
                .array(
                  z.object({
                    modelId: z.string().describe('The model id'),
                    cubeName: z.string().describe('The name of cube'),
                    prompts: z.array(z.string().describe('The suggestion prompt to analysis the data model'))
                  })
                )
                .describe('Top 3 models'),
              more: z
                .array(
                  z
                    .object({
                      modelId: z.string().describe('The model id'),
                      cubeName: z.string().describe('The name of cube')
                    })
                    .optional()
                    .nullable()
                )
                .optional()
                .nullable()
                .describe('The more models')
            })
          }
        )
      )
    }

    if (enabled.answer_question) {
      tools.push(
        tool(
          async (params, config: LangGraphRunnableConfig): Promise<string> => {
            const answer = params as z.infer<typeof ChatAnswerSchema>
            const hasQueryTarget = !!(answer.dimensions?.length || answer.measures?.length)
            // const emitAnswerSummaryCard = () => {
            //   const dimensions = (answer.dimensions || []).map((dimension) => dimension?.dimension || 'Unknown')
            //   const measures = (answer.measures || []).map((measure) => measure?.measure || 'Unknown')
            //   const filters = [...(answer.variables || []), ...(answer.slicers || []), ...(answer.timeSlicers || [])]

            //   emitLarkUpdateCard(config, {
            //     header: {
            //       title: {
            //         tag: 'plain_text',
            //         content: 'Analysis result'
            //       },
            //       subtitle: {
            //         tag: 'plain_text',
            //         content: answer.preface || ''
            //       },
            //       template: ChatLarkMessage.headerTemplate,
            //       icon: ChatLarkMessage.logoIcon
            //     },
            //     elements: [
            //       {
            //         tag: 'markdown',
            //         content: `**Preface:** ${answer.preface || 'N/A'}`
            //       },
            //       {
            //         tag: 'markdown',
            //         content: `**visualType:** ${answer.visualType || 'Table'}`
            //       },
            //       {
            //         tag: 'markdown',
            //         content: `**dimensions:** ${dimensions.length ? dimensions.join(', ') : 'N/A'}`
            //       },
            //       {
            //         tag: 'markdown',
            //         content: `**measures:** ${measures.length ? measures.join(', ') : 'N/A'}`
            //       },
            //       {
            //         tag: 'markdown',
            //         content: `**filters:** ${filters.length ? JSON.stringify(filters) : 'N/A'}`
            //       }
            //     ]
            //   })
            // }

            if (!hasQueryTarget) {
              return `The chart answer has already been provided to the user, please do not repeat the response.`
            }

            const models = await getConfiguredModels()
            const currentState = getCurrentStateSafe()
            const dsCoreService = await getDSCoreService()

            const runtimeIndicators = ((currentState[CHATBI_INDICATORS_CHANNEL] as Indicator[]) ?? []).filter(
              (item): item is Indicator => !!item
            )
            if (runtimeIndicators.length) {
              await updateIndicators(dsCoreService, models, runtimeIndicators)
            }

            const resolvedDataSettings = resolveAnswerDataSettings(answer, currentState, models)
            if (!resolvedDataSettings?.dataSource || !resolvedDataSettings?.entitySet) {
              throw new Error(
                'DataSettings is required to answer question. Please call get_cube_context and provide dataSettings (dataSource/entitySet).'
              )
            }
            if (!resolveChatBIModel(models, String(resolvedDataSettings.dataSource))) {
              throw new Error(
                `[answer_question] Resolved dataSource '${resolvedDataSettings.dataSource}' does not match configured models. Incoming dataSettings=${JSON.stringify(
                  answer.dataSettings ?? {}
                )}`
              )
            }

            try {
              this.logger.log(
                `[answer_question] selectEntitySet start: dataSource=${resolvedDataSettings.dataSource}, entitySet=${resolvedDataSettings.entitySet}`
              )
              const entity = await firstValueFrom(
                dsCoreService.selectEntitySet(resolvedDataSettings.dataSource, resolvedDataSettings.entitySet).pipe(
                  timeout({
                    first: timeoutMs,
                    with: () =>
                      throwError(
                        () =>
                          new Error(
                            `Timeout while selecting entity set '${resolvedDataSettings.entitySet}' from '${resolvedDataSettings.dataSource}' after ${timeoutMs}ms`
                          )
                      )
                  })
                )
              )
              const propertyCount = Object.keys(entity.entityType?.properties ?? {}).length
              this.logger.log(
                `[answer_question] selectEntitySet success: dataSource=${resolvedDataSettings.dataSource}, entitySet=${resolvedDataSettings.entitySet}, properties=${propertyCount}`
              )
              this.logger.warn(
                `[answer_question][debug] Query context: ${formatJsonPreview({
                  language: answer.language,
                  visualType: answer.visualType,
                  preface: answer.preface,
                  dataSettings: resolvedDataSettings,
                  dimensions: answer.dimensions,
                  measures: answer.measures,
                  orders: answer.orders,
                  limit: answer.limit,
                  slicers: answer.slicers,
                  timeSlicers: answer.timeSlicers,
                  variables: answer.variables,
                  calculated_members: answer.calculated_members
                })}`
              )
              const chartData = await drawChatAnswerCard({
                dsCoreService,
                entityType: entity.entityType,
                answer: {
                  ...answer,
                  dataSettings: resolvedDataSettings
                },
                dataPermission: parsed.dataPermission ?? false,
                queryTimeoutMs: timeoutMs,
                onDebug: (message, data) =>
                  this.logger.warn(
                    `[answer_question][drawChatAnswerCard] ${message}${
                      data === undefined ? '' : `: ${formatJsonPreview(data)}`
                    }`
                  ),
                onUpdateCard: (card) => emitLarkUpdateCard(config, card)
              })
              this.logger.log(
                `[answer_question] drawChatAnswerCard finished: rows=${Array.isArray(chartData) ? chartData.length : 0}`
              )

              const results = limitDataResults(chartData, parsed.dataLimit || 100)
              return `The data are:\n${results}\n Please give more analysis suggestions about other dimensions or filter by dimensioin members, 3 will be enough.`
            } catch (error) {
              this.logger.error(error)
              const message = getErrorMessage(error) || 'Failed to query chart data'
              this.logger.warn(`[answer_question] Failed with error: ${message}`)
              throw new Error(`${message}\nIf more information is needed from the user, remind the user directly.`)
            }
          },
          {
            name: 'answer_question',
            description: 'Show answer for the question to user',
            schema: ChatAnswerSchema,
            verboseParsingErrors: true
          }
        )
      )
    }

    return {
      name: CHATBI_LARK_MIDDLEWARE_NAME,
      stateSchema: chatBIStateSchema,
      beforeAgent: async (state) => {
        return {
          tool_chatbi_prompts_default: state.tool_chatbi_prompts_default || TOOL_CHATBI_PROMPTS_DEFAULT,
          chatbi_models: await getModelMarkdown()
        }
      },
      tools
    }
  }
}

export type { ChatBILarkMiddlewareConfig }
