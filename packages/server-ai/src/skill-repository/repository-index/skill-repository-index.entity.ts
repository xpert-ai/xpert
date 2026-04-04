import { ISkillRepositoryIndex, ISkillRepositoryIndexPublisher, ISkillRepositoryIndexStats } from '@metad/contracts'
import { TenantOrganizationBaseEntity } from '@metad/server-core'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsArray, IsDateString, IsJSON, IsObject, IsOptional, IsString } from 'class-validator'
import { Column, DeleteDateColumn, Entity, JoinColumn, ManyToOne, RelationId } from 'typeorm'
import { SkillRepository } from '../skill-repository.entity'

@Entity('skill_repository_index')
export class SkillRepositoryIndex extends TenantOrganizationBaseEntity implements ISkillRepositoryIndex {
	@ApiProperty({ type: () => SkillRepository })
	@ManyToOne(() => SkillRepository, { onDelete: 'CASCADE' })
	@JoinColumn()
	repository?: SkillRepository

	@ApiProperty({ type: () => String })
	@RelationId((it: SkillRepositoryIndex) => it.repository)
	@IsString()
	@Column()
	repositoryId: string

	@ApiProperty({ type: () => String })
	@IsString()
	@Column({ length: 300 })
	skillPath: string

	@ApiProperty({ type: () => String })
	@IsString()
	@Column({ length: 200 })
	skillId: string

	@ApiPropertyOptional({ type: () => String })
	@IsOptional()
	@IsString()
	@Column({ nullable: true })
	name?: string

	@ApiPropertyOptional({ type: () => String })
	@IsOptional()
	@IsString()
	@Column({ nullable: true, length: 500 })
	link?: string

	@ApiPropertyOptional({ type: () => Object })
	@IsOptional()
	@IsObject()
	@Column({ type: 'json', nullable: true, name: 'author' })
	publisher?: ISkillRepositoryIndexPublisher

	@ApiPropertyOptional({ type: () => String })
	@IsOptional()
	@IsString()
	@Column({ nullable: true, type: 'text' })
	description?: string

	@ApiPropertyOptional({ type: () => String })
	@IsOptional()
	@IsString()
	@Column({ nullable: true })
	license?: string

	@ApiPropertyOptional({ type: () => [String] })
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	@Column({ type: 'json', nullable: true })
	tags?: string[]

	@ApiPropertyOptional({ type: () => String })
	@IsOptional()
	@IsString()
	@Column({ nullable: true, length: 50 })
	version?: string

	@ApiPropertyOptional({ type: () => Object })
	@IsOptional()
	@IsObject()
	@Column({ type: 'json', nullable: true })
	stats?: ISkillRepositoryIndexStats

	@ApiPropertyOptional({ type: () => Object })
	@IsOptional()
	@IsJSON()
	@Column({ type: 'json', nullable: true })
	resources?: any[]
	
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
}
