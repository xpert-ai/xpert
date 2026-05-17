import {
    IKnowledgebase,
    IKnowledgeDocument,
    IKnowledgeGraphEntity,
    IKnowledgeGraphMention,
    IKnowledgeGraphRelation
} from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsJSON, IsNumber, IsOptional, IsString } from 'class-validator'
import { Column, Entity, Index, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { Knowledgebase, KnowledgeDocument } from '../../core/entities/internal'
import { KnowledgeGraphEntity } from './knowledge-graph-entity.entity'
import { KnowledgeGraphRelation } from './knowledge-graph-relation.entity'

@Entity('knowledge_graph_mention')
@Index(['knowledgebaseId', 'documentId'])
@Index(['knowledgebaseId', 'chunkId'])
export class KnowledgeGraphMention extends TenantOrganizationBaseEntity implements IKnowledgeGraphMention {
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
    @RelationId((it: KnowledgeGraphMention) => it.knowledgebase)
    @IsString()
    @IsOptional()
    @Column({ nullable: true })
    knowledgebaseId?: string

    @ApiProperty({ type: () => KnowledgeGraphEntity, readOnly: true })
    @ManyToOne(() => KnowledgeGraphEntity, (entity) => entity.mentions, {
        nullable: true,
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
    })
    @JoinColumn()
    @IsOptional()
    entity?: IKnowledgeGraphEntity

    @ApiProperty({ type: () => String, readOnly: true })
    @RelationId((it: KnowledgeGraphMention) => it.entity)
    @IsString()
    @IsOptional()
    @Column({ nullable: true })
    entityId?: string

    @ApiPropertyOptional({ type: () => KnowledgeGraphRelation, readOnly: true })
    @ManyToOne(() => KnowledgeGraphRelation, (relation) => relation.mentions, {
        nullable: true,
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
    })
    @JoinColumn()
    @IsOptional()
    relation?: IKnowledgeGraphRelation | null

    @ApiPropertyOptional({ type: () => String, readOnly: true })
    @RelationId((it: KnowledgeGraphMention) => it.relation)
    @IsString()
    @IsOptional()
    @Column({ nullable: true })
    relationId?: string | null

    @ApiProperty({ type: () => KnowledgeDocument, readOnly: true })
    @ManyToOne(() => KnowledgeDocument, {
        nullable: true,
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
    })
    @JoinColumn()
    @IsOptional()
    document?: IKnowledgeDocument

    @ApiProperty({ type: () => String, readOnly: true })
    @RelationId((it: KnowledgeGraphMention) => it.document)
    @IsString()
    @IsOptional()
    @Column({ nullable: true })
    documentId?: string

    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @IsOptional()
    @Column({ type: 'varchar', nullable: true })
    chunkId?: string

    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @IsOptional()
    @Column({ type: 'text', nullable: true })
    quote?: string | null

    @ApiPropertyOptional({ type: () => Number })
    @IsNumber()
    @IsOptional()
    @Column({ type: 'float', nullable: true })
    confidence?: number | null

    @ApiPropertyOptional({ type: () => Number })
    @IsNumber()
    @IsOptional()
    @Column({ type: 'int', nullable: true })
    startOffset?: number | null

    @ApiPropertyOptional({ type: () => Number })
    @IsNumber()
    @IsOptional()
    @Column({ type: 'int', nullable: true })
    endOffset?: number | null

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
}
