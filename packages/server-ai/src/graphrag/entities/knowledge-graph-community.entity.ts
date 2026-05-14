import { IKnowledgebase, IKnowledgeGraphCommunity } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsJSON, IsNumber, IsOptional, IsString } from 'class-validator'
import { Column, Entity, Index, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { Knowledgebase } from '../../core/entities/internal'

@Entity('knowledge_graph_community')
@Index(['knowledgebaseId', 'key'], { unique: true })
export class KnowledgeGraphCommunity extends TenantOrganizationBaseEntity implements IKnowledgeGraphCommunity {
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
    @RelationId((it: KnowledgeGraphCommunity) => it.knowledgebase)
    @IsString()
    @IsOptional()
    @Column({ nullable: true })
    knowledgebaseId?: string

    @ApiProperty({ type: () => String })
    @IsString()
    @Column({ type: 'varchar', length: 160 })
    key: string

    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @IsOptional()
    @Column({ type: 'varchar', nullable: true, length: 512 })
    title?: string | null

    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @IsOptional()
    @Column({ type: 'text', nullable: true })
    summary?: string | null

    @ApiPropertyOptional({ type: () => Object })
    @IsJSON()
    @IsOptional()
    @Column({ type: 'jsonb', nullable: true, default: [] })
    entityIds?: string[] | null

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
