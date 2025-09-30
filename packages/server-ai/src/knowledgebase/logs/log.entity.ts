import { IKnowledgebase, IKnowledgeRetrievalLog } from '@metad/contracts'
import { TenantOrganizationBaseEntity } from '@metad/server-core'
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
