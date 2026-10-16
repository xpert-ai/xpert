// Invariants: version backup, Agent changes and the published graph commit together.
// A row lock and snapshot check reject concurrent edits; authorization precedes this boundary.
// External activation runs after commit and can be resumed without publishing another version.
import { normalizeXpertAgentConfig, TagCategoryEnum } from '@xpert-ai/contracts'
import { ConflictException, Injectable, ForbiddenException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { DataSource, DeepPartial, EntityManager, IsNull } from 'typeorm'
import { t } from 'i18next'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { assertValidTagAssociations } from '../../shared/tag-associations'
import { XpertAgent } from '../../xpert-agent/xpert-agent.entity'
import { Xpert } from '../xpert.entity'

@Injectable()
export class XpertPublicationPersistence {
    constructor(
        private readonly database: DataSource,
        private readonly access: XpertWorkspaceAccessService
    ) {}

    async run<T>(snapshot: Xpert, write: (store: PublicationStore) => Promise<T>): Promise<T> {
        if (snapshot.workspaceId) await this.access.assertCanAuthor(snapshot.workspaceId)
        return this.database.transaction(async (manager) => {
            const row = await manager.getRepository(Xpert).findOne({
                where: {
                    id: snapshot.id,
                    tenantId: snapshot.tenantId,
                    organizationId: snapshot.organizationId ?? IsNull()
                },
                select: ['id', 'version', 'draft', 'environmentId', 'copilotModelId'],
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
            return write(new PublicationStore(manager, this.access, snapshot))
        })
    }

    async completeActivation(xpert: Xpert): Promise<void> {
        await this.database.transaction(async (manager) => {
            const repository = manager.getRepository(Xpert)
            const current = await repository.findOne({
                where: { id: xpert.id, tenantId: xpert.tenantId, organizationId: xpert.organizationId ?? IsNull() },
                select: ['id', 'version', 'options'],
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

    async saveTeam(entity: Xpert): Promise<Xpert> {
        const repository = this.manager.getRepository(Xpert)
        await assertValidTagAssociations(repository, this.access, entity, TagCategoryEnum.XPERT)
        return repository.save({ ...entity, agentConfig: normalizeXpertAgentConfig(entity.agentConfig) })
    }

    async createBackup(entity: DeepPartial<Xpert>): Promise<Xpert> {
        const repository = this.manager.getRepository(Xpert)
        await assertValidTagAssociations(repository, this.access, entity, TagCategoryEnum.XPERT, this.source.id)
        return repository.save(
            repository.create({
                ...entity,
                agentConfig: normalizeXpertAgentConfig(entity.agentConfig),
                updatedById: RequestContext.currentUserId()
            })
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
