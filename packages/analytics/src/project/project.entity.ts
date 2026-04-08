import {
	ICertification,
	IIndicator,
	IProject,
	ISemanticModel,
	IStorageFile,
	IStory,
	ITag,
	IUser,
	ProjectStatusEnum
} from '@metad/contracts'
import { StorageFile, Tag, TenantOrganizationBaseEntity, User } from '@metad/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsDateString, IsOptional, IsString } from 'class-validator'
import {
	Column,
	DeleteDateColumn,
	Entity,
	JoinColumn,
	JoinTable,
	ManyToMany,
	ManyToOne,
	OneToMany,
	RelationId
} from 'typeorm'
import { Certification, Indicator, SemanticModel, Story } from '../core/entities/internal'

@Entity('project')
export class Project extends TenantOrganizationBaseEntity implements IProject {
	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	name?: string

	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	@Column({ nullable: true })
	description?: string

	@ApiProperty({ type: () => String, enum: ProjectStatusEnum })
	@Column({ type: 'varchar', nullable: true, default: ProjectStatusEnum.Progressing })
	status?: ProjectStatusEnum

	// Soft Delete
	@ApiPropertyOptional({
		type: 'string',
		format: 'date-time',
		example: '2024-10-14T06:20:32.232Z'
	})
	@IsOptional()
	@IsDateString()
	// Soft delete column that records the date/time when the entity was soft-deleted
	@DeleteDateColumn() // Indicates that this column is used for soft-delete
	deletedAt?: Date

	@ApiProperty({ type: () => User })
	@ManyToOne(() => User)
	@JoinColumn()
	owner: IUser

	@ApiProperty({ type: () => String })
	@RelationId((it: Project) => it.owner)
	@IsString()
	@Column({ nullable: true })
	ownerId: string

	/**
	 * Many to Many relations
	 */
	// Members
	@ManyToMany(() => User)
	@JoinTable({
		name: 'project_member'
	})
	members?: IUser[]

	// Employee Tags
	@ManyToMany(() => Tag)
	@JoinTable({
		name: 'tag_project'
	})
	tags?: ITag[]

	// Semantic Models
	@ManyToMany(() => SemanticModel)
	@JoinTable({
		name: 'project_model'
	})
	models?: ISemanticModel[]

	@ManyToMany(() => Certification, {cascade: true})
	@JoinTable({
		name: 'project_certification'
	})
	certifications?: ICertification[]

	@ManyToMany(() => StorageFile,  {
		cascade: ["insert", "update", "remove"]
	})
	@JoinTable({
		name: 'project_files'
	})
	files?: IStorageFile[]

	/**
	 * One to Many relations
	 */
	@ApiProperty({ type: () => Story, isArray: true })
	@OneToMany(() => Story, (m) => m.project, {
		nullable: true,
		cascade: true
	})
	stories?: IStory[]

	@ApiProperty({ type: () => Indicator, isArray: true })
	@OneToMany(() => Indicator, (m) => m.project, {
		nullable: true,
		cascade: true
	})
	indicators?: IIndicator[]
	
}
