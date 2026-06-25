import { IKnowledgebase, IKnowledgeDocument, IKnowledgeDocumentChunk } from '@xpert-ai/contracts'
import { TenantOrganizationBaseEntity } from '@xpert-ai/server-core'
import { Optional } from '@nestjs/common'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsJSON, IsNumber, IsOptional, IsString } from 'class-validator'
import {
    Column,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    RelationId,
    Tree,
    TreeChildren,
    TreeParent,
    VersionColumn
} from 'typeorm'
import { KnowledgeDocument } from '../document.entity'
import { Knowledgebase } from '../../core/entities/internal'
import { TDocChunkMetadata } from '../types'

@Entity('knowledge_document_chunk')
@Index('IDX_knowledge_document_chunk_doc_content_hash', ['documentId', 'contentHash'])
@Tree('closure-table') 
export class KnowledgeDocumentChunk<T extends TDocChunkMetadata = TDocChunkMetadata>
	extends TenantOrganizationBaseEntity
	implements IKnowledgeDocumentChunk<T>
{
	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Optional()
	@Column({ nullable: true })
	pageContent: string

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	metadata: T

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Optional()
	@Column({ type: 'varchar', nullable: true, length: 64 })
	contentHash?: string | null

	@ApiPropertyOptional({ type: () => Number })
	@IsNumber()
	@Optional()
	@VersionColumn({ type: 'int', default: 1 })
	version?: number

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Optional()
	@Column({ nullable: true })
	status?: string

	/*
	|--------------------------------------------------------------------------
	| Parent-children relationship 
	|--------------------------------------------------------------------------
	*/
	@TreeChildren()
	children: KnowledgeDocumentChunk<T>[]

	@ApiPropertyOptional({ type: () => KnowledgeDocumentChunk, description: 'Parent document chunk' })
	@IsOptional()
	@TreeParent()
	parent: KnowledgeDocumentChunk<T>;

	/*
	|--------------------------------------------------------------------------
	| @ManyToOne relationships
	|--------------------------------------------------------------------------
	*/
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
	@RelationId((it: KnowledgeDocumentChunk) => it.knowledgebase)
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
	@RelationId((it: KnowledgeDocumentChunk) => it.document)
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	documentId?: string
}
