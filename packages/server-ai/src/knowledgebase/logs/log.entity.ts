import {
    IKnowledgebase,
    IKnowledgeRetrievalLog,
    KnowledgeFilterDiagnostics,
    KnowledgeFilterNode,
    KnowledgeFilterStatus
} from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { ApiProperty } from '@nestjs/swagger'
import { IsNumber, IsOptional, IsString } from 'class-validator'
import { Column, Entity, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { Knowledgebase } from '../knowledgebase.entity'

@Entity('knowledge_retrieval_log')
export class KnowledgeRetrievalLog extends TenantOrganizationBaseEntity implements IKnowledgeRetrievalLog {
    @ApiProperty({ type: () => String, readOnly: true })
    @IsString()
    @IsOptional()
    @Column({ nullable: true })
    query: string

    @ApiProperty({ type: () => String, readOnly: true })
    @IsString()
    @IsOptional()
    @Column({ nullable: true })
    source: string

    @ApiProperty({ type: () => Number, readOnly: true })
    @IsNumber()
    @IsOptional()
    @Column({ nullable: true })
    hitCount: number

    @ApiProperty({ type: () => String, readOnly: true })
    @IsString()
    @IsOptional()
    @Column({ nullable: true })
    requestId: string

    @Column({ nullable: true })
    filterVersion?: number

    @Column({ type: 'jsonb', nullable: true })
    fixedFilter?: KnowledgeFilterNode

    @Column({ type: 'jsonb', nullable: true })
    dynamicFilter?: KnowledgeFilterNode

    @Column({ type: 'jsonb', nullable: true })
    requestFilter?: KnowledgeFilterNode

    @Column({ type: 'jsonb', nullable: true })
    effectiveFilter?: KnowledgeFilterNode

    @Column({ nullable: true, length: 64 })
    filterHash?: string

    @Column({ type: 'varchar', nullable: true, length: 32 })
    filterStatus?: KnowledgeFilterStatus

    @Column({ nullable: true, length: 64 })
    fallbackReason?: string

    @Column({ type: 'varchar', nullable: true })
    errorCode?: string

    @Column({ nullable: true })
    candidateDocumentCount?: number

    @Column({ nullable: true })
    candidateChunkCount?: number

    @Column({ nullable: true, length: 32 })
    vectorBackend?: string

    @Column({ type: 'float', nullable: true })
    filterLatency?: number

    @Column({ type: 'float', nullable: true })
    vectorLatency?: number

    @Column({ type: 'jsonb', nullable: true })
    diagnostics?: KnowledgeFilterDiagnostics

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
    @RelationId((it: KnowledgeRetrievalLog) => it.knowledgebase)
    @IsString()
    @IsOptional()
    @Column({ nullable: true })
    knowledgebaseId?: string
}
