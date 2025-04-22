import {
	IStorageFile,
	IUser,
	IXpert,
	IXpertProject,
	TXpertProjectSettings,
	TXpertProjectStatus
} from '@metad/contracts'
import { StorageFile, TenantOrganizationBaseEntity, User } from '@metad/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsJSON, IsOptional, IsString } from 'class-validator'
import { Column, Entity, JoinColumn, JoinTable, ManyToMany, ManyToOne, RelationId } from 'typeorm'
import { Xpert } from '../core/entities/internal'

@Entity('xpert_project')
export class XpertProject extends TenantOrganizationBaseEntity implements IXpertProject {
	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Column()
	name: string

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
}
