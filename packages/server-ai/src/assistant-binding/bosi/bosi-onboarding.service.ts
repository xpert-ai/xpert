// Invariants: the bootstrap lock owns mutations. Catalogs describe capabilities,
// not grants; workspace installation and every runtime retain their own authorization.
import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { DataSource } from 'typeorm'
import { t } from 'i18next'
import {
    resolveI18nText,
    type BosiOnboardingCatalog,
    type BosiOnboardingChoice,
    type BosiOnboardingItem
} from '@xpert-ai/contracts'
import { getConnectorAuthorizationModes, RequestContext } from '@xpert-ai/plugin-sdk'
import { AssistantBinding } from '../assistant-binding.entity'
import { parseBosiOnboardingPreferences } from './bosi-onboarding.schema'
import { XpertWorkspaceService } from '../../xpert-workspace/workspace.service'
import { EnsurePersonalDefaultWorkspaceCommand } from '../../xpert-workspace/commands/ensure-personal-default-workspace.command'
import { AgentPluginInstallationsService } from '../../agent-plugin/agent-plugin-installations.service'
import { agentPluginConnectorProviders } from '../../agent-plugin/agent-plugin-connector-providers'
import type { RuntimeResourceReference } from '@xpert-ai/contracts'
import { ConnectorService } from '../../connector/connector.service'

@Injectable()
export class BosiOnboardingService {
    constructor(
        private readonly database: DataSource,
        private readonly workspaces: XpertWorkspaceService,
        private readonly plugins: AgentPluginInstallationsService,
        private readonly connectors: ConnectorService,
        private readonly commands: CommandBus
    ) {}

    private mutable(binding: AssistantBinding) {
        if (binding.assistantId || binding.desktopBootstrap)
            throw new ConflictException(t('server-ai:Error.BosiOnboardingFinished'))
    }

    async workspace(binding: AssistantBinding) {
        const preferences = binding.desktopOnboarding ? parseBosiOnboardingPreferences(binding.desktopOnboarding) : null
        const workspace = preferences
            ? await this.workspaces.findOne(preferences.workspaceId, { relations: ['members'] })
            : await this.commands.execute(new EnsurePersonalDefaultWorkspaceCommand('Bosi'))
        if (
            workspace.tenantId !== binding.tenantId ||
            workspace.organizationId !== binding.organizationId ||
            workspace.ownerId !== binding.userId ||
            workspace.members?.length ||
            (workspace.status && workspace.status !== 'active') ||
            (workspace.settings?.access?.visibility ?? 'private') !== 'private'
        )
            throw new ForbiddenException(t('server-ai:Error.BosiPrivateWorkspaceRequired'))
        if (!preferences) {
            binding.desktopOnboarding = {
                version: 1,
                revision: 0,
                workspaceId: workspace.id,
                packages: [],
                connectorIds: []
            }
            await this.save(binding)
        }
        return workspace
    }

    private save(binding: AssistantBinding) {
        return this.database.getRepository(AssistantBinding).update(binding.id, {
            desktopOnboarding: binding.desktopOnboarding
        })
    }

    async catalog(binding: AssistantBinding): Promise<BosiOnboardingCatalog> {
        return (await this.choices(binding)).catalog
    }

