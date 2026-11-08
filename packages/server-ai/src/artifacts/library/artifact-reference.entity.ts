import { Column, Entity, Index } from 'typeorm'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'

/** Project placement references immutable published bytes; it owns neither bytes nor source permissions. */
@Entity('artifact_reference')
@Index('IDX_artifact_reference_project', ['tenantId', 'organizationId', 'projectId', 'artifactId'], {
    unique: true,
    where: '"groupId" IS NULL'
})
@Index('IDX_artifact_reference_group_grant', ['tenantId', 'organizationId', 'projectId', 'groupId', 'useGrantId'], {
    unique: true,
    where: '"groupId" IS NOT NULL'
})
export class ArtifactReference extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid', nullable: true }) groupId?: string | null
    @Column({ type: 'uuid', nullable: true }) useGrantId?: string | null
    @Column({ type: 'uuid' }) projectId: string
    @Column({ type: 'uuid' }) artifactId: string
    @Column({ type: 'uuid' }) versionId: string
    @Column({ type: 'varchar', length: 200 }) title: string
    @Column({ type: 'int', default: 1 }) revision: number
    @Column({ type: 'boolean', default: false }) deleted: boolean
}
