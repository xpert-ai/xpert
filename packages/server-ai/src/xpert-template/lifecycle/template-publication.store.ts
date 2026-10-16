import { Injectable, NotFoundException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { TXpertTemplate, XpertTypeEnum } from '@xpert-ai/contracts'
import { t } from 'i18next'
import { stringify } from 'yaml'
import { TemplatePublicationEntity } from './template-publication.entity'
import { portableDraft, portableTemplateSchema } from './portable-template'
import { z } from 'zod'

const publicationSummarySchema = z.object({
    id: z.string(),
    version: z.string(),
    contentHash: z.string(),
    releaseNotes: z.string(),
    presentation: portableTemplateSchema.shape.presentation
})

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
    async listSummaries(): Promise<TXpertTemplate[]> {
        if (!RequestContext.currentUserId()) return []
        // Select presentation in PostgreSQL so browsing never hydrates instructions or builds YAML.
        const rows = await this.reader()
            .select('publication.id', 'id')
            .addSelect('publication.version', 'version')
            .addSelect('publication.contentHash', 'contentHash')
            .addSelect('publication.releaseNotes', 'releaseNotes')
            .addSelect("publication.content -> 'presentation'", 'presentation')
            .orderBy('publication.updatedAt', 'DESC')
            .getRawMany<unknown>()
        return rows.map((row) => this.summary(publicationSummarySchema.parse(row)))
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
        const draft = portableDraft(row.content)
        return {
            ...this.summary({ ...row, presentation: row.content.presentation }),
            export_data: stringify(draft),
            dependencies: draft.template?.dependencies
        }
    }
    private summary(row: z.output<typeof publicationSummarySchema>): TXpertTemplate {
        return {
            id: `shared-${row.id}`,
            key: `shared-${row.id}`,
            name: row.presentation.title,
            title: row.presentation.title,
            description: row.presentation.description,
            type: XpertTypeEnum.Agent,
            category: 'assistant',
            copyright: t('server-ai:TemplateCommunityPublisher'),
            avatar: null,
            source: 'shared',
            pluginVersion: row.version,
            contentHash: row.contentHash,
            releaseNotes: row.releaseNotes,
            export_data: '',
            targetApps: ['xpert']
        }
    }
}
