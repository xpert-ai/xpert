import { ISkillRepository, ISkillRepositoryIndex, ISkillRepositoryIndexPublisher, ISkillRepositoryIndexStats } from '@metad/contracts'
import { ApiProperty } from '@nestjs/swagger'
import { Exclude, Expose, Transform } from 'class-transformer'
import { IsDateString, IsObject, IsOptional, IsString, IsUUID } from 'class-validator'
import { SimpleSkillRepositoryDTO } from './simple-skill-repository.dto'

@Exclude()
export class SimpleSkillIndexDto implements ISkillRepositoryIndex {

    @Expose()
	@ApiProperty({
		description: 'Skill index ID',
		format: 'uuid'
	})
	@IsUUID()
	id: string

    @Expose()
	@ApiProperty({
		description: 'Repository ID this index belongs to',
		format: 'uuid'
	})
	@IsUUID()
	repositoryId: string

    @Expose()
	@ApiProperty({
		description: 'Organization ID',
		format: 'uuid'
	})
	@IsUUID()
	organizationId: string

    @Expose()
	@ApiProperty({
		description: 'Tenant ID',
		format: 'uuid'
	})
	@IsUUID()
	tenantId: string

    @Expose()
	@ApiProperty({
		description: 'Skill path'
	})
	@IsString()
	skillPath: string

    @Expose()
	@ApiProperty({
		description: 'Skill ID'
	})
	@IsString()
	skillId: string

    @Expose()
	@ApiProperty({
		description: 'Index name'
	})
	@IsString()
	name: string

	@Expose()
	@ApiProperty({
		description: 'Original skill details URL',
		required: false
	})
	@IsOptional()
	@IsString()
	link?: string

	@Expose()
	@ApiProperty({
		description: 'Skill publisher from repository source',
		required: false,
		type: Object
	})
	@IsOptional()
	@IsObject()
	publisher?: ISkillRepositoryIndexPublisher

    @Expose()
	@ApiProperty({
		description: 'Index description',
		required: false
	})
	@IsOptional()
	@IsString()
	description?: string

    @Expose()
	@ApiProperty({
		description: 'Index status',
		required: false
	})
	@IsOptional()
	@IsString()
	status?: string

    @Expose()
	@ApiProperty({
		description: 'Index type',
		required: false
	})
	@IsOptional()
	@IsString()
	type?: string

    @Expose()
	@ApiProperty({
		description: 'License information',
		required: false
	})
	@IsOptional()
	@IsString()
    license?: string

	@Expose()
	@ApiProperty({
		description: 'Skill stats from repository source',
		required: false,
		type: Object
	})
	@IsOptional()
	@IsObject()
	stats?: ISkillRepositoryIndexStats

	@Expose()
	@IsOptional()
	@Transform(({ value }) => value ? new SimpleSkillRepositoryDTO(value) : undefined)
	repository?: ISkillRepository

    @Expose()
	@ApiProperty({
		description: 'Created at timestamp (ISO 8601)'
	})
	@IsDateString()
	createdAt: Date

    @Expose()
	@ApiProperty({
		description: 'Last updated timestamp (ISO 8601)'
	})
	@IsDateString()
	updatedAt: Date

    constructor(partial: Partial<SimpleSkillIndexDto>) {
        Object.assign(this, partial);
    }
}
