import { IXpert, IXpertTask, LanguagesEnum, XpertTaskStatus } from '@metad/contracts'
import { RequestContext, TenantOrganizationBaseEntity } from '@metad/server-core'
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger'
import { IsString, IsOptional, IsEnum } from 'class-validator'
import { Transform } from 'class-transformer'
import cronstrue from 'cronstrue'
import 'cronstrue/locales/en'
import 'cronstrue/locales/zh_CN'
import { Column, DeleteDateColumn, Entity, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { Xpert } from '../core/entities/internal'

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
	readonly xpertId?: string

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

	// Temporary properties
	@Transform(({obj}) =>
		cronstrue.toString(obj.schedule, { locale: CronstrueLocales[RequestContext.getLanguageCode()] ?? RequestContext.getLanguageCode() })
	)
    scheduleDescription?: string
}

const CronstrueLocales = {
	[LanguagesEnum.SimplifiedChinese]: 'zh_CN',
}