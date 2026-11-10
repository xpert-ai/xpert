import { Column, Entity, Index, PrimaryColumn } from 'typeorm'
import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'
import type { DeliveryEvidence, Phase, Requirement } from './schemas'
import { NAMESPACE } from './constants'

@Entity(pluginArtifactTableName(NAMESPACE, 'delivery'))
@Index(['tenantId', 'organizationId', 'projectId'])
export class CodingDelivery {
  @PrimaryColumn('uuid') id: string
  @Column({ type: 'uuid', nullable: true }) tenantId: string | null
  @Column({ type: 'uuid', nullable: true }) organizationId: string | null
  @Column('uuid') projectId: string
  @Column('uuid') createdById: string
  @Column('int') revision: number
  @Column('jsonb') requirement: Requirement
  @Column({ type: 'uuid', nullable: true }) instanceId: string | null
  @Column('timestamptz') createdAt: Date
}

/** Immutable operation identity plus a single CAS from awaiting evidence to sealed evidence. */
@Entity(pluginArtifactTableName(NAMESPACE, 'work'))
@Index(['tenantId', 'organizationId', 'projectId', 'deliveryId'])
export class CodingDeliveryWork {
  @PrimaryColumn('uuid') id: string
  @Column({ type: 'uuid', nullable: true }) tenantId: string | null
  @Column({ type: 'uuid', nullable: true }) organizationId: string | null
  @Column('uuid') projectId: string
  @Column('uuid') deliveryId: string
  @Column('int') requirementVersion: number
  @Column('jsonb') requirement: Requirement
  @Column('varchar') phase: Phase
  // Parse at the persistence boundary; keeping recursive JSON out of TypeORM's deep mutation types avoids TS2589.
  @Column('jsonb') context: object
  @Column({ type: 'jsonb', nullable: true }) evidence: DeliveryEvidence | null
  @Column('timestamptz') createdAt: Date
}