    private async choices(binding: AssistantBinding) {
        this.mutable(binding)
        const workspace = await this.workspace(binding)
        const connectorScope = { type: 'workspace' as const, workspaceId: workspace.id }
        const [packages, definitions, connections] = await Promise.all([
            this.plugins.installedCatalog(workspace.id),
            this.connectors.definitionsForScope(connectorScope),
            this.connectors.listBindings(connectorScope)
        ])
        const preferences = binding.desktopOnboarding
        const items: BosiOnboardingItem[] = []
        const relatedProviders = new Set<string>()
        const selectable = new Map<string, { resource: RuntimeResourceReference; providers: string[] }>()
        for (const { pkg, binding: resource } of packages) {
            if (resource.definition.kind !== 'agent_plugin') continue
            const requirements = resource.definition.connectorServers ?? pkg.descriptor.extension?.connectors ?? {}
            const providers = new Set<string>()
            let configurationRequired =
                this.plugins.missingExperts(pkg, resource) ||
                pkg.descriptor.diagnostics.length > 0 ||
                !!resource.definition.oauthServers?.length
            if (resource.enabled && !configurationRequired) {
                try {
                    for (const { provider } of agentPluginConnectorProviders(
                        pkg,
                        requirements,
                        binding.organizationId
                    ).values()) {
                        const definition = definitions.find(
                            (entry) => entry.provider === provider || entry.canonicalProvider === provider
                        )
                        if (
                            !definition ||
                            definition.unavailable ||
                            !getConnectorAuthorizationModes(definition).includes('shared')
                        ) {
                            configurationRequired = true
                            continue
                        }
                        relatedProviders.add(definition.provider)
                        providers.add(definition.provider)
                    }
                } catch (error) {
                    if (!(error instanceof BadRequestException)) throw error
                    configurationRequired = true
                }
            }
            const needsAuth = [...providers].some(
                (provider) =>
                    !connections.some(
                        (connection) =>
                            connection.provider === provider &&
                            connection.authorizationMode === 'shared' &&
                            connection.status === 'active'
                    )
            )
            const status = !resource.enabled
                ? 'unavailable'
                : configurationRequired
                  ? 'configuration_required'
                  : needsAuth
                    ? 'requires_auth'
                    : 'ready'
            if (resource.enabled && !configurationRequired) {
                selectable.set(pkg.id, {
                    resource: { bindingId: resource.id, version: resource.version },
                    providers: [...providers]
                })
            }
            const language = RequestContext.getLanguageCode()
            const display = pkg.descriptor.extension?.interface
            items.push({
                id: pkg.id,
                kind: 'plugin',
                name: resolveI18nText(display?.displayName, language) || resource.title,
                description: resolveI18nText(display?.description ?? resource.description, language),
                ...(display?.icon ? { icon: { type: 'image', value: display.icon } as const } : {}),
                status,
                selected: preferences.packages.some((entry) => entry.packageId === pkg.id),
                canSelect: status !== 'unavailable' && status !== 'configuration_required',
                canConnect: false,
                ...(status === 'configuration_required'
                    ? { reason: t('server-ai:Error.BosiCapabilityConfigurationRequired') }
                    : {}),
                ...(status === 'unavailable' ? { reason: t('server-ai:Error.AgentPluginWorkspaceDisabled') } : {})
            })
        }
        for (const definition of definitions) {
            // Credential-only providers are shown with their actual plugin dependency.
            if (definition.runtimeUsage === 'credential' && !relatedProviders.has(definition.provider)) continue
            const connection = connections.find((entry) => entry.provider === definition.provider)
            const supported =
                getConnectorAuthorizationModes(definition).includes('shared') &&
                (!connection || connection.authorizationMode === 'shared')
            const ready = supported && connection?.status === 'active'
            items.push({
                id: definition.provider,
                kind: 'connector',
                name: resolveI18nText(definition.label, RequestContext.getLanguageCode()) || definition.provider,
                description: resolveI18nText(definition.description, RequestContext.getLanguageCode()),
                icon: definition.icon,
                status: !supported
                    ? 'configuration_required'
                    : ready
                      ? 'ready'
                      : connection?.status === 'expired'
                        ? 'expired'
                        : 'requires_auth',
                selected: !!connection && preferences.connectorIds.includes(connection.id),
                canSelect: supported && definition.runtimeUsage !== 'credential',
                canConnect: supported,
                ...(!supported ? { reason: t('server-ai:Error.BosiCapabilityConfigurationRequired') } : {})
            })
        }
        return {
            catalog: { workspace: { id: workspace.id, name: workspace.name }, revision: preferences.revision, items },
            selectable
        }
    }

