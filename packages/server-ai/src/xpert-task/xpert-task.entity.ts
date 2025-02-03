import {
	IXpert,
	IXpertAgentExecution,
	IXpertTask,
	LanguagesEnum,
	XpertAgentExecutionStatusEnum,
	XpertTaskStatus
} from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { RequestContext, TenantOrganizationBaseEntity } from '@metad/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Exclude, Expose, Transform } from 'class-transformer'
import { IsEnum, IsOptional, IsString } from 'class-validator'
import cronstrue from 'cronstrue'
import 'cronstrue/locales/en'
import 'cronstrue/locales/zh_CN'
import { Column, DeleteDateColumn, Entity, JoinColumn, JoinTable, ManyToMany, ManyToOne, RelationId } from 'typeorm'
import { Xpert, XpertAgentExecution } from '../core/entities/internal'
import { XpertIdentiDto } from '../xpert/dto'

@Entity('xpert_task')
export class XpertTask extends TenantOrganizationBaseEntity implements IXpertTask {
	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true, length: 100 })
	name?: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true, length: 50 })
	schedule?: string

	@ApiPropertyOptional({ type: () => String })
	@IsOptional()
	@IsString()
	@Column({ nullable: true })
	timeZone?: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	prompt?: string

	@ApiPropertyOptional({ enum: XpertTaskStatus })
	@IsEnum(XpertTaskStatus)
	@IsOptional()
	@Column({ nullable: true, length: 20 })
	status?: XpertTaskStatus

	@ApiProperty({ type: () => Xpert })
	@Transform(({ value }) => value && new XpertIdentiDto(value))
	@ManyToOne(() => Xpert, {
		nullable: true,
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	xpert?: IXpert

	@ApiProperty({ type: () => String, readOnly: true })
	@RelationId((it: XpertTask) => it.xpert)
	@IsString()
	@Column({ nullable: true })
	xpertId?: string

	@ApiProperty({ type: () => String, readOnly: true })
	@IsString()
	@Column({ nullable: true })
	agentKey?: string

	/**
	 * Soft Delete
	 */
	@ApiPropertyOptional({ type: () => 'timestamptz' })
	@DeleteDateColumn({ nullable: true })
	deletedAt?: Date

	@ApiProperty({ type: () => [XpertAgentExecution] })
	@Exclude()
	@ManyToMany(() => XpertAgentExecution, {
		eager: true,
		onUpdate: 'CASCADE',
		onDelete: 'CASCADE'
	})
	@JoinTable({
		name: 'xpert_task_to_execution'
	})
	executions?: IXpertAgentExecution[]

	// Temporary properties
	@Expose()
	get scheduleDescription(): string {
		try {
			return cronstrue.toString(this.schedule, {
				locale: CronstrueLocales[RequestContext.getLanguageCode()] ?? RequestContext.getLanguageCode()
			})
		} catch (err) {
			return getErrorMessage(err)
		}
	}

	@Expose()
	get executionCount(): number {
		return this.executions?.length
	}

	@Expose()
	get errorCount(): number {
		return this.executions?.filter((_) => _.status === XpertAgentExecutionStatusEnum.ERROR).length
	}

	@Expose()
	get successCount(): number {
		return this.executions?.filter((_) => _.status !== XpertAgentExecutionStatusEnum.ERROR).length
	}
}

const CronstrueLocales = {
	[LanguagesEnum.SimplifiedChinese]: 'zh_CN'
}
