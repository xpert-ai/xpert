import type { ProjectConfigurationApi } from '@xpert-ai/plugin-sdk'
import { buildConnectorCallbackUrl } from '../../../connector/connector-oauth-url'
import { ForbiddenException, Injectable } from '@nestjs/common'
import { RequestContext, getConnectorAuthorizationModes, getConnectorAuthMethods } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { ConnectorService } from '../../../connector/connector.service'
import { ConnectorOAuthLaunchService } from '../../../connector/oauth-launch/connector-oauth-launch.service'
import { XpertProjectAccessService } from '../../services/project-access.service'

@Injectable()
export class ProjectConfigurationConnectorsAdapter {
    constructor(private readonly connectors: ConnectorService, private readonly access: XpertProjectAccessService,
        private readonly launches: ConnectorOAuthLaunchService) {}
    async listConnectors(projectId: string): ReturnType<ProjectConfigurationApi['listConnectors']> {
        const scope = { type: 'project' as const, projectId }
        const [bindings, definitions] = await Promise.all([
            this.connectors.listBindings(scope), this.connectors.definitionsForScope(scope)
        ])
        return { bindings, definitions: definitions.filter((definition) =>
            getConnectorAuthorizationModes(definition).includes('shared') || bindings.some((binding) => binding.provider === definition.provider)
        ).map((definition) => ({ provider: definition.provider, label: definition.label,
            authMethods: getConnectorAuthMethods(definition).filter((method) => !method.deprecated) })) }
    }
    async addConnector(projectId: string, input: Parameters<ProjectConfigurationApi['addConnector']>[1]): ReturnType<ProjectConfigurationApi['addConnector']> {
        await this.access.assertCanManage(projectId)
        await this.connectors.createBinding({ scope: { type: 'project', projectId }, provider: input.provider, authorizationMode: 'shared' })
        return null
    }
    async removeConnector(projectId: string, input: Parameters<ProjectConfigurationApi['removeConnector']>[1]): ReturnType<ProjectConfigurationApi['removeConnector']> {
        const binding = await this.assertBinding(projectId, input.bindingId)
        await this.connectors.deleteBinding(binding.id)
        return null
    }
    async getConnectorAuthorizationStatus(projectId: string, input: Parameters<ProjectConfigurationApi['getConnectorAuthorizationStatus']>[1]): ReturnType<ProjectConfigurationApi['getConnectorAuthorizationStatus']> {
        const binding = await this.assertBinding(projectId, input.bindingId)
        const result = await this.connectors.authorizationStatusBinding(binding.id)
        // Status checks never return reusable authorization URLs.
        return { status: result.connector.status }
    }
    async cancelConnectorAuthorization(projectId: string, input: Parameters<ProjectConfigurationApi['cancelConnectorAuthorization']>[1]): ReturnType<ProjectConfigurationApi['cancelConnectorAuthorization']> {
        const binding = await this.assertBinding(projectId, input.bindingId)
        await this.connectors.cancelBindingAuthorization(binding.id)
        return null
    }
    async connectConnector(projectId: string, input: Parameters<ProjectConfigurationApi['connectConnector']>[1]): ReturnType<ProjectConfigurationApi['connectConnector']> {
        const binding = await this.assertBinding(projectId, input.bindingId)
        const redirectUri = buildConnectorCallbackUrl(RequestContext.currentRequest())
        const result = await this.connectors.connectBinding(binding.id, { authMethodId: input.authMethodId, values: input.values, redirectUri })
        return this.launches.issue(result, redirectUri)
    }
    private async assertBinding(projectId: string, bindingId: string) {
        await this.access.assertCanManage(projectId)
        const binding = (await this.connectors.listBindings({ type: 'project', projectId })).find((item) => item.id === bindingId)
        if (!binding) throw new ForbiddenException(t('server-ai:Error.ConnectorDocumentAccessDenied'))
        return binding
    }
}
