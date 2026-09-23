import { WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { AgentMiddlewareRegistry, IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { inheritMiddlewareToolDisplayMetadata } from '../shared/agent'
import { THREAD_REFERENCE_MIDDLEWARE_NAME } from './thread-reference.middleware'

/** Always construct the gate so references added by a later steering input can activate it. */
export async function createThreadReferenceMiddleware(
    registry: AgentMiddlewareRegistry,
    context: Omit<IAgentMiddlewareContext, 'node'>
) {
    const key = '__thread_reference_middleware__'
    const strategy = registry.get(THREAD_REFERENCE_MIDDLEWARE_NAME)
    const middleware = inheritMiddlewareToolDisplayMetadata(
        await strategy.createMiddleware(
            {},
            {
                ...context,
                node: {
                    id: key,
                    key,
                    type: WorkflowNodeTypeEnum.MIDDLEWARE,
                    provider: THREAD_REFERENCE_MIDDLEWARE_NAME,
                    required: true
                }
            }
        ),
        strategy.meta
    )
    middleware.tools?.forEach((tool) => context.tools.set(tool.name, tool))
    return { key, middleware }
}
