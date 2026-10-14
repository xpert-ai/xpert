import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Repository } from 'typeorm'
import {
    getConnectorAuthMethods,
    RequestContext,
    type ConnectorIntegrationOption,
    type ConnectorIntegrationRequest
} from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { ConnectorAppIntegrationService } from '@xpert-ai/server-core'
import { Connector } from '../connector.entity'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { ConnectorProviderService } from '../connector-provider.service'

@Injectable()
export class ConnectorIntegrationService {
    constructor(
        @InjectRepository(Connector) private readonly bindings: Pick<Repository<Connector>, 'findOne' | 'update'>,
        @Inject(XpertWorkspaceAccessService)
        private readonly workspaces: Pick<XpertWorkspaceAccessService, 'assertCanRead' | 'assertCanManage'>,
        @Inject(ConnectorProviderService) private readonly providers: Pick<ConnectorProviderService, 'getRuntime'>,
        @Inject(ConnectorAppIntegrationService)
        private readonly applications: Pick<ConnectorAppIntegrationService, 'list' | 'select' | 'create'>
    ) {}
    async list(workspaceId: string, provider: string, authMethodId: string) {
        const { workspace } = await this.workspaces.assertCanRead(workspaceId)
        const scope = { tenantId: RequestContext.currentTenantId(), organizationId: workspace.organizationId ?? null }
        const descriptor = await this.descriptor(provider, authMethodId, scope)
        return this.applications.list(scope, descriptor)
    }

    async prepare(bindingId: string, input: ConnectorIntegrationRequest): Promise<ConnectorIntegrationOption> {
        const tenantId = RequestContext.currentTenantId()
        const binding = await this.bindings.findOne({ where: { id: bindingId, tenantId } })
        if (!binding?.workspaceId || binding.projectId || binding.authorizationMode === 'personal')
            throw new NotFoundException()
        const { workspace } = await this.workspaces.assertCanManage(binding.workspaceId)
        if (binding.status === 'pending' || binding.status === 'active')
            throw new ConflictException(t('server-ai:Error.ConnectorIntegrationBusy'))
        const scope = { tenantId, organizationId: workspace.organizationId ?? null }
        const descriptor = await this.descriptor(binding.provider, input.authMethodId, scope)
        const selected =
            input.selection.type === 'existing'
                ? await this.applications.select(scope, descriptor, input.selection.integrationId)
                : await this.applications.create(scope, descriptor, binding.id, input.selection)
        const updated = await this.bindings.update(
            { id: binding.id, tenantId, status: binding.status },
            {
                appIntegrationId: selected.id,
                authMethodId: input.authMethodId,
                updatedById: RequestContext.currentUserId()
            }
        )
        if (updated.affected !== 1) throw new ConflictException(t('server-ai:Error.ConnectorIntegrationBusy'))
        return selected
    }

    private async descriptor(
        provider: string,
        authMethodId: string,
        scope: { tenantId: string; organizationId: string | null }
    ) {
        const strategy = await this.providers.getRuntime(provider, scope.organizationId ?? undefined, scope.tenantId)
        const method = getConnectorAuthMethods(strategy.definition).find((method) => method.id === authMethodId)
        if (method?.type !== 'oauth2' || !method.appCredentials?.integration)
            throw new BadRequestException(t('server-ai:Error.ConnectorIntegrationUnavailable'))
        return method.appCredentials.integration
    }
}
