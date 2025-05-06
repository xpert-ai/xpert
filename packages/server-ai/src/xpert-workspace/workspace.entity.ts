import { IEnvironment, IUser, IXpertWorkspace, TXpertWorkspaceSettings, TXpertWorkspaceStatus } from '@metad/contracts'
import { TenantOrganizationBaseEntity, User } from '@metad/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsJSON, IsOptional, IsString } from 'class-validator'
import { Column, Entity, JoinColumn, JoinTable, ManyToMany, ManyToOne, OneToMany, RelationId } from 'typeorm'
import { Environment } from '../core/entities/internal'

@Entity('xpert_workspace')
export class XpertWorkspace extends TenantOrganizationBaseEntity implements IXpertWorkspace {
	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@Column()
	name: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true, length: 500 })
	description?: string

    @ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	status: TXpertWorkspaceStatus

	@ApiPropertyOptional({ type: () => Object })
	@IsJSON()
	@IsOptional()
	@Column({ type: 'json', nullable: true })
	settings?: TXpertWorkspaceSettings

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
	@RelationId((it: XpertWorkspace) => it.owner)
	@IsString()
	@Column({ nullable: true })
	ownerId: string

	/*
    |--------------------------------------------------------------------------
    | @OneToMany
    |--------------------------------------------------------------------------
    */
	@ApiPropertyOptional({ type: () => Environment, isArray: true })
	@IsOptional()
	@OneToMany(() => Environment, (_) => _.workspace, {
		cascade: ['insert', 'update', 'remove', 'soft-remove', 'recover']
	})
	environments?: IEnvironment[] | null

	/*
    |--------------------------------------------------------------------------
    | @ManyToMany 
    |--------------------------------------------------------------------------
    */
	// Workspace's members
	@ManyToMany(() => User)
	@JoinTable({
		name: 'xpert_workspace_member'
	})
	members?: IUser[]
}
