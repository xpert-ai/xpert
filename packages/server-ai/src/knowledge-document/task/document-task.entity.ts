import { IKnowledgebase, IKnowledgeDocument, IKnowledgeDocumentTask, TaskStep } from '@metad/contracts'
import { TenantOrganizationBaseEntity } from '@metad/server-core'
import { Optional } from '@nestjs/common'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsJSON, IsOptional, IsString } from 'class-validator'
import { Column, Entity, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { KnowledgeDocument } from '../document.entity'
import { Knowledgebase } from '../../core/entities/internal'

@Entity('knowledge_document_task')
export class KnowledgeDocumentTask
    extends TenantOrganizationBaseEntity
    implements IKnowledgeDocumentTask
{
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
    @RelationId((it: KnowledgeDocumentTask) => it.knowledgebase)
    @IsString()
    @IsOptional()
    @Column({ nullable: true })
    knowledgebaseId?: string

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
    @RelationId((it: KnowledgeDocumentTask) => it.document)
    @IsString()
    @IsOptional()
    @Column({ nullable: true })
    documentId?: string

    @Column({ type: 'varchar', length: 50 })
    taskType: string; // preprocess / re-embed / cleanup ...

    @ApiPropertyOptional({ type: () => String })
    @IsString()
    @Optional()
    @Column({ nullable: true })
    status?: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';

    @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
    progress: number; // overall progress 0-100

    @Column({ type: 'jsonb', nullable: true })
    steps: TaskStep[];

    @Column({ type: 'text', nullable: true })
    error?: string;


    @ApiProperty({
        type: 'string',
        format: 'date-time',
        example: '2018-11-21T06:20:32.232Z',
    })
    @Column({
        type: 'timestamptz',
        nullable: true
    })
    finishedAt?: Date;
}
