// Readiness is recomputed before writes. Loaded packages never imply that all their resources are selected.
import {
    TemplateDependencyLock,
    TemplateRuntimeDependencyReport,
    templateDependencyVersionsSchema,
    TXpertTemplate,
    XpertToolsetCategoryEnum
} from '@xpert-ai/contracts'
import { LOADED_PLUGINS, LoadedPluginRecord, normalizePluginName } from '@xpert-ai/server-core'
import { AgentMiddlewareRegistry, SandboxProviderRegistry, ToolsetRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import { BadRequestException, HttpException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { z } from 'zod'
import { t } from 'i18next'
import { PluginResourceInstallerService, RuntimeComponent } from '../plugin-resource-installer.service'
import { resolveScopedLoadedPlugin } from '../plugin-resource-components'
import { resolveTemplateRuntimeDependencyComponents } from '../commands/template-runtime-dependencies'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { XpertToolset } from '../../xpert-toolset/xpert-toolset.entity'
import { XpertService } from '../../xpert/xpert.service'
import { inspectTemplateManifest, requirementCheck } from './template-manifest-check'
import {
    AssertAssistantTemplateDependenciesCommand,
    InspectTemplateReadinessCommand
} from './template-readiness.command'
import { ResolveAssistantFileAccessCommand } from '../../xpert/assistant-files/resolve-assistant-file-access.command'
import { AssertProjectAssistantAccessCommand } from '../../xpert-project/commands/assert-project-assistant-access.command'
import { installationHash, InstallationSourceChangedError } from './template-installation-source'
import {
    ResolveAgentPluginTemplateDependencyCommand,
    AssertAgentPluginTemplateDependencyCommand
} from '../../agent-plugin/templates/agent-plugin-template.command'

@Injectable()
export class TemplateReadinessService {
    constructor(
        private readonly installer: PluginResourceInstallerService,
        private readonly workspaces: XpertWorkspaceAccessService,
        private readonly xperts: XpertService,
        @InjectRepository(XpertToolset) private readonly toolsets: Repository<XpertToolset>,
        @Inject(LOADED_PLUGINS) private readonly loaded: LoadedPluginRecord[],
        private readonly middleware: AgentMiddlewareRegistry,
        private readonly sandbox: SandboxProviderRegistry,
        private readonly toolsetRegistry: ToolsetRegistry,
        private readonly commands: CommandBus
    ) {}

    async inspect(template: TXpertTemplate, workspaceId?: string) {
        if (workspaceId) await this.workspaces.assertCanAuthor(workspaceId)
        return this.inspectRequirements(template, workspaceId)
    }

    /** Runtime access is checked separately from authoring; run-only users can delegate templates. */
    async prepareRuntime(
        template: TXpertTemplate,
        assistantId: string,
        workspaceId: string,
        expected?: TemplateDependencyLock[],
        projectId?: string,
        sandboxProvider?: string
    ) {
        await this.commands.execute(
            projectId
                ? new AssertProjectAssistantAccessCommand(projectId, assistantId)
                : new ResolveAssistantFileAccessCommand(assistantId, 'capabilities', 'runtime')
        )
        const result = await this.inspectRequirements(template, workspaceId, { sandboxProvider })
        if (expected && installationHash(expected) !== installationHash(result.readiness.dependencies))
            throw new InstallationSourceChangedError()
        if (!result.readiness.canInstall) {
            const check = result.readiness.checks.find(
                (check) => check.required && !['ready', 'pending-configuration'].includes(check.status)
            )
            throw new BadRequestException(
                t('server-ai:Error.TemplateSubagentDependencyUnavailable', {
                    dependency: check?.key,
                    status: check?.status
                })
            )
        }
        return result
    }

    private async inspectRequirements(
        template: TXpertTemplate,
        workspaceId?: string,
        runtime?: { sandboxProvider?: string }
    ) {
        const result = inspectTemplateManifest(template)
        const { readiness, manifest, normalized } = result
        const components: RuntimeComponent[] = []
        const dependencies = normalized?.dependencies ?? template.dependencies
        const parsedVersions = templateDependencyVersionsSchema.safeParse(dependencies?.versions ?? [])
        if (!parsedVersions.success) {
            readiness.checks.push(requirementCheck('manifest', 'dependency-versions', 'incompatible'))
            readiness.canInstall = false
            return { ...result, components }
        }
        const names = new Set(
            [
                ...(readiness.legacy && template.pluginName ? [template.pluginName] : []),
                ...(dependencies?.plugins ?? []),
                ...parsedVersions.data.map((item) => item.pluginName),
                ...[
                    ...(dependencies?.skills ?? []),
                    ...(dependencies?.mcpServers ?? []),
                    ...(dependencies?.hooks ?? []),
                    ...(dependencies?.apps ?? []),
                    ...(dependencies?.toolsets ?? [])
                ]
                    .filter((item) => !('source' in item && item.source))
                    .map((item) => item.pluginName ?? template.pluginName ?? '')
            ]
                .map(normalizePluginName)
                .filter(Boolean)
        )
        const providerOwners: { pluginName: string; kind: 'middleware' | 'sandbox' | 'toolset'; key: string }[] = []
        if (!readiness.legacy && normalized) {
            const addProvider = (
                kind: 'middleware' | 'sandbox' | 'toolset',
                provider: string,
                source: () => { kind: string; pluginName?: string; pluginVersion?: string }
            ) => {
                try {
                    const owner = source()
                    if (owner.kind === 'plugin' && owner.pluginName) {
                        const pluginName = normalizePluginName(owner.pluginName)
                        if (owner.pluginVersion && owner.pluginVersion !== this.pluginVersion(pluginName))
                            throw new Error('Stale provider registration')
                        names.add(pluginName)
                        providerOwners.push({ pluginName, kind, key: provider })
                    }
                    readiness.checks.push(requirementCheck('execution', `${kind}:${provider}`, 'ready'))
                } catch {
                    readiness.checks.push(requirementCheck('execution', `${kind}:${provider}`, 'missing'))
                }
            }
            for (const provider of new Set(
                readiness.capabilities.agents.flatMap((agent) => agent.middleware.map((item) => item.provider))
            ))
                addProvider('middleware', provider, () => this.middleware.getSource(this.middleware.get(provider)))
            for (const selector of dependencies?.toolsets ?? [])
                addProvider('toolset', selector.provider, () =>
                    this.toolsetRegistry.getSource(this.toolsetRegistry.get(selector.provider))
                )
            const sandbox = normalized.definition.team.features?.sandbox
            if (sandbox?.enabled) {
                const providers = await this.xperts.getSandboxProviders()
                const provider =
                    sandbox.provider ||
                    (runtime
                        ? runtime.sandboxProvider
                        : providers.find((item) => item.type !== 'local-shell-sandbox')?.type)
                if (
                    !provider ||
                    provider === 'local-shell-sandbox' ||
                    (runtime && !providers.some((item) => item.type === provider))
                )
                    readiness.checks.push(requirementCheck('execution', 'server-sandbox', 'missing'))
                else {
                    // Pin the same effective provider that readiness validates and the child graph will execute.
                    if (runtime) sandbox.provider = provider
                    addProvider('sandbox', provider, () => this.sandbox.getSource(this.sandbox.get(provider)))
                }
            }
        }
        for (const pluginName of [...names].sort()) {
            let version: string | undefined
            try {
                version = this.pluginVersion(pluginName)
                if (!version) throw new Error('Missing version')
                const incompatible = parsedVersions.data.some(
                    (item) => normalizePluginName(item.pluginName) === pluginName && item.version !== version
                )
                readiness.checks.push({
                    ...requirementCheck('plugin', pluginName, incompatible ? 'incompatible' : 'ready'),
                    pluginName,
                    version
                })
                const providers = providerOwners
                    .filter((item) => item.pluginName === pluginName)
                    .map(({ kind, key }) => ({ kind, key }))
                const requiredVersion = parsedVersions.data.find(
                    (item) => normalizePluginName(item.pluginName) === pluginName
                )?.version
                readiness.dependencies.push({
                    pluginName,
                    version,
                    ...(requiredVersion ? { requiredVersion } : {}),
                    components: [],
                    ...(providers.length ? { providers } : {})
                })
            } catch {
                readiness.checks.push({
                    ...requirementCheck('plugin', pluginName || 'plugin-owner', 'missing'),
                    pluginName
                })
            }
        }
        // Resolve every selector separately: a partial match must never silently drop a missing resource.
        for (const kind of ['skills', 'mcpServers', 'hooks', 'apps'] as const) {
            for (const selector of dependencies?.[kind] ?? []) {
                if ('source' in selector && selector.source?.kind === 'agent-plugin') {
                    try {
                        const resolved = await this.commands.execute(
                            new ResolveAgentPluginTemplateDependencyCommand(
                                kind === 'skills' ? 'skill' : 'mcp_server',
                                selector,
                                workspaceId
                            )
                        )
                        components.push(resolved.component)
                        const existing = readiness.dependencies.find(
                            (lock) => lock.pluginName === resolved.lock.pluginName && lock.source
                        )
                        if (existing) {
                            for (const component of resolved.lock.components)
                                if (
                                    !existing.components.some(
                                        (item) => item.type === component.type && item.key === component.key
                                    )
                                )
                                    existing.components.push(component)
                        } else readiness.dependencies.push(resolved.lock)
                        readiness.checks.push(requirementCheck('resource', `${kind}:${selector.componentKey}`, 'ready'))
                    } catch {
                        readiness.checks.push(
                            requirementCheck('resource', `${kind}:${selector.componentKey}`, 'missing')
                        )
                    }
                    continue
                }
                const pluginName = normalizePluginName(selector.pluginName ?? template.pluginName ?? '')
                try {
                    const resolved = await resolveTemplateRuntimeDependencyComponents(
                        this.installer,
                        template.pluginName,
                        { [kind]: [selector] }
                    )
                    if (resolved.length !== 1 || !resolved[0].component.definitionHash)
                        throw new Error('Missing component')
                    components.push(...resolved)
                    const component = resolved[0]
                    if (component.pluginVersion !== this.pluginVersion(pluginName))
                        throw new Error('Component version mismatch')
                    const lock = readiness.dependencies.find((entry) => entry.pluginName === pluginName)
                    if (
                        lock &&
                        !lock.components.some(
                            (entry) =>
                                entry.type === component.component.componentType && entry.key === selector.componentKey
                        )
                    )
                        lock.components.push({
                            type: component.component.componentType,
                            key: selector.componentKey,
                            hash: component.component.definitionHash
                        })
                    readiness.checks.push({
                        ...requirementCheck(
                            'resource',
                            `${kind}:${selector.componentKey}`,
                            'auth' in selector && selector.auth === 'on_install' ? 'pending-configuration' : 'ready'
                        ),
                        pluginName
                    })
                } catch {
                    readiness.checks.push({
                        ...requirementCheck('resource', `${kind}:${selector.componentKey}`, 'missing'),
                        pluginName
                    })
                }
            }
        }
        for (const selector of dependencies?.toolsets ?? []) {
            const available = workspaceId
                ? await this.toolsets.find({
                      where: {
                          workspaceId,
                          tenantId: RequestContext.currentTenantId(),
                          organizationId: RequestContext.getOrganizationId(),
                          category: XpertToolsetCategoryEnum.BUILTIN,
                          type: selector.provider,
                          ...(selector.instanceName ? { name: selector.instanceName } : {})
                      },
                      select: ['id']
                  })
                : []
            readiness.checks.push(
                requirementCheck(
                    'resource',
                    `toolset:${selector.provider}`,
                    workspaceId ? (available.length === 1 ? 'ready' : 'missing') : 'pending-configuration'
                )
            )
        }
        if (
            readiness.legacy &&
            template.manifest?.schemaVersion === 1 &&
            template.manifest.execution?.sandbox === 'server'
        ) {
            const providers = await this.xperts.getSandboxProviders()
            readiness.checks.push(
                requirementCheck(
                    'execution',
                    'server-sandbox',
                    providers.some((provider) => provider.type !== 'local-shell-sandbox') ? 'ready' : 'missing'
                )
            )
        }
        readiness.dependencies.forEach((lock) =>
            lock.components.sort((a, b) => `${a.type}:${a.key}`.localeCompare(`${b.type}:${b.key}`))
        )
        readiness.canInstall = !readiness.checks.some(
            (check) => check.required && !['ready', 'pending-configuration'].includes(check.status)
        )
        return { manifest, readiness, components, normalized }
    }

    async prepare(template: TXpertTemplate, workspaceId: string, expected?: TemplateDependencyLock[] | null) {
        const result = await this.inspect(template, workspaceId)
        if (expected && installationHash(expected) !== installationHash(result.readiness.dependencies))
            throw new InstallationSourceChangedError()
        if (!result.readiness.canInstall) throw new BadRequestException(t('server-ai:Error.TemplateRequirementsUnmet'))
        return result
    }

    private pluginVersion(pluginName: string) {
        const plugin = resolveScopedLoadedPlugin(pluginName, this.loaded)
        return z.object({ meta: z.object({ version: z.string().min(1) }) }).parse(plugin.instance).meta.version
    }

    /** Installation uses exact snapshots to detect changes between preparation and resource writes. */
    async assertDependencies(locks: TemplateDependencyLock[]) {
        for (const lock of locks) {
            try {
                if (lock.source?.kind === 'agent-plugin') {
                    await this.commands.execute(new AssertAgentPluginTemplateDependencyCommand(lock))
                    continue
                }
                const version = this.pluginVersion(lock.pluginName)
                if (version !== lock.version) throw new Error('Version changed')
                for (const provider of lock.providers ?? []) {
                    const source =
                        provider.kind === 'middleware'
                            ? this.middleware.getSource(this.middleware.get(provider.key))
                            : provider.kind === 'sandbox'
                              ? this.sandbox.getSource(this.sandbox.get(provider.key))
                              : this.toolsetRegistry.getSource(this.toolsetRegistry.get(provider.key))
                    if (
                        source.kind !== 'plugin' ||
                        normalizePluginName(source.pluginName) !== lock.pluginName ||
                        (source.pluginVersion && source.pluginVersion !== lock.version)
                    )
                        throw new Error('Provider owner changed')
                }
                for (const component of lock.components) {
                    const current = await this.installer.resolveRuntimeComponents(lock.pluginName, [
                        { componentType: component.type, componentKey: component.key }
                    ])
                    if (current.length !== 1 || current[0].component.definitionHash !== component.hash)
                        throw new Error('Component changed')
                }
            } catch {
                throw new BadRequestException(t('server-ai:Error.TemplateDependencyChanged'))
            }
        }
    }

    /**
     * Published Assistants keep their graph and installed resources across compatible plugin updates.
     * A package version or definition hash is provenance, not proof of a breaking change.
     * Immutable agent-plugin references still verify their pinned artifact, not the latest package.
     */
    async inspectRuntimeDependencies(locks: TemplateDependencyLock[]): Promise<TemplateRuntimeDependencyReport> {
        const updates: TemplateRuntimeDependencyReport['updates'] = []
        for (const lock of locks) {
            if (lock.source?.kind === 'agent-plugin') {
                await this.commands.execute(new AssertAgentPluginTemplateDependencyCommand(lock))
                continue
            }
            let version: string
            try {
                version = this.pluginVersion(lock.pluginName)
            } catch {
                this.runtimeUnavailable(lock.pluginName, 'plugin-unavailable')
            }
            if (lock.requiredVersion && version !== lock.requiredVersion) {
                this.runtimeUnavailable(lock.pluginName, 'version-required', lock.requiredVersion, version)
            }
            for (const provider of lock.providers ?? []) {
                const dependency = `${lock.pluginName}/${provider.kind}:${provider.key}`
                try {
                    const source =
                        provider.kind === 'middleware'
                            ? this.middleware.getSource(this.middleware.get(provider.key))
                            : provider.kind === 'sandbox'
                              ? this.sandbox.getSource(this.sandbox.get(provider.key))
                              : this.toolsetRegistry.getSource(this.toolsetRegistry.get(provider.key))
                    if (source.kind !== 'plugin' || normalizePluginName(source.pluginName) !== lock.pluginName)
                        this.runtimeUnavailable(dependency, 'provider-owner-changed')
                    // A registration from a different *loaded* version is a partially activated runtime,
                    // not an old Assistant binding. Do not execute mismatched code during a rollout.
                    if (source.pluginVersion && source.pluginVersion !== version)
                        this.runtimeUnavailable(dependency, 'provider-not-ready', version, source.pluginVersion)
                } catch (error) {
                    if (error instanceof HttpException && error.getStatus() !== 404) throw error
                    this.runtimeUnavailable(dependency, 'provider-unavailable')
                }
            }
            const changedComponents: TemplateRuntimeDependencyReport['updates'][number]['changedComponents'] = []
            for (const component of lock.components) {
                const dependency = `${lock.pluginName}/${component.type}:${component.key}`
                let current: RuntimeComponent[]
                try {
                    current = await this.installer.resolveRuntimeComponents(lock.pluginName, [
                        { componentType: component.type, componentKey: component.key }
                    ])
                } catch (error) {
                    // Preserve actual access denials and storage failures instead of calling them version drift.
                    if (error instanceof NotFoundException) this.runtimeUnavailable(dependency, 'resource-unavailable')
                    throw error
                }
                if (current.length !== 1) this.runtimeUnavailable(dependency, 'resource-unavailable')
                if (current[0].pluginVersion !== version)
                    this.runtimeUnavailable(dependency, 'resource-not-ready', version, current[0].pluginVersion)
                if (current[0].component.definitionHash !== component.hash)
                    changedComponents.push({ type: component.type, key: component.key })
            }
            if (version !== lock.version || changedComponents.length) {
                updates.push({
                    pluginName: lock.pluginName,
                    installedVersion: lock.version,
                    currentVersion: version,
                    changedComponents
                })
            }
        }
        return { updates }
    }

    private runtimeUnavailable(
        dependency: string,
        reason:
            | 'plugin-unavailable'
            | 'version-required'
            | 'provider-owner-changed'
            | 'provider-not-ready'
            | 'provider-unavailable'
            | 'resource-unavailable'
            | 'resource-not-ready',
        expectedVersion?: string,
        actualVersion?: string
    ): never {
        throw new BadRequestException({
            code: 'ASSISTANT_DEPENDENCY_UNAVAILABLE',
            dependency,
            reason,
            ...(expectedVersion ? { expectedVersion } : {}),
            ...(actualVersion ? { actualVersion } : {}),
            message: t(`server-ai:Error.AssistantDependency.${reason}`, {
                interpolation: { escapeValue: false },
                dependency,
                expectedVersion,
                actualVersion
            })
        })
    }
}

@CommandHandler(InspectTemplateReadinessCommand)
export class InspectTemplateReadinessHandler implements ICommandHandler<InspectTemplateReadinessCommand> {
    constructor(private readonly readiness: TemplateReadinessService) {}
    async execute(command: InspectTemplateReadinessCommand) {
        return (await this.readiness.inspect(command.template, command.workspaceId)).readiness
    }
}

@CommandHandler(AssertAssistantTemplateDependenciesCommand)
export class AssertAssistantTemplateDependenciesHandler implements ICommandHandler<AssertAssistantTemplateDependenciesCommand> {
    constructor(
        private readonly commands: CommandBus,
        private readonly readiness: TemplateReadinessService
    ) {}
    async execute(command: AssertAssistantTemplateDependenciesCommand) {
        const access = await this.commands.execute(
            new ResolveAssistantFileAccessCommand(command.assistantId, 'capabilities', command.entry)
        )
        return this.readiness.inspectRuntimeDependencies(access.dependencyLocks ?? [])
    }
}
