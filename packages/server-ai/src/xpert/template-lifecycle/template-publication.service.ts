import { Injectable, ConflictException, BadRequestException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { TemplatePublicationInput, TemplatePublicationPreview } from '@xpert-ai/contracts'
import { t } from 'i18next'
import { stringify } from 'yaml'
import { TemplateAuthoring } from './template-authoring'
import { TemplatePublicationEntity } from '../../xpert-template/lifecycle/template-publication.entity'
import { fingerprint, portableTemplate, portableDraft } from '../../xpert-template/lifecycle/portable-template'

@Injectable()
export class TemplatePublicationService {
    constructor(
        private readonly authoring: TemplateAuthoring,
        private readonly database: DataSource
    ) {}
    async preview(id: string): Promise<TemplatePublicationPreview> {
        const { xpert, draft, revision } = await this.authoring.load(id)
        const { content, omitted, blocked } = portableTemplate(draft)
        const row = await this.database.getRepository(TemplatePublicationEntity).findOne({
            where: {
                tenantId: xpert.tenantId,
                organizationId: xpert.organizationId,
                assistantId: id
            }
        })
        return {
            revision,
            contentHash: fingerprint(content),
            content: stringify(portableDraft(content)),
            omitted,
            blocked,
            publication: row
                ? { id: `shared-${row.id}`, version: row.version, visibility: row.visibility, revoked: row.revoked }
                : undefined
        }
    }
    async publish(id: string, input: TemplatePublicationInput) {
        return this.database.transaction(async (manager) => {
            await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`template-publication:${id}`])
            const { xpert, draft, revision } = await this.authoring.load(id)
            const { content, blocked } = portableTemplate(draft)
            if (input.revision !== revision || input.contentHash !== fingerprint(content))
                throw new ConflictException(t('server-ai:Error.TemplateLifecycleStale'))
            if (blocked.length) throw new BadRequestException(t('server-ai:Error.TemplatePublicationUnsupported'))
            const repository = manager.getRepository(TemplatePublicationEntity)
            const previous = await repository.findOne({
                where: { tenantId: xpert.tenantId, organizationId: xpert.organizationId, assistantId: id }
            })
            if (previous && !newer(input.version, previous.version))
                throw new ConflictException(t('server-ai:Error.TemplatePublicationVersion'))
            const row = await repository.save(
                repository.create({
                    ...previous,
                    tenantId: xpert.tenantId,
                    organizationId: xpert.organizationId,
                    assistantId: id,
                    ...input,
                    content,
                    revoked: false
                })
            )
            return { id: `shared-${row.id}`, version: row.version, visibility: row.visibility, revoked: row.revoked }
        })
    }
    async revoke(id: string) {
        const { xpert } = await this.authoring.load(id)
        await this.database
            .getRepository(TemplatePublicationEntity)
            .update(
                { tenantId: xpert.tenantId, organizationId: xpert.organizationId, assistantId: id },
                { revoked: true }
            )
        return { revoked: true }
    }
}
function newer(next: string, previous: string) {
    const before = previous.split('.').map(Number),
        after = next.split('.').map(Number)
    for (let index = 0; index < 3; index++) {
        if (after[index] !== before[index]) return after[index] > before[index]
    }
    return false
}
