// Invariants: version backup, Agent changes and the published graph commit together.
// A row lock and snapshot check reject concurrent edits; authorization precedes this boundary.
// External activation runs after commit and can be resumed without publishing another version.
import { assistantSharingLock } from '../sharing/sharing-lock'
import { TagCategoryEnum } from '@xpert-ai/contracts'
import { ConflictException, Injectable, ForbiddenException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { DataSource, DeepPartial, EntityManager, IsNull } from 'typeorm'
import { t } from 'i18next'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { assertValidTagAssociations } from '../../shared/tag-associations'
import { XpertAgent } from '../../xpert-agent/xpert-agent.entity'
import { Xpert } from '../xpert.entity'
import { normalizeXpertExecutionConfig } from '../xpert-execution-config'

@Injectable()
export class XpertPublicationPersistence {
    constructor(
        private readonly database: DataSource,
        private readonly access: XpertWorkspaceAccessService
    ) {}

    async run<T>(snapshot: Xpert, write: (store: PublicationStore) => Promise<T>): Promise<T> {
        if (snapshot.workspaceId) await this.access.assertCanAuthor(snapshot.workspaceId)
        return this.database.transaction(async (manager) => {
            await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
                assistantSharingLock(snapshot)
            ])
            const row = await manager.getRepository(Xpert).findOne({
                where: {
                    id: snapshot.id,
                    tenantId: snapshot.tenantId,
                    organizationId: snapshot.organizationId ?? IsNull()
                },
                select: ['id', 'version', 'draft', 'environmentId', 'copilotModelId'],
                // Eager tag joins include nullable rows; PostgreSQL must lock only the Assistant.
                loadEagerRelations: false,
                lock: { mode: 'pessimistic_write' }
            })
            if (
                !row ||
                row.version !== snapshot.version ||
                (row.environmentId ?? null) !== (snapshot.environmentId ?? null) ||
                (row.copilotModelId ?? null) !== (snapshot.copilotModelId ?? null) ||
                JSON.stringify(row.draft) !== JSON.stringify(snapshot.draft)
            ) {
                throw new ConflictException(t('server-ai:Error.XpertPublicationStale'))
            }
            const currentAccess = await manager.getRepository(Xpert).findOne({
                where: { id: snapshot.id, tenantId: snapshot.tenantId },
                relations: ['userGroups']
            })
            snapshot.userGroups = currentAccess.userGroups
            return write(new PublicationStore(manager, this.access, snapshot))
        })
    }

    async completeActivation(xpert: Xpert): Promise<void> {
        await this.database.transaction(async (manager) => {
            // This checkpoint update only needs scalar columns, not recursive Assistant relations.
            const repository =
                manager.getRepository<Pick<Xpert, 'id' | 'tenantId' | 'organizationId' | 'version' | 'options'>>(Xpert)
            const current = await repository.findOne({
                where: { id: xpert.id, tenantId: xpert.tenantId, organizationId: xpert.organizationId ?? IsNull() },
                select: ['id', 'version', 'options'],
                loadEagerRelations: false,
                lock: { mode: 'pessimistic_write' }
            })
            if (!current || current.version !== xpert.version)
                throw new ConflictException(t('server-ai:Error.XpertPublicationStale'))
            if (current.options?.pendingPublication?.version === xpert.version) {
                const options = { ...current.options }
                delete options.pendingPublication
                await repository.update(current.id, { options })
            }
        })
        if (xpert.options) delete xpert.options.pendingPublication
    }
}

export class PublicationStore {
    constructor(
        private readonly manager: EntityManager,
        private readonly access: XpertWorkspaceAccessService,
        private readonly source: Xpert
    ) {}

    async advanceVersion(version: string): Promise<void> {
        // Reserving the new version must not cascade into Agents before their stale checks.
        const repository = this.manager.getRepository<Pick<Xpert, 'id' | 'version'>>(Xpert)
        await repository.update(this.source.id, { version })
    }

    async saveTeam(entity: Xpert): Promise<Xpert> {
        const repository = this.manager.getRepository(Xpert)
        await assertValidTagAssociations(repository, this.access, entity, TagCategoryEnum.XPERT)
        return repository.save(
            normalizeXpertExecutionConfig({
                ...entity,
                userGroups: this.source.userGroups
            })
        )
    }

    async createBackup(entity: DeepPartial<Xpert>): Promise<Xpert> {
        const repository = this.manager.getRepository(Xpert)
        await assertValidTagAssociations(repository, this.access, entity, TagCategoryEnum.XPERT, this.source.id)
        return repository.save(
            repository.create(
                normalizeXpertExecutionConfig({
                    ...entity,
                    userGroups: this.source.userGroups,
                    updatedById: RequestContext.currentUserId()
                })
            )
        )
    }

    async createAgent(entity: DeepPartial<XpertAgent>): Promise<XpertAgent> {
        const repository = this.manager.getRepository(XpertAgent)
        return repository.save(
            repository.create({
                ...entity,
                tenantId: this.source.tenantId,
                organizationId: this.source.organizationId,
                createdById: entity.createdById ?? RequestContext.currentUserId(),
                updatedById: RequestContext.currentUserId()
            })
        )
    }

    async updateAgent(id: string, entity: Partial<XpertAgent>): Promise<XpertAgent> {
        const agent = this.ownedAgent(id)
        return this.manager.getRepository(XpertAgent).save({ ...agent, ...entity, id })
    }

    async deleteAgent(id: string): Promise<void> {
        this.ownedAgent(id)
        await this.manager.getRepository(XpertAgent).delete({ id, tenantId: this.source.tenantId })
    }

    private ownedAgent(id: string): XpertAgent {
        const agent = [this.source.agent, ...(this.source.agents ?? [])].find((item) => item?.id === id)
        if (!agent) throw new ForbiddenException()
        return agent as XpertAgent
    }
}
