import { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import {
    AgentMiddleware,
    AgentMiddlewareRegistry,
    AgentMiddlewareStrategy,
    IAgentMiddlewareContext,
    IAgentMiddlewareStrategy,
    PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { Injectable } from '@nestjs/common'

export const CONNECTOR_MIDDLEWARE_NAME = 'ConnectorMiddleware'
export const CONNECTOR_RUNTIME_MIDDLEWARE_PREFIX = 'ConnectorRuntime:'

type ConnectorMiddlewareConfig = {
    provider?: string
    connectorId?: string
}

@Injectable()
@AgentMiddlewareStrategy(CONNECTOR_MIDDLEWARE_NAME)
export class ConnectorMiddleware implements IAgentMiddlewareStrategy<ConnectorMiddlewareConfig> {
    readonly meta: TAgentMiddlewareMeta = {
        name: CONNECTOR_MIDDLEWARE_NAME,
        label: {
            en_US: 'Connector',
            zh_Hans: '连接器'
        },
        icon: {
            type: 'font',
            value: 'ri-plug-line'
        },
        description: {
            en_US: 'Select a workspace connector and let its provider plugin prepare runtime credentials and tools.',
            zh_Hans: '选择工作区连接器，由对应插件准备运行时凭证和工具。'
        },
        configSchema: {
            type: 'object',
            properties: {
                provider: {
                    type: 'string',
                    title: {
                        en_US: 'Connector',
                        zh_Hans: '连接器'
                    },
                    description: {
                        en_US: 'Workspace connector provider.',
                        zh_Hans: '工作区连接器提供方。'
                    },
                    'x-ui': {
                        component: 'remoteSelect',
                        selectUrl: '/api/xpert-workspace/connectors/provider-options',
                        depends: [
                            {
                                source: 'context',
                                name: 'workspaceId'
                            }
                        ],
                        span: 2
                    }
                }
            },
            required: ['provider']
        } as TAgentMiddlewareMeta['configSchema']
    }

    constructor(private readonly agentMiddlewareRegistry: AgentMiddlewareRegistry) {}

    createMiddleware(
        options: ConnectorMiddlewareConfig,
        context: IAgentMiddlewareContext
    ): PromiseOrValue<AgentMiddleware> {
        const provider = normalizeConfigValue(options?.provider)
        const connectorId = normalizeConfigValue(options?.connectorId)
        if (!provider) {
            return {
                name: CONNECTOR_MIDDLEWARE_NAME
            }
        }

        const runtimeProvider = connectorRuntimeMiddlewareProvider(provider)
        let strategy: IAgentMiddlewareStrategy
        try {
            strategy = this.agentMiddlewareRegistry.get(runtimeProvider, context.organizationId ?? undefined)
        } catch (error) {
            return createMissingRuntimeMiddleware(runtimeProvider, error)
        }
        const middleware = strategy.createMiddleware(
            {
                provider,
                ...(connectorId ? { connectorId } : {})
            },
            context
        )

        if (isPromiseLike(middleware)) {
            return middleware.then((value) => normalizeConnectorMiddleware(value))
        }

        return normalizeConnectorMiddleware(middleware)
    }
}

export function connectorRuntimeMiddlewareProvider(provider: string) {
    return `${CONNECTOR_RUNTIME_MIDDLEWARE_PREFIX}${provider}`
}

function normalizeConnectorMiddleware(middleware: AgentMiddleware): AgentMiddleware {
    return {
        ...middleware,
        name: CONNECTOR_MIDDLEWARE_NAME
    }
}

function createMissingRuntimeMiddleware(runtimeProvider: string, cause: unknown): AgentMiddleware {
    const message =
        `Connector runtime '${runtimeProvider}' is not registered. ` +
        'Install or reload the provider plugin that implements this workspace connector.'

    return {
        name: CONNECTOR_MIDDLEWARE_NAME,
        beforeAgent: () => {
            const details = cause instanceof Error && cause.message ? ` Original error: ${cause.message}` : ''
            throw new Error(`${message}${details}`)
        }
    }
}

function normalizeConfigValue(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isPromiseLike<T>(value: PromiseOrValue<T>): value is Promise<T> {
    return !!value && typeof (value as Promise<T>).then === 'function'
}
