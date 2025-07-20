import {
	generateCronExpression,
	IChatConversation,
	IXpert,
	IXpertTask,
	LanguagesEnum,
	ScheduleTaskStatus,
	TScheduleOptions,
} from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { RequestContext, TenantOrganizationBaseEntity } from '@metad/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Expose, Transform } from 'class-transformer'
import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator'
import cronstrue from 'cronstrue'
import 'cronstrue/locales/en'
import 'cronstrue/locales/zh_CN'
import { Column, DeleteDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, RelationId } from 'typeorm'
import { ChatConversation, Xpert } from '../core/entities/internal'
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

	@ApiPropertyOptional({ type: () => Object })
	@IsObject()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	options?: TScheduleOptions

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

	@ApiPropertyOptional({ enum: ScheduleTaskStatus })
	@IsEnum(ScheduleTaskStatus)
	@IsOptional()
	@Column({ nullable: true, length: 20 })
	status?: ScheduleTaskStatus

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

	@ApiPropertyOptional({ type: () => ChatConversation, isArray: true })
	@IsOptional()
	@OneToMany(() => ChatConversation, (_) => _.task)
	conversations?: IChatConversation[]

	// Temporary properties
	@Expose()
	get scheduleDescription(): string {
		try {
			const schedule = this.schedule || generateCronExpression(this.options)
			return cronstrue.toString(schedule, {
				locale: CronstrueLocales[RequestContext.getLanguageCode()] ?? RequestContext.getLanguageCode()
			})
		} catch (err) {
			return getErrorMessage(err)
		}
	}

	@Expose()
	get executionCount(): number {
		return this.conversations?.length
	}

	@Expose()
	get errorCount(): number {
		return this.conversations?.filter((_) => _.status === 'error').length
	}

	@Expose()
	get successCount(): number {
		return this.conversations?.filter((_) => _.status !== 'error').length
	}
}

const CronstrueLocales = {
	[LanguagesEnum.SimplifiedChinese]: 'zh_CN'
}
