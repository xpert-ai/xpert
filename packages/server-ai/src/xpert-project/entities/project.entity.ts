import {
	IStorageFile,
	IUser,
	IXpert,
	IXpertProject,
	IXpertProjectTask,
	IXpertToolset,
	IXpertWorkspace,
	TAvatar,
	TXpertProjectSettings,
	TXpertProjectStatus
} from '@metad/contracts'
import { StorageFile, TenantOrganizationBaseEntity, User } from '@metad/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsJSON, IsOptional, IsString } from 'class-validator'
import { Column, Entity, JoinColumn, JoinTable, ManyToMany, ManyToOne, OneToMany, RelationId } from 'typeorm'
import { Xpert, XpertProjectTask, XpertToolset, XpertWorkspace } from '../../core/entities/internal'
import { WorkspaceBaseEntity } from '../../core/entities/base.entity'

@Entity('xpert_project')
export class XpertProject extends TenantOrganizationBaseEntity implements IXpertProject {
	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Column()
	name: string

	@ApiPropertyOptional({ type: () => Object })
	@IsString()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	avatar?: TAvatar

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	description?: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	status: TXpertProjectStatus

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	settings?: TXpertProjectSettings

	/*
    |--------------------------------------------------------------------------
    | @ManyToOne 
    |--------------------------------------------------------------------------
    */
	@ApiProperty({ type: () => User })
	@ManyToOne(() => User)
	@JoinColumn()
	owner?: IUser

	@ApiProperty({ type: () => String })
	@RelationId((it: XpertProject) => it.owner)
	@IsString()
	@Column({ nullable: true })
	ownerId: string

	@ApiProperty({ type: () => XpertWorkspace, readOnly: true })
	@ManyToOne(() => XpertWorkspace, {
		nullable: true,
		onUpdate: 'CASCADE',
		onDelete: 'CASCADE'
	})
	@JoinColumn()
	@IsOptional()
	workspace?: IXpertWorkspace

	@ApiProperty({ type: () => String, readOnly: true })
	@RelationId((it: WorkspaceBaseEntity) => it.workspace)
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	workspaceId?: string

	/*
    |--------------------------------------------------------------------------
    | @OneToMany 
    |--------------------------------------------------------------------------
    */
	@ApiPropertyOptional({ type: () => XpertProjectTask, isArray: true })
	@IsOptional()
	@OneToMany(() => XpertProjectTask, (_) => _.project, {
		cascade: ['insert', 'update', 'remove', 'soft-remove', 'recover']
	})
	tasks?: IXpertProjectTask[] | null

	/*
    |--------------------------------------------------------------------------
    | @ManyToMany 
    |--------------------------------------------------------------------------
    */
	// Project's members
	@ManyToMany(() => User)
	@JoinTable({
		name: 'xpert_project_member'
	})
	members?: IUser[]

	// Project's xperts
	@ManyToMany(() => Xpert)
	@JoinTable({
		name: 'xpert_project_xpert'
	})
	xperts?: IXpert[]

	// Project's files
	@ManyToMany(() => StorageFile)
	@JoinTable({
		name: 'xpert_project_file'
	})
	files?: IStorageFile[]

	// Project's tools
	@ManyToMany(() => XpertToolset)
	@JoinTable({
		name: 'xpert_project_toolset'
	})
	toolsets?: IXpertToolset[]
}
