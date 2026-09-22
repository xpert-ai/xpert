import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException
} from '@nestjs/common'
import { ModuleRef } from '@nestjs/core'
import { InjectRepository } from '@nestjs/typeorm'
import { AgentMiddlewareRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import {
    PLUGIN_COMPONENT_TYPE,
    RolesEnum,
    isUserAddableAgentMiddleware,
    type RuntimeResourceBindingInput
} from '@xpert-ai/contracts'
import { Repository } from 'typeorm'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { t } from 'i18next'
import { AgentPluginPackage, AgentResourceBinding } from './agent-plugin.entity'
import { parseAgentPlugin } from './agent-plugin-parser'
import { extractPortableZip, portablePackageDigest, copyPortablePackage, stagePortableGit } from './agent-plugin-source'
import type { RuntimeComponent } from '../plugin-resource/plugin-resource-installer.service'
import Ajv from 'ajv'
import { connectorMcpAuth, portableMcpSchema } from './agent-plugin-mcp'
import { AgentPluginConnectorService } from './agent-plugin-connector.service'
import { publishedResourceVersion } from './published-resource-version'

export function resourceScope() {
    const tenantId = RequestContext.currentTenantId()
    const organizationId = RequestContext.getOrganizationId()
    if (!tenantId || !organizationId)
        throw new ForbiddenException(
            t('server-ai:Error.AgentResourceOrganizationRequired', {
                defaultValue: 'An organization context is required.'
            })
        )
    return { tenantId, organizationId }
}

export function requireResourceAdmin() {
    const user = RequestContext.currentUser()
    if (!user?.role || ![RolesEnum.SUPER_ADMIN, RolesEnum.ADMIN].includes(user.role.name as RolesEnum)) {
        throw new ForbiddenException(
            t('server-ai:Error.AgentResourceAdminRequired', {
                defaultValue: 'An administrator is required to manage Agent Plugins.'
            })
        )
    }
    return resourceScope()
}

@Injectable()
export class AgentPluginService {
    constructor(
        @InjectRepository(AgentPluginPackage) readonly packages: Repository<AgentPluginPackage>,
        @InjectRepository(AgentResourceBinding) readonly bindings: Repository<AgentResourceBinding>,
        private readonly modules: ModuleRef
    ) {}

    validateMiddleware(registry: AgentMiddlewareRegistry, provider: string, options: object, organizationId: string) {
        const strategy = registry.get(provider, organizationId)
        if (!isUserAddableAgentMiddleware(strategy.meta))
            throw new BadRequestException(t('server-ai:Error.AgentResourceSystemMiddleware'))
        if (strategy.meta.configSchema) {
            // Host providers use localized objects for annotation titles/descriptions.
            // Ajv still compiles and enforces validation keywords on the actual options.
            const validator = new Ajv({ strict: false, validateSchema: false }).compile(strategy.meta.configSchema)
            if (!validator(options)) throw new BadRequestException(validator.errors)
        }
    }

    async options() {
        const scope = requireResourceAdmin()
        const access = this.modules.get(
            (await import('../xpert-workspace/workspace-access.service')).XpertWorkspaceAccessService,
            { strict: false }
        )
        const accessible = await access.findAccessibleWorkspaces(undefined, { purpose: 'authoring' })
        const workspaces = await Promise.all(
            accessible
                .filter((workspace) => workspace.organizationId === scope.organizationId)
                .map(async (workspace) => ({
                    ...workspace,
                    capabilities: (await access.getAccess(workspace.id)).capabilities
                }))
        )
        const experts = await this.modules
            .get((await import('../xpert/published-xpert-access.service')).PublishedXpertAccessService, {
                strict: false
            })
            .findAccessiblePublishedXperts({ where: { latest: true } })
        const middlewares = this.modules
            .get(AgentMiddlewareRegistry, { strict: false })
            .list(scope.organizationId)
            .filter((strategy) => isUserAddableAgentMiddleware(strategy.meta))
            .map((strategy) => strategy.meta)
        return {
            workspaces: workspaces
                .filter(
                    (workspace) =>
                        workspace.organizationId === scope.organizationId && workspace.capabilities?.canManage
                )
                .map(({ id, name }) => ({ id, name })),
            experts: experts.map(({ id, name, title }) => ({ id, name: title || name })),
            middlewares
        }
    }

    async list() {
        const scope = requireResourceAdmin()
        const [packages, bindings] = await Promise.all([
            this.packages.find({ where: scope, order: { createdAt: 'DESC' } }),
            this.bindings.find({ where: scope, order: { createdAt: 'DESC' } })
        ])
        return { packages: packages.map(({ rootPath, ...item }) => item), bindings }
    }

    async importGit(input: { url: string; ref: string; subdirectory?: string }) {
        requireResourceAdmin()
        const staged = await stagePortableGit(input.url, input.ref, input.subdirectory).catch((error: unknown) => {
            throw new BadRequestException(
                t('server-ai:Error.AgentPluginImportFailed', {
                    reason: error instanceof Error ? error.message : String(error)
                })
            )
        })
        try {
            return await this.importDirectory(staged.root, { kind: 'git', ...input, commit: staged.commit })
        } finally {
            await rm(staged.temp, { recursive: true, force: true })
        }
    }

    async importZip(buffer: Buffer) {
        requireResourceAdmin()
        const directory = await mkdtemp(join(tmpdir(), 'agent-plugin-zip-'))
        try {
            await extractPortableZip(buffer, directory)
            let root = directory
            const entries = await readdir(directory)
            if (
                !entries.includes('plugin.json') &&
                entries.length === 1 &&
                (await stat(join(directory, entries[0]))).isDirectory()
            )
                root = join(directory, entries[0])
            return await this.importDirectory(root, { kind: 'zip' })
        } catch (error) {
            if (error instanceof BadRequestException) throw error
            throw new BadRequestException(
                t('server-ai:Error.AgentPluginImportFailed', {
                    reason: error instanceof Error ? error.message : String(error)
                })
            )
        } finally {
            await rm(directory, { recursive: true, force: true })
        }
    }

    private async importDirectory(root: string, source: AgentPluginPackage['source']) {
        const scope = requireResourceAdmin()
        try {
            const descriptor = await parseAgentPlugin(root)
            const digest = await portablePackageDigest(root)
            const existing = await this.packages.findOne({ where: { ...scope, digest } })
            if (existing) {
                const { rootPath, ...result } = existing
                return result
            }
            const rootPath = resolve(
                process.env.XPERT_AGENT_PLUGIN_PATH || 'storage/agent-plugins',
                scope.tenantId,
                scope.organizationId,
                randomUUID()
            )
            await mkdir(rootPath, { recursive: true })
            try {
                const skipped = await copyPortablePackage(root, rootPath)
                descriptor.diagnostics.push(
                    ...skipped.map((component) => ({
                        component,
                        code: 'unsafe_path',
                        message: 'Skipped a broken, cyclic or escaping package path'
                    }))
                )
                if ((await portablePackageDigest(rootPath)) !== digest) throw new Error('Plugin changed during import')
                const saved = await this.packages.save(
                    this.packages.create({ ...scope, rootPath, digest, descriptor, source })
                )
                const { rootPath: storedPath, ...result } = saved
                return result
            } catch (error) {
                await rm(rootPath, { recursive: true, force: true })
                throw error
            }
        } catch (error) {
            throw new BadRequestException(
                t('server-ai:Error.AgentPluginImportFailed', {
                    defaultValue: 'Agent Plugin import failed: {{reason}}',
                    reason: error instanceof Error ? error.message : String(error)
                })
            )
        }
    }

    async createBinding(input: RuntimeResourceBindingInput) {
        const scope = requireResourceAdmin()
        const access = this.modules.get(
            (await import('../xpert-workspace/workspace-access.service')).XpertWorkspaceAccessService,
            { strict: false }
        )
        for (const workspaceId of input.workspaceIds) {
            const { workspace } = await access.assertCan(workspaceId, 'manage')
            if (workspace.organizationId !== scope.organizationId)
                throw new ForbiddenException(t('server-ai:Error.AgentResourceScopeMismatch'))
        }
        if (input.replacesBindingId) {
            const previous = await this.bindings.findOneBy({ ...scope, id: input.replacesBindingId })
            if (!previous || previous.definition.kind !== input.definition.kind)
                throw new BadRequestException(t('server-ai:Error.AgentResourceNotFound'))
        }
        const expertVersions: AgentResourceBinding['expertVersions'] = {}
        const definition = input.definition
        const experts = this.modules.get(
            (await import('../xpert/published-xpert-access.service')).PublishedXpertAccessService,
            { strict: false }
        )
        const registry = this.modules.get(AgentMiddlewareRegistry, { strict: false })
        let pkg: AgentPluginPackage | null = null
        if (definition.kind === 'agent_plugin') {
            pkg = await this.packages.findOneBy({ ...scope, id: definition.packageId })
            if (!pkg) throw new NotFoundException(t('server-ai:Error.AgentPluginNotFound'))
            definition.connectorServers ??= pkg.descriptor.extension?.connectors
            if (definition.oauthServers?.length)
                throw new BadRequestException(t('server-ai:Error.ConnectorWorkspaceConnectionRequired'))
            if (definition.connectorServers)
                this.modules
                    .get(AgentPluginConnectorService, { strict: false })
                    .register(pkg, definition.connectorServers)
            for (const middleware of pkg.descriptor.extension?.middlewares ?? [])
                this.validateMiddleware(registry, middleware.provider, middleware.options ?? {}, scope.organizationId)
            for (const expert of pkg.descriptor.extension?.experts ?? []) {
                const target = definition.experts[expert.reference]
                if (!target)
                    throw new BadRequestException(
                        t('server-ai:Error.AgentResourceExpertMapping', { reference: expert.reference })
                    )
                expertVersions[target] = publishedResourceVersion(
                    (await experts.getAccessiblePublishedXpert(target)).publishAt
                )
            }
        } else if (definition.kind === 'middleware')
            this.validateMiddleware(registry, definition.provider, definition.options, scope.organizationId)
        else
            expertVersions[definition.xpertId] = publishedResourceVersion(
                (await experts.getAccessiblePublishedXpert(definition.xpertId)).publishAt
            )
        const version = createHash('sha256')
            .update(JSON.stringify({ ...input, expertVersions, digest: pkg?.digest }))
            .digest('hex')
        const installations: AgentResourceBinding['installations'] = {}
        if (pkg) {
            const installer = this.modules.get(
                (await import('../plugin-resource/plugin-resource-installer.service')).PluginResourceInstallerService,
                { strict: false }
            )
            for (const workspaceId of input.workspaceIds) {
                const resources: AgentResourceBinding['installations'][string] = { skills: [], toolsets: [] }
                if (definition.kind === 'agent_plugin' && definition.connectorServers)
                    resources.connectors = await this.modules
                        .get(AgentPluginConnectorService, { strict: false })
                        .install(pkg, workspaceId, definition.connectorServers)
                for (const component of this.components(pkg, version)) {
                    const installed = await installer.installRuntimeComponent(component, workspaceId, null)
                    if (!installed.runtimeId)
                        throw new BadRequestException(t('server-ai:Error.AgentResourceInstallFailed'))
                    if (component.component.componentType === PLUGIN_COMPONENT_TYPE.SKILL) {
                        await this.packages.manager
                            .getRepository((await import('../skill-package/skill-package.entity')).SkillPackage)
                            .update({ id: installed.runtimeId, ...scope }, { runtimeResourceOnly: true })
                        resources.skills.push(installed.runtimeId)
                    } else {
                        const server = pkg.descriptor.servers.find(
                            (item) => item.key === component.component.componentKey
                        )
                        const toolsetRepo = this.packages.manager.getRepository(
                            (await import('../xpert-toolset/xpert-toolset.entity')).XpertToolset
                        )
                        const toolset = await toolsetRepo.findOneByOrFail({ id: installed.runtimeId, ...scope })
                        const oauth =
                            definition.kind === 'agent_plugin' && definition.oauthServers?.includes(server.key)
                        toolset.schema = JSON.stringify(
                            portableMcpSchema(
                                server,
                                !!oauth,
                                definition.kind === 'agent_plugin'
                                    ? connectorMcpAuth(
                                          resources.connectors?.[server.key],
                                          definition.connectorServers?.[server.key]
                                      )
                                    : undefined
                            )
                        )
                        toolset.options = { ...toolset.options, needSandbox: false, pluginManaged: false }
                        await toolsetRepo.save(toolset)
                        resources.toolsets.push(installed.runtimeId)
                    }
                }
                installations[workspaceId] = resources
            }
        }
        return this.bindings.manager.transaction(async (manager) => {
            const { replacesBindingId, ...values } = input
            const previous = replacesBindingId
                ? await manager.findOne(AgentResourceBinding, {
                      where: { ...scope, id: replacesBindingId },
                      lock: { mode: 'pessimistic_write' }
                  })
                : null
            if (replacesBindingId && (!previous || previous.supersededById))
                throw new ConflictException(t('server-ai:Error.AgentResourceRevisionConflict'))
            const next = await manager.save(
                AgentResourceBinding,
                this.bindings.create({ ...scope, ...values, version, installations, expertVersions, enabled: true })
            )
            if (previous) {
                previous.supersededById = next.id
                await manager.save(previous)
            }
            return next
        })
    }

    async setEnabled(id: string, enabled: boolean) {
        const scope = requireResourceAdmin()
        const binding = await this.bindings.findOneBy({ ...scope, id })
        if (!binding) throw new NotFoundException(t('server-ai:Error.AgentResourceNotFound'))
        binding.enabled = enabled
        return this.bindings.save(binding)
    }

    private components(pkg: AgentPluginPackage, version: string): RuntimeComponent[] {
        const pluginName = `agent-plugin-${pkg.id}-${version.slice(0, 12)}`
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
        ].map((component) => ({ pluginName, pluginVersion: pkg.digest, rootDir: pkg.rootPath, component }))
    }
}
