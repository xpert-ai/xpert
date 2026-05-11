import { IKnowledgebase, IKnowledgeGraphEntity } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsJSON, IsNumber, IsOptional, IsString } from 'class-validator'
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, RelationId } from 'typeorm'
import { Knowledgebase } from '../../core/entities/internal'
import { KnowledgeGraphMention } from './knowledge-graph-mention.entity'
import { KnowledgeGraphRelation } from './knowledge-graph-relation.entity'

@Entity('knowledge_graph_entity')
@Index(['tenantId', 'organizationId', 'knowledgebaseId', 'normalizedName', 'type'], { unique: true })
export class KnowledgeGraphEntity extends TenantOrganizationBaseEntity implements IKnowledgeGraphEntity {
    @ApiProperty({ type: () => Knowledgebase, readOnly: true })
    @ManyToOne(() => Knowledgebase, {
        nullable: true,
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
    })
    @JoinColumn()
    @IsOptional()
    knowledgebase?: IKnowledgebase

    @ApiProperty({ type: () => String, readOnly: true })
    @RelationId((it: KnowledgeGraphEntity) => it.knowledgebase)
    @IsString()
    @IsOptional()
    @Column({ nullable: true })
    knowledgebaseId?: string

    @ApiProperty({ type: () => String })
    @IsString()
    @Column({ type: 'varchar', length: 120 })
    type: string

    @ApiProperty({ type: () => String })
    @IsString()
    @Column({ type: 'varchar', length: 512 })
    name: string

    @ApiProperty({ type: () => String })
    @IsString()
    @Column({ type: 'varchar', length: 512 })
    normalizedName: string

    @ApiPropertyOptional({ type: () => Object })
    @IsJSON()
    @IsOptional()
    @Column({ type: 'jsonb', nullable: true, default: [] })
    aliases?: string[] | null

    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @IsOptional()
    @Column({ type: 'text', nullable: true })
    description?: string | null

    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @IsOptional()
    @Column({ type: 'text', nullable: true })
    summary?: string | null

    @ApiPropertyOptional({ type: () => Number })
    @IsNumber()
    @IsOptional()
    @Column({ type: 'float', nullable: true })
    confidence?: number | null

    @ApiPropertyOptional({ type: () => Number })
    @IsNumber()
    @IsOptional()
    @Column({ type: 'int', nullable: true, default: 0 })
    mentionCount?: number | null

    @ApiPropertyOptional({ type: () => Number })
    @IsNumber()
    @IsOptional()
    @Column({ type: 'int', nullable: true, default: 0 })
    revision?: number | null

    @ApiPropertyOptional({ type: () => Object })
    @IsJSON()
    @IsOptional()
    @Column({ type: 'jsonb', nullable: true })
    metadata?: { [key: string]: unknown } | null

    @OneToMany(() => KnowledgeGraphMention, (mention) => mention.entity)
    mentions?: KnowledgeGraphMention[]

    @OneToMany(() => KnowledgeGraphRelation, (relation) => relation.sourceEntity)
    outgoingRelations?: KnowledgeGraphRelation[]

    @OneToMany(() => KnowledgeGraphRelation, (relation) => relation.targetEntity)
    incomingRelations?: KnowledgeGraphRelation[]
}
