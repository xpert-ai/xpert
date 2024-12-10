import { IXpert, IXpertAgentExecution, TAgentExecutionMetadata, XpertAgentExecutionStatusEnum } from '@metad/contracts'
import { TenantOrganizationBaseEntity } from '@metad/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsJSON, IsNumber, IsOptional, IsString, IsEnum } from 'class-validator'
import { Column, Entity, JoinColumn, ManyToOne, OneToMany, RelationId } from 'typeorm'
import { Xpert } from '../core/entities/internal'

@Entity('xpert_agent_execution')
export class XpertAgentExecution extends TenantOrganizationBaseEntity implements IXpertAgentExecution {
	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true,})
	title?: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true, length: 100 })
	agentKey?: string

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	inputs?: any

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	outputs?: any

	@ApiProperty({ type: () => String, enum: XpertAgentExecutionStatusEnum })
	@IsEnum(XpertAgentExecutionStatusEnum)
	@IsOptional()
	@Column({ nullable: true })
	status?: XpertAgentExecutionStatusEnum

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	error?: string

	@ApiProperty({ type: () => Number })
	@IsNumber()
	@IsOptional()
	@Column({ type: 'numeric', nullable: true })
	elapsedTime?: number

	@ApiProperty({ type: () => Number })
	@IsNumber()
	@IsOptional()
	@Column({ type: 'integer', nullable: true, default: 0 })
	tokens?: number

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	metadata?: TAgentExecutionMetadata

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true, length: 100, default: () => 'gen_random_uuid()' })
	threadId?: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true, length: 100 })
	parent_thread_id?: string

	/*
    |--------------------------------------------------------------------------
    | @ManyToOne
    |--------------------------------------------------------------------------
    */
	@ApiProperty({ type: () => XpertAgentExecution })
	@ManyToOne(() => XpertAgentExecution, {
		nullable: true,
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	parent?: IXpertAgentExecution

	@ApiProperty({ type: () => String })
	@RelationId((it: XpertAgentExecution) => it.parent)
	@IsString()
	@Column({ nullable: true })
	parentId?: string

	@ApiProperty({ type: () => XpertAgentExecution, isArray: true })
	@OneToMany(() => XpertAgentExecution, (_) => _.parent)
	subExecutions?: IXpertAgentExecution[]

	@ApiProperty({ type: () => Xpert })
	@ManyToOne(() => Xpert, {
		nullable: true,
		cascade: true
	})
	@JoinColumn()
	xpert: IXpert

	@ApiProperty({ type: () => String, readOnly: true })
	@RelationId((it: XpertAgentExecution) => it.xpert)
	@IsString()
	@Column({ nullable: true })
	readonly xpertId: string

	// Temporary properties
	get totalTokens() {
		return (this.tokens ?? 0) + (this.subExecutions?.reduce((acc, curr) => {
			return acc + (curr.totalTokens ?? 0)
		}, 0) ?? 0)
	}
}
