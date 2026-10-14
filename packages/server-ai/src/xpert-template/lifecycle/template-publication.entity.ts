import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'
import { PortableTemplate, portableTemplateSchema } from './portable-template'

@Entity('assistant_template_publication')
@Index('uq_assistant_template_publication_source', ['tenantId', 'organizationId', 'assistantId'], { unique: true })
export class TemplatePublicationEntity extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid' }) assistantId: string
    @Column({ type: 'varchar', length: 12 }) visibility: 'team' | 'public'
    @Column({ type: 'boolean', default: false }) revoked: boolean
    @Column({ type: 'varchar', length: 64 }) version: string
    @Column({ type: 'varchar', length: 64 }) contentHash: string
    @Column({ type: 'text', default: '' }) releaseNotes: string
    @Column({
        type: 'jsonb',
        transformer: {
            to: (value: PortableTemplate) => value,
            from: (value: unknown) => portableTemplateSchema.parse(value)
        }
    })
    content: PortableTemplate
}
