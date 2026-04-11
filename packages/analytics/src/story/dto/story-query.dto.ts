import { IUser } from '@xpert-ai/contracts'
import { UserPublicDTO } from '@xpert-ai/server-core'
import { Exclude, Expose, Transform } from 'class-transformer'
import { IsOptional, IsString } from 'class-validator'
import { Story } from "../story.entity"


@Exclude()
export class StoryQueryDTO {
	@Expose()
	id: string

    @Expose()
	@IsString()
	@IsOptional()
	name: string

	@Expose()
	@IsString()
	@IsOptional()
	description?: string

	@Expose()
	@IsOptional()
	createdAt?: Date

	@Expose()
	@IsOptional()
	updatedAt?: Date

	@Expose()
	@Transform(({ value }) => value && new UserPublicDTO(value))
	createdBy?: IUser

    constructor(partial: Partial<Story>) {
		Object.assign(this, partial)
	}
}
