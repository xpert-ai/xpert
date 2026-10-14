import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index } from 'typeorm'
import { TXpertTeamDraft, TemplateUpgradeOperation } from '@xpert-ai/contracts'
import { PortableTemplate, portableTemplateSchema } from '../../xpert-template/lifecycle/portable-template'

@Entity('assistant_template_upgrade')
@Index('idx_assistant_template_upgrade_assistant', ['tenantId', 'organizationId', 'assistantId', 'createdAt'])
export class TemplateUpgradeEntity extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid' }) assistantId: string
    @Column({ type: 'varchar', length: 12, default: 'upgrade' }) direction: 'upgrade' | 'rollback'
    @Column({ type: 'boolean', default: false }) prepared: boolean
    @Column({ type: 'varchar', length: 24 }) state: TemplateUpgradeOperation['state']
    @Column({ type: 'varchar', length: 64 }) revision: string
    @Column({ type: 'varchar', length: 64 }) sourceHash: string
    @Column({ type: 'jsonb' }) before: TXpertTeamDraft
    @Column({ type: 'jsonb' }) after: TXpertTeamDraft
    @Column({
        type: 'jsonb',
        transformer: {
            to: (value: PortableTemplate) => value,
            from: (value: unknown) => portableTemplateSchema.parse(value)
        }
    })
    baseline: PortableTemplate
}
