import {
    IKnowledgebase,
    IKnowledgeDocument,
    IKnowledgeGraphIndexJob,
    KnowledgeGraphIndexJobStatus,
    KnowledgeGraphIndexJobType
} from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsDate, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator'
import { Column, Entity, Index, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { Knowledgebase, KnowledgeDocument } from '../../core/entities/internal'

@Entity('knowledge_graph_index_job')
@Index(['knowledgebaseId', 'documentId', 'status'])
export class KnowledgeGraphIndexJob extends TenantOrganizationBaseEntity implements IKnowledgeGraphIndexJob {
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
    @RelationId((it: KnowledgeGraphIndexJob) => it.knowledgebase)
    @IsString()
    @IsOptional()
    @Column({ nullable: true })
    knowledgebaseId?: string

    @ApiPropertyOptional({ type: () => KnowledgeDocument, readOnly: true })
    @ManyToOne(() => KnowledgeDocument, {
        nullable: true,
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
    })
    @JoinColumn()
    @IsOptional()
    document?: IKnowledgeDocument | null

    @ApiPropertyOptional({ type: () => String, readOnly: true })
    @RelationId((it: KnowledgeGraphIndexJob) => it.document)
    @IsString()
    @IsOptional()
    @Column({ nullable: true })
    documentId?: string | null

    @ApiProperty({ type: () => String })
    @IsString()
    @Column({ type: 'varchar', length: 30 })
    type: KnowledgeGraphIndexJobType

    @ApiProperty({ enum: KnowledgeGraphIndexJobStatus, enumName: 'KnowledgeGraphIndexJobStatus' })
    @IsEnum(KnowledgeGraphIndexJobStatus)
    @Column({ type: 'varchar', length: 30, default: KnowledgeGraphIndexJobStatus.QUEUED })
    status: KnowledgeGraphIndexJobStatus

    @ApiPropertyOptional({ type: () => Number })
    @IsNumber()
    @IsOptional()
    @Column({ type: 'int', nullable: true, default: 0 })
    revision?: number | null

    @ApiPropertyOptional({ type: () => Number })
    @IsNumber()
    @IsOptional()
    @Column({ type: 'int', nullable: true, default: 0 })
    totalChunks?: number | null

    @ApiPropertyOptional({ type: () => Number })
    @IsNumber()
    @IsOptional()
    @Column({ type: 'int', nullable: true, default: 0 })
    processedChunks?: number | null

    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @IsOptional()
    @Column({ type: 'text', nullable: true })
    error?: string | null

    @ApiPropertyOptional({ type: () => Date })
    @IsDate()
    @IsOptional()
    @Column({ type: 'timestamp', nullable: true })
    startedAt?: Date | null

    @ApiPropertyOptional({ type: () => Date })
    @IsDate()
    @IsOptional()
    @Column({ type: 'timestamp', nullable: true })
    completedAt?: Date | null
}
