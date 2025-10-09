import { IKnowledgebase, IKnowledgeDocument, IKnowledgeDocumentPage } from '@metad/contracts'
import { TenantOrganizationBaseEntity } from '@metad/server-core'
import { Optional } from '@nestjs/common'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ChunkMetadata } from '@xpert-ai/plugin-sdk'
import { IsJSON, IsOptional, IsString } from 'class-validator'
import { Column, Entity, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { KnowledgeDocument } from '../document.entity'
import { Knowledgebase } from '../../core/entities/internal'

@Entity('knowledge_document_page')
export class KnowledgeDocumentPage
	extends TenantOrganizationBaseEntity
	implements IKnowledgeDocumentPage<ChunkMetadata>
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
	@RelationId((it: KnowledgeDocumentPage) => it.knowledgebase)
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
	@RelationId((it: KnowledgeDocumentPage) => it.document)
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	documentId?: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Optional()
	@Column({ nullable: true })
	pageContent: string

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	metadata: ChunkMetadata

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Optional()
	@Column({ nullable: true })
	status?: 'wasted' | 'validate' | 'running' | 'cancel' | 'finish' | 'error'
}
