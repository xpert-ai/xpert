import { Tag, TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { Knowledgebase } from '../knowledgebase.entity'

/** Selects an existing tag; definitions remain owned by the organization/tenant directory. */
@Entity('knowledgebase_tag')
@Index('UQ_knowledgebase_tag', ['knowledgebaseId', 'tagId'], { unique: true })
export class KnowledgebaseTag extends TenantOrganizationBaseEntity {
    @Column({ type: 'uuid' })
    knowledgebaseId: string

    @ManyToOne(() => Knowledgebase, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'knowledgebaseId' })
    knowledgebase?: Knowledgebase

    @Column({ type: 'uuid' })
    tagId: string

    @ManyToOne(() => Tag, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'tagId' })
    tag: Tag
}
