import { Column, Entity, Index } from 'typeorm'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'

/** Project placement references immutable published bytes; it owns neither bytes nor source permissions. */
@Entity('artifact_reference')
@Index(['tenantId', 'organizationId', 'projectId', 'artifactId'], { unique: true })
export class ArtifactReference extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid' }) projectId: string
    @Column({ type: 'uuid' }) artifactId: string
    @Column({ type: 'uuid' }) versionId: string
    @Column({ type: 'varchar', length: 200 }) title: string
    @Column({ type: 'int', default: 1 }) revision: number
    @Column({ type: 'boolean', default: false }) deleted: boolean
}
