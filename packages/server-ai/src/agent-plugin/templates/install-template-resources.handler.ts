import { BadRequestException } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import {
    PLUGIN_RESOURCE_INSTALLATION_STATUS,
    MCPServerType,
    type AgentPluginConnectorBinding
} from '@xpert-ai/contracts'
import { t } from 'i18next'
import { AgentPluginInstallationsService } from '../agent-plugin-installations.service'
import { AgentPluginConnectorService } from '../agent-plugin-connector.service'
import { connectorMcpAuth } from '../agent-plugin-mcp'
import { PluginResourceInstallerService } from '../../plugin-resource/plugin-resource-installer.service'
import { InstallAgentPluginTemplateResourcesCommand } from './agent-plugin-template.command'

@CommandHandler(InstallAgentPluginTemplateResourcesCommand)
export class InstallAgentPluginTemplateResourcesHandler implements ICommandHandler<InstallAgentPluginTemplateResourcesCommand> {
    constructor(
        private readonly packages: AgentPluginInstallationsService,
        private readonly connectors: AgentPluginConnectorService,
        private readonly installer: PluginResourceInstallerService
    ) {}

    async execute(command: InstallAgentPluginTemplateResourcesCommand) {
        const components = command.components.map((item) => ({ ...item }))
        const groups = new Map<
            string,
            {
                reference: { bindingId: string; version: string }
                connectors: { [key: string]: AgentPluginConnectorBinding }
            }
        >()
        for (const component of components) {
            if (component.runtimeSource !== 'agent-plugin' || component.component.componentType !== 'mcp_server')
                continue
            const source = command.locks.find((lock) => lock.pluginName === component.pluginName)?.source
            if (!source) throw new BadRequestException(t('server-ai:Error.TemplateDependencyChanged'))
            const reference = { bindingId: source.bindingId, version: source.bindingVersion }
            const resolved = await this.packages.reference(reference, command.assistant.workspaceId)
            if (!resolved || resolved.pkg.digest !== source.digest)
                throw new BadRequestException(t('server-ai:Error.TemplateDependencyChanged'))
            const key = component.component.componentKey
            const server = resolved.pkg.descriptor.servers.find((item) => item.key === key)
            if (!server) throw new BadRequestException(t('server-ai:Error.TemplateDependencyChanged'))
            const requirement = resolved.pkg.descriptor.extension?.connectors?.[key]
            const bindings = requirement
                ? await this.connectors.install(resolved.pkg, command.assistant.workspaceId, { [key]: requirement })
                : {}
            const auth = connectorMcpAuth(bindings[key], requirement)
            component.portableServer = { ...server.config, type: MCPServerType.HTTP, ...(auth ? { auth } : {}) }
            const group = groups.get(component.pluginName) ?? { reference, connectors: {} }
            Object.assign(group.connectors, bindings)
            groups.set(component.pluginName, group)
        }
        const result = await this.installer.installComponentsForXpert(command.assistant, components)
        for (const [pluginName, group] of groups) {
            const toolsets = result.installations.filter(
                (item) => item.pluginName === pluginName && item.componentType === 'mcp_server' && item.runtimeId
            )
            await this.packages.registerTemplateMcp(
                group.reference,
                command.assistant.workspaceId,
                toolsets.map((item) => item.runtimeId),
                group.connectors
            )
            for (const installation of toolsets) {
                const binding = group.connectors[installation.componentKey]
                if (binding && (await this.connectors.status(binding, command.assistant.id)) !== 'ready') {
                    // Connector authorization is per user and checked again at execution.
                    // Do not change the shared resource installation's persisted status.
                    result.pendingAuth.push({
                        ...installation,
                        status: PLUGIN_RESOURCE_INSTALLATION_STATUS.PENDING_AUTH
                    })
                }
            }
        }
        return result
    }
}
