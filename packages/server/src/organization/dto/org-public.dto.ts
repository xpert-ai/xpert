import { ApiPropertyOptional } from '@nestjs/swagger'
import { Exclude, Expose } from 'class-transformer'
import { IsOptional, IsString } from 'class-validator'

/**
 * Organization Public DTO
 */
@Exclude()
export class OrganizationPublicDTO {
	@Expose()
	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	id?: string

	@Expose()
	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	name?: string

	@Expose()
	@ApiPropertyOptional({ type: () => String })
	@IsString()
	@IsOptional()
	imageUrl?: string

	constructor(partial: Partial<OrganizationPublicDTO>) {
		Object.assign(this, partial)
	}
}
