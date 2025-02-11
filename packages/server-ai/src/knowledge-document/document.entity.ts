import { DocumentParserConfig, IKnowledgebase, IKnowledgeDocument, IStorageFile, KDocumentSourceType } from '@metad/contracts'
import { Optional } from '@nestjs/common'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsDate, IsJSON, IsNumber, IsOptional, IsString } from 'class-validator'
import { Column, Entity, JoinColumn, ManyToOne, OneToOne, RelationId } from 'typeorm'
import { Knowledgebase } from '../core/entities/internal'
import { StorageFile, TenantOrganizationBaseEntity } from '@metad/server-core'

@Entity('knowledge_document')
export class KnowledgeDocument extends TenantOrganizationBaseEntity implements IKnowledgeDocument {
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
	@OneToOne(() => StorageFile, {
		nullable: true,
		onUpdate: 'CASCADE',
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	@IsOptional()
	storageFile?: IStorageFile

	@ApiProperty({ type: () => String, readOnly: true })
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

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	parserConfig: DocumentParserConfig

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Optional()
	@Column({ nullable: true, length: 20 })
	sourceType?: KDocumentSourceType

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Optional()
	@Column({ nullable: true })
	type: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Optional()
	@Column({ nullable: true })
	name: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Optional()
	@Column({ nullable: true })
	location: string

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

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Optional()
	@Column({ nullable: true })
	status?: 'wasted' | 'validate' | 'running' | 'cancel' | 'finish' | 'error'

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Optional()
	@Column({ nullable: true })
	jobId?: string
}
