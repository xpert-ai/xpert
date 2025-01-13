import { IUser } from '@metad/contracts'
import { ApiProperty } from '@nestjs/swagger'
import { Exclude, Expose, Transform } from 'class-transformer'
import { User } from '../../core/entities/internal'
import { UserPublicDTO } from '../../user/dto'

@Expose()
export class IntegrationPublicDTO {
	@Exclude()
	options: any

	@ApiProperty({ type: () => User, readOnly: true })
	@Transform(({ value }) => value && new UserPublicDTO(value))
	createdBy?: IUser

	@ApiProperty({ type: () => User, readOnly: true })
	@Transform(({ value }) => value && new UserPublicDTO(value))
	updatedBy?: IUser

	constructor(partial: Partial<IntegrationPublicDTO>) {
		Object.assign(this, partial)
	}
}
