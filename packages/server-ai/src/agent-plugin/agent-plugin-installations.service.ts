// References stay pinned across upgrades. Catalog reads never provision workspace resources;
// execution prepares only the selected, scope-authorized package and never creates Connector grants.
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
    PLUGIN_COMPONENT_TYPE,
    type InstalledAgentPlugin,
    type IXpert,
    type RuntimeResourceReference
} from '@xpert-ai/contracts'
import { t } from 'i18next'
import { AgentPluginPackage, AgentResourceBinding } from './agent-plugin.entity'
import { AgentPluginConnectorService } from './agent-plugin-connector.service'
import {
    PluginResourceInstallerService,
    type RuntimeComponent
} from '../plugin-resource/plugin-resource-installer.service'
import { SkillPackage } from '../skill-package/skill-package.entity'
import { XpertToolset } from '../xpert-toolset/xpert-toolset.entity'
import { agentPluginScope, agentPluginScopeWhere, visibleAgentPluginScopes } from './agent-plugin-scope'
import { importedPluginBinding, installedPluginBindings } from './installed-plugin-catalog'
import { connectorMcpAuth, portableMcpSchema } from './agent-plugin-mcp'

@Injectable()
export class AgentPluginInstallationsService {
    constructor(
        @InjectRepository(AgentPluginPackage) private readonly packages: Repository<AgentPluginPackage>,
        @InjectRepository(AgentResourceBinding) private readonly bindings: Repository<AgentResourceBinding>,
        private readonly installer: PluginResourceInstallerService,
        private readonly connectors: AgentPluginConnectorService
    ) {}

    private async visible() {
        const scope = agentPluginScope()
        const where = visibleAgentPluginScopes(scope)
        const [packages, bindings] = await Promise.all([
            this.packages.find({ where, order: { createdAt: 'DESC', id: 'ASC' } }),
            this.bindings.find({ where, order: { createdAt: 'DESC', id: 'ASC' } })
        ])
        return { scope, packages, bindings }
    }

    async runtimeCatalog(workspaceId: string) {
        const { scope, packages, bindings } = await this.visible()
        return installedPluginBindings(packages, bindings, scope, workspaceId).map((binding) => {
            const definition = binding.definition
            return {
                binding,
                pkg: packages.find((pkg) => definition.kind === 'agent_plugin' && pkg.id === definition.packageId)!
            }
        })
    }

    /** Backfill only an already scope-authorized, digest-verified immutable package. */
    async saveTemplateCatalog(
        pkg: AgentPluginPackage,
        templateCatalog: NonNullable<AgentPluginPackage['descriptor']['templateCatalog']>
    ) {
        await this.packages
            .createQueryBuilder()
            .update()
            .set({ descriptor: () => ':descriptor' })
            .setParameter('descriptor', JSON.stringify({ ...pkg.descriptor, templateCatalog }))
            .where({
                id: pkg.id,
                digest: pkg.digest,
                ...agentPluginScopeWhere({ tenantId: pkg.tenantId, organizationId: pkg.organizationId ?? null })
            })
            .execute()
    }

    /** Resolve only visible, enabled packages; an explicit digest never follows a newer import. */
    async templatePackage(name: string, digest?: string, workspaceId?: string) {
        const { scope, packages, bindings } = await this.visible()
        const current = installedPluginBindings(packages, bindings, scope, workspaceId).find((binding) => {
            const definition = binding.definition
            return (
                definition.kind === 'agent_plugin' &&
                packages.some((pkg) => pkg.id === definition.packageId && pkg.descriptor.name === name)
            )
        })
        if (!current?.enabled || current.definition.kind !== 'agent_plugin') return null
        const packageId = current.definition.packageId
        const active = packages.find((pkg) => pkg.id === packageId)!
        if (!digest || digest === active.digest) return { pkg: active, binding: current }
        const pinned = packages.find(
            (pkg) =>
                pkg.descriptor.name === name &&
                pkg.digest === digest &&
                (pkg.organizationId ?? null) === (active.organizationId ?? null)
        )
        const binding = pinned && importedPluginBinding(pinned)
        return binding ? this.reference({ bindingId: binding.id, version: binding.version }, workspaceId) : null
    }

