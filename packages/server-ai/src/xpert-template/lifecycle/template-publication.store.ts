import { Injectable, NotFoundException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { TXpertTemplate, XpertTypeEnum } from '@xpert-ai/contracts'
import { t } from 'i18next'
import { stringify } from 'yaml'
import { TemplatePublicationEntity } from './template-publication.entity'
import { portableDraft } from './portable-template'

@Injectable()
export class TemplatePublicationStore {
    constructor(private readonly database: DataSource) {}
    private reader() {
        return this.database
            .getRepository(TemplatePublicationEntity)
            .createQueryBuilder('publication')
            .where('publication.revoked = false')
            .andWhere(
                '(publication.visibility = :public OR (publication."tenantId" = :tenant AND publication."organizationId" = :organization))',
                {
                    public: 'public',
                    tenant: RequestContext.currentTenantId(),
                    organization: RequestContext.getOrganizationId()
                }
            )
    }
    async list(): Promise<TXpertTemplate[]> {
        // Public means visible to signed-in platform users. Anonymous requests remain behind normal auth.
        if (!RequestContext.currentUserId()) return []
        return (await this.reader().orderBy('publication.updatedAt', 'DESC').getMany()).map((row) =>
            this.descriptor(row)
        )
    }
    async get(id: string): Promise<TXpertTemplate> {
        if (!RequestContext.currentUserId() || !/^shared-[a-f0-9-]{36}$/.test(id)) this.missing()
        const row = await this.reader()
            .andWhere('publication.id = :id', { id: id.slice(7) })
            .getOne()
        if (!row) this.missing()
        return this.descriptor(row)
    }
    private missing(): never {
        throw new NotFoundException(t('server-ai:Error.AssistantTemplateNotFound'))
    }
    private descriptor(row: TemplatePublicationEntity): TXpertTemplate {
        return {
            id: `shared-${row.id}`,
            key: `shared-${row.id}`,
            name: row.content.presentation.title,
            title: row.content.presentation.title,
            description: row.content.presentation.description,
            type: XpertTypeEnum.Agent,
            category: 'assistant',
            copyright: t('server-ai:TemplateCommunityPublisher'),
            avatar: null,
            source: 'shared',
            pluginVersion: row.version,
            contentHash: row.contentHash,
            releaseNotes: row.releaseNotes,
            export_data: stringify(portableDraft(row.content)),
            targetApps: ['xpert'],
            dependencies: portableDraft(row.content).template?.dependencies
        }
    }
}
