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
import type {
    ManagedQueueService,
    McpCapabilityDefinitions,
    McpCapabilityRuntimeProvider,
    TToolModelRuntime
} from '@xpert-ai/plugin-sdk'
import { _BaseToolset } from './toolset'

export type { TToolModelRuntime, TToolModelUsageReporter } from '@xpert-ai/plugin-sdk'

/**
 * The context params of creating toolset
 */
export type TBuiltinToolsetParams = TToolsetParams & {
    commandBus: CommandBus
    queryBus: QueryBus
    store?: BaseStore
    modelRuntime?: TToolModelRuntime
    managedQueue?: ManagedQueueService
    pluginScopeKey?: string
    pluginName?: string
    pluginVersion?: string
}

export interface IBuiltinToolset {
    validateCredentials(credentials: TToolCredentials): Promise<void>
}

export abstract class BuiltinToolset<T extends StructuredToolInterface = StructuredToolInterface, C = TToolCredentials>
    extends _BaseToolset<T>
    implements IBuiltinToolset, McpCapabilityRuntimeProvider
{
    static provider = ''
    protected logger = new Logger(this.constructor.name)

    providerType: XpertToolsetCategoryEnum.BUILTIN

    credentialsSchema?: { [key: string]: ToolProviderCredentials }
    protected mcpCapabilities: McpCapabilityDefinitions = {}

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
        protected params?: TBuiltinToolsetParams
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

    getMcpCapabilityDefinitions(): Readonly<McpCapabilityDefinitions> {
        return this.mcpCapabilities
    }

    getMcpCapabilitySource() {
        return {
            ...(this.params?.pluginName ? { pluginName: this.params.pluginName } : {}),
            ...(this.params?.pluginVersion ? { pluginVersion: this.params.pluginVersion } : {})
        }
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