    async catalog(language?: string): Promise<{ items: InstalledAgentPlugin[] }> {
        const { scope, packages, bindings } = await this.visible()
        return {
            items: installedPluginBindings(packages, bindings, scope, undefined, language).map((binding) => {
                const definition = binding.definition
                const pkg = packages.find(
                    (item) => definition.kind === 'agent_plugin' && item.id === definition.packageId
                )!
                const descriptor = pkg.descriptor
                return {
                    id: pkg.id,
                    name: binding.title,
                    description: binding.description,
                    icon: descriptor.extension?.interface?.icon,
                    version: descriptor.version || pkg.digest.slice(0, 8),
                    scope: pkg.organizationId ? 'organization' : 'tenant',
                    status: !binding.enabled
                        ? 'disabled'
                        : this.missingExperts(pkg, binding)
                          ? 'configuration_required'
                          : 'available',
                    components: [
                        ...(descriptor.templates ?? []).map(({ key }) => ({
                            kind: 'assistant_template' as const,
                            name: key
                        })),
                        ...descriptor.skills.map(({ key }) => ({ kind: 'skill' as const, name: key })),
                        ...descriptor.servers.map(({ key }) => ({ kind: 'mcp' as const, name: key })),
                        ...(descriptor.extension?.middlewares ?? []).map(({ key }) => ({
                            kind: 'middleware' as const,
                            name: key
                        })),
                        ...(descriptor.extension?.experts ?? []).map(({ reference }) => ({
                            kind: 'external_xpert' as const,
                            name: reference
                        }))
                    ],
                    expertReferences: (descriptor.extension?.experts ?? []).map(({ reference }) => reference)
                }
            })
        }
    }

    missingExperts(pkg: AgentPluginPackage, binding: Pick<AgentResourceBinding, 'definition' | 'expertVersions'>) {
        const definition = binding.definition
        return (
            definition.kind === 'agent_plugin' &&
            (pkg.descriptor.extension?.experts ?? []).some(
                ({ reference }) =>
                    !definition.experts[reference] || !binding.expertVersions?.[definition.experts[reference]]
            )
        )
    }

    async reference(reference: RuntimeResourceReference, workspaceId?: string) {
        const { scope, packages, bindings } = await this.visible()
        const binding =
            bindings.find((item) => item.id === reference.bindingId && item.version === reference.version) ??
            packages
                .map((pkg) => importedPluginBinding(pkg))
                .find((item) => item.id === reference.bindingId && item.version === reference.version)
        if (!binding || !binding.enabled || binding.definition.kind !== 'agent_plugin') return null
        const packageId = binding.definition.packageId
        const pkg = packages.find((item) => item.id === packageId)
        if (!pkg) return null
        // A scope-level disable revokes old selections as well; an upgrade alone never rewrites them.
        const current = installedPluginBindings(packages, bindings, scope, workspaceId).find((item) => {
            const definition = item.definition
            return (
                definition.kind === 'agent_plugin' &&
                packages.some(
                    (candidate) =>
                        candidate.id === definition.packageId && candidate.descriptor.name === pkg.descriptor.name
                )
            )
        })
        if (!current?.enabled) return null
        return { binding, pkg }
    }

    async package(binding: Pick<AgentResourceBinding, 'id' | 'version'>, workspaceId?: string) {
        const result = await this.reference({ bindingId: binding.id, version: binding.version }, workspaceId)
        if (!result) throw new ForbiddenException(t('server-ai:Error.AgentResourceUnavailable'))
        return result.pkg
    }

    async connectorReferences(
        pkg: AgentPluginPackage,
        binding: Pick<AgentResourceBinding, 'definition' | 'installations'>,
        assistant: Pick<IXpert, 'id' | 'workspaceId'>
    ) {
        if (binding.definition.kind !== 'agent_plugin') return {}
        return this.connectors.runtimeBindings(
            pkg,
            assistant.id,
            binding.definition.connectorServers ?? pkg.descriptor.extension?.connectors ?? {},
            binding.installations[assistant.workspaceId]?.connectors
        )
    }

