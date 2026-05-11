import { IKnowledgebase, IKnowledgeGraphEntity, IKnowledgeGraphRelation } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsJSON, IsNumber, IsOptional, IsString } from 'class-validator'
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, RelationId } from 'typeorm'
import { Knowledgebase } from '../../core/entities/internal'
import { KnowledgeGraphEntity } from './knowledge-graph-entity.entity'
import { KnowledgeGraphMention } from './knowledge-graph-mention.entity'

@Entity('knowledge_graph_relation')
@Index(['knowledgebaseId', 'sourceEntityId', 'targetEntityId', 'type'], { unique: true })
export class KnowledgeGraphRelation extends TenantOrganizationBaseEntity implements IKnowledgeGraphRelation {
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
    @RelationId((it: KnowledgeGraphRelation) => it.knowledgebase)
    @IsString()
    @IsOptional()
    @Column({ nullable: true })
    knowledgebaseId?: string

    @ApiProperty({ type: () => KnowledgeGraphEntity, readOnly: true })
    @ManyToOne(() => KnowledgeGraphEntity, (entity) => entity.outgoingRelations, {
        nullable: true,
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
    })
    @JoinColumn()
    @IsOptional()
    sourceEntity?: IKnowledgeGraphEntity

    @ApiProperty({ type: () => String, readOnly: true })
    @RelationId((it: KnowledgeGraphRelation) => it.sourceEntity)
    @IsString()
    @IsOptional()
    @Column({ nullable: true })
    sourceEntityId?: string

    @ApiProperty({ type: () => KnowledgeGraphEntity, readOnly: true })
    @ManyToOne(() => KnowledgeGraphEntity, (entity) => entity.incomingRelations, {
        nullable: true,
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
    })
    @JoinColumn()
    @IsOptional()
    targetEntity?: IKnowledgeGraphEntity

    @ApiProperty({ type: () => String, readOnly: true })
    @RelationId((it: KnowledgeGraphRelation) => it.targetEntity)
    @IsString()
    @IsOptional()
    @Column({ nullable: true })
    targetEntityId?: string

    @ApiProperty({ type: () => String })
    @IsString()
    @Column({ type: 'varchar', length: 160 })
    type: string

    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @IsOptional()
    @Column({ type: 'varchar', nullable: true, length: 160 })
    normalizedType?: string | null

    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @IsOptional()
    @Column({ type: 'text', nullable: true })
    description?: string | null

    @ApiPropertyOptional({ type: () => Number })
    @IsNumber()
    @IsOptional()
    @Column({ type: 'float', nullable: true })
    confidence?: number | null

    @ApiPropertyOptional({ type: () => Number })
    @IsNumber()
    @IsOptional()
    @Column({ type: 'float', nullable: true })
    weight?: number | null

    @ApiPropertyOptional({ type: () => Number })
    @IsNumber()
    @IsOptional()
    @Column({ type: 'int', nullable: true, default: 0 })
    evidenceCount?: number | null

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

    @OneToMany(() => KnowledgeGraphMention, (mention) => mention.relation)
    mentions?: KnowledgeGraphMention[]
}
