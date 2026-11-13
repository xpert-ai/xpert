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
import { RolesEnum, isUserAddableAgentMiddleware, type RuntimeResourceBindingInput } from '@xpert-ai/contracts'
import { Repository, type EntityManager } from 'typeorm'
import { createHash } from 'node:crypto'
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { t } from 'i18next'
import { AgentPluginPackage, AgentResourceBinding } from './agent-plugin.entity'
import { parseAgentPlugin } from './agent-plugin-parser'
import { extractPortableZip, portablePackageDigest, stagePortableGit } from './agent-plugin-source'
import Ajv from 'ajv'
import { AgentPluginConnectorService } from './agent-plugin-connector.service'
import { publishedResourceVersion } from './published-resource-version'
import { agentPluginScope, agentPluginScopeWhere } from './agent-plugin-scope'
import { importedPluginBinding } from './installed-plugin-catalog'
import { lockPackageScope, packageIntact, stagePackageFiles, removePackageFiles } from './maintenance/package-storage'
import { activatePackage, currentPackageBinding } from './maintenance/activate-package'
import { retirePackageFiles, collectPackageGarbage } from './maintenance/package-garbage'

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
    return agentPluginScope()
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
        if (!scope.organizationId) return { workspaces: [], experts: [], middlewares: [] }
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
            this.packages.find({ where: agentPluginScopeWhere(scope), order: { createdAt: 'DESC' } }),
            this.bindings.find({ where: agentPluginScopeWhere(scope), order: { createdAt: 'DESC' } })
        ])
        const defaults = packages
            .filter(
                (pkg) =>
                    !bindings.some(
                        (binding) =>
                            binding.definition.kind === 'agent_plugin' && binding.definition.packageId === pkg.id
                    )
            )
            .map((pkg) => importedPluginBinding(pkg))
        return { packages: packages.map(({ rootPath, ...item }) => item), bindings: [...defaults, ...bindings] }
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
            return await this.importStagedDirectory(staged.root, { kind: 'git', ...input, commit: staged.commit })
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
            return await this.importStagedDirectory(root, { kind: 'zip' })
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

    /** Internal staged content only; HTTP imports must pass through Git/ZIP validation first. */
    async importStagedDirectory(
        root: string,
        source: AgentPluginPackage['source'],
        activate = false,
        manager: EntityManager = this.packages.manager
    ) {
        const scope = requireResourceAdmin()
        try {
            const descriptor = await parseAgentPlugin(root)
            const digest = await portablePackageDigest(root)
            let stagedPath: string | undefined
            let committed = false
            try {
                const result = await manager.transaction(async (manager) => {
                    await lockPackageScope(manager, scope)
                    const previous = activate ? await currentPackageBinding(manager, scope, descriptor.name) : undefined
                    const repository = manager.getRepository(AgentPluginPackage)
                    const existing = await repository.findOne({ where: { ...agentPluginScopeWhere(scope), digest } })
                    const intact = existing && (await packageIntact(existing.rootPath, digest, scope))
                    let rootPath = existing?.rootPath
                    if (!intact) {
                        const staged = await stagePackageFiles(root, digest, scope)
                        rootPath = stagedPath = staged.rootPath
                        descriptor.diagnostics.push(
                            ...staged.skipped.map((component) => ({
                                component,
                                code: 'unsafe_path',
                                message: 'Skipped a broken, cyclic or escaping package path'
                            }))
                        )
                        if (existing) await retirePackageFiles(manager, scope, [existing.rootPath])
                    }
                    // Never rewrite package identity, creation time or bindings during repair/reimport.
                    const saved = existing
                        ? await repository.save({ ...existing, descriptor, rootPath, ...(activate ? { source } : {}) })
                        : await repository.save(repository.create({ ...scope, rootPath, digest, descriptor, source }))
                    if (
                        activate &&
                        (previous?.definition.kind !== 'agent_plugin' || previous.definition.packageId !== saved.id)
                    )
                        await activatePackage(manager, saved, previous)
                    const { rootPath: storedPath, ...item } = saved
                    return {
                        ...item,
                        importStatus: existing
                            ? intact
                                ? ('existing' as const)
                                : ('repaired' as const)
                            : ('imported' as const)
                    }
                })
                committed = true
                // Collection is best-effort and durable; a cleanup failure must not roll back a successful repair.
                await manager
                    .transaction(async (manager) => {
                        await lockPackageScope(manager, scope)
                        await collectPackageGarbage(manager, scope)
                    })
                    .catch(() => undefined)
                return result
            } finally {
                if (!committed && stagedPath) await removePackageFiles(stagedPath, scope)
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
        if (input.definition.kind === 'agent_plugin') {
            return this.createAuthorizedBinding(
                {
                    ...input,
                    workspaceIds: [],
                    definition: { ...input.definition, availability: 'scope' }
                },
                scope
            )
        }
        if (!scope.organizationId || !input.workspaceIds.length)
            throw new BadRequestException(t('server-ai:Error.AgentResourceOrganizationRequired'))
        const access = this.modules.get(
            (await import('../xpert-workspace/workspace-access.service')).XpertWorkspaceAccessService,
            { strict: false }
        )
        for (const workspaceId of input.workspaceIds) {
            const { workspace } = await access.assertCan(workspaceId, 'manage')
            if (workspace.organizationId !== scope.organizationId)
                throw new ForbiddenException(t('server-ai:Error.AgentResourceScopeMismatch'))
        }
        return this.createAuthorizedBinding(input, scope)
    }

    private async createAuthorizedBinding(
        input: RuntimeResourceBindingInput,
        scope: ReturnType<typeof agentPluginScope>
    ) {
        const where = agentPluginScopeWhere(scope)
        let projectedPrevious: AgentResourceBinding | null = null
        if (input.replacesBindingId) {
            const stored = await this.bindings.findOneBy({ ...where, id: input.replacesBindingId })
            const previous =
                stored ??
                (await this.packages.find({ where }))
                    .map((pkg) => importedPluginBinding(pkg))
                    .find((binding) => binding.id === input.replacesBindingId)
            if (!previous || previous.definition.kind !== input.definition.kind)
                throw new BadRequestException(t('server-ai:Error.AgentResourceNotFound'))
            if (!stored) projectedPrevious = previous
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
            pkg = await this.packages.findOneBy({ ...where, id: definition.packageId })
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
        return this.bindings.manager.transaction(async (manager) => {
            if (definition.kind === 'agent_plugin') {
                await lockPackageScope(manager, scope)
                if (!(await manager.findOneBy(AgentPluginPackage, { ...where, id: definition.packageId })))
                    throw new NotFoundException(t('server-ai:Error.AgentPluginNotFound'))
            }
            const { replacesBindingId, ...values } = input
            if (replacesBindingId)
                await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`agent-plugin:${replacesBindingId}`])
            let previous = replacesBindingId
                ? await manager.findOne(AgentResourceBinding, {
                      where: { ...where, id: replacesBindingId },
                      lock: { mode: 'pessimistic_write' }
                  })
                : null
            if (!previous && projectedPrevious)
                previous = await manager.save(AgentResourceBinding, this.bindings.create(projectedPrevious))
            if (replacesBindingId && (!previous || previous.supersededById))
                throw new ConflictException(t('server-ai:Error.AgentResourceRevisionConflict'))
            const next = await manager.save(
                AgentResourceBinding,
                this.bindings.create({ ...scope, ...values, version, installations: {}, expertVersions, enabled: true })
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
        const where = agentPluginScopeWhere(scope)
        return this.bindings.manager.transaction(async (manager) => {
            await lockPackageScope(manager, scope)
            await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`agent-plugin:${id}`])
            const binding =
                (await manager.findOneBy(AgentResourceBinding, { ...where, id })) ??
                (await manager.find(AgentPluginPackage, { where }))
                    .map((pkg) => importedPluginBinding(pkg))
                    .find((item) => item.id === id)
            if (!binding) throw new NotFoundException(t('server-ai:Error.AgentResourceNotFound'))
            binding.enabled = enabled
            binding.cleanupEligible = false
            return manager.save(AgentResourceBinding, this.bindings.create(binding))
        })
    }
}