    /** Persist ownership for template-selected MCP resources so the same runtime credential
     * authority validates them. This never grants an account or installs unselected components. */
    async registerTemplateMcp(
        reference: RuntimeResourceReference,
        workspaceId: string,
        toolsets: string[],
        connectors: NonNullable<AgentResourceBinding['installations'][string]['connectors']>
    ) {
        await this.bindings.manager.transaction(async (manager) => {
            await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`agent-plugin:${reference.bindingId}`])
            const resolved = await this.reference(reference, workspaceId)
            if (!resolved) throw new ForbiddenException(t('server-ai:Error.AgentResourceUnavailable'))
            const binding = resolved.binding
            const previous = binding.installations[workspaceId] ?? { skills: [], toolsets: [] }
            binding.installations = {
                ...binding.installations,
                [workspaceId]: {
                    ...previous,
                    toolsets: [...new Set([...previous.toolsets, ...toolsets])],
                    connectors: { ...previous.connectors, ...connectors }
                }
            }
            await manager.save(AgentResourceBinding, this.bindings.create(binding))
        })
    }

    /** Caller has authorized the published Assistant; no authoring permission is implied or granted. */
    async prepare(reference: RuntimeResourceReference, assistant: IXpert) {
        const scope = agentPluginScope()
        if (
            !scope.organizationId ||
            (assistant.organizationId && assistant.organizationId !== scope.organizationId) ||
            (assistant.tenantId && assistant.tenantId !== scope.tenantId) ||
            !assistant.workspaceId
        )
            throw new ForbiddenException(t('server-ai:Error.AgentResourceScopeMismatch'))
        return this.bindings.manager.transaction(async (manager) => {
            // Serialize all workspace projections of this reference to preserve the JSON installation map.
            await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`agent-plugin:${reference.bindingId}`])
            const resolved = await this.reference(reference, assistant.workspaceId)
            if (!resolved) throw new ForbiddenException(t('server-ai:Error.AgentResourceUnavailable'))
            const { binding, pkg } = resolved
            const definition = binding.definition
            if (definition.kind !== 'agent_plugin')
                throw new ForbiddenException(t('server-ai:Error.AgentResourceUnavailable'))
            if (this.missingExperts(pkg, binding))
                throw new BadRequestException(t('server-ai:Error.AgentResourceConfigurationRequired'))
            if (definition.oauthServers?.length)
                throw new BadRequestException(t('server-ai:Error.ConnectorWorkspaceConnectionRequired'))
            const requirements = definition.connectorServers ?? pkg.descriptor.extension?.connectors ?? {}
            const connectors = await this.connectorReferences(pkg, binding, assistant)
            if (Object.keys(requirements).some((key) => !connectors[key]))
                throw new BadRequestException(t('server-ai:Error.AgentPluginConnectorConfiguration'))
            const existing = binding.installations[assistant.workspaceId]
            if (
                existing &&
                Object.keys(requirements).every(
                    (key) => existing.connectors?.[key]?.bindingId === connectors[key]?.bindingId
                )
            )
                return { binding, pkg, installation: existing }
            const installation: AgentResourceBinding['installations'][string] = { skills: [], toolsets: [], connectors }
            for (const component of pluginRuntimeComponents(pkg, binding.version)) {
                const installed = await this.installer.installRuntimeComponent(component, assistant.workspaceId, null)
                if (!installed.runtimeId) throw new BadRequestException(t('server-ai:Error.AgentResourceInstallFailed'))
                if (component.component.componentType === PLUGIN_COMPONENT_TYPE.SKILL) {
                    await this.packages.manager
                        .getRepository(SkillPackage)
                        .update({ ...scope, id: installed.runtimeId }, { runtimeResourceOnly: true })
                    installation.skills.push(installed.runtimeId)
                } else {
                    const server = pkg.descriptor.servers.find((item) => item.key === component.component.componentKey)!
                    const repository = this.packages.manager.getRepository(XpertToolset)
                    const toolset = await repository.findOneByOrFail({ ...scope, id: installed.runtimeId })
                    toolset.schema = JSON.stringify(
                        portableMcpSchema(
                            server,
                            false,
                            connectorMcpAuth(connectors[server.key], requirements[server.key])
                        )
                    )
                    toolset.options = { ...toolset.options, needSandbox: false, pluginManaged: false }
                    await repository.save(toolset)
                    installation.toolsets.push(installed.runtimeId)
                }
            }
            const stored = await manager.findOneBy(AgentResourceBinding, {
                ...agentPluginScopeWhere({ tenantId: pkg.tenantId, organizationId: pkg.organizationId ?? null }),
                id: binding.id
            })
            binding.installations = { ...binding.installations, [assistant.workspaceId]: installation }
            if (stored)
                await manager.update(AgentResourceBinding, { id: binding.id }, { installations: binding.installations })
            else await manager.save(AgentResourceBinding, this.bindings.create(binding))
            return { binding, pkg, installation }
        })
    }
}

export function pluginRuntimeComponents(pkg: AgentPluginPackage, version: string): RuntimeComponent[] {
    return [
        ...pkg.descriptor.skills.map((skill) => ({
            componentType: PLUGIN_COMPONENT_TYPE.SKILL,
            componentKey: skill.key,
            sourcePath: skill.path,
            config: { path: skill.path },
            metadata: { name: skill.key },
            definitionHash: pkg.digest
        })),
        ...pkg.descriptor.servers.map((server) => ({
            componentType: PLUGIN_COMPONENT_TYPE.MCP_SERVER,
            componentKey: server.key,
            sourcePath: 'mcp.json',
            config: { ...server.config, type: 'http' },
            metadata: { serverName: server.key },
            definitionHash: pkg.digest
        }))
    ].map((component) => ({
        pluginName: `agent-plugin-${pkg.id}-${version.slice(0, 12)}`,
        pluginVersion: pkg.digest,
        rootDir: pkg.rootPath,
        component
    }))
}
