import {
    normalizeMiddlewareProvider,
    WorkflowNodeTypeEnum,
    type AssistantTemplateSetup,
    type IWFNMiddleware,
    type TXpertTeamNode
} from '@xpert-ai/contracts'
import { CONNECTOR_MIDDLEWARE_NAME } from '../../xpert-middleware/connector.middleware'

/** Template declarations opt their providers into explicit per-user connection selection. */
export function templateConnectorSelection(nodes: TXpertTeamNode[], setup?: AssistantTemplateSetup) {
    const bindings =
        setup?.connectors.flatMap((connector) => {
            const choice = setup.state.connectors[connector.key]
            if (connector.status !== 'ready' || choice?.choice !== 'binding') return []
            return connector.options
                .filter((option) => option.bindingId === choice.bindingId && option.runtimeUsage !== 'credential')
                .map((option) => ({ provider: connector.provider, bindingId: option.bindingId }))
        }) ?? []
    return {
        bindingIds: bindings.map((binding) => binding.bindingId),
        nodes: nodes.flatMap((node) => {
            if (node.type !== 'workflow' || node.entity.type !== WorkflowNodeTypeEnum.MIDDLEWARE) return [node]
            const entity = node.entity as IWFNMiddleware
            if (normalizeMiddlewareProvider(entity.provider) !== CONNECTOR_MIDDLEWARE_NAME) return [node]
            const requirement = setup?.connectors.find((connector) => connector.provider === entity.options?.provider)
            if (!requirement) return [node]
            const binding = bindings.find((binding) => binding.provider === requirement.provider)
            return binding
                ? [{ ...node, entity: { ...entity, options: { ...entity.options, connectorId: binding.bindingId } } }]
                : []
        })
    }
}
