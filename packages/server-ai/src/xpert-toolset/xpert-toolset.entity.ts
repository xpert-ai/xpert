import { ITag, IXpertTool, IXpertToolset, TAvatar, TToolCredentials, TXpertToolsetOptions, XpertToolsetCategoryEnum } from '@metad/contracts'
import { Tag } from '@metad/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsJSON, IsOptional, IsString } from 'class-validator'
import { Exclude } from 'class-transformer'
import { Column, Entity, JoinTable, ManyToMany, OneToMany } from 'typeorm'
import { XpertTool } from '../core/entities/internal'
import { WorkspaceBaseEntity } from '../core/entities/base.entity'

@Entity('xpert_toolset')
export class XpertToolset extends WorkspaceBaseEntity implements IXpertToolset {
	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Column()
	name: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Column({ nullable: true, length: 50 })
	type: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Column({ nullable: true, length: 10 })
	category?: 'command' | XpertToolsetCategoryEnum

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	description?: string

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	avatar?: TAvatar

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	options?: TXpertToolsetOptions

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Exclude({toPlainOnly: true})
	@Column({ type: 'json', nullable: true })
	credentials?: TToolCredentials

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	schema?: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	schemaType?: 'openapi_json' | 'openapi_yaml'

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	privacyPolicy?: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	customDisclaimer?: string

	/*
    |--------------------------------------------------------------------------
    | @OneToMany 
    |--------------------------------------------------------------------------
    */

	// Xpert Tools
	@ApiProperty({ type: () => XpertTool, isArray: true })
	@OneToMany(() => XpertTool, (tool) => tool.toolset, {
		cascade: ['insert', 'update', 'remove', 'soft-remove', 'recover']
	})
	tools?: IXpertTool[]

	/*
    |--------------------------------------------------------------------------
    | @ManyToMany 
    |--------------------------------------------------------------------------
    */
	// Toolset Tags
	@ManyToMany(() => Tag, {cascade: true, eager: true})
	@JoinTable({
	  name: 'tag_xpert_toolset',
	})
	tags?: ITag[]
}