    private async ensureConnector(binding: AssistantBinding, provider: string) {
        const scope = { type: 'workspace' as const, workspaceId: binding.desktopOnboarding.workspaceId }
        const items = await this.connectors.listBindings(scope)
        return (
            items.find((item) => item.provider === provider) ??
            this.connectors.createBinding({
                provider,
                scope,
                authorizationMode: 'shared'
            })
        )
    }

    async choose(binding: AssistantBinding, choice: BosiOnboardingChoice) {
        const { catalog, selectable } = await this.choices(binding)
        if (choice.revision !== catalog.revision) throw new ConflictException(t('server-ai:Error.BosiChoicesChanged'))
        const item = catalog.items.find((entry) => entry.id === choice.id && entry.kind === choice.kind)
        const preferences = binding.desktopOnboarding
        // Revoked/deleted choices can still be removed, but never installed again.
        if (choice.selected && !item?.canSelect)
            throw new ForbiddenException(t('server-ai:Error.BosiCapabilityConfigurationRequired'))
        if (
            choice.selected &&
            !item.selected &&
            (choice.kind === 'plugin' ? preferences.packages.length : preferences.connectorIds.length) >= 50
        )
            throw new BadRequestException(t('server-ai:Error.BosiSelectionLimit'))
        if (choice.kind === 'plugin') {
            preferences.packages = preferences.packages.filter((entry) => entry.packageId !== choice.id)
            if (choice.selected) {
                const plugin = selectable.get(choice.id)!
                for (const provider of plugin.providers) await this.ensureConnector(binding, provider)
                preferences.packages.push({ packageId: choice.id, resource: plugin.resource })
            }
        } else {
            const connections = await this.connectors.listBindings({
                type: 'workspace',
                workspaceId: catalog.workspace.id
            })
            const connection = choice.selected
                ? await this.ensureConnector(binding, choice.id)
                : connections.find((entry) => entry.provider === choice.id)
            if (connection) {
                preferences.connectorIds = preferences.connectorIds.filter((id) => id !== connection.id)
                if (choice.selected) preferences.connectorIds.push(connection.id)
            }
        }
        preferences.revision++
        await this.save(binding)
        return this.catalog(binding)
    }

    async connection(binding: AssistantBinding, provider: string) {
        const catalog = await this.catalog(binding)
        const item = catalog.items.find((entry) => entry.kind === 'connector' && entry.id === provider)
        if (!item?.canConnect) throw new ForbiddenException(t('server-ai:Error.BosiCapabilityConfigurationRequired'))
        const connection = await this.ensureConnector(binding, provider)
        if (item.canSelect && !binding.desktopOnboarding.connectorIds.includes(connection.id)) {
            if (binding.desktopOnboarding.connectorIds.length >= 50)
                throw new BadRequestException(t('server-ai:Error.BosiSelectionLimit'))
            binding.desktopOnboarding.connectorIds.push(connection.id)
            binding.desktopOnboarding.revision++
            await this.save(binding)
        }
        return { workspaceId: catalog.workspace.id, bindingId: connection.id, organizationId: binding.organizationId }
    }

    async resolveConnection(binding: AssistantBinding, target: { workspaceId: string; bindingId: string }) {
        this.mutable(binding)
        const workspace = await this.workspace(binding)
        if (workspace.id !== target.workspaceId)
            throw new ForbiddenException(t('server-ai:Error.BosiPrivateWorkspaceRequired'))
        const connections = await this.connectors.listBindings({ type: 'workspace', workspaceId: workspace.id })
        const connection = connections.find(
            (item) => item.id === target.bindingId && item.authorizationMode === 'shared'
        )
        if (!connection) throw new ForbiddenException(t('server-ai:Error.BosiCapabilityConfigurationRequired'))
        return { ...target, connected: connection.status === 'active' }
    }
}
