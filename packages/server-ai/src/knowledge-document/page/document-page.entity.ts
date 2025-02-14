import { IKnowledgeDocument, IKnowledgeDocumentPage, Metadata } from '@metad/contracts'
import { TenantOrganizationBaseEntity } from '@metad/server-core'
import { Optional } from '@nestjs/common'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsJSON, IsOptional, IsString } from 'class-validator'
import { Column, Entity, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { KnowledgeDocument } from '../document.entity'

@Entity('knowledge_document_page')
export class KnowledgeDocumentPage extends TenantOrganizationBaseEntity implements IKnowledgeDocumentPage {
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
	metadata: Metadata

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Optional()
	@Column({ nullable: true })
	status?: 'wasted' | 'validate' | 'running' | 'cancel' | 'finish' | 'error'
}
