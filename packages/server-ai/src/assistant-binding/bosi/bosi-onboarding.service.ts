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
import { AgentPluginService } from '../../agent-plugin/agent-plugin.service'
import { ConnectorService } from '../../connector/connector.service'

@Injectable()
export class BosiOnboardingService {
    constructor(
        private readonly database: DataSource,
        private readonly workspaces: XpertWorkspaceService,
        private readonly plugins: AgentPluginService,
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
        this.mutable(binding)
        const workspace = await this.workspace(binding)
        const scope = { tenantId: binding.tenantId, organizationId: binding.organizationId }
        const connectorScope = { type: 'workspace' as const, workspaceId: workspace.id }
        const [library, packages, resources, definitions, connections] = await Promise.all([
            this.plugins.workspaceCatalog(workspace.id),
            this.plugins.packages.find({ where: scope }),
            this.plugins.bindings.find({ where: scope }),
            this.connectors.definitionsForScope(connectorScope),
            this.connectors.listBindings(connectorScope)
        ])
        const preferences = binding.desktopOnboarding
        const items: BosiOnboardingItem[] = []
        const relatedProviders = new Set<string>()
        for (const item of library.items) {
            const pkg = packages.find((entry) => entry.id === item.id)
            if (!pkg) continue
            const resource = resources.find(
                (entry) =>
                    entry.enabled &&
                    !entry.supersededById &&
                    entry.workspaceIds.includes(workspace.id) &&
                    entry.definition.kind === 'agent_plugin' &&
                    entry.definition.packageId === item.id
            )
            const requirements = Object.values(pkg.descriptor.extension?.connectors ?? {})
            for (const requirement of requirements)
                if (requirement.type === 'existing') relatedProviders.add(requirement.provider)
            const references = Object.values(resource?.installations[workspace.id]?.connectors ?? {})
            for (const reference of references) relatedProviders.add(reference.provider)
            const missingProvider = requirements.some(
                (requirement) =>
                    requirement.type === 'existing' &&
                    !definitions.some(
                        (definition) =>
                            definition.provider === requirement.provider &&
                            getConnectorAuthorizationModes(definition).includes('shared')
                    )
            )
            const configurationRequired =
                missingProvider ||
                (!resource && item.expertReferences.length > 0) ||
                pkg.descriptor.diagnostics.length > 0 ||
                (resource?.definition.kind === 'agent_plugin' && !!resource.definition.oauthServers?.length)
            const needsAuth = references.some(
                (ref) =>
                    !connections.some(
                        (connection) =>
                            connection.id === ref.bindingId &&
                            connection.authorizationMode === 'shared' &&
                            connection.status === 'active'
                    )
            )
            const status =
                item.status === 'disabled'
                    ? 'unavailable'
                    : configurationRequired
                      ? 'configuration_required'
                      : resource
                        ? needsAuth
                            ? 'requires_auth'
                            : 'ready'
                        : 'available'
            items.push({
                id: item.id,
                kind: 'plugin',
                name: item.name,
                description: resolveI18nText(item.description, RequestContext.getLanguageCode()),
                ...(item.icon ? { icon: { type: 'image', value: item.icon } as const } : {}),
                status,
                selected: preferences.packages.some((entry) => entry.packageId === item.id),
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
        return { workspace: { id: workspace.id, name: workspace.name }, revision: preferences.revision, items }
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
        const catalog = await this.catalog(binding)
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
                const pkg = await this.plugins.packages.findOneByOrFail({
                    id: choice.id,
                    tenantId: binding.tenantId,
                    organizationId: binding.organizationId
                })
                for (const requirement of Object.values(pkg.descriptor.extension?.connectors ?? {}))
                    if (requirement.type === 'existing') await this.ensureConnector(binding, requirement.provider)
                const result = await this.plugins.addToWorkspace(catalog.workspace.id, {
                    packageId: choice.id,
                    experts: {}
                })
                const resource = await this.plugins.bindings.findOneByOrFail({
                    id: result.bindingId,
                    tenantId: binding.tenantId,
                    organizationId: binding.organizationId
                })
                preferences.packages.push({
                    packageId: choice.id,
                    resource: { bindingId: resource.id, version: resource.version }
                })
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
