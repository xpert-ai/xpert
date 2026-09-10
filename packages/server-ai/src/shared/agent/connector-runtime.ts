import { ForbiddenException } from '@nestjs/common'
import { IWFNMiddleware, normalizeMiddlewareProvider, TXpertTeamNode, WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import type { SelectedRuntimeConnectorBinding } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { CONNECTOR_MIDDLEWARE_NAME } from '../../xpert-middleware/connector.middleware'

/** Grant only enabled graph nodes; keep their middleware instances and exact pinned IDs. */
export function getConnectorMiddlewareScope(
    nodes: TXpertTeamNode[],
    selectedBindings: SelectedRuntimeConnectorBinding[]
) {
    const connectorBindingIds = new Set(selectedBindings.map(({ bindingId }) => bindingId))
    const connectorProviders = new Set<string>()
    const graphProviders = new Set<string>()
    const pinnedBindings = new Map(selectedBindings.map(({ provider, bindingId }) => [provider, bindingId]))

    for (const node of nodes) {
        if (node.type !== 'workflow' || node.entity.type !== WorkflowNodeTypeEnum.MIDDLEWARE) {
            continue
        }
        const entity = node.entity as IWFNMiddleware
        if (normalizeMiddlewareProvider(entity.provider) !== CONNECTOR_MIDDLEWARE_NAME) {
            continue
        }
        const provider = typeof entity.options?.provider === 'string' ? entity.options.provider.trim() : ''
        const connectorId = typeof entity.options?.connectorId === 'string' ? entity.options.connectorId.trim() : ''
        if (!provider) continue

        graphProviders.add(provider)
        if (connectorId) {
            const existing = pinnedBindings.get(provider)
            if (existing && existing !== connectorId) {
                throw new ForbiddenException(
                    t('server-ai:Error.ConnectorAccessDenied', {
                        defaultValue: 'Connector access is not available in the current scope'
                    })
                )
            }
            pinnedBindings.set(provider, connectorId)
            connectorBindingIds.add(connectorId)
        } else {
            connectorProviders.add(provider)
        }
    }

    return {
        connectorBindingIds: [...connectorBindingIds],
        connectorProviders: [...connectorProviders],
        // One provider has one binding per scope. Its existing graph node owns
        // tool preferences and ordering; only graphless selections need a builtin.
        additionalBindings: selectedBindings.filter(({ provider }) => !graphProviders.has(provider))
    }
}
