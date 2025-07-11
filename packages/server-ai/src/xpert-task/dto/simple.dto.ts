import {
	generateCronExpression,
	IChatConversation,
	IXpert,
	IXpertTask,
	LanguagesEnum,
	TTaskOptions,
	XpertTaskStatus
} from '@metad/contracts'
import { getErrorMessage } from '@metad/server-common'
import { RequestContext } from '@metad/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Exclude, Expose, Transform } from 'class-transformer'
import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator'
import cronstrue from 'cronstrue'
import 'cronstrue/locales/en'
import 'cronstrue/locales/zh_CN'
import { ChatConversation, Xpert } from '../../core/entities/internal'
import { XpertIdentiDto } from '../../xpert/dto'

export class SimpleXpertTask implements IXpertTask {
	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	name?: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	schedule?: string

	@ApiPropertyOptional({ type: () => Object })
	@IsObject()
	@IsOptional()
	options?: TTaskOptions

	@ApiPropertyOptional({ type: () => String })
	@IsOptional()
	@IsString()
	timeZone?: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	prompt?: string

	@ApiPropertyOptional({ enum: XpertTaskStatus })
	@IsEnum(XpertTaskStatus)
	@IsOptional()
	status?: XpertTaskStatus

	@ApiProperty({ type: () => Xpert })
	@Transform(({ value }) => value && new XpertIdentiDto(value))
	xpert?: IXpert

	@ApiProperty({ type: () => String, readOnly: true })
	@IsString()
	xpertId?: string

	@ApiProperty({ type: () => String, readOnly: true })
	@IsString()
	agentKey?: string

	/**
	 * Soft Delete
	 */
	@ApiPropertyOptional({ type: () => 'timestamptz' })
	deletedAt?: Date

	@Exclude()
	@ApiPropertyOptional({ type: () => ChatConversation, isArray: true })
	@IsOptional()
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

    constructor(partial: Partial<SimpleXpertTask>) {
        Object.assign(this, partial)
    }
}

const CronstrueLocales = {
	[LanguagesEnum.SimplifiedChinese]: 'zh_CN'
}
