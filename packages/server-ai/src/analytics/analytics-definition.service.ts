// Invariants: versions are append-only; publishing never rewrites bindings or old version content.
// Every operation binds tenant, organization and current viewer; only the owner can publish/archive.
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash } from 'node:crypto'
import { DataSource, Repository } from 'typeorm'
import type {
    AnalyticsDefinitionCreate,
    AnalyticsDefinitionPublish,
    AnalyticsVersionedSourceRef,
    JSONValue
} from '@xpert-ai/contracts'
import {
    AnalyticsProviderRegistry,
    RequestContext,
    analyticsOptionsSchema,
    type AnalyticsResolvedSource,
    type DataSourceActor
} from '@xpert-ai/plugin-sdk'
import { UserOrganizationService } from '@xpert-ai/server-core'
import { AnalyticsDefinition, AnalyticsDefinitionVersion } from './analytics-definition.entity'
import { definitionError } from './analytics-definition.errors'

export const definitionDigest = (options: Record<string, JSONValue>) =>
    createHash('sha256').update(JSON.stringify(options)).digest('hex')
@Injectable()
export class AnalyticsDefinitionService {
    constructor(
        @InjectRepository(AnalyticsDefinition) private readonly definitions: Repository<AnalyticsDefinition>,
        @InjectRepository(AnalyticsDefinitionVersion) private readonly versions: Repository<AnalyticsDefinitionVersion>,
        private readonly db: DataSource,
        private readonly providers: AnalyticsProviderRegistry,
        private readonly memberships: UserOrganizationService
    ) {}
    actor(): DataSourceActor {
        return {
            tenantId: RequestContext.currentTenantId(),
            organizationId: RequestContext.getOrganizationId(),
            userId: RequestContext.currentUserId()
        }
    }
    async authorize(actor = this.actor()) {
        const current = this.actor()
        if (
            !actor.tenantId ||
            !actor.organizationId ||
            !actor.userId ||
            actor.tenantId !== current.tenantId ||
            actor.organizationId !== current.organizationId ||
            actor.userId !== current.userId
        )
            throw definitionError('denied')
        const membership = await this.memberships.findMembershipByUserAndOrganization(actor)
        if (!membership?.isActive) throw definitionError('denied')
        return actor
    }
    async catalog() {
        const actor = await this.authorize()
        return this.providers
            .list(actor.organizationId)
            .flatMap((provider) =>
                provider.configuration
                    ? [{ descriptor: provider.descriptor, configuration: provider.configuration }]
                    : []
            )
    }
    async list(page: number, pageSize: number, actor = this.actor()) {
        await this.authorize(actor)
        const scope = { tenantId: actor.tenantId, organizationId: actor.organizationId }
        const [items, total] = await this.definitions.findAndCount({
            where: [
                { ...scope, userId: actor.userId },
                { ...scope, visibility: 'organization' }
            ],
            order: { id: 'ASC' },
            skip: (page - 1) * pageSize,
            take: pageSize
        })
        return { items, total, page, pageSize }
    }
    async get(id: string, actor = this.actor(), write = false) {
        await this.authorize(actor)
        const definition = await this.definitions.findOneBy({
            id,
            tenantId: actor.tenantId,
            organizationId: actor.organizationId
        })
        if (!definition || (definition.userId !== actor.userId && (write || definition.visibility !== 'organization')))
            throw definitionError('unavailable')
        return definition
    }
    async version(id: string, versionId: string, actor = this.actor()) {
        const definition = await this.get(id, actor)
        if (definition.status !== 'active') throw definitionError('unavailable')
        const version = await this.versions.findOneBy({
            id: versionId,
            definitionId: id,
            tenantId: actor.tenantId,
            organizationId: actor.organizationId
        })
        const options = analyticsOptionsSchema.safeParse(version?.options)
        if (!version || !options.success || definitionDigest(options.data) !== version.sha256)
            throw definitionError('unavailable')
        return { definition, version }
    }
    async history(id: string, page: number, pageSize: number) {
        const definition = await this.get(id)
        const [items, total] = await this.versions.findAndCount({
            where: { definitionId: id, tenantId: definition.tenantId, organizationId: definition.organizationId },
            select: ['id', 'definitionId', 'versionNumber', 'sha256', 'createdAt'],
            order: { versionNumber: 'DESC' },
            skip: (page - 1) * pageSize,
            take: pageSize
        })
        return { items, total, page, pageSize }
    }
    private async validate(providerId: string, options: Record<string, JSONValue>, actor: DataSourceActor) {
        const provider = this.providers
            .list(actor.organizationId)
            .find((item) => item.descriptor.id === providerId && item.descriptor.sourceKinds.includes('definition'))
        if (provider?.configuration?.kind !== 'definition' || !provider.validateConfiguration)
            throw definitionError('unavailable')
        try {
            return analyticsOptionsSchema.parse(await provider.validateConfiguration(options, actor))
        } catch {
            throw definitionError('invalid')
        }
    }
    async validateInput(input: AnalyticsDefinitionCreate) {
        const actor = await this.authorize()
        return { options: await this.validate(input.providerId, input.options, actor) }
    }
    async create(input: AnalyticsDefinitionCreate, registrationKey?: string) {
        const actor = await this.authorize()
        const options = await this.validate(input.providerId, input.options, actor)
        await this.authorize(actor)
        return this.db.transaction(async (manager) => {
            // A deterministic scoped UUID plus transaction lock makes retries safe across processes.
            const digest = registrationKey
                ? createHash('sha256')
                      .update(JSON.stringify([actor, registrationKey]))
                      .digest('hex')
                : null
            const id = digest
                ? `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`
                : undefined
            if (id) {
                await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [id])
                const existing = await manager.findOneBy(AnalyticsDefinition, { id, ...actor })
                if (existing) {
                    const version = await manager.findOneBy(AnalyticsDefinitionVersion, {
                        definitionId: id,
                        versionNumber: 1
                    })
                    if (
                        existing.status !== 'active' ||
                        existing.name !== input.name ||
                        existing.providerId !== input.providerId ||
                        existing.visibility !== input.visibility ||
                        version?.sha256 !== definitionDigest(options)
                    )
                        throw definitionError('conflict')
                    return { definition: existing, version }
                }
            }
            const definition = await manager.save(
                AnalyticsDefinition,
                manager.create(AnalyticsDefinition, {
                    ...actor,
                    ...(id ? { id } : {}),
                    name: input.name,
                    providerId: input.providerId,
                    visibility: input.visibility,
                    status: 'active',
                    currentVersionId: null
                })
            )
            const version = await manager.save(
                AnalyticsDefinitionVersion,
                manager.create(AnalyticsDefinitionVersion, {
                    tenantId: actor.tenantId,
                    organizationId: actor.organizationId,
                    definitionId: definition.id,
                    versionNumber: 1,
                    options,
                    sha256: definitionDigest(options)
                })
            )
            definition.currentVersionId = version.id
            await manager.save(AnalyticsDefinition, definition)
            return { definition, version }
        })
    }
    async publish(id: string, input: AnalyticsDefinitionPublish) {
        const actor = await this.authorize(),
            original = await this.get(id, actor, true)
        const options = await this.validate(original.providerId, input.options, actor)
        await this.authorize(actor)
        return this.db.transaction(async (manager) => {
            const definition = await manager.findOne(AnalyticsDefinition, {
                where: { id, ...actor },
                lock: { mode: 'pessimistic_write' }
            })
            if (!definition || definition.status !== 'active') throw definitionError('unavailable')
            if (definition.currentVersionId !== input.expectedCurrentVersionId) throw definitionError('conflict')
            const current = await manager.findOneBy(AnalyticsDefinitionVersion, {
                id: definition.currentVersionId,
                definitionId: id
            })
            if (!current) throw definitionError('unavailable')
            const version = await manager.save(
                AnalyticsDefinitionVersion,
                manager.create(AnalyticsDefinitionVersion, {
                    tenantId: actor.tenantId,
                    organizationId: actor.organizationId,
                    definitionId: id,
                    versionNumber: current.versionNumber + 1,
                    options,
                    sha256: definitionDigest(options)
                })
            )
            if (input.visibility !== undefined) definition.visibility = input.visibility
            definition.currentVersionId = version.id
            await manager.save(AnalyticsDefinition, definition)
            return { definition, version }
        })
    }
    async status(id: string, status: AnalyticsDefinition['status']) {
        const definition = await this.get(id, this.actor(), true)
        await this.definitions.update(
            { id, tenantId: definition.tenantId, organizationId: definition.organizationId, userId: definition.userId },
            { status }
        )
        return { ...definition, status }
    }
    async resolve(
        actor: DataSourceActor,
        source: Extract<AnalyticsVersionedSourceRef, { kind: 'definition' }>
    ): Promise<AnalyticsResolvedSource> {
        const initial = await this.version(source.definitionId, source.versionId, actor)
        return {
            source,
            providerIds: [initial.definition.providerId],
            options: initial.version.options,
            revalidate: async () => {
                const current = await this.version(source.definitionId, source.versionId, actor)
                if (
                    current.version.sha256 !== initial.version.sha256 ||
                    current.definition.providerId !== initial.definition.providerId
                )
                    throw definitionError('unavailable')
            }
        }
    }
}
