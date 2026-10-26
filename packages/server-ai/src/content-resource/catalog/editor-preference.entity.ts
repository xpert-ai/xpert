import { Column, Entity, Index } from 'typeorm'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'

@Entity('content_editor_preference')
@Index('IDX_content_editor_preference', ['tenantId', 'organizationId', 'scope', 'scopeId', 'modelKey'], {
    unique: true
})
export class ContentEditorPreference extends TenantOrganizationBaseEntity {
    @Column({ type: 'varchar', length: 20 }) scope: 'resource' | 'project' | 'organization'
    @Column({ type: 'uuid' }) scopeId: string
    @Column({ type: 'varchar', length: 64 }) modelKey: string
    @Column({ type: 'varchar', length: 200, nullable: true }) editorKey: string | null
    @Column({ type: 'int', default: 0 }) revision: number
}
