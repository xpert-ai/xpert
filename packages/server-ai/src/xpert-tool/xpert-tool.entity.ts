import { IBuiltinTool, IXpertTool, IXpertToolset, TAvatar, TXpertToolEntity } from '@metad/contracts'
import { TenantOrganizationBaseEntity } from '@metad/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsJSON, IsOptional, IsString, IsBoolean } from 'class-validator'
import { Exclude } from 'class-transformer'
import { Column, Entity, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { XpertToolset } from '../core/entities/internal'

@Entity('xpert_tool')
export class XpertTool extends TenantOrganizationBaseEntity implements IXpertTool {
	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Column()
	name: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true, length: 500 })
	description?: string

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	avatar?: TAvatar

	@ApiPropertyOptional({ type: () => Boolean })
	@IsBoolean()
	@Column({ nullable: true })
	enabled?: boolean

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Exclude({toPlainOnly: true})
	@Column({ type: 'json', nullable: true })
	schema?: Record<string, any> | TXpertToolEntity | IBuiltinTool

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	parameters?: Record<string, any>

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	options?: Record<string, any>

	/*
    |--------------------------------------------------------------------------
    | @ManyToOne 
    |--------------------------------------------------------------------------
    */

	// Xpert Toolset
	@ApiProperty({ type: () => XpertToolset })
	@ManyToOne(() => XpertToolset, (toolset) => toolset.tools, {
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	toolset?: IXpertToolset

	@ApiProperty({ type: () => String, readOnly: true })
	@RelationId((it: XpertTool) => it.toolset)
	@IsString()
	@Column({ nullable: true })
	toolsetId?: string

	// Temporary properties
	provider: IBuiltinTool
}
