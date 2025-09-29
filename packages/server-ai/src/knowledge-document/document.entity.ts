import {
	TDocumentWebOptions,
	IIntegration,
	IKnowledgebase,
	IKnowledgeDocument,
	IKnowledgeDocumentPage,
	IStorageFile,
	KDocumentSourceType,
	KBDocumentCategoryEnum,
	DocumentTextParserConfig,
	KBDocumentStatusEnum,
	IKnowledgebaseTask,
	Metadata,
} from '@metad/contracts'
import { Integration, StorageFile, TenantOrganizationBaseEntity } from '@metad/server-core'
import { DocumentInterface } from '@langchain/core/documents'
import { Optional } from '@nestjs/common'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsDate, IsEnum, IsJSON, IsNumber, IsOptional, IsString } from 'class-validator'
import { Column, Entity, JoinColumn, ManyToOne, OneToMany, OneToOne, RelationId, Tree, TreeChildren, TreeParent } from 'typeorm'
import { Knowledgebase, KnowledgebaseTask, KnowledgeDocumentPage } from '../core/entities/internal'

@Entity('knowledge_document')
@Tree('closure-table') 
export class KnowledgeDocument extends TenantOrganizationBaseEntity implements IKnowledgeDocument {
	@ApiProperty({ type: () => Boolean })
	@IsBoolean()
	@IsOptional()
	@Column({ nullable: true })
	disabled?: boolean

	@ApiPropertyOptional({ enum: KDocumentSourceType, description: 'Source type of the document' })
	@IsEnum(KDocumentSourceType)
	@Optional()
	@Column({ nullable: true, length: 20 })
	sourceType?: KDocumentSourceType

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	sourceConfig?: any

	@ApiPropertyOptional({ enum: KBDocumentCategoryEnum, description: 'Category of the document' })
	@IsEnum(KBDocumentCategoryEnum)
	@Optional()
	@Column({ nullable: true })
	category?: KBDocumentCategoryEnum | null

	@ApiPropertyOptional({ type: () => String, description: 'Type of the file' })
	@IsString()
	@Optional()
	@Column({ nullable: true })
	type: string

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
	@RelationId((it: KnowledgeDocument) => it.knowledgebase)
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	knowledgebaseId?: string

	@ApiProperty({ type: () => StorageFile, readOnly: true })
	@ManyToOne(() => StorageFile, {
		nullable: true,
	})
	@JoinColumn()
	@IsOptional()
	storageFile?: IStorageFile

	@ApiProperty({ type: 'string', format: 'uuid', description: 'Storage file ID' })
	@RelationId((it: KnowledgeDocument) => it.storageFile)
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	storageFileId?: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Optional()
	@Column({ nullable: true })
	thumbnail?: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Optional()
	@Column({ nullable: true })
	parserId: string

	@ApiProperty({
		type: () => Object,
		description: 'Parser Config',
		example: {
			chunkSize: 1000,
			chunkOverlap: 100,
			delimiter: '; , .'
		}
	})
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	parserConfig: DocumentTextParserConfig

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Optional()
	@Column({ nullable: true })
	name: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Optional()
	@Column({ nullable: true })
	filePath: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Optional()
	@Column({ nullable: true })
	fileUrl: string

	@ApiPropertyOptional({ type: () => Number })
	@IsNumber()
	@Optional()
	@Column({ nullable: true })
	size: string

	@ApiPropertyOptional({ type: () => Number })
	@IsNumber()
	@Optional()
	@Column({ nullable: true })
	tokenNum?: number

	@ApiPropertyOptional({ type: () => Number })
	@IsNumber()
	@Optional()
	@Column({ nullable: true })
	chunkNum?: number

	@ApiPropertyOptional({ type: () => Number })
	@IsNumber()
	@Optional()
	@Column({ nullable: true, type: 'float' })
	progress?: number

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Optional()
	@Column({ nullable: true })
	processMsg?: string

	@ApiPropertyOptional({ type: () => Date })
	@IsDate()
	@Optional()
	@Column({ type: 'date', nullable: true })
	processBeginAt?: Date

	@ApiPropertyOptional({ type: () => Number })
	@IsNumber()
	@Optional()
	@Column({ nullable: true })
	processDuation?: number

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Optional()
	@Column({ nullable: true })
	run?: string

	@ApiPropertyOptional({ enum: KBDocumentStatusEnum, description: 'Status of the document process' })
	@IsEnum(KBDocumentStatusEnum)
	@Optional()
	@Column({ nullable: true })
	status?: KBDocumentStatusEnum

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Optional()
	@Column({ nullable: true })
	jobId?: string

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	options?: TDocumentWebOptions

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	metadata?: Metadata

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	chunks?: DocumentInterface[]

	/*
    |--------------------------------------------------------------------------
    | Parent-children relationship 
    |--------------------------------------------------------------------------
    */
	@TreeChildren()
	children: KnowledgeDocument[]

	@ApiPropertyOptional({ type: () => KnowledgeDocument, description: 'Parent document' })
	@IsOptional()
	@TreeParent()
	parent: KnowledgeDocument;

	/*
    |--------------------------------------------------------------------------
    | @OneToOne
    |--------------------------------------------------------------------------
    */
	@ApiProperty({ type: () => Integration, readOnly: true })
	@OneToOne(() => Integration, {
		nullable: true,
		onDelete: 'SET NULL'
	})
	@JoinColumn()
	@IsOptional()
	integration?: IIntegration

	@ApiProperty({ type: () => String, readOnly: true })
	@RelationId((it: KnowledgeDocument) => it.integration)
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	integrationId?: string

	/*
    |--------------------------------------------------------------------------
    | @OneToMany 
    |--------------------------------------------------------------------------
    */
	@ApiProperty({ type: () => KnowledgeDocumentPage, isArray: true })
	@OneToMany(() => KnowledgeDocumentPage, (page) => page.document, {
		cascade: ['insert', 'update', 'remove', 'soft-remove', 'recover']
	})
	pages?: IKnowledgeDocumentPage[]

	@ApiProperty({ type: () => KnowledgebaseTask, isArray: true })
	@ManyToOne(() => KnowledgebaseTask)
	task?: IKnowledgebaseTask

	@ApiProperty({ type: () => String })
	@RelationId((it: KnowledgeDocument) => it.task)
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	taskId?: string
}
