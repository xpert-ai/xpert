import { IKnowledgebase, IKnowledgeDocument, IKnowledgeDocumentChunk } from '@metad/contracts'
import { TenantOrganizationBaseEntity } from '@metad/server-core'
import { Optional } from '@nestjs/common'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsJSON, IsOptional, IsString } from 'class-validator'
import { Column, Entity, JoinColumn, ManyToOne, RelationId, Tree, TreeChildren, TreeParent } from 'typeorm'
import { KnowledgeDocument } from '../document.entity'
import { Knowledgebase } from '../../core/entities/internal'
import { TDocChunkMetadata } from '../types'


@Entity('knowledge_document_chunk')
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
