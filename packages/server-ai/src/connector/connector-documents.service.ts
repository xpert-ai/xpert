import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { t } from 'i18next'
import {
    ConnectorDocumentsRuntimeCapability,
    RequestContext,
    type ConnectorDocumentsApi,
    type ConnectorDocumentContext
} from '@xpert-ai/plugin-sdk'
import { RuntimeCapabilityProvider } from '../shared/runtime'
import { ConnectorService } from './connector.service'
import { ConnectorProviderService } from './connector-provider.service'

/** Invariants: interactive View access is checked against the live binding catalog, never an ID
 * supplied as a runtime grant by the browser. Every read rechecks connection, project and Assistant ACLs.
 */
@Injectable()
@RuntimeCapabilityProvider(ConnectorDocumentsRuntimeCapability)
export class ConnectorDocumentsService implements ConnectorDocumentsApi {
    constructor(
        @Inject(ConnectorService) private readonly connectors: ConnectorService,
        @Inject(ConnectorProviderService) private readonly providers: ConnectorProviderService
    ) {}
    private async catalog(context: ConnectorDocumentContext) {
        const { actor } = context
        if (
            !context.projectId ||
            !context.assistantId ||
            actor.tenantId !== RequestContext.currentTenantId() ||
            actor.organizationId !== RequestContext.getOrganizationId() ||
            actor.userId !== RequestContext.currentUserId()
        )
            throw new ForbiddenException(t('server-ai:Error.ConnectorDocumentAccessDenied'))
        // runtimeOptions authorizes the published Assistant and its binding to this Project.
        const options = await this.connectors.runtimeOptions(context.assistantId, context.projectId, true)
        const items = []
        for (const binding of options.items) {
            const provider = await this.providers.getRuntime(binding.provider, actor.organizationId, actor.tenantId)
            if (provider.documents) items.push({ binding, documents: provider.documents })
        }
        return items
    }
    sources: ConnectorDocumentsApi['sources'] = async (context) => ({
        items: (await this.catalog(context)).map(({ binding }) => ({
            bindingId: binding.bindingId,
            provider: binding.provider,
            label: binding.label,
            scope: binding.scope,
            status: binding.status,
            available: binding.granted,
            managementUrl: binding.managementUrl
        }))
    })
    private async resolve(context: ConnectorDocumentContext & { bindingId: string }) {
        const source = (await this.catalog(context)).find(({ binding }) => binding.bindingId === context.bindingId)
        if (!source?.binding.granted) throw new ForbiddenException(t('server-ai:Error.ConnectorDocumentAccessDenied'))
        const credential = await this.connectors.getRuntimeConnectorCredentialForScope(
            { bindingId: source.binding.bindingId },
            {
                ...context.actor,
                xpertId: context.assistantId,
                projectId: context.projectId,
                viewHost: { type: 'agent', id: context.assistantId },
                connectorBindingIds: [source.binding.bindingId]
            }
        )
        return { documents: source.documents, credential }
    }
    search: ConnectorDocumentsApi['search'] = async (input) => {
        if (
            input.query.length > 200 ||
            (input.cursor?.length ?? 0) > 2000 ||
            !Number.isInteger(input.pageSize) ||
            input.pageSize < 1 ||
            input.pageSize > 50
        )
            throw new BadRequestException(t('server-ai:Error.ConnectorDocumentInvalidInput'))
        const { documents, credential } = await this.resolve(input)
        return documents.search(credential, { query: input.query, cursor: input.cursor, pageSize: input.pageSize })
    }
    read: ConnectorDocumentsApi['read'] = async (input) => {
        if (!input.locator || input.locator.length > 2000)
            throw new BadRequestException(t('server-ai:Error.ConnectorDocumentInvalidInput'))
        const { documents, credential } = await this.resolve(input)
        return documents.read(credential, input.locator)
    }
}
