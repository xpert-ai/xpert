import { createHash } from 'node:crypto'
import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { DataSource } from 'typeorm'
import { t } from 'i18next'
import { Xpert } from '../xpert.entity'
import { PublishedXpertAccessService } from '../published-xpert-access.service'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { AssistantAppearanceInput } from './assistant-appearance.schema'

const revision = (xpert: Xpert) =>
    createHash('sha256')
        .update(JSON.stringify([xpert.title, xpert.titleCN, xpert.avatar]))
        .digest('hex')

@Injectable()
export class AssistantAppearanceService {
    constructor(
        private readonly published: PublishedXpertAccessService,
        private readonly access: XpertWorkspaceAccessService,
        private readonly database: DataSource
    ) {}

    private async load(id: string) {
        const assistant = await this.published.getAccessiblePublishedXpert(id)
        if (
            assistant.tenantId !== RequestContext.currentTenantId() ||
            (assistant.organizationId && assistant.organizationId !== RequestContext.getOrganizationId())
        )
            throw new ForbiddenException(t('server-ai:Error.AssistantConfigurationForbidden'))
        return assistant
    }

    async get(id: string) {
        const assistant = await this.load(id)
        let canEdit = false
        try {
            if (assistant.organizationId && assistant.organizationId === RequestContext.getOrganizationId()) {
                await this.access.assertCanAuthor(assistant.workspaceId)
                canEdit = true
            }
        } catch (error) {
            if (!(error instanceof ForbiddenException)) throw error
        }
        return {
            canEdit,
            name: assistant.title || assistant.name,
            avatar: assistant.avatar ?? {},
            revision: revision(assistant)
        }
    }

    async save(id: string, input: AssistantAppearanceInput) {
        const assistant = await this.load(id)
        if (!assistant.organizationId || assistant.organizationId !== RequestContext.getOrganizationId())
            throw new ForbiddenException(t('server-ai:Error.AssistantConfigurationForbidden'))
        await this.access.assertCanAuthor(assistant.workspaceId)
        return this.database.transaction(async (manager) => {
            const repo = manager.getRepository(Xpert)
            const current = await repo.findOne({
                where: { id, tenantId: assistant.tenantId, organizationId: assistant.organizationId },
                loadEagerRelations: false,
                lock: { mode: 'pessimistic_write' }
            })
            if (!current || current.workspaceId !== assistant.workspaceId || revision(current) !== input.revision)
                throw new ConflictException(t('server-ai:Error.AssistantConfigurationStale'))
            // Whitelist public identity only; publishing and Studio drafts are intentionally independent.
            await repo.update(current.id, { title: input.name, titleCN: input.name, avatar: input.avatar })
            return { id }
        })
    }
}
