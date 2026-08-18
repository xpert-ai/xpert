import { StructuredToolInterface } from '@langchain/core/tools'
import { BaseStore } from '@langchain/langgraph'
import {
  I18nObject,
  IBuiltinTool,
  IXpertToolset,
  ToolProviderCredentials,
  TToolCredentials,
  TToolsetParams,
  XpertToolsetCategoryEnum
} from '@xpert-ai/contracts'
import { Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { BaseToolset } from './toolset'
import type { AgentMiddlewareModelProviderConnection, AgentMiddlewareRuntimeApi } from '../agent/middleware/runtime'
import type { ManagedQueueService } from '../managed-queue'

/**
 * The context params of creating toolset
 */
export type TToolTokenUsage = {
  type?: 'estimated'
  requestId: string
  provider: string
  model?: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export type TToolModelUsageReporter = (usage: TToolTokenUsage) => void | Promise<void>

export type TToolModelProviderRuntime = AgentMiddlewareModelProviderConnection

export type TToolModelRuntime = {
  /** Use the host's configured model provider; tool plugins must not handle provider API keys. */
  createModelClient: AgentMiddlewareRuntimeApi['createModelClient']
  /** Resolve the host model provider account required by a direct Provider API tool. */
  getModelProvider?: (provider: string) => Promise<TToolModelProviderRuntime>
  /** Report usage only for model APIs called directly by the tool. */
  reportUsage?: TToolModelUsageReporter
}

export type TBuiltinToolsetParams = TToolsetParams & {
  commandBus: CommandBus
  queryBus: QueryBus
  store?: BaseStore
  modelRuntime?: TToolModelRuntime
  managedQueue?: ManagedQueueService
  /** Installation scope used to route jobs back to this plugin instance. */
  pluginScopeKey?: string
}

export interface IBuiltinToolset {
  validateCredentials(credentials: TToolCredentials): Promise<void>
}

export abstract class BuiltinToolset<T extends StructuredToolInterface = StructuredToolInterface, C = TToolCredentials>
  extends BaseToolset<T>
  implements IBuiltinToolset
{
  static provider = ''
  protected logger = new Logger(this.constructor.name)

  providerType: XpertToolsetCategoryEnum.BUILTIN

  credentialsSchema?: { [key: string]: ToolProviderCredentials }

  get tenantId() {
    return this.params?.tenantId
  }
  get organizationId() {
    return this.params?.organizationId
  }
  get commandBus() {
    return this.params?.commandBus
  }
  get queryBus() {
    return this.params?.queryBus
  }

  get xpertId() {
    return this.params?.xpertId
  }
  get modelRuntime() {
    return this.params?.modelRuntime
  }
  get managedQueue() {
    return this.params?.managedQueue
  }
  get pluginScopeKey() {
    return this.params?.pluginScopeKey
  }

  constructor(
    public providerName: string,
    protected toolset?: IXpertToolset,
    protected override params?: TBuiltinToolsetParams
  ) {
    super(params)
  }

  async validateCredentials(credentials: C): Promise<void> {
    await this._validateCredentials(credentials)
  }

  async _validateCredentials(credentials: C) {
    throw new Error('Method not implemented.')
  }

  getId() {
    return this.toolset?.id
  }

  getCredentials() {
    return this.toolset?.credentials as C
  }

  getToolTitle(name: string): string | I18nObject {
    const tool = this.toolset?.tools?.find((tool) => tool.name === name)
    const identity = (<IBuiltinTool>tool?.schema)?.identity
    if (identity) {
      return identity.label
    }
    return null
  }

  /**
   * Get credentials schema
   *
   * @returns Credentials schema
   */
  getCredentialsSchema(): { [key: string]: ToolProviderCredentials } {
    return { ...this.credentialsSchema }
  }

  /**
   * Get toolset entity
   *
   * @returns XpertToolset
   */
  getToolset() {
    return this.toolset
  }

  getName() {
    return this.getToolset()?.name
  }
}
